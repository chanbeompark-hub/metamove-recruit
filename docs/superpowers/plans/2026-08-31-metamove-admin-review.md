# Metamove Gym Admin Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an authenticated admin workspace for searching applicants, reviewing applications and private resumes, recording evaluation notes, and changing hiring status with an audit history.

**Architecture:** Supabase Auth establishes administrator identity. Browser queries use the public Supabase client but RLS authorizes only active rows in `admin_profiles`; state transitions use one database RPC to update the application and append history atomically. Resume access uses short-lived signed URLs created only after an active-admin check.

**Tech Stack:** Existing React/Vite/Supabase stack, React Router 7.18.3, Supabase JS 2.112.4, Vitest, Testing Library, Playwright, Supabase pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-31-metamove-gym-recruitment-design.md`

## Global Constraints

- Status values are `new`, `reviewing`, `interview`, `accepted`, `rejected`, displayed as `신규`, `검토 중`, `면접 예정`, `합격`, `불합격`.
- Desktop uses a list/detail split; tablet and mobile navigate from list to a separate detail view.
- Search/filter fields are name, entry/experienced, specialty, application date, and status.
- Every status change records previous status, new status, admin ID, timestamp, and internal reason.
- Evaluation and internal memo are never exposed to applicants.
- Resume links are private and short-lived; no persistent public URL is stored.
- Color is never the only status indicator.
- Actual deployment remains blocked until approved privacy notice, retention duration, contact details, brand assets, and real employment conditions are supplied.
- Do not create an `AGENTS.md` inside the project.

## File Structure

- `src/lib/supabase/browserClient.ts`: singleton public client using publishable key only.
- `src/features/admin/types.ts`, `queries.ts`: applicant list/detail contracts and RLS-backed queries.
- `src/features/admin/components/*`: login, summary, filters, table, detail, review panel.
- `src/pages/AdminLoginPage.tsx`, `AdminPage.tsx`, `ApplicantDetailPage.tsx`: route-level ownership.
- `src/app/AdminRoute.tsx`: session and active-admin guard.
- `supabase/migrations/0002_admin_review.sql`: atomic status/review RPC and signed-file authorization support.
- `supabase/migrations/0003_retention_cron.sql`, `supabase/functions/purge-expired-applications/*`: expired record and private-file deletion.
- `supabase/tests/admin_review.sql`: authorization and audit assertions.
- `e2e/admin-review.spec.ts`, `e2e/release.spec.ts`: workflow and release gate.

---

### Task 1: Add administrator login and guarded routing

**Files:**
- Create: `src/lib/supabase/browserClient.ts`
- Create: `src/app/AdminRoute.tsx`
- Create: `src/features/admin/components/AdminLoginForm.tsx`
- Create: `src/pages/AdminLoginPage.tsx`
- Create: `src/test/fixtures/admin.ts`
- Modify: `src/app/App.tsx`
- Test: `src/app/AdminRoute.test.tsx`

**Interfaces:**
- Produces: `getBrowserSupabase()`, `AdminRoute`, routes `/admin/login`, `/admin`, `/admin/applicants/:applicationId`.
- Consumes: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; never service-role credentials.

- [ ] **Step 1: Write unauthenticated and inactive-admin tests**

```tsx
it('redirects an unauthenticated visitor to admin login', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  renderAdminRoute('/admin');
  expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeVisible();
});

it('shows access denied for a signed-in user without an active admin profile', async () => {
  mockGetSession.mockResolvedValue(sessionResult);
  mockAdminProfile.mockResolvedValue({ data: null, error: null });
  renderAdminRoute('/admin');
  expect(await screen.findByText('관리자 권한이 없습니다.')).toBeVisible();
});
```

- [ ] **Step 2: Run the guard test and confirm missing route failure**

Run: `npm test -- src/app/AdminRoute.test.tsx`

Expected: FAIL because the client, guard, and login page are absent.

- [ ] **Step 3: Implement password login, session loading, and active-profile guard**

```ts
export function getBrowserSupabase() {
  return createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
}
```

`AdminRoute` shows a named loading region, redirects null sessions, queries `admin_profiles` for `active = true`, and renders access denied without revealing role internals. Login errors use `이메일 또는 비밀번호를 확인해주세요.` regardless of which credential failed.

- [ ] **Step 4: Run auth tests and build**

Run: `npm test -- src/app/AdminRoute.test.tsx && npm run build`

Expected: PASS; searching the built assets for `service_role` returns no secret value.

- [ ] **Step 5: Commit guarded admin routing**

```bash
git add src/lib src/app src/features/admin src/pages
git commit -m "feat: add guarded administrator access"
```

### Task 2: Implement applicant list, counts, search, and filters

**Files:**
- Create: `src/features/admin/types.ts`
- Create: `src/features/admin/queries.ts`
- Create: `src/features/admin/components/AdminSummary.tsx`
- Create: `src/features/admin/components/ApplicantFilters.tsx`
- Create: `src/features/admin/components/ApplicantTable.tsx`
- Create: `src/pages/AdminPage.tsx`
- Test: `src/features/admin/components/ApplicantTable.test.tsx`

**Interfaces:**
- Produces: `ApplicantListItem`, `ApplicantFilters`, `listApplicants(filters)`, `AdminPage`.
- Consumes: `applications` fields `id, name, level, career_months, specialties, created_at, status`.

- [ ] **Step 1: Write status-text, empty-result, and filter tests**

```tsx
it('renders status as text and sends combined filters', async () => {
  render(<ApplicantTable applicants={[fixtureApplicant]} onSelect={onSelect} />);
  expect(screen.getByText('면접 예정')).toBeVisible();
  expect(screen.getByText('면접 예정')).toHaveAttribute('data-status', 'interview');
});

it('distinguishes no applications from no filter results', () => {
  render(<ApplicantTable applicants={[]} hasActiveFilters />);
  expect(screen.getByText('조건에 맞는 지원자가 없습니다.')).toBeVisible();
});
```

- [ ] **Step 2: Run the list test and verify missing component failure**

Run: `npm test -- src/features/admin/components/ApplicantTable.test.tsx`

Expected: FAIL on unresolved types/components.

- [ ] **Step 3: Implement typed queries and the desktop list**

```ts
export type ApplicationStatus = 'new' | 'reviewing' | 'interview' | 'accepted' | 'rejected';
export type ApplicantFilters = {
  query: string;
  level: 'all' | 'entry' | 'experienced';
  specialty: string;
  status: 'all' | ApplicationStatus;
  from?: string;
  to?: string;
};
```

Escape `%` and `_` before `.ilike('name', ...)`, whitelist sort fields, cap pages at 50 rows, and debounce name search by 300ms. Summary counts come from exact count queries under the same RLS session. Table rows are buttons or links with visible focus and an accessible name containing applicant name and date.

- [ ] **Step 4: Run list tests, lint, and build**

Run: `npm test -- src/features/admin/components/ApplicantTable.test.tsx && npm run lint && npm run build`

Expected: PASS; all five Korean status labels are covered by the test table.

- [ ] **Step 5: Commit applicant discovery**

```bash
git add src/features/admin src/pages/AdminPage.tsx
git commit -m "feat: add applicant search and filters"
```

### Task 3: Add applicant detail and private resume access

**Files:**
- Create: `src/features/admin/components/ApplicantDetail.tsx`
- Create: `src/features/admin/components/ResumeDownload.tsx`
- Create: `src/pages/ApplicantDetailPage.tsx`
- Create: `functions/api/admin/applications/[applicationId]/files/[fileId].ts`
- Test: `src/features/admin/components/ApplicantDetail.test.tsx`
- Test: `src/server/admin/createSignedFileUrl.test.ts`

**Interfaces:**
- Produces: `getApplicantDetail(applicationId)`, `createSignedFileUrl({ applicationId, fileId, adminJwt }): Promise<string>`.
- Consumes: application, answers, file metadata; signed URL lifetime is exactly 60 seconds.

- [ ] **Step 1: Write detail redaction and authorization tests**

```tsx
it('renders application answers but not internal review in applicant content sections', () => {
  render(<ApplicantDetail application={detailFixture} />);
  expect(screen.getByRole('heading', { name: '자기소개서' })).toBeVisible();
  expect(screen.queryByText('내부 평가')).not.toBeInTheDocument();
});
```

```ts
it('refuses a file URL when the active admin check fails', async () => {
  await expect(createSignedFileUrl(command, inactiveAdminRepository)).rejects.toThrow('ADMIN_FORBIDDEN');
  expect(inactiveAdminRepository.signFile).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests and confirm missing detail/file service failures**

Run: `npm test -- src/features/admin/components/ApplicantDetail.test.tsx src/server/admin/createSignedFileUrl.test.ts`

Expected: FAIL because the components and service are absent.

- [ ] **Step 3: Implement detail sections and 60-second signed downloads**

The server route reads the bearer token, verifies the user through Supabase Auth, checks `admin_profiles.active`, confirms the file belongs to the route's application ID, then calls `createSignedUrl(path, 60)`. Return `Cache-Control: private, no-store`. Do not log the URL, applicant name, or file name.

```ts
export async function createSignedFileUrl(command: SignedFileCommand, repository: AdminFileRepository) {
  const admin = await repository.requireActiveAdmin(command.adminJwt);
  if (!admin) throw new Error('ADMIN_FORBIDDEN');
  const file = await repository.findFile(command.applicationId, command.fileId);
  if (!file) throw new Error('FILE_NOT_FOUND');
  return repository.signFile(file.storagePath, 60);
}
```

- [ ] **Step 4: Run detail and signed URL tests**

Run: `npm test -- src/features/admin/components/ApplicantDetail.test.tsx src/server/admin/createSignedFileUrl.test.ts && npm run build`

Expected: PASS; inactive admin and mismatched application/file ID receive 403/404 without a URL.

- [ ] **Step 5: Commit secure detail review**

```bash
git add src/features/admin src/pages/ApplicantDetailPage.tsx src/server/admin functions/api/admin
git commit -m "feat: add secure applicant detail review"
```

### Task 4: Implement atomic evaluation and status history

**Files:**
- Create: `supabase/migrations/0002_admin_review.sql`
- Create: `supabase/tests/admin_review.sql`
- Create: `src/features/admin/components/ReviewPanel.tsx`
- Modify: `src/features/admin/queries.ts`
- Test: `src/features/admin/components/ReviewPanel.test.tsx`

**Interfaces:**
- Produces: RPC `public.review_application(p_application_id uuid, p_status application_status, p_rating smallint, p_note text, p_next_action_at timestamptz, p_reason text)` and client `saveReview(input)`.
- Consumes: active authenticated admin and existing application ID.

- [ ] **Step 1: Write database and component failure tests**

```sql
select throws_ok(
  $$ select public.review_application(gen_random_uuid(), 'interview', 5, '메모', now(), '면접 진행') $$,
  '42501', null, 'non-admin cannot review applications'
);
```

```tsx
it('requires a reason when status changes', async () => {
  render(<ReviewPanel application={reviewFixture} onSave={onSave} />);
  await userEvent.selectOptions(screen.getByLabelText('채용 상태'), 'interview');
  await userEvent.click(screen.getByRole('button', { name: '검토 내용 저장' }));
  expect(screen.getByText('상태 변경 사유를 입력해주세요.')).toBeVisible();
  expect(onSave).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify both database and component failures**

Run: `npx supabase@2.116.0 test db supabase/tests/admin_review.sql && npm test -- src/features/admin/components/ReviewPanel.test.tsx`

Expected: FAIL because the RPC and panel do not exist.

- [ ] **Step 3: Implement one transaction for review, status, and history**

The security-definer RPC must first call `is_active_admin()`, lock the application row, upsert one review per application/admin pair, update status and `updated_at`, and insert status history only when old and new status differ. Constrain rating to 1–5 and memo/reason lengths. Revoke execute from anon and grant only authenticated.

```sql
if v_old_status is distinct from p_status then
  insert into public.application_status_history(application_id, previous_status, new_status, admin_id, reason)
  values (p_application_id, v_old_status, p_status, auth.uid(), p_reason);
end if;
```

- [ ] **Step 4: Run database, component, and reset tests**

Run: `npx supabase@2.116.0 db reset && npx supabase@2.116.0 test db && npm test -- src/features/admin/components/ReviewPanel.test.tsx && npx supabase@2.116.0 db reset`

Expected: PASS; one RPC call produces one status history row and one current review.

- [ ] **Step 5: Commit review management**

```bash
git add supabase src/features/admin
git commit -m "feat: add audited applicant reviews"
```

### Task 5: Purge expired applications and private files

**Files:**
- Create: `supabase/functions/purge-expired-applications/index.ts`
- Create: `supabase/migrations/0003_retention_cron.sql`
- Create: `supabase/tests/retention.sql`
- Test: `supabase/functions/purge-expired-applications/index.test.ts`

**Interfaces:**
- Produces: `purgeExpiredApplications(repository, now): Promise<{ purged: number; failed: string[] }>` and a daily `purge-expired-applications` Supabase Cron job.
- Consumes: `applications.retention_until`, `application_files.storage_path`, Supabase Storage service-role removal, and cascade deletion of relational child rows.

- [ ] **Step 1: Write file-first deletion and authorization tests**

```ts
it('removes private files before deleting the expired application graph', async () => {
  repository.listExpired.mockResolvedValue([{ id: 'app-1', paths: ['applications/app-1/resume.pdf'] }]);
  await purgeExpiredApplications(repository, new Date('2026-08-31T00:00:00Z'));
  expect(repository.removeFiles).toHaveBeenCalledWith(['applications/app-1/resume.pdf']);
  expect(repository.deleteApplication).toHaveBeenCalledWith('app-1');
  expect(repository.removeFiles.mock.invocationCallOrder[0]).toBeLessThan(repository.deleteApplication.mock.invocationCallOrder[0]);
});

it('keeps the database record when storage deletion fails', async () => {
  repository.removeFiles.mockRejectedValue(new Error('storage'));
  const result = await purgeExpiredApplications(repository, new Date());
  expect(repository.deleteApplication).not.toHaveBeenCalled();
  expect(result.failed).toEqual(['app-1']);
});
```

- [ ] **Step 2: Run the retention tests and verify missing service failure**

Run: `npm test -- supabase/functions/purge-expired-applications/index.test.ts && npx supabase@2.116.0 test db supabase/tests/retention.sql`

Expected: FAIL because the purge service, cron extension, and schedule are absent.

- [ ] **Step 3: Implement service-role purge and daily Cron invocation**

The Edge Function accepts POST only, compares `Authorization` to a dedicated `PURGE_CRON_SECRET`, lists applications where `retention_until <= now()`, removes all associated objects through the Storage API, and then deletes the application row so cascading foreign keys remove answers, metadata, reviews, and history. Process at most 100 applications per run and return only counts and opaque application IDs for failures; never return names, emails, or file paths.

```ts
export async function purgeExpiredApplications(repository: RetentionRepository, now: Date) {
  const expired = await repository.listExpired(now, 100);
  const failed: string[] = [];
  let purged = 0;
  for (const application of expired) {
    try {
      if (application.paths.length > 0) await repository.removeFiles(application.paths);
      await repository.deleteApplication(application.id);
      purged += 1;
    } catch { failed.push(application.id); }
  }
  return { purged, failed };
}
```

Enable `pg_cron` and `pg_net`, store the project URL and `PURGE_CRON_SECRET` in Supabase Vault, and schedule the function at `15 18 * * *` UTC, which is 03:15 Asia/Seoul. Name the job `purge-expired-applications-daily`. The migration must first unschedule an existing job with that exact name so reset/redeploy remains idempotent.

- [ ] **Step 4: Run unit, database, and reset tests**

Run: `npx supabase@2.116.0 db reset && npm test -- supabase/functions/purge-expired-applications/index.test.ts && npx supabase@2.116.0 test db supabase/tests/retention.sql && npx supabase@2.116.0 db reset`

Expected: PASS; expired fixtures are removed file-first, non-expired fixtures remain, and the named daily job exists once.

- [ ] **Step 5: Commit retention enforcement**

```bash
git add supabase/functions supabase/migrations/0003_retention_cron.sql supabase/tests/retention.sql
git commit -m "feat: purge expired application data"
```

### Task 6: Verify responsive admin workflow and release gates

**Files:**
- Create: `e2e/admin-review.spec.ts`
- Create: `e2e/release.spec.ts`
- Create: `e2e/helpers/admin.ts`
- Create: `.dev.vars.example`
- Create: `wrangler.toml`
- Create: `functions/api/health/release.ts`
- Modify: `DESIGN_BRIEF.md`
- Modify: `README.md`

**Interfaces:**
- Produces: Cloudflare Pages deployment configuration, documented secrets, full release checklist.
- Consumes: all public, intake, and admin routes plus approved launch content.

- [ ] **Step 1: Write admin workflow and launch-block tests**

```ts
test('admin filters, opens, reviews, and sees status history', async ({ page }) => {
  await loginAsActiveAdmin(page);
  await page.goto('/admin');
  await page.getByLabel('채용 상태').selectOption('new');
  await page.getByRole('link', { name: /홍길동/ }).click();
  await page.getByLabel('종합 평가').selectOption('5');
  await page.getByLabel('채용 상태').selectOption('interview');
  await page.getByLabel('상태 변경 사유').fill('1차 면접 진행');
  await page.getByRole('button', { name: '검토 내용 저장' }).click();
  await expect(page.getByText('면접 예정')).toBeVisible();
  await expect(page.getByText('1차 면접 진행')).toBeVisible();
});

test('release health fails when privacy policy configuration is absent', async ({ request }) => {
  const response = await request.get('/api/health/release');
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ ready: false, missing: expect.arrayContaining(['PRIVACY_CONSENT_VERSION','PRIVACY_RETENTION_DAYS']) });
});
```

- [ ] **Step 2: Run the release suite and capture expected failures**

Run: `npm run e2e -- e2e/admin-review.spec.ts e2e/release.spec.ts`

Expected: FAIL until responsive routing, release health, and environment documentation are complete.

- [ ] **Step 3: Complete Cloudflare config and operational documentation**

`wrangler.toml` contains `name = "metamove-gym-careers"`, `pages_build_output_dir = "./dist"`, and `compatibility_date = "2026-08-31"`. `.dev.vars.example` lists `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, `VITE_TURNSTILE_SITE_KEY`, `SUBMISSION_HASH_SECRET`, `PRIVACY_CONSENT_VERSION`, `PRIVACY_RETENTION_DAYS`, and `PURGE_CRON_SECRET` using obvious non-secret examples. `README.md` documents local Supabase 2.116.0 start/reset, test commands, Cloudflare preview, Turnstile setup, retention Cron/Vault setup, admin provisioning, content launch gate, backup/export procedure, and free-tier limits.

```toml
name = "metamove-gym-careers"
pages_build_output_dir = "./dist"
compatibility_date = "2026-08-31"
```

```ts
export function onRequestGet({ env }: EventContext<ReleaseEnv, string, unknown>) {
  const required = ['PRIVACY_CONSENT_VERSION', 'PRIVACY_RETENTION_DAYS', 'TURNSTILE_SECRET_KEY', 'SUBMISSION_HASH_SECRET'] as const;
  const missing = required.filter(key => !env[key]);
  return Response.json({ ready: missing.length === 0, missing }, { status: missing.length === 0 ? 200 : 503 });
}
```

At widths below 900px, `/admin` shows list only and selection navigates to `/admin/applicants/:id`; desktop keeps list and detail visible together. The release health endpoint checks configuration presence, not secret contents, and never returns values.

- [ ] **Step 4: Run the complete product verification**

Run: `npx supabase@2.116.0 db reset && npx supabase@2.116.0 test db && npm test && npm run lint && npm run build && npm run e2e`

Expected: every command exits 0; 320/360/390/430/desktop screenshots have no horizontal overflow; anonymous reads fail; admin flow succeeds; release health is 503 without approved policy config and 200 only when every launch requirement is set.

- [ ] **Step 5: Update evidence and commit the release-ready implementation**

Record real screenshot/video paths and the final commands in `DESIGN_BRIEF.md`, then commit.

```bash
git add e2e .dev.vars.example wrangler.toml README.md DESIGN_BRIEF.md src functions supabase
git commit -m "test: verify Metamove recruitment release"
```
