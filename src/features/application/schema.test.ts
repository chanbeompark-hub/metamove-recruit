import { describe, expect, it } from 'vitest';

import { applicationSchema } from './schema';
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

  it('exposes the file upload limit and allowlist', async () => {
    const { ALLOWED_FILE_TYPES, MAX_FILE_BYTES } = await import('./schema');

    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(ALLOWED_FILE_TYPES).toEqual({
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    });
  });
});
