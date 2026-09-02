import type { ApplicationInput } from './types';

export const DRAFT_KEY = 'metamove-application-draft-v1';
export const DRAFT_WARNING = '임시 저장을 사용할 수 없습니다. 작성은 계속할 수 있습니다.';

const DRAFT_VERSION = 1;

export type ApplicationDraft = Partial<Omit<ApplicationInput, 'privacyConsent'>>;

type DraftEnvelope = {
  version: typeof DRAFT_VERSION;
  data: ApplicationDraft;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

function careerHistory(value: unknown): ApplicationInput['careerHistory'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const valid = value.every((item) => (
    isRecord(item)
    && typeof item.company === 'string'
    && typeof item.role === 'string'
    && typeof item.months === 'number'
    && Number.isFinite(item.months)
  ));
  return valid ? value as ApplicationInput['careerHistory'] : undefined;
}

function sanitizeDraft(value: unknown): ApplicationDraft {
  if (!isRecord(value)) return {};

  const result: ApplicationDraft = {};
  if (typeof value.name === 'string') result.name = value.name;
  if (typeof value.phone === 'string') result.phone = value.phone;
  if (typeof value.email === 'string') result.email = value.email;
  if (value.level === 'entry' || value.level === 'experienced') result.level = value.level;
  if (typeof value.availableFrom === 'string') result.availableFrom = value.availableFrom;
  if (typeof value.careerMonths === 'number' && Number.isFinite(value.careerMonths)) {
    result.careerMonths = value.careerMonths;
  }

  const history = careerHistory(value.careerHistory);
  const certifications = stringArray(value.certifications);
  const specialties = stringArray(value.specialties);
  if (history) result.careerHistory = history;
  if (certifications) result.certifications = certifications;
  if (specialties) result.specialties = specialties;
  if (typeof value.motivation === 'string') result.motivation = value.motivation;
  if (typeof value.strengths === 'string') result.strengths = value.strengths;
  if (typeof value.goals === 'string') result.goals = value.goals;
  return result;
}

export function saveDraft(value: ApplicationDraft, onError?: () => void): boolean {
  try {
    const envelope: DraftEnvelope = { version: DRAFT_VERSION, data: sanitizeDraft(value) };
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    onError?.();
    return false;
  }
}

export function loadDraft(onError?: () => void): ApplicationDraft {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    if ('version' in parsed || 'data' in parsed) {
      if (parsed.version !== DRAFT_VERSION || !isRecord(parsed.data)) return {};
      return sanitizeDraft(parsed.data);
    }

    return sanitizeDraft(parsed);
  } catch {
    onError?.();
    return {};
  }
}

export function clearDraft(onError?: () => void): boolean {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
    return true;
  } catch {
    onError?.();
    return false;
  }
}
