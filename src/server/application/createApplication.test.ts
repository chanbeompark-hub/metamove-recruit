import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validEntryInput } from '../../test/fixtures/application';
import { validPdfBytes } from '../../test/fixtures/documents';
import { createApplication } from './createApplication';
import { ApplicationRepositoryError } from './repository';
import type {
  ApplicationPolicy,
  ApplicationRepository,
  CreateApplicationCommand,
  PersistedApplication,
} from './types';

const PDF_HEADER = validPdfBytes();
const policy: ApplicationPolicy = {
  privacyConsentVersion: 'test-approved-v1',
  privacyRetentionDays: 30,
};

function command(overrides: Partial<CreateApplicationCommand> = {}): CreateApplicationCommand {
  return {
    input: validEntryInput,
    idempotencyKey: '10000000-0000-4000-8000-000000000001',
    actorHash: 'a'.repeat(64),
    resume: new File([PDF_HEADER], '..\\private\\resume.pdf', { type: 'application/pdf' }),
    portfolio: null,
    ...overrides,
  };
}

function repository(overrides: Partial<ApplicationRepository> = {}) {
  const storedGraphs: PersistedApplication[] = [];
  const uploadedPaths: string[] = [];
  const deletedPaths: string[] = [];
  const fake: ApplicationRepository = {
    consumeSubmissionQuota: vi.fn(async () => true),
    uploadFile: vi.fn(async (path) => {
      uploadedPaths.push(path);
      return path;
    }),
    findApplicationByIdempotencyKey: vi.fn(async () => null),
    insertApplicationGraph: vi.fn(async (graph) => {
      storedGraphs.push(graph);
      return { status: 'inserted', receiptCode: graph.application.receiptCode } as const;
    }),
    deleteFile: vi.fn(async (path) => {
      deletedPaths.push(path);
    }),
    enqueueFileReconciliation: vi.fn(async () => undefined),
    ...overrides,
  };
  return { fake, storedGraphs, uploadedPaths, deletedPaths };
}

describe('createApplication', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T08:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses exactly five attempts per ten minutes before any upload', async () => {
    const order: string[] = [];
    const { fake } = repository({
      consumeSubmissionQuota: vi.fn(async (_hash, maximum, windowSeconds) => {
        order.push(`quota:${maximum}:${windowSeconds}`);
        return true;
      }),
      uploadFile: vi.fn(async (path) => {
        order.push('upload');
        return path;
      }),
    });

    await createApplication(command(), fake, policy);

    expect(order.slice(0, 2)).toEqual(['quota:5:600', 'upload']);
  });

  it('rejects the sixth attempt without uploading or persisting', async () => {
    const { fake } = repository({ consumeSubmissionQuota: vi.fn(async () => false) });

    await expect(createApplication(command(), fake, policy)).rejects.toThrow('RATE_LIMITED');
    expect(fake.uploadFile).not.toHaveBeenCalled();
    expect(fake.insertApplicationGraph).not.toHaveBeenCalled();
  });

  it('replays a committed idempotency key without consuming another submission quota slot', async () => {
    const receiptCode = 'MMG-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const { fake } = repository({
      consumeSubmissionQuota: vi.fn(async () => false),
      findApplicationByIdempotencyKey: vi.fn(async () => ({
        applicationId: '20000000-0000-4000-8000-000000000002',
        receiptCode,
      })),
    });

    await expect(createApplication(command(), fake, policy)).resolves.toEqual({ receiptCode });
    expect(fake.consumeSubmissionQuota).not.toHaveBeenCalled();
    expect(fake.uploadFile).not.toHaveBeenCalled();
  });

  it('keeps production unavailable when privacy policy values are absent or invalid', async () => {
    const { fake } = repository();

    await expect(createApplication(command(), fake, {
      privacyConsentVersion: '',
      privacyRetentionDays: 30,
    })).rejects.toThrow('POLICY_UNAVAILABLE');
    await expect(createApplication(command(), fake, {
      privacyConsentVersion: 'test-approved-v1',
      privacyRetentionDays: 0,
    })).rejects.toThrow('POLICY_UNAVAILABLE');
    expect(fake.consumeSubmissionQuota).not.toHaveBeenCalled();
  });

  it('deletes both successfully uploaded random paths when graph insertion definitively fails', async () => {
    const { fake, uploadedPaths, deletedPaths } = repository({
      insertApplicationGraph: vi.fn(async () => {
        throw new ApplicationRepositoryError('GRAPH_REJECTED');
      }),
    });
    const portfolio = new File([PDF_HEADER], '../../portfolio.pdf', { type: 'application/pdf' });

    await expect(createApplication(command({ portfolio }), fake, policy)).rejects.toThrow(
      'APPLICATION_SAVE_FAILED',
    );

    expect(uploadedPaths).toHaveLength(2);
    expect(deletedPaths).toEqual(expect.arrayContaining(uploadedPaths));
    expect(deletedPaths).toHaveLength(2);
    for (const path of uploadedPaths) {
      expect(path).toMatch(/^applications\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/);
      expect(path).not.toContain('resume');
      expect(path).not.toContain('portfolio');
      expect(path).not.toContain('..');
    }
  });

  it('enqueues durable reconciliation and reports pending when cleanup fails', async () => {
    const deletedPaths: string[] = [];
    const { fake } = repository({
      insertApplicationGraph: vi.fn(async () => {
        throw new ApplicationRepositoryError('GRAPH_REJECTED');
      }),
      deleteFile: vi.fn(async (path) => {
        deletedPaths.push(path);
        if (deletedPaths.length === 1) throw new Error('cleanup detail');
      }),
    });
    const portfolio = new File([PDF_HEADER], 'portfolio.pdf', { type: 'application/pdf' });

    await expect(createApplication(command({ portfolio }), fake, policy)).rejects.toThrow('SUBMISSION_PENDING');
    expect(deletedPaths).toHaveLength(2);
    expect(fake.enqueueFileReconciliation).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: command().idempotencyKey,
      paths: expect.any(Array),
    }));
  });

  it('fails safely and emits a non-PII operational alert when a cleanup reconciliation enqueue fails', async () => {
    const enqueueError = new ApplicationRepositoryError('RECONCILIATION_ENQUEUE_FAILED');
    const alert = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
    const { fake } = repository({
      insertApplicationGraph: vi.fn(async () => {
        throw new ApplicationRepositoryError('GRAPH_REJECTED');
      }),
      deleteFile: vi.fn(async () => {
        throw new ApplicationRepositoryError('FILE_DELETE_FAILED');
      }),
      enqueueFileReconciliation: vi.fn(async () => {
        throw enqueueError;
      }),
    });

    try {
      await expect(createApplication(command(), fake, policy)).rejects.toThrow('SUBMISSION_UNAVAILABLE');
      expect(alert).toHaveBeenCalledWith('application_reconciliation_enqueue_failed', {
        code: 'RECONCILIATION_ENQUEUE_FAILED',
        count: 1,
      });
      expect(JSON.stringify(alert.mock.calls)).not.toContain(validEntryInput.email);
      expect(JSON.stringify(alert.mock.calls)).not.toContain(command().idempotencyKey);
    } finally {
      alert.mockRestore();
    }
  });

  it('deletes the requested resume path when a later portfolio upload fails', async () => {
    let calls = 0;
    const deletedPaths: string[] = [];
    const { fake } = repository({
      uploadFile: vi.fn(async (path) => {
        calls += 1;
        if (calls === 2) throw new Error('storage detail');
        return path;
      }),
      deleteFile: vi.fn(async (path) => {
        deletedPaths.push(path);
      }),
    });
    const portfolio = new File([PDF_HEADER], 'portfolio.pdf', { type: 'application/pdf' });

    await expect(createApplication(command({ portfolio }), fake, policy)).rejects.toThrow(
      'APPLICATION_SAVE_FAILED',
    );
    expect(deletedPaths).toHaveLength(1);
    expect(deletedPaths[0]).toMatch(/\.pdf$/);
  });

  it('persists one canonical graph and returns only a random receipt', async () => {
    const { fake, storedGraphs } = repository();

    const result = await createApplication(command(), fake, policy);

    expect(Object.keys(result)).toEqual(['receiptCode']);
    expect(result.receiptCode).toMatch(/^MMG-[0-9A-F]{32}$/);
    expect(storedGraphs).toHaveLength(1);
    expect(storedGraphs[0]).toMatchObject({
      application: {
        idempotencyKey: command().idempotencyKey,
        name: validEntryInput.name,
        email: validEntryInput.email,
        receiptCode: result.receiptCode,
        privacyConsentVersion: 'test-approved-v1',
        privacyConsentAt: '2026-09-02T08:00:00.000Z',
        retentionUntil: '2026-10-02T08:00:00.000Z',
      },
      answers: [
        { answerKey: 'motivation', answerText: validEntryInput.motivation.trim(), displayOrder: 1 },
        { answerKey: 'strengths', answerText: validEntryInput.strengths.trim(), displayOrder: 2 },
        { answerKey: 'goals', answerText: validEntryInput.goals.trim(), displayOrder: 3 },
      ],
      files: [
        {
          fileKind: 'resume',
          originalFilename: 'resume.pdf',
          mimeType: 'application/pdf',
          sizeBytes: PDF_HEADER.byteLength,
          securityStatus: 'quarantined',
        },
      ],
    });
    expect(storedGraphs[0].answers).not.toContainEqual(expect.objectContaining({ answerKey: 'career_history' }));
  });

  it('validates schema and file signatures before consuming quota', async () => {
    const { fake } = repository();
    const invalidInput = { ...validEntryInput, email: 'not-an-email' };

    await expect(createApplication(command({ input: invalidInput }), fake, policy)).rejects.toThrow(
      'INVALID_APPLICATION',
    );
    await expect(createApplication(command({
      resume: new File(['MZ'], 'resume.pdf', { type: 'application/pdf' }),
    }), fake, policy)).rejects.toThrow('FILE_INVALID');
    expect(fake.consumeSubmissionQuota).not.toHaveBeenCalled();
  });

  it('generalizes quota infrastructure failures as unavailable', async () => {
    const { fake } = repository({
      consumeSubmissionQuota: vi.fn(async () => {
        throw new Error('rpc detail');
      }),
    });

    await expect(createApplication(command(), fake, policy)).rejects.toThrow('SUBMISSION_UNAVAILABLE');
  });

  it('returns a committed receipt after an ambiguous graph response without deleting uploaded files', async () => {
    const committedReceipt = 'MMG-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    let applicationId = '';
    const { fake } = repository({
      insertApplicationGraph: vi.fn(async (graph) => {
        applicationId = graph.application.id;
        throw new ApplicationRepositoryError('GRAPH_AMBIGUOUS');
      }),
      findApplicationByIdempotencyKey: vi.fn()
        .mockResolvedValueOnce(null)
        .mockImplementationOnce(async () => ({ applicationId, receiptCode: committedReceipt })),
    });

    await expect(createApplication(command(), fake, policy)).resolves.toEqual({ receiptCode: committedReceipt });
    expect(fake.deleteFile).not.toHaveBeenCalled();
  });

  it('cleans confirmed uploads when an ambiguous graph lookup proves a different application already owns the idempotency key', async () => {
    const committedReceipt = 'MMG-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    const { fake } = repository({
      insertApplicationGraph: vi.fn(async () => { throw new ApplicationRepositoryError('GRAPH_AMBIGUOUS'); }),
      findApplicationByIdempotencyKey: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          applicationId: '20000000-0000-4000-8000-000000000002',
          receiptCode: committedReceipt,
        }),
    });

    await expect(createApplication(command(), fake, policy)).resolves.toEqual({ receiptCode: committedReceipt });
    expect(fake.deleteFile).toHaveBeenCalledOnce();
  });

  it('keeps files and enqueues reconciliation when graph status is unknowable', async () => {
    const { fake } = repository({
      insertApplicationGraph: vi.fn(async () => { throw new ApplicationRepositoryError('GRAPH_AMBIGUOUS'); }),
      findApplicationByIdempotencyKey: vi.fn()
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new ApplicationRepositoryError('LOOKUP_UNAVAILABLE')),
    });

    await expect(createApplication(command(), fake, policy)).rejects.toThrow('SUBMISSION_PENDING');
    expect(fake.deleteFile).not.toHaveBeenCalled();
    expect(fake.enqueueFileReconciliation).toHaveBeenCalledOnce();
  });

  it('never deletes uploads when an ambiguous graph lookup is null and a commit can occur after the lookup', async () => {
    const { fake } = repository({
      insertApplicationGraph: vi.fn(async () => { throw new ApplicationRepositoryError('GRAPH_AMBIGUOUS'); }),
      findApplicationByIdempotencyKey: vi.fn().mockResolvedValue(null),
    });

    await expect(createApplication(command(), fake, policy)).rejects.toThrow('SUBMISSION_PENDING');
    expect(fake.deleteFile).not.toHaveBeenCalled();
    expect(fake.enqueueFileReconciliation).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'graph_status_unknown',
      idempotencyKey: command().idempotencyKey,
    }));
  });

  it('retries only receipt collisions without re-uploading files', async () => {
    const { fake } = repository({
      insertApplicationGraph: vi.fn()
        .mockRejectedValueOnce(new ApplicationRepositoryError('RECEIPT_COLLISION'))
        .mockResolvedValueOnce({ status: 'inserted', receiptCode: 'MMG-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' }),
    });

    await createApplication(command(), fake, policy);

    expect(fake.uploadFile).toHaveBeenCalledOnce();
    expect(fake.insertApplicationGraph).toHaveBeenCalledTimes(2);
    const first = vi.mocked(fake.insertApplicationGraph).mock.calls[0][0];
    const second = vi.mocked(fake.insertApplicationGraph).mock.calls[1][0];
    expect(first.application.receiptCode).not.toBe(second.application.receiptCode);
  });

  it('stops after three receipt collisions and cleans up the confirmed upload', async () => {
    const { fake } = repository({
      insertApplicationGraph: vi.fn(async () => {
        throw new ApplicationRepositoryError('RECEIPT_COLLISION');
      }),
    });

    await expect(createApplication(command(), fake, policy)).rejects.toThrow('APPLICATION_SAVE_FAILED');
    expect(fake.insertApplicationGraph).toHaveBeenCalledTimes(3);
    expect(fake.uploadFile).toHaveBeenCalledOnce();
    expect(fake.deleteFile).toHaveBeenCalledOnce();
  });
});
