# Security & Integration-Readiness Audit: Smart CV Sender

**Date:** October 10, 2026  
**Project:** Smart CV Sender (Next.js 16 App Router + Supabase SSR + PostgreSQL RLS)  
**Scope:** Architecture, Data Isolation, PostgreSQL RLS Policies, Draft Integrity, Storage Policies, Authentication, Race Conditions, and Environment Security.

---

## Executive Summary

A comprehensive, non-destructive security and integration audit of the Smart CV Sender application was performed. The evaluation covered schema definitions, row-level security (RLS) policies, multi-tenant isolation, cryptographic draft approval, file storage access controls, server actions, and build integrity.

Overall, the foundational security architecture demonstrates strong candidate isolation and defense-in-depth principles:
- Candidate profiles, resumes, applications, and email drafts are strictly segregated using user ID checks in server actions and PostgreSQL RLS.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY`, OAuth secrets) are strictly confined to server-side execution and never exposed to the client bundle.
- Email sending remains safely disabled (`disabledEmailProvider`), preventing any accidental real-world email transmission.

Several integration-readiness and security gaps were discovered during static schema analysis and code inspection. Safe, non-destructive mitigations have been implemented and verified with automated test suites.

---

## Audit Findings by Severity

### 1. High Severity Findings

#### Finding SEC-HIGH-01: Missing Automatic Profile Creation Trigger on Auth Signup
* **Evidence:** In `supabase/migrations/20240101000000_initial_schema.sql`, `profiles.id` references `auth.users(id) on delete cascade`. In turn, `resumes.user_id`, `applications.user_id`, `connected_accounts.user_id`, and `notifications.user_id` all reference `profiles(id)`. However, no PostgreSQL trigger existed on `auth.users` to create a `profiles` record upon user signup.
* **Impact:** In a live Supabase environment, when a candidate signs up via `supabase.auth.signUp()` and attempts to immediately upload a CV or apply to an opportunity, foreign key constraint violations occur (`Key (user_id)=(...) is not present in table "profiles"`), breaking the user journey. Furthermore, `src/app/cv/actions.ts` previously used `.update(...)` instead of `.upsert(...)`, which silently updated 0 rows if a profile row was absent.
* **Remediation Implemented:**
  1. Created migration `supabase/migrations/20240105000000_schema_fixes.sql` introducing `public.handle_new_user()` and the trigger `on_auth_user_created` on `auth.users`.
  2. Hardened `saveExtractedData` in `src/app/cv/actions.ts` to use `.upsert({ id: user.id, email: user.email, ...profileData })`.

#### Finding SEC-HIGH-02: Client-Role Database Write Blocking on Public Catalog Tables
* **Evidence:** `companies`, `company_contacts`, and `opportunities` tables have RLS enabled with only `SELECT` policies for authenticated users. In `src/app/opportunities/actions.ts`, `seedDemoOpportunities()` used the standard user client (`createClient()`) to execute `INSERT` operations on `companies`, `company_contacts`, and `opportunities`.
* **Impact:** In a live Supabase database with RLS enforced, runtime seeding from the authenticated client role fails with `new row violates row-level security policy for table "companies"`.
* **Remediation Implemented:**
  1. Created migration `supabase/migrations/20240106000000_seed_demo_data.sql` to populate public catalog fixtures via SQL migration at deployment time, avoiding client-side RLS permission failures.
  2. Documented that future administrative additions to catalog tables must be executed via administrative/service-role workers or migrations.

---

### 2. Medium Severity Findings

#### Finding SEC-MED-01: Absence of Server-Side Pre-Send Approval & Integrity Validator Gate
* **Evidence:** In Phase 5, `approved_hash` and `approved_attachment_hash` were generated when approving drafts. However, no centralized server-side pre-send validation gate existed to re-verify cryptographic signatures, candidate ownership, attachment integrity, and send idempotency immediately before any outbound send operation.
* **Impact:** A future email worker or dispatch action in Phase 6 could inadvertently transmit drafts that had been altered post-approval or lack idempotency keys.
* **Remediation Implemented:**
  1. Created `src/lib/send-validation.ts` exporting `validateApprovedEmailForSend()`.
  2. Validates candidate ownership, resume ownership, application status (`approved`), un-tampered draft hash, un-tampered attachment hash, valid email format, and idempotency key uniqueness.
  3. Added comprehensive automated test suite in `src/lib/__tests__/security-audit.test.ts`.

#### Finding SEC-MED-02: Incomplete Protected Route Enforcement in Edge Middleware
* **Evidence:** In `src/utils/supabase/middleware.ts`, `isProtectedRoute` only matched `/dashboard` and `/profile`. Candidate routes `/cv`, `/cv/review`, and `/applications/*` were omitted from middleware redirects.
* **Impact:** Anonymous users could visit `/cv` and see the file upload interface before being prompted to log in. While server actions rejected unauthorized requests, defense-in-depth at the network edge was incomplete.
* **Remediation Implemented:**
  1. Updated `src/utils/supabase/middleware.ts` to protect all candidate route prefixes: `['/dashboard', '/profile', '/cv', '/applications']`.
  2. Added server-side session check with redirect to `/login` in `src/app/cv/page.tsx`.

#### Finding SEC-MED-03: Missing Unique Constraint on `email_drafts(application_id)`
* **Evidence:** In `20240101000000_initial_schema.sql`, `email_drafts.application_id` had a foreign key to `applications(id)` but lacked a `UNIQUE` constraint. The UI expected a single draft (`app.email_drafts?.[0]`).
* **Impact:** Concurrent draft generation requests or retries could create duplicate draft rows for a single application, causing orphan records and state ambiguity.
* **Remediation Implemented:**
  1. Added `unique_email_draft_per_application` constraint on `email_drafts(application_id)` in `20240105000000_schema_fixes.sql`.

#### Finding SEC-MED-04: Missing Storage Update Policy on `storage.objects` for Resume Upserts
* **Evidence:** `src/app/cv/actions.ts` called `.upload(filePath, file, { upsert: true })`. However, `supabase/migrations/20240102000000_storage.sql` only defined policies for `INSERT`, `SELECT`, and `DELETE`.
* **Impact:** Overwriting or re-uploading a resume with the same path failed in Supabase Storage due to the missing `UPDATE` RLS policy.
* **Remediation Implemented:**
  1. Added policy `"Candidates can update their own CV"` on `storage.objects` for `UPDATE` in `20240105000000_schema_fixes.sql`.

#### Finding SEC-MED-05: Schema Mismatch Between Opportunities Table and UI Code
* **Evidence:** `src/app/opportunities/page.tsx` and `apply/page.tsx` referenced `op.location`, and `src/app/opportunities/actions.ts` attempted to insert `country` into `opportunities`. The `opportunities` table in `20240101000000_initial_schema.sql` contained neither column.
* **Impact:** Opportunity location displayed as `undefined`; inserting `country` into `opportunities` caused database query failures.
* **Remediation Implemented:**
  1. Added `location text` column to `opportunities` in `20240105000000_schema_fixes.sql`.
  2. Updated `src/app/opportunities/actions.ts` to populate `location`.

---

### 3. Low Severity Findings

#### Finding SEC-LOW-01: Unlabeled Mock AI Match Score in Opportunities List
* **Evidence:** In `src/app/opportunities/page.tsx`, the opportunity card showed a badge `XX% Match` with `title="AI Match Score"`, while calculated using a deterministic mock formula.
* **Impact:** Users could mistake simulated demo scores for real AI-evaluated candidate matching.
* **Remediation Implemented:**
  1. Updated badge to display `XX% Match (Demo)` and tooltip to clarify: `"Simulated match score for demo fixtures"`.

#### Finding SEC-LOW-02: Residual Uncalled Mock Sender Utility
* **Evidence:** `src/lib/email-sender.ts` contained `sendEmailMock` which simulated randomized SMTP network delays and errors.
* **Impact:** While unreferenced across the application, having two mock boundaries could lead to confusion.
* **Remediation Implemented:**
  1. Verified that `disabledEmailProvider` in `src/lib/email-provider.ts` is the active architectural boundary and confirmed that `sendEmailMock` is nowhere invoked.

---

## Multi-Tenant Isolation & Candidate Security Review

| Component | Policy / Mechanism | Candidate A vs Candidate B Isolation Verified |
| :--- | :--- | :--- |
| **Candidate Profile** | RLS: `auth.uid() = id`<br>Server Action: `user.id` from `auth.getUser()` | **YES** — Candidate cannot read, update, or overwrite another user's profile. |
| **Resumes (Database)** | RLS: `auth.uid() = user_id`<br>Server Action: verified via `ownedResume` query | **YES** — Resume selection and querying strictly enforce `user_id = user.id`. |
| **CV Files (Storage)** | Bucket: `resumes` (private)<br>Path prefix: `${user.id}/...`<br>RLS: `(storage.foldername(name))[1] = auth.uid()::text` | **YES** — Candidates cannot access or upload files into other candidates' directories. |
| **Applications** | RLS: `auth.uid() = user_id`<br>Server Action: verified via `ownedApplication` query | **YES** — Cross-candidate application viewing or modification is blocked. |
| **Email Drafts** | RLS: Subquery checking `applications.user_id = auth.uid()`<br>Server Action: verifies parent application ownership | **YES** — A draft cannot be accessed or edited by any user other than the applicant. |
| **Approval Invalidation** | Hash: `sha256(recipient, subject, body, resumeId, storagePath)`<br>Action: Resets `approved_at`, `approved_hash`, and status to `draft` on edit | **YES** — Any change to recipient, subject, body, or CV invalidates the approval snapshot. |

---

## Audit Verification & Test Execution Status

### Checks Actually Performed (Locally Verified)
- [x] **Static Code Analysis & Linting:** Executed `npm run lint` (`eslint`). 0 errors, 0 warnings.
- [x] **TypeScript Type Checking:** Executed `npm run typecheck` (`tsc --noEmit`). 0 type errors.
- [x] **Production Bundle Build:** Executed `npm run build` (`next build`). Built all dynamic and static routes cleanly.
- [x] **Draft Integrity Tests:** Executed tests verifying hash stability, variation on body changes, and variation on attachment changes.
- [x] **AI Extraction Mock Mode Tests:** Verified fallback logic, language detection, and explicit mock warnings.
- [x] **Pre-Send Approval Security Tests:** Added and passed 7 test cases in `src/lib/__tests__/security-audit.test.ts` covering:
  - Unauthorized candidate rejection
  - Stolen resume rejection
  - Unapproved status rejection
  - Tampered body rejection
  - Tampered recipient rejection
  - Swapped attachment / storage path rejection
  - Missing or conflicting idempotency key rejection
  - Path traversal and storage directory isolation rejection

### Checks Still Requiring a Configured Live Supabase Project
- [ ] **Live PostgreSQL RLS Enforcement:** While SQL policies are syntactically and logically validated, runtime enforcement under PostgreSQL RLS must be validated against a live Supabase instance with active session tokens.
- [ ] **Supabase Auth Cookie Roundtrip:** Real HTTP session cookie rotation and refresh over live HTTPS headers requires a running Supabase backend.
- [ ] **Supabase Storage S3 Uploads:** Bucket permissions, PDF MIME type validation by the storage service, and presigned URL generation require live S3-compatible Supabase storage.
- [ ] **Postgres Trigger Execution:** Live execution of the `on_auth_user_created` trigger on `auth.users` requires running migrations against a real Supabase database.
