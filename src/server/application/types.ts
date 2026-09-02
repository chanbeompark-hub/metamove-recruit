import type { ApplicantLevel } from '../../features/application/schema';

export type ApplicationPolicy = {
  privacyConsentVersion: string;
  privacyRetentionDays: number;
};

export type CreateApplicationCommand = {
  input: unknown;
  actorHash: string;
  resume: File | null;
  portfolio?: File | null;
};

export type PersistedApplicationRecord = {
  id: string;
  receiptCode: string;
  name: string;
  phone: string;
  email: string;
  level: ApplicantLevel;
  availableFrom: string;
  careerMonths: number;
  specialties: string[];
  certifications: string[];
  privacyConsentVersion: string;
  privacyConsentAt: string;
  retentionUntil: string;
};

export type PersistedApplicationAnswer = {
  answerKey: 'career_history' | 'motivation' | 'strengths' | 'goals';
  answerText: string | null;
  answerJson: unknown | null;
  displayOrder: number;
};

export type PersistedApplicationFile = {
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  fileKind: 'resume' | 'portfolio';
};

export type PersistedApplication = {
  application: PersistedApplicationRecord;
  answers: PersistedApplicationAnswer[];
  files: PersistedApplicationFile[];
};

export interface ApplicationRepository {
  consumeSubmissionQuota(
    actorHash: string,
    maximum: number,
    windowSeconds: number,
  ): Promise<boolean>;
  uploadFile(path: string, file: File): Promise<string>;
  insertApplicationGraph(input: PersistedApplication): Promise<void>;
  deleteFile(path: string): Promise<void>;
}

export type ApplicationDomainErrorCode =
  | 'INVALID_APPLICATION'
  | 'FILE_REQUIRED'
  | 'FILE_INVALID'
  | 'FILE_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'POLICY_UNAVAILABLE'
  | 'SUBMISSION_UNAVAILABLE'
  | 'APPLICATION_SAVE_FAILED';

export class ApplicationDomainError extends Error {
  readonly code: ApplicationDomainErrorCode;

  constructor(code: ApplicationDomainErrorCode) {
    super(code);
    this.name = 'ApplicationDomainError';
    this.code = code;
  }
}
