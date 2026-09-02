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
    if (value.level === 'experienced' && value.careerHistory.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['careerHistory'],
        message: '경력자는 근무 이력을 한 개 이상 입력해주세요.',
      });
    }
  });

export type ApplicantLevel = z.infer<typeof applicationSchema>['level'];
export type ApplicationInput = z.infer<typeof applicationSchema>;
