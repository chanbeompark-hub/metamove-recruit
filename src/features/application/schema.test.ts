import { describe, expect, it } from 'vitest';

import {
  ALLOWED_FILE_TYPES,
  applicationSchema,
  MAX_FILE_BYTES,
} from './schema';
import { validEntryInput } from '../../test/fixtures/application';

describe('applicationSchema', () => {
  it('accepts a valid entry applicant without career history', () => {
    expect(applicationSchema.safeParse(validEntryInput).success).toBe(true);
  });

  it('requires career history only for experienced applicants', () => {
    const result = applicationSchema.safeParse({
      ...validEntryInput,
      level: 'experienced',
      careerHistory: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual({
        code: 'custom',
        path: ['careerHistory'],
        message: '경력자는 근무 이력을 한 개 이상 입력해주세요.',
      });
    }
  });

  it('enforces the zero-career invariant for entry applicants', () => {
    const nonzeroWithoutHistory = applicationSchema.safeParse({
      ...validEntryInput,
      careerMonths: 1,
    });
    const historyWithoutCareer = applicationSchema.safeParse({
      ...validEntryInput,
      careerHistory: [{ company: '가상센터', role: '트레이너', months: 1 }],
    });
    const nonzeroWithHistory = applicationSchema.safeParse({
      ...validEntryInput,
      careerMonths: 1,
      careerHistory: [{ company: '가상센터', role: '트레이너', months: 1 }],
    });

    expect(nonzeroWithoutHistory.success).toBe(false);
    expect(historyWithoutCareer.success).toBe(false);
    expect(nonzeroWithHistory.success).toBe(false);
    if (!nonzeroWithoutHistory.success) {
      expect(nonzeroWithoutHistory.error.issues).toContainEqual({
        code: 'custom',
        path: ['careerMonths'],
        message: '신입 지원자의 경력 기간은 0개월이어야 합니다.',
      });
    }
    if (!historyWithoutCareer.success) {
      expect(historyWithoutCareer.error.issues).toContainEqual({
        code: 'custom',
        path: ['careerHistory'],
        message: '신입 지원자는 근무 이력을 입력할 수 없습니다.',
      });
    }
  });

  it('enforces positive, matching career data for experienced applicants', () => {
    const noCareerMonths = applicationSchema.safeParse({
      ...validEntryInput,
      level: 'experienced',
      careerMonths: 0,
      careerHistory: [],
    });
    const historyWithoutCareerMonths = applicationSchema.safeParse({
      ...validEntryInput,
      level: 'experienced',
      careerMonths: 0,
      careerHistory: [{ company: '가상센터', role: '트레이너', months: 1 }],
    });
    const careerMonthsWithoutHistory = applicationSchema.safeParse({
      ...validEntryInput,
      level: 'experienced',
      careerMonths: 24,
      careerHistory: [],
    });
    const mismatchedCareerMonths = applicationSchema.safeParse({
      ...validEntryInput,
      level: 'experienced',
      careerMonths: 24,
      careerHistory: [{ company: '가상센터', role: '트레이너', months: 12 }],
    });

    expect(noCareerMonths.success).toBe(false);
    expect(historyWithoutCareerMonths.success).toBe(false);
    expect(careerMonthsWithoutHistory.success).toBe(false);
    expect(mismatchedCareerMonths.success).toBe(false);
    if (!noCareerMonths.success) {
      expect(noCareerMonths.error.issues).toContainEqual({
        code: 'custom',
        path: ['careerMonths'],
        message: '경력자의 경력 기간은 1개월 이상이어야 합니다.',
      });
    }
    if (!mismatchedCareerMonths.success) {
      expect(mismatchedCareerMonths.error.issues).toContainEqual({
        code: 'custom',
        path: ['careerMonths'],
        message: '경력 기간과 근무 이력의 합계가 일치해야 합니다.',
      });
    }
  });

  it('accepts an experienced applicant with a valid career history', () => {
    const result = applicationSchema.safeParse({
      ...validEntryInput,
      level: 'experienced',
      careerMonths: 24,
      careerHistory: [{ company: '가상센터', role: '트레이너', months: 24 }],
    });

    expect(result.success).toBe(true);
  });

  it('rejects an essay shorter than 100 Korean characters', () => {
    const result = applicationSchema.safeParse({
      ...validEntryInput,
      motivation: '짧은 답변',
    });

    expect(result.success).toBe(false);
  });

  it('counts essay characters after trimming surrounding whitespace', () => {
    const result = applicationSchema.safeParse({
      ...validEntryInput,
      motivation: `   ${'가'.repeat(99)}   `,
    });

    expect(result.success).toBe(false);
  });

  it('trims bounded text fields in the parsed value', () => {
    const result = applicationSchema.safeParse({
      ...validEntryInput,
      name: '  테스트지원자  ',
      careerHistory: [{ company: '  가상센터  ', role: '  트레이너  ', months: 1 }],
      level: 'experienced',
      careerMonths: 1,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('테스트지원자');
      expect(result.data.careerHistory[0]).toEqual({
        company: '가상센터',
        role: '트레이너',
        months: 1,
      });
    }
  });

  it('rejects invalid phone, email, and calendar dates', () => {
    expect(applicationSchema.safeParse({ ...validEntryInput, phone: '010-123-456' }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...validEntryInput, email: 'not-an-email' }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...validEntryInput, availableFrom: '2026-02-30' }).success).toBe(false);
  });

  it('rejects non-integer and out-of-range career months', () => {
    expect(applicationSchema.safeParse({ ...validEntryInput, careerMonths: 1.5 }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...validEntryInput, careerMonths: -1 }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...validEntryInput, careerMonths: 601 }).success).toBe(false);
  });

  it('rejects empty or oversized attribute arrays', () => {
    expect(applicationSchema.safeParse({ ...validEntryInput, specialties: [] }).success).toBe(false);
    expect(applicationSchema.safeParse({
      ...validEntryInput,
      specialties: Array.from({ length: 11 }, (_, index) => `전문 분야 ${index}`),
    }).success).toBe(false);
    expect(applicationSchema.safeParse({
      ...validEntryInput,
      certifications: Array.from({ length: 21 }, (_, index) => `자격증 ${index}`),
    }).success).toBe(false);
  });

  it('accepts an essay at the minimum and rejects one over the maximum', () => {
    expect(applicationSchema.safeParse({ ...validEntryInput, motivation: '가'.repeat(100) }).success).toBe(true);
    expect(applicationSchema.safeParse({ ...validEntryInput, motivation: '가'.repeat(2001) }).success).toBe(false);
  });

  it('requires explicit privacy consent', () => {
    expect(applicationSchema.safeParse({ ...validEntryInput, privacyConsent: false }).success).toBe(false);
  });

  it('rejects duplicate certifications and specialties after trimming', () => {
    const duplicateCertifications = applicationSchema.safeParse({
      ...validEntryInput,
      certifications: [' 생활스포츠지도사 ', '생활스포츠지도사'],
    });
    const duplicateSpecialties = applicationSchema.safeParse({
      ...validEntryInput,
      specialties: [' 웨이트 트레이닝 ', '웨이트 트레이닝'],
    });

    expect(duplicateCertifications.success).toBe(false);
    expect(duplicateSpecialties.success).toBe(false);
    if (!duplicateCertifications.success) {
      expect(duplicateCertifications.error.issues).toContainEqual({
        code: 'custom',
        path: ['certifications'],
        message: '자격증은 중복해서 입력할 수 없습니다.',
      });
    }
    if (!duplicateSpecialties.success) {
      expect(duplicateSpecialties.error.issues).toContainEqual({
        code: 'custom',
        path: ['specialties'],
        message: '전문 분야는 중복해서 입력할 수 없습니다.',
      });
    }
  });

  it('exposes the exact file upload limit and allowlist', () => {
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(ALLOWED_FILE_TYPES).toEqual({
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    });
  });
});
