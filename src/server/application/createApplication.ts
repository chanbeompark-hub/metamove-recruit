import { validateApplicationFile, type ValidatedApplicationFile } from '../../features/application/fileValidation';
import { applicationSchema, type ApplicationInput } from '../../features/application/schema';
import { ApplicationDomainError, type ApplicationPolicy, type ApplicationRepository, type CreateApplicationCommand, type PersistedApplication, type PersistedApplicationAnswer, type PersistedApplicationFile } from './types';

const SUBMISSION_MAXIMUM = 5;
const SUBMISSION_WINDOW_SECONDS = 10 * 60;
const RECEIPT_ATTEMPTS = 3;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function validatedPolicy(policy: ApplicationPolicy) {
  const privacyConsentVersion = policy.privacyConsentVersion.trim();
  if (!privacyConsentVersion || !Number.isSafeInteger(policy.privacyRetentionDays) || policy.privacyRetentionDays <= 0) throw new ApplicationDomainError('POLICY_UNAVAILABLE');
  return { privacyConsentVersion, privacyRetentionDays: policy.privacyRetentionDays };
}
function domainFileError(code: string) {
  if (code === 'FILE_REQUIRED') return new ApplicationDomainError('FILE_REQUIRED');
  if (code === 'FILE_TOO_LARGE') return new ApplicationDomainError('FILE_TOO_LARGE');
  return new ApplicationDomainError('FILE_INVALID');
}
function randomReceiptCode() { return `MMG-${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`; }
function randomStoragePath(applicationId: string, file: ValidatedApplicationFile) { return `applications/${applicationId}/${crypto.randomUUID()}${file.extension}`; }
function repositoryCode(error: unknown) { return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''; }

function applicationAnswers(input: ApplicationInput): PersistedApplicationAnswer[] {
  const answers: PersistedApplicationAnswer[] = [];
  let displayOrder = 1;
  if (input.level === 'experienced') {
    answers.push({ answerKey: 'career_history', answerText: null, answerJson: input.careerHistory, displayOrder });
    displayOrder += 1;
  }
  for (const [answerKey, answerText] of [['motivation', input.motivation], ['strengths', input.strengths], ['goals', input.goals]] as const) {
    answers.push({ answerKey, answerText, answerJson: null, displayOrder });
    displayOrder += 1;
  }
  return answers;
}

async function enqueueReconciliation(repository: ApplicationRepository, applicationId: string, idempotencyKey: string, paths: string[], reason: 'cleanup_failed' | 'graph_status_unknown') {
  try {
    await repository.enqueueFileReconciliation({ applicationId, idempotencyKey, paths, reason });
  } catch {
    globalThis.console.error('application_reconciliation_enqueue_failed', {
      code: 'RECONCILIATION_ENQUEUE_FAILED',
      count: 1,
    });
    throw new ApplicationDomainError('SUBMISSION_UNAVAILABLE');
  }
}

async function cleanupOrPending(repository: ApplicationRepository, applicationId: string, idempotencyKey: string, paths: string[]) {
  const results = await Promise.allSettled(paths.map((path) => repository.deleteFile(path)));
  const failed = paths.filter((_path, index) => results[index].status === 'rejected');
  if (failed.length) {
    await enqueueReconciliation(repository, applicationId, idempotencyKey, failed, 'cleanup_failed');
    throw new ApplicationDomainError('SUBMISSION_PENDING');
  }
}

async function resolveAmbiguousGraph(
  repository: ApplicationRepository,
  applicationId: string,
  idempotencyKey: string,
  uploadedPaths: string[],
) {
  let existing: { applicationId: string; receiptCode: string } | null;
  try {
    existing = await repository.findApplicationByIdempotencyKey(idempotencyKey);
  } catch {
    await enqueueReconciliation(repository, applicationId, idempotencyKey, uploadedPaths, 'graph_status_unknown');
    throw new ApplicationDomainError('SUBMISSION_PENDING');
  }

  if (!existing) {
    await enqueueReconciliation(repository, applicationId, idempotencyKey, uploadedPaths, 'graph_status_unknown');
    throw new ApplicationDomainError('SUBMISSION_PENDING');
  }
  if (existing.applicationId === applicationId) return { receiptCode: existing.receiptCode };

  await cleanupOrPending(repository, applicationId, idempotencyKey, uploadedPaths);
  return { receiptCode: existing.receiptCode };
}

export async function createApplication(command: CreateApplicationCommand, repository: ApplicationRepository, policy: ApplicationPolicy): Promise<{ receiptCode: string }> {
  const approvedPolicy = validatedPolicy(policy);
  const parsed = applicationSchema.safeParse(command.input);
  if (!parsed.success || !/^[0-9a-f]{64}$/.test(command.actorHash) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.idempotencyKey)) throw new ApplicationDomainError('INVALID_APPLICATION');

  const resumeResult = await validateApplicationFile(command.resume, { required: true });
  if (!resumeResult.ok) throw domainFileError(resumeResult.code);
  if (!resumeResult.value) throw new ApplicationDomainError('FILE_REQUIRED');
  const portfolioResult = await validateApplicationFile(command.portfolio ?? null, { required: false });
  if (!portfolioResult.ok) throw domainFileError(portfolioResult.code);

  try {
    const existing = await repository.findApplicationByIdempotencyKey(command.idempotencyKey);
    if (existing) return { receiptCode: existing.receiptCode };
  } catch { throw new ApplicationDomainError('SUBMISSION_UNAVAILABLE'); }
  try {
    if (!await repository.consumeSubmissionQuota(command.actorHash, SUBMISSION_MAXIMUM, SUBMISSION_WINDOW_SECONDS)) throw new ApplicationDomainError('RATE_LIMITED');
  } catch (error) {
    if (error instanceof ApplicationDomainError) throw error;
    throw new ApplicationDomainError('SUBMISSION_UNAVAILABLE');
  }

  const applicationId = crypto.randomUUID();
  const consentAt = new Date();
  const retentionUntil = new Date(consentAt.getTime() + approvedPolicy.privacyRetentionDays * DAY_MILLISECONDS);
  if (Number.isNaN(retentionUntil.getTime())) throw new ApplicationDomainError('POLICY_UNAVAILABLE');
  const uploads: Array<{ kind: 'resume' | 'portfolio'; validated: ValidatedApplicationFile }> = [{ kind: 'resume', validated: resumeResult.value }];
  if (portfolioResult.value) uploads.push({ kind: 'portfolio', validated: portfolioResult.value });
  const uploadedPaths: string[] = [];
  const persistedFiles: PersistedApplicationFile[] = [];

  try {
    for (const upload of uploads) {
      const storagePath = randomStoragePath(applicationId, upload.validated);
      const returnedPath = await repository.uploadFile(storagePath, upload.validated.file, upload.validated.mimeType);
      if (returnedPath !== storagePath) throw new Error('storage acknowledgement mismatch');
      uploadedPaths.push(storagePath);
      persistedFiles.push({ storagePath, originalFilename: upload.validated.originalFilename, mimeType: upload.validated.mimeType, sizeBytes: upload.validated.sizeBytes, fileKind: upload.kind, securityStatus: 'quarantined' });
    }
  } catch {
    await cleanupOrPending(repository, applicationId, command.idempotencyKey, uploadedPaths);
    throw new ApplicationDomainError('APPLICATION_SAVE_FAILED');
  }

  const input = parsed.data;
  let graph: PersistedApplication = {
    application: {
      id: applicationId, idempotencyKey: command.idempotencyKey, receiptCode: randomReceiptCode(), name: input.name, phone: input.phone, email: input.email,
      level: input.level, availableFrom: input.availableFrom, careerMonths: input.careerMonths, specialties: input.specialties, certifications: input.certifications,
      privacyConsentVersion: approvedPolicy.privacyConsentVersion, privacyConsentAt: consentAt.toISOString(), retentionUntil: retentionUntil.toISOString(),
    },
    answers: applicationAnswers(input), files: persistedFiles,
  };

  for (let attempt = 0; attempt < RECEIPT_ATTEMPTS; attempt += 1) {
    try {
      const result = await repository.insertApplicationGraph(graph);
      if (result.status === 'replayed') await cleanupOrPending(repository, applicationId, command.idempotencyKey, uploadedPaths);
      return { receiptCode: result.receiptCode };
    } catch (error) {
      const code = repositoryCode(error);
      if (code === 'RECEIPT_COLLISION' && attempt + 1 < RECEIPT_ATTEMPTS) {
        graph = { ...graph, application: { ...graph.application, receiptCode: randomReceiptCode() } };
        continue;
      }
      if (code === 'GRAPH_AMBIGUOUS') {
        return resolveAmbiguousGraph(repository, applicationId, command.idempotencyKey, uploadedPaths);
      }
      await cleanupOrPending(repository, applicationId, command.idempotencyKey, uploadedPaths);
      throw new ApplicationDomainError('APPLICATION_SAVE_FAILED');
    }
  }
  await cleanupOrPending(repository, applicationId, command.idempotencyKey, uploadedPaths);
  throw new ApplicationDomainError('APPLICATION_SAVE_FAILED');
}
