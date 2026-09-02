import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validEntryInput } from '../../test/fixtures/application';
import { createApplication } from './createApplication';
import type {
  ApplicationPolicy,
  ApplicationRepository,
  CreateApplicationCommand,
  PersistedApplication,
} from './types';

const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const policy: ApplicationPolicy = {
  privacyConsentVersion: 'test-approved-v1',
  privacyRetentionDays: 30,
};

function command(overrides: Partial<CreateApplicationCommand> = {}): CreateApplicationCommand {
  return {
    input: validEntryInput,
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
    insertApplicationGraph: vi.fn(async (graph) => {
      storedGraphs.push(graph);
    }),
    deleteFile: vi.fn(async (path) => {
      deletedPaths.push(path);
    }),
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

  it('deletes both requested random paths when graph insertion fails', async () => {
    const { fake, uploadedPaths, deletedPaths } = repository({
      insertApplicationGraph: vi.fn(async () => {
        throw new Error('database detail');
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

  it('attempts every cleanup even when one delete fails', async () => {
    const deletedPaths: string[] = [];
    const { fake } = repository({
      insertApplicationGraph: vi.fn(async () => {
        throw new Error('database detail');
      }),
      deleteFile: vi.fn(async (path) => {
        deletedPaths.push(path);
        if (deletedPaths.length === 1) throw new Error('cleanup detail');
      }),
    });
    const portfolio = new File([PDF_HEADER], 'portfolio.pdf', { type: 'application/pdf' });

    await expect(createApplication(command({ portfolio }), fake, policy)).rejects.toThrow(
      'APPLICATION_SAVE_FAILED',
    );
    expect(deletedPaths).toHaveLength(2);
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
    expect(deletedPaths).toHaveLength(2);
  });

  it('persists one canonical graph and returns only a random receipt', async () => {
    const { fake, storedGraphs } = repository();

    const result = await createApplication(command(), fake, policy);

    expect(Object.keys(result)).toEqual(['receiptCode']);
    expect(result.receiptCode).toMatch(/^MMG-[0-9A-F]{32}$/);
    expect(storedGraphs).toHaveLength(1);
    expect(storedGraphs[0]).toMatchObject({
      application: {
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
});
