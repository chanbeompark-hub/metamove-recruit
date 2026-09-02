import { validateApplicationFile, type ValidatedApplicationFile } from '../../features/application/fileValidation';
import { applicationSchema, type ApplicationInput } from '../../features/application/schema';
import {
  ApplicationDomainError,
  type ApplicationPolicy,
  type ApplicationRepository,
  type CreateApplicationCommand,
  type PersistedApplication,
  type PersistedApplicationAnswer,
  type PersistedApplicationFile,
} from './types';

const SUBMISSION_MAXIMUM = 5;
const SUBMISSION_WINDOW_SECONDS = 10 * 60;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function validatedPolicy(policy: ApplicationPolicy) {
  const privacyConsentVersion = policy.privacyConsentVersion.trim();
  if (
    !privacyConsentVersion
    || !Number.isSafeInteger(policy.privacyRetentionDays)
    || policy.privacyRetentionDays <= 0
  ) {
    throw new ApplicationDomainError('POLICY_UNAVAILABLE');
  }
  return { privacyConsentVersion, privacyRetentionDays: policy.privacyRetentionDays };
}

function domainFileError(code: string) {
  if (code === 'FILE_REQUIRED') return new ApplicationDomainError('FILE_REQUIRED');
  if (code === 'FILE_TOO_LARGE') return new ApplicationDomainError('FILE_TOO_LARGE');
  return new ApplicationDomainError('FILE_INVALID');
}

function randomReceiptCode() {
  return `MMG-${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`;
}

function randomStoragePath(applicationId: string, file: ValidatedApplicationFile) {
  return `applications/${applicationId}/${crypto.randomUUID()}${file.extension}`;
}

function applicationAnswers(input: ApplicationInput): PersistedApplicationAnswer[] {
  const answers: PersistedApplicationAnswer[] = [];
  let displayOrder = 1;
  if (input.level === 'experienced') {
    answers.push({
      answerKey: 'career_history',
      answerText: null,
      answerJson: input.careerHistory,
      displayOrder,
    });
    displayOrder += 1;
  }

  for (const [answerKey, answerText] of [
    ['motivation', input.motivation],
    ['strengths', input.strengths],
    ['goals', input.goals],
  ] as const) {
    answers.push({ answerKey, answerText, answerJson: null, displayOrder });
    displayOrder += 1;
  }
  return answers;
}

async function deleteAll(repository: ApplicationRepository, paths: string[]) {
  await Promise.allSettled(paths.map((path) => repository.deleteFile(path)));
}

export async function createApplication(
  command: CreateApplicationCommand,
  repository: ApplicationRepository,
  policy: ApplicationPolicy,
): Promise<{ receiptCode: string }> {
  const approvedPolicy = validatedPolicy(policy);
  const parsed = applicationSchema.safeParse(command.input);
  if (!parsed.success || !/^[0-9a-f]{64}$/.test(command.actorHash)) {
    throw new ApplicationDomainError('INVALID_APPLICATION');
  }

  const resumeResult = await validateApplicationFile(command.resume, { required: true });
  if (!resumeResult.ok) throw domainFileError(resumeResult.code);
  if (!resumeResult.value) throw new ApplicationDomainError('FILE_REQUIRED');
  const portfolioResult = await validateApplicationFile(command.portfolio ?? null, { required: false });
  if (!portfolioResult.ok) throw domainFileError(portfolioResult.code);

  let quotaAllowed: boolean;
  try {
    quotaAllowed = await repository.consumeSubmissionQuota(
      command.actorHash,
      SUBMISSION_MAXIMUM,
      SUBMISSION_WINDOW_SECONDS,
    );
  } catch {
    throw new ApplicationDomainError('SUBMISSION_UNAVAILABLE');
  }
  if (!quotaAllowed) throw new ApplicationDomainError('RATE_LIMITED');

  const applicationId = crypto.randomUUID();
  const receiptCode = randomReceiptCode();
  const consentAt = new Date();
  const retentionUntil = new Date(
    consentAt.getTime() + approvedPolicy.privacyRetentionDays * DAY_MILLISECONDS,
  );
  if (Number.isNaN(retentionUntil.getTime())) {
    throw new ApplicationDomainError('POLICY_UNAVAILABLE');
  }

  const filesToUpload: Array<{
    kind: 'resume' | 'portfolio';
    validated: ValidatedApplicationFile;
  }> = [{ kind: 'resume', validated: resumeResult.value }];
  if (portfolioResult.value) {
    filesToUpload.push({ kind: 'portfolio', validated: portfolioResult.value });
  }
  const cleanupPaths: string[] = [];
  const persistedFiles: PersistedApplicationFile[] = [];

  try {
    for (const upload of filesToUpload) {
      const storagePath = randomStoragePath(applicationId, upload.validated);
      cleanupPaths.push(storagePath);
      const returnedPath = await repository.uploadFile(storagePath, upload.validated.file);
      if (returnedPath !== storagePath) throw new Error('unexpected storage path');
      persistedFiles.push({
        storagePath,
        originalFilename: upload.validated.originalFilename,
        mimeType: upload.validated.mimeType,
        sizeBytes: upload.validated.sizeBytes,
        fileKind: upload.kind,
      });
    }

    const input = parsed.data;
    const graph: PersistedApplication = {
      application: {
        id: applicationId,
        receiptCode,
        name: input.name,
        phone: input.phone,
        email: input.email,
        level: input.level,
        availableFrom: input.availableFrom,
        careerMonths: input.careerMonths,
        specialties: input.specialties,
        certifications: input.certifications,
        privacyConsentVersion: approvedPolicy.privacyConsentVersion,
        privacyConsentAt: consentAt.toISOString(),
        retentionUntil: retentionUntil.toISOString(),
      },
      answers: applicationAnswers(input),
      files: persistedFiles,
    };
    await repository.insertApplicationGraph(graph);
  } catch {
    await deleteAll(repository, cleanupPaths);
    throw new ApplicationDomainError('APPLICATION_SAVE_FAILED');
  }

  return { receiptCode };
}
