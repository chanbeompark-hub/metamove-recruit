# Metamove Gym Application Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a five-step trainer application flow that validates applicant data, uploads private resume files, records consent, and returns a receipt without exposing submitted data.

**Architecture:** React Hook Form and Zod own browser form state and validation; session storage preserves an unfinished application on the same device. A Cloudflare Pages Function delegates to a testable server service that writes private files and relational records through a server-only Supabase service key. The browser never receives the service key or a permanent file URL.

**Tech Stack:** Existing public-site stack plus React Hook Form 7.87.0, Zod 4.5.4, `@hookform/resolvers` 5.9.1, Supabase JS 2.112.4, Wrangler 4.127.1, Supabase CLI 2.116.0, Cloudflare Pages Turnstile plugin 1.0.2, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-metamove-gym-recruitment-design.md`

## Global Constraints

- Steps are `기본 정보 / 경력·자격 / 자기소개서 / 서류 첨부 / 검토·제출`.
- Entry applicants do not see required career-history fields; experienced applicants do.
- Required essays are 지원 동기, 트레이너로서의 강점, 메타무브짐에서 이루고 싶은 목표.
- Resume is required; portfolio is optional; each file is at most 10MB.
- Allowed files are PDF, DOC, and DOCX with matching MIME and extension.
- Every submission must pass Cloudflare Turnstile and a server-side limit of five attempts per hashed actor key in ten minutes.
- Submitted answers are not displayed after success; show only receipt and next-process copy.
- Actual submission is disabled unless `PRIVACY_CONSENT_VERSION` and positive `PRIVACY_RETENTION_DAYS` are configured from company-approved policy text.
- Anonymous users cannot read, update, or delete application data or files.
- Do not create an `AGENTS.md` inside the project.

## File Structure

- `src/features/application/schema.ts`, `types.ts`: canonical client/server data contract.
- `src/features/application/store.ts`: same-device draft persistence without files.
- `src/features/application/components/*`: stepper, five steps, errors, success.
- `src/features/application/api.ts`: browser multipart submission client.
- `functions/api/applications.ts`: Cloudflare HTTP adapter only.
- `src/server/application/createApplication.ts`: validation and orchestration.
- `src/server/application/repository.ts`: Supabase database/storage adapter.
- `supabase/migrations/0001_application_intake.sql`: tables, private bucket, RLS.
- `src/server/application/*.test.ts`, `e2e/application.spec.ts`: service and full-flow proof.

---

### Task 1: Define the canonical application schema

**Files:**
- Create: `src/features/application/types.ts`
- Create: `src/features/application/schema.ts`
- Create: `src/test/fixtures/application.ts`
- Test: `src/features/application/schema.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `applicationSchema`, `ApplicationInput`, `ApplicantLevel`, `MAX_FILE_BYTES`, `ALLOWED_FILE_TYPES`.
- Consumes: no UI or server implementation.

- [ ] **Step 1: Write conditional validation tests**

```ts
// src/test/fixtures/application.ts
export const validEntryInput = {
  name: '테스트지원자', phone: '010-1234-5678', email: 'applicant@example.test',
  level: 'entry' as const, availableFrom: '2026-09-15', careerMonths: 0, careerHistory: [],
  certifications: ['생활스포츠지도사'], specialties: ['웨이트 트레이닝'],
  motivation: '지원 동기 테스트 문장입니다. '.repeat(8),
  strengths: '트레이너 강점 테스트 문장입니다. '.repeat(8),
  goals: '입사 후 목표 테스트 문장입니다. '.repeat(8),
  privacyConsent: true as const
};

// src/features/application/schema.test.ts
import { validEntryInput } from '../../test/fixtures/application';

it('requires career history only for experienced applicants', () => {
  expect(applicationSchema.safeParse(validEntryInput).success).toBe(true);
  const result = applicationSchema.safeParse({ ...validEntryInput, level: 'experienced', careerHistory: [] });
  expect(result.success).toBe(false);
});

it('rejects an essay shorter than 100 Korean characters', () => {
  const result = applicationSchema.safeParse({ ...validEntryInput, motivation: '짧은 답변' });
  expect(result.success).toBe(false);
});
```

- [ ] **Step 2: Install schema dependencies and verify failure**

Run: `npm install zod@4.5.4 react-hook-form@7.87.0 @hookform/resolvers@5.9.1 @supabase/supabase-js@2.112.4 @cloudflare/pages-plugin-turnstile@1.0.2 && npm install -D wrangler@4.127.1 && npm test -- src/features/application/schema.test.ts`

Expected: FAIL because `applicationSchema` is missing.

- [ ] **Step 3: Implement the exact input contract**

```ts
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
} as const;

export const applicationSchema = z.object({
  name: z.string().trim().min(2).max(50),
  phone: z.string().regex(/^01[016789]-?\d{3,4}-?\d{4}$/),
  email: z.string().email().max(254),
  level: z.enum(['entry', 'experienced']),
  availableFrom: z.iso.date(),
  careerMonths: z.number().int().min(0).max(600),
  careerHistory: z.array(z.object({ company: z.string().trim().min(1), role: z.string().trim().min(1), months: z.number().int().min(1) })),
  certifications: z.array(z.string().trim().min(1)).max(20),
  specialties: z.array(z.string().trim().min(1)).min(1).max(10),
  motivation: z.string().trim().min(100).max(2000),
  strengths: z.string().trim().min(100).max(2000),
  goals: z.string().trim().min(100).max(2000),
  privacyConsent: z.literal(true)
}).superRefine((value, context) => {
  if (value.level === 'experienced' && value.careerHistory.length === 0) {
    context.addIssue({ code: 'custom', path: ['careerHistory'], message: '경력자는 근무 이력을 한 개 이상 입력해주세요.' });
  }
});
export type ApplicantLevel = z.infer<typeof applicationSchema>['level'];
export type ApplicationInput = z.infer<typeof applicationSchema>;
```

- [ ] **Step 4: Run schema tests and build**

Run: `npm test -- src/features/application/schema.test.ts && npm run build`

Expected: PASS for entry data and FAIL with the exact Korean issue for empty experienced history.

- [ ] **Step 5: Commit the domain contract**

```bash
git add package.json package-lock.json src/features/application
git commit -m "feat: define trainer application schema"
```

### Task 2: Create secure relational storage and RLS policies

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/0001_application_intake.sql`
- Create: `supabase/tests/application_intake.sql`

**Interfaces:**
- Produces: `applications`, `application_answers`, `application_files`, `admin_profiles`, `application_reviews`, `application_status_history`, `submission_rate_limits`, private bucket `application-files`, function `public.is_active_admin()`.
- Consumes: `ApplicationInput` field names from Task 1.

- [ ] **Step 1: Write failing pgTAP authorization assertions**

```sql
begin;
select plan(4);
set local role anon;
select throws_ok('select * from public.applications', '42501', null, 'anon cannot read applications');
select throws_ok('insert into public.applications (receipt_code, name, phone, email, level, available_from, career_months, privacy_consent_version, privacy_consent_at, retention_until) values (''X'', ''홍길동'', ''01000000000'', ''a@b.com'', ''entry'', current_date, 0, ''v1'', now(), now())', '42501', null, 'anon cannot insert directly');
reset role;
select ok((select public.is_active_admin()) = false, 'unauthenticated caller is not admin');
select is((select public from storage.buckets where id = 'application-files'), false, 'application bucket is private');
select * from finish();
rollback;
```

- [ ] **Step 2: Run the database test and verify missing schema failure**

Run: `npx supabase@2.116.0 start && npx supabase@2.116.0 test db supabase/tests/application_intake.sql`

Expected: FAIL because tables, functions, and bucket do not exist.

- [ ] **Step 3: Implement tables, checks, private storage, and deny-by-default RLS**

The migration must create UUID primary keys, the five exact statuses, `created_at`/`updated_at`, foreign keys with cascading deletion for answers/files/reviews/history, and `retention_until timestamptz not null`. `application_answers` stores `answer_key text`, nullable `answer_text text`, and nullable `answer_json jsonb`; career history uses `answer_key = 'career_history'` and essays use text keys. `submission_rate_limits` stores only `actor_hash text` and `attempted_at timestamptz`, never a raw IP address. Add a service-role-only RPC `consume_submission_quota(p_actor_hash text, p_maximum integer, p_window_seconds integer)` that deletes expired rows, locks on the actor hash, counts attempts, and records an allowed attempt atomically. Enable RLS on every public table. Grant no anon table privileges. Authenticated select/update policies call a `security definer` `public.is_active_admin()` function with a fixed `search_path` and return true only for an active `admin_profiles` row matching `auth.uid()`.

```sql
create type public.application_status as enum ('new','reviewing','interview','accepted','rejected');
create table public.applications (
  id uuid primary key default gen_random_uuid(), receipt_code text unique not null,
  name text not null, phone text not null, email text not null,
  level text not null check (level in ('entry','experienced')),
  available_from date not null, career_months integer not null check (career_months between 0 and 600),
  specialties text[] not null, certifications text[] not null default '{}',
  status public.application_status not null default 'new',
  privacy_consent_version text not null, privacy_consent_at timestamptz not null,
  retention_until timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
```

Create `application-files` with `public = false`. Add storage policies that permit authenticated reads only when `public.is_active_admin()` is true; service-role uploads bypass RLS from the server.

- [ ] **Step 4: Run database tests and reset twice**

Run: `npx supabase@2.116.0 db reset && npx supabase@2.116.0 test db supabase/tests/application_intake.sql && npx supabase@2.116.0 db reset`

Expected: pgTAP PASS; the second reset succeeds without manual cleanup.

- [ ] **Step 5: Commit the storage foundation**

```bash
git add supabase
git commit -m "feat: add secure application data model"
```

### Task 3: Build draft persistence and the five-step UI

**Files:**
- Create: `src/features/application/store.ts`
- Create: `src/features/application/components/ApplicationStepper.tsx`
- Create: `src/features/application/components/BasicInfoStep.tsx`
- Create: `src/features/application/components/ExperienceStep.tsx`
- Create: `src/features/application/components/EssayStep.tsx`
- Create: `src/features/application/components/FileStep.tsx`
- Create: `src/features/application/components/ReviewStep.tsx`
- Create: `src/pages/ApplicationPage.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/pages/ApplicationPage.test.tsx`

**Interfaces:**
- Produces: `ApplicationPage`, `saveDraft(inputWithoutFiles)`, `loadDraft()`, `clearDraft()`.
- Consumes: `applicationSchema`; files remain in memory and are never written to web storage.

- [ ] **Step 1: Write the step, conditional field, and draft tests**

```tsx
it('hides career history for entry applicants and restores text draft', async () => {
  sessionStorage.setItem('metamove-application-draft-v1', JSON.stringify({ name: '홍길동', level: 'entry' }));
  render(<MemoryRouter><ApplicationPage /></MemoryRouter>);
  expect(screen.getByLabelText('이름')).toHaveValue('홍길동');
  await userEvent.click(screen.getByRole('button', { name: '다음' }));
  expect(screen.queryByText('근무 이력 추가')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify missing page failure**

Run: `npm test -- src/pages/ApplicationPage.test.tsx`

Expected: FAIL because the page and store are absent.

- [ ] **Step 3: Implement accessible step navigation and persistence**

Use one `useForm<ApplicationInput>` instance with `shouldUnregister: true`. Validate only the active step before advancing. The stepper is an ordered list with `aria-current="step"`. When changing steps, focus the new `h1`. Save non-file values to `sessionStorage` after valid step transitions; catch quota and privacy-mode errors and show `임시 저장을 사용할 수 없습니다. 작성은 계속할 수 있습니다.` without blocking.

```ts
export const DRAFT_KEY = 'metamove-application-draft-v1';
export type ApplicationDraft = Partial<Omit<ApplicationInput, 'privacyConsent'>>;
export function saveDraft(value: ApplicationDraft) { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(value)); }
export function loadDraft(): Partial<ApplicationDraft> { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}'); } catch { return {}; } }
export function clearDraft() { sessionStorage.removeItem(DRAFT_KEY); }
```

- [ ] **Step 4: Run UI tests and keyboard-check all five steps**

Run: `npm test -- src/pages/ApplicationPage.test.tsx && npm run build`

Expected: PASS; Back/Next preserves previous answers and entry applicants never receive a hidden required error.

- [ ] **Step 5: Commit the application UI**

```bash
git add src/features/application src/pages/ApplicationPage.tsx src/app/App.tsx
git commit -m "feat: add five-step trainer application"
```

### Task 4: Implement file validation and server-side submission orchestration

**Files:**
- Create: `src/features/application/fileValidation.ts`
- Create: `src/features/application/api.ts`
- Create: `src/server/application/types.ts`
- Create: `src/server/application/repository.ts`
- Create: `src/server/application/createApplication.ts`
- Create: `functions/api/applications.ts`
- Test: `src/features/application/fileValidation.test.ts`
- Test: `src/server/application/createApplication.test.ts`

**Interfaces:**
- Produces: `validateApplicationFile(file)`, `submitApplication(formData)`, `createApplication(command, repository, policy): Promise<{ receiptCode: string }>`.
- Consumes: `ApplicationInput`; `ApplicationRepository` methods `consumeSubmissionQuota`, `uploadFile`, `insertApplicationGraph`, `deleteFile`.

- [ ] **Step 1: Write file and rollback service tests**

```ts
it('rejects a mismatched executable renamed as PDF', () => {
  const file = new File(['MZ'], 'resume.pdf', { type: 'application/x-msdownload' });
  expect(validateApplicationFile(file)).toEqual({ ok: false, message: 'PDF, DOC, DOCX 파일만 첨부할 수 있습니다.' });
});

it('deletes uploaded files when the database graph insert fails', async () => {
  repository.uploadFile.mockResolvedValue('applications/id/resume.pdf');
  repository.insertApplicationGraph.mockRejectedValue(new Error('db'));
  await expect(createApplication(command, repository, policy)).rejects.toThrow('APPLICATION_SAVE_FAILED');
  expect(repository.deleteFile).toHaveBeenCalledWith('applications/id/resume.pdf');
});
```

- [ ] **Step 2: Run focused tests and verify missing functions**

Run: `npm test -- src/features/application/fileValidation.test.ts src/server/application/createApplication.test.ts`

Expected: FAIL because validators and service do not exist.

- [ ] **Step 3: Implement validation, repository boundary, and Cloudflare adapter**

The Pages Function accepts only POST multipart requests, rejects bodies with missing `payload` or `resume`, validates policy environment values, parses the JSON payload through `applicationSchema`, checks extension and MIME, generates `crypto.randomUUID()` paths, and maps known failures to 400/413/429/500 without returning internal messages.

```ts
export interface ApplicationRepository {
  consumeSubmissionQuota(actorHash: string, maximum: number, windowSeconds: number): Promise<boolean>;
  uploadFile(path: string, file: File): Promise<string>;
  insertApplicationGraph(input: PersistedApplication): Promise<void>;
  deleteFile(path: string): Promise<void>;
}

export const onRequestPost = [
  async (context: EventContext<Env, string, unknown>) => turnstilePlugin({ secret: context.env.TURNSTILE_SECRET_KEY })(context),
  async (context: EventContext<Env, string, unknown>) => {
    const form = await context.request.formData();
    const result = await handleApplicationRequest(form, context.env);
    return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  }
];
```

Install `@cloudflare/pages-plugin-turnstile@1.0.2`. Derive `actorHash = HMAC-SHA-256(SUBMISSION_HASH_SECRET, normalizedEmail + ':' + cfConnectingIp)` and call `consumeSubmissionQuota(actorHash, 5, 600)` before upload. The repository deletes rate rows older than ten minutes, counts the current hash inside one database transaction, records the attempt, and returns false when the count is already five. Never store or log the raw IP, email, Turnstile token, or HMAC secret.

- [ ] **Step 4: Run service tests, type check, and Wrangler dry run**

Run: `npm test -- src/features/application/fileValidation.test.ts src/server/application/createApplication.test.ts && npm run build && npx wrangler pages functions build functions`

Expected: PASS; server bundle contains no hard-coded Supabase keys.

- [ ] **Step 5: Commit submission orchestration**

```bash
git add src/features/application src/server functions package.json package-lock.json
git commit -m "feat: securely submit trainer applications"
```

### Task 5: Complete review, success, error recovery, and end-to-end security proof

**Files:**
- Create: `src/features/application/components/SubmissionResult.tsx`
- Create: `e2e/application.spec.ts`
- Create: `e2e/application-security.spec.ts`
- Create: `e2e/helpers/application.ts`
- Create: `e2e/fixtures/resume.pdf`
- Modify: `src/pages/ApplicationPage.tsx`
- Modify: `playwright.config.ts`

**Interfaces:**
- Produces: complete `/apply` flow and receipt-only success screen.
- Consumes: POST `/api/applications`; Supabase local test environment.

- [ ] **Step 1: Write complete-flow and information-disclosure tests**

```ts
test('applicant reviews, submits, and sees only the receipt', async ({ page }) => {
  await page.goto('/apply');
  await completeValidApplication(page);
  await page.getByRole('button', { name: '지원서 제출하기' }).click();
  await expect(page.getByRole('heading', { name: '지원이 접수되었습니다' })).toBeVisible();
  await expect(page.getByText(/접수번호/)).toBeVisible();
  await expect(page.getByText(validApplication.motivation)).toHaveCount(0);
});

test('anonymous client cannot list applications', async ({ request }) => {
  const response = await request.get(`${process.env.SUPABASE_URL}/rest/v1/applications`, { headers: { apikey: process.env.SUPABASE_ANON_KEY! } });
  expect(response.ok()).toBe(false);
});
```

`e2e/helpers/application.ts` exports `validApplication` and `completeValidApplication(page)`, filling every field with deterministic fictional test data, attaching `e2e/fixtures/resume.pdf`, and never using a real person's information.

- [ ] **Step 2: Run E2E tests and confirm failure before result wiring**

Run: `npm run e2e -- e2e/application.spec.ts e2e/application-security.spec.ts`

Expected: FAIL at submit/result until the UI calls the API and clears the draft.

- [ ] **Step 3: Wire review changes, submit states, receipt, and retry**

On submit, disable only the final button, announce progress with `aria-live="polite"`, preserve the form on network failure, focus the error summary, and clear the draft only after HTTP 201. The success component receives `{ receiptCode, nextStepCopy }` and never receives `ApplicationInput`.

```tsx
export function SubmissionResult({ receiptCode, nextStepCopy }: { receiptCode: string; nextStepCopy: string }) {
  return <main aria-labelledby="submission-title">
    <h1 id="submission-title">지원이 접수되었습니다</h1>
    <p>접수번호 <strong>{receiptCode}</strong></p>
    <p>{nextStepCopy}</p>
  </main>;
}
```

- [ ] **Step 4: Run full intake quality gate**

Run: `npx supabase@2.116.0 db reset && npx supabase@2.116.0 test db && npm test && npm run lint && npm run build && npm run e2e -- e2e/application.spec.ts e2e/application-security.spec.ts`

Expected: all checks pass; anonymous DB/file reads fail; receipt success contains no essay text.

- [ ] **Step 5: Commit the verified intake flow**

```bash
git add src e2e playwright.config.ts supabase
git commit -m "test: verify secure application intake"
```
