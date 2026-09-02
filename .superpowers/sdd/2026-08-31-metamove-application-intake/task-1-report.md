# Task 1 report: canonical application schema

## Commit

`f0ffc873b849c762665529b272a9bc2d674b8697` — `feat: define trainer application schema`

## Files

- `src/features/application/schema.ts`: canonical Zod contract, inferred types, and upload constants.
- `src/features/application/types.ts`: public type and constant exports for later client/server consumers.
- `src/features/application/schema.test.ts`: conditional, essay-length, trimming, and constant tests.
- `src/test/fixtures/application.ts`: deterministic fictional applicant fixture.
- `package.json`, `package-lock.json`: requested schema/form/submission dependencies.

No UI, server, database, or project-level `AGENTS.md` files were added.

## Dependency resolution

Installed the requested exact versions without peer-conflict overrides:

- `zod@4.5.4`
- `react-hook-form@7.87.0`
- `@hookform/resolvers@5.9.1`
- `@supabase/supabase-js@2.112.4`
- `@cloudflare/pages-plugin-turnstile@1.0.2`
- `wrangler@4.127.1` (dev dependency)

The existing TypeScript `5.9.3` toolchain was retained. There were no exact-version deviations.

## TDD evidence

- RED: after installing dependencies and writing the fixture/tests, `npm test -- src/features/application/schema.test.ts` failed because `./schema` did not exist.
- GREEN: the minimum schema implementation made the focused suite pass: 1 file, 7 tests.
- Refactor: extracted the repeated career-history and essay schemas and re-exported the inferred contract through `types.ts`; the focused suite stayed green.

The contract trims bounded text values, validates essays at 100–2000 characters after trimming, allows an empty career history for entry applicants, and requires at least one valid history entry for experienced applicants with the specified Korean error. `MAX_FILE_BYTES` is 10 MiB and the allowlist requires PDF, DOC, or DOCX MIME keys with matching extensions. `ApplicationInput` and `ApplicantLevel` are inferred from the Zod schema.

## Verification

- `npm test -- src/features/application/schema.test.ts` — passed (7 tests).
- `npm test` — passed (7 files, 34 tests).
- `npm run lint` — passed.
- `npm run build` — passed (`tsc -b` and Vite production build).
- `npm audit --audit-level=high` — passed, 0 vulnerabilities.
- `git diff --check` — passed (only normal CRLF normalization warnings).

## Assumptions and risks

- Essay length follows the specified Zod string-length semantics; surrounding whitespace is removed before the 100–2000 bounds are applied.
- `types.ts` re-exports inferred types rather than duplicating a handwritten interface, keeping later consumers on the canonical runtime schema.
- Submission policy, file-content sniffing, persistence, and UI behavior remain intentionally deferred to later tasks.
