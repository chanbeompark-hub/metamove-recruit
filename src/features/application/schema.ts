import { z } from 'zod';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
} as const;

const careerHistoryEntrySchema = z.object({
  company: z.string().trim().min(1),
  role: z.string().trim().min(1),
  months: z.number().int().min(1),
});

const essaySchema = z.string().trim().min(100).max(2000);

export const applicationSchema = z
  .object({
    name: z.string().trim().min(2).max(50),
    phone: z.string().regex(/^01[016789]-?\d{3,4}-?\d{4}$/),
    email: z.string().email().max(254),
    level: z.enum(['entry', 'experienced']),
    availableFrom: z.iso.date(),
    careerMonths: z.number().int().min(0).max(600),
    careerHistory: z.array(careerHistoryEntrySchema),
    certifications: z.array(z.string().trim().min(1)).max(20),
    specialties: z.array(z.string().trim().min(1)).min(1).max(10),
    motivation: essaySchema,
    strengths: essaySchema,
    goals: essaySchema,
    privacyConsent: z.literal(true),
  })
  .superRefine((value, context) => {
    if (value.level === 'entry') {
      if (value.careerMonths !== 0) {
        context.addIssue({
          code: 'custom',
          path: ['careerMonths'],
          message: '신입 지원자의 경력 기간은 0개월이어야 합니다.',
        });
      }
      if (value.careerHistory.length > 0) {
        context.addIssue({
          code: 'custom',
          path: ['careerHistory'],
          message: '신입 지원자는 근무 이력을 입력할 수 없습니다.',
        });
      }
    } else {
      if (value.careerMonths <= 0) {
        context.addIssue({
          code: 'custom',
          path: ['careerMonths'],
          message: '경력자의 경력 기간은 1개월 이상이어야 합니다.',
        });
      }
      if (value.careerHistory.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['careerHistory'],
          message: '경력자는 근무 이력을 한 개 이상 입력해주세요.',
        });
      } else if (
        value.careerHistory.reduce((total, item) => total + item.months, 0) !==
        value.careerMonths
      ) {
        context.addIssue({
          code: 'custom',
          path: ['careerMonths'],
          message: '경력 기간과 근무 이력의 합계가 일치해야 합니다.',
        });
      }
    }

    if (new Set(value.certifications).size !== value.certifications.length) {
      context.addIssue({
        code: 'custom',
        path: ['certifications'],
        message: '자격증은 중복해서 입력할 수 없습니다.',
      });
    }
    if (new Set(value.specialties).size !== value.specialties.length) {
      context.addIssue({
        code: 'custom',
        path: ['specialties'],
        message: '전문 분야는 중복해서 입력할 수 없습니다.',
      });
    }
  });

export type ApplicantLevel = z.infer<typeof applicationSchema>['level'];
export type ApplicationInput = z.infer<typeof applicationSchema>;
