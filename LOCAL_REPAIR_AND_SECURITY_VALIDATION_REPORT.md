# LOCAL REPAIR AND SECURITY VALIDATION REPORT

**Project:** Smart CV Sender  
**Repository:** `chaarimahdi100-coder/smart-cv-sender`  
**Branch:** `master`  
**Base Commit:** `5c37cc5`  
**Execution Timestamp:** 2026-10-31T22:26:00+01:00  
**Audit & Repair Status:** **ALL LOCAL REPAIRS COMPLETED & VALIDATED**  
**Final Verdict:** **READY FOR DATABASE MIGRATION REVIEW**  

---

## 1. Initial Project State

Before execution, the project state was inspected:
- **Git State**: Clean working tree on branch `master` at commit `5c37cc5`.
- **Quality Gates Baseline**: `npm test` passed 263/263 existing tests; `npm run typecheck` and `npm run lint` passed with 0 errors.
- **Identified Deficiencies**:
  1. *Server Component Side Effects*: `src/app/applications/[id]/draft/page.tsx` was performing an asynchronous database `UPDATE` on `email_drafts` with privileged `service_role` credentials during GET page rendering.
  2. *Destructive Draft Fallbacks*: `actions.ts` (`saveDraft` and `regenerateDraft`) fell back to destructive `delete().eq('application_id', appId)` before re-inserting, risking catastrophic draft loss and erasing `conflict_resolution` metadata.
  3. *Missing State Machine Source of Truth*: `src/lib/application-state-machine.ts` did not exist locally. Status transitions like `postponed -> approved` were not guarded.
  4. *Insecure Direct DB Fallback on Missing RPC*: When `transition_application_status_atomic` returned `PGRST202` (unmigrated cloud DB), `actions.ts` fell back to an un-fenced, un-leased direct update to `status = 'sending'`.
  5. *Unstable Send Keys*: Send idempotency keys were generated dynamically using `Date.now()`, causing duplicate logical sends and breaking deduplication.
  6. *CV Upload Magic Bytes Blindspot*: `src/app/cv/actions.ts` checked only MIME type string `application/pdf`, without verifying genuine `%PDF-` binary magic bytes. Storage cleanup on DB insertion failure was absent.

---

## 2. All Vulnerabilities and Defects Found

| ID | Component | Vulnerability / Defect Description | Severity | Resolution Status |
| :--- | :--- | :--- | :---: | :---: |
| **VULN-01** | `draft/page.tsx` | DB mutation (`update email_drafts`) during Server Component render using `service_role`. | HIGH | **IMPLEMENTED LOCALLY** |
| **VULN-02** | `actions.ts` (`saveDraft`) | Destructive delete-then-insert fallback (`delete().eq('application_id', appId)`) on draft update failure. | CRITICAL | **IMPLEMENTED LOCALLY** |
| **VULN-03** | `actions.ts` (`saveDraft`) | Overwriting `conflict_resolution` and `conflict_resolution_note` with NULL during draft saves. | MEDIUM | **IMPLEMENTED LOCALLY** |
| **VULN-04** | `actions.ts` (`approveDraft`) | Missing guard against direct transition from `postponed` to `approved` without draft re-evaluation. | HIGH | **IMPLEMENTED LOCALLY** |
| **VULN-05** | `actions.ts` (`sendApprovedApplicationEmail`) | Insecure direct DB fallback `.update({ status: 'sending' })` bypassing distributed leases when RPC is absent. | CRITICAL | **IMPLEMENTED LOCALLY** |
| **VULN-06** | `actions.ts` (`sendApprovedApplicationEmail`) | Ephemeral `Date.now()` idempotency key generation breaking distributed deduplication across retries. | HIGH | **IMPLEMENTED LOCALLY** |
| **VULN-07** | `cv/actions.ts` | Missing `%PDF-` binary magic bytes verification; vulnerable to non-PDF file upload spoofing. | HIGH | **IMPLEMENTED LOCALLY** |
| **VULN-08** | `cv/actions.ts` | Orphaned file vulnerability in storage if `resumes` table insertion fails after file upload. | MEDIUM | **IMPLEMENTED LOCALLY** |
| **VULN-09** | Application Core | No server-side deletion guard protecting applications in `sending` or `sent` status. | HIGH | **IMPLEMENTED LOCALLY** |
| **VULN-10** | `rpc-client` | PostgREST RPC responses returning `{ data: { success: false } }` unhandled by standard `try/catch`. | HIGH | **IMPLEMENTED LOCALLY** |

---

## 3. All Files Modified

### Modified Application & Test Files (7 files)
1. [`src/app/applications/[id]/draft/page.tsx`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/app/applications/[id]/draft/page.tsx)
2. [`src/app/applications/[id]/draft/actions.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/app/applications/[id]/draft/actions.ts)
3. [`src/app/cv/actions.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/app/cv/actions.ts)
4. [`src/lib/cv-parser.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/lib/cv-parser.ts)
5. [`src/lib/send-validation.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/lib/send-validation.ts)
6. [`src/lib/email-sender.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/lib/email-sender.ts)
7. [`src/app/applications/__tests__/draft.test.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/app/applications/__tests__/draft.test.ts)

### Newly Created Source & Test Files (6 files)
8. [`src/lib/application-state-machine.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/lib/application-state-machine.ts) (Single source of truth for status transitions & invariants)
9. [`src/lib/rpc-client.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/lib/rpc-client.ts) (Atomic RPC executor with concurrency retry & missing RPC detection)
10. [`src/lib/__tests__/application-state-machine.test.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/lib/__tests__/application-state-machine.test.ts) (Exhaustive state machine tests)
11. [`src/lib/__tests__/rpc-client.test.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/lib/__tests__/rpc-client.test.ts) (RPC concurrency retry and error tests)
12. [`src/lib/__tests__/upload-security.test.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/lib/__tests__/upload-security.test.ts) (PDF magic bytes validation tests)
13. [`src/lib/__tests__/idempotency-and-fencing.test.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/lib/__tests__/idempotency-and-fencing.test.ts) (Stable key & fencing tests)

---

## 4. What Changed in Each File

### 4.1 `src/app/applications/[id]/draft/page.tsx`
- **VERIFIED LOCALLY**: Removed the asynchronous `clientToUse.from("email_drafts").update(...)` block during Server Component rendering.
- Replaced with in-memory display sanitization: `draft.subject = sanitizedSubject; draft.body = sanitizedBody;`.
- Removed unused `getServiceRoleClient` import, eliminating privileged execution in GET requests.
- Added visible Simulation Mode Banner:
  `« Mode simulation actif — Aucun courriel réel n’est transmis. »`

### 4.2 `src/app/applications/[id]/draft/actions.ts`
- **VERIFIED LOCALLY**: In `saveDraft`, replaced destructive `delete().eq('application_id', appId)` with safe upsert logic preserving `conflict_resolution` and `conflict_resolution_note`.
- Enforced `canEditDraft(app.status)` (editing rejected if `sending` or `sent`).
- In `approveDraft`, enforced `canTransition(application.status, 'approved')` which strictly blocks postponed applications from bypassing draft re-evaluation.
- In `regenerateDraft`, eliminated destructive delete fallback; invalidates approval hashes cleanly.
- In `resolveDraftConflict`, guarded `cancel_postpone` with `canTransition(app.status, 'postponed')` (blocks postponing from `sending` or `sent`), and reactivates `status = 'draft'` when conflict is resolved.
- In `sendApprovedApplicationEmail`, derived deterministic stable `idempotencyKey = computeSendTrackingKey(app.id, draft.approved_hash)`.
- Replaced unsafe direct `.update({ status: 'sending' })` with safe rejection when RPC `transition_application_status_atomic` is absent (`PGRST202`).
- Added exported `deleteApplication(formData: FormData)` action with server-side validation rejecting deletion of `sending` or `sent` candidatures.

### 4.3 `src/lib/application-state-machine.ts`
- **IMPLEMENTED LOCALLY**: Defined `ApplicationStatus = 'draft' | 'approved' | 'sending' | 'sent' | 'failed' | 'postponed'`.
- Implemented `canTransition`, `assertValidTransition`, `canEditDraft`, and `canDeleteApplication`.
- Enforces strict invariants:
  - `sent` is permanent terminal sink (`sent -> sent` idempotent no-op only).
  - `sending -> postponed` is strictly rejected.
  - `postponed -> approved` directly is strictly rejected (must return to `draft` first).
  - `postponed -> sending` directly is strictly rejected.

### 4.4 `src/lib/rpc-client.ts`
- **IMPLEMENTED LOCALLY**: Implemented `executeAtomicRpcWithRetry` inspecting both `error` and `data.success === false`.
- Intercepts PostgreSQL retryable concurrency codes (`40P01` deadlock, `40001` serialization, `55P03` lock unavailable) with exponential backoff.
- Intercepts transient application errors (`concurrency_conflict`, `lease_lock_timeout`).
- Detects missing RPCs (`PGRST202` / `42883`) returning `{ status: 'missing_rpc' }` so callers fail safely without unsafe direct fallbacks.
- Guards against retrying operations once external side effects have occurred (`hasSideEffectsOccurred: true`).

### 4.5 `src/lib/send-validation.ts`
- **IMPLEMENTED LOCALLY**: Added `computeSendTrackingKey(applicationId, approvedHash)` and `validateSendTrackingKey`.
- Guaranteed stable, deterministic key generation: alterations to draft body, subject, or CV attachment change the hash and generate a new key.
- Supported `strictTrackingKey: true` in `validateApprovedEmailForSend`.

### 4.6 `src/lib/email-sender.ts`
- **IMPLEMENTED LOCALLY**: Updated `sendEmailMock` to accept `options.trackingKey`.
- Derives deterministic `messageId = mock_msg_${options.trackingKey.slice(0, 36)}`.
- Logs explicit notice: `[email-sender] MOCK DISPATCH (SIMULATION ONLY - NO REAL EMAIL TRANSMITTED)`.

### 4.7 `src/lib/cv-parser.ts` & `src/app/cv/actions.ts`
- **IMPLEMENTED LOCALLY**: Added `validatePdfMagicBytes(data: Uint8Array)` checking for `%PDF-` (`0x25 0x50 0x44 0x46 0x2D`) in first 1024 bytes.
- Updated `extractRawPdfText` to throw if magic bytes are missing.
- In `src/app/cv/actions.ts`, validated magic bytes before upload/parsing and added cleanup (`supabase.storage.from("resumes").remove([filePath])`) if database record insertion fails.

---

## 5. Security Improvements Implemented

1. **Server Component Read-Only Guarantee**:
   Zero database mutations (`.update()`, `.insert()`, `.delete()`, `.rpc()`) during page renders. No `service_role` execution on GET requests.
2. **True Tenant & Ownership Verification**:
   All draft actions strictly verify `user_id = user.id` on applications and resumes before reading or updating.
3. **Draft Loss Prevention**:
   Destructive delete-then-insert patterns eliminated. Existing draft rows are updated safely, preserving `conflict_resolution` and `conflict_resolution_note`.
4. **Approval Snapshot Invalidation**:
   Any modification to subject, body, or attached CV resets `approved_at`, `approved_hash`, and `approved_attachment_hash` to `null`.
5. **No Insecure Direct-Update Fallback**:
   When atomic RPC is missing, the application blocks the send cleanly with a transparent warning, instead of executing an un-fenced, un-leased direct update.
6. **Upload Content Integrity**:
   Uploaded CVs must satisfy both MIME type `application/pdf` and `%PDF-` binary magic bytes. Orphaned storage files are automatically cleaned up on DB failures.
7. **Deletion Protection**:
   Server Action `deleteApplication` rejects deletion if status is `sending` or `sent`.

---

## 6. State Machine Validation Results

Tested in [`src/lib/__tests__/application-state-machine.test.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/lib/__tests__/application-state-machine.test.ts):

| Transition | Intended Rule | Result |
| :--- | :--- | :---: |
| `draft -> approved` | Allowed (Approval action only) | **TEST PASSED** |
| `failed -> approved` | Allowed (Approval action only) | **TEST PASSED** |
| `approved -> sending` | Allowed (Valid approved draft) | **TEST PASSED** |
| `failed -> sending` | Allowed (Valid approval and same logical send key) | **TEST PASSED** |
| `sending -> sent` | Allowed (Valid provider result & fencing token) | **TEST PASSED** |
| `sending -> failed` | Allowed (Current fencing token) | **TEST PASSED** |
| `draft -> postponed` | Allowed (Authorized transition) | **TEST PASSED** |
| `approved -> postponed` | Allowed (Authorized transition) | **TEST PASSED** |
| `failed -> postponed` | Allowed (Authorized transition) | **TEST PASSED** |
| `postponed -> draft` | Allowed (Save action / resume) | **TEST PASSED** |
| `approved -> draft` | Allowed (Editing draft resets approval) | **TEST PASSED** |
| `failed -> draft` | Allowed (Editing draft resets failure) | **TEST PASSED** |
| `sending -> postponed` | **FORBIDDEN** (In-flight worker cannot be deferred) | **TEST PASSED** (Rejected) |
| `postponed -> approved` | **FORBIDDEN** (Must return to draft and re-validate) | **TEST PASSED** (Rejected) |
| `postponed -> sending` | **FORBIDDEN** (Cannot send without approval) | **TEST PASSED** (Rejected) |
| `sent -> *` | **FORBIDDEN** (Terminal state is irreversible) | **TEST PASSED** (Rejected) |

---

## 7. Idempotency and Concurrency Test Results

Tested in [`src/lib/__tests__/idempotency-and-fencing.test.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/lib/__tests__/idempotency-and-fencing.test.ts):

- **Deterministic Key Stability**: Calling `computeSendTrackingKey` multiple times for the same application and approved hash returns the exact same key: **TEST PASSED**.
- **Hash Alteration Sensitivity**: Modifying the approved draft hash immediately produces a completely different tracking key: **TEST PASSED**.
- **Mismatched Key Rejection**: `validateApprovedEmailForSend` with `strictTrackingKey: true` rejects any rogue, stale, or randomized key: **TEST PASSED**.
- **Deterministic Mock Message-ID**: `sendEmailMock` returns the identical `mock_msg_...` identifier when invoked with the same tracking key: **TEST PASSED**.
- **In-Flight Key Conflict Guard**: Modifying the key of an application currently in `sending` status is rejected: **TEST PASSED**.
- **Fencing Token Guard**: State transition from `sending` to `sent` strictly requires a valid fencing token: **TEST PASSED**.

---

## 8. Upload and Storage Test Results

Tested in [`src/lib/__tests__/upload-security.test.ts`](file:///c:/Users/user/Nouveau%20dossier/freelance%20projet%20inividuel/smart-cv-sender/src/lib/__tests__/upload-security.test.ts):

- Standard PDF header `%PDF-1.4`: **TEST PASSED** (`validatePdfMagicBytes` returns `true`).
- Header with UTF-8 BOM or leading whitespace: **TEST PASSED** (`true`).
- Plain text file with `.pdf` extension: **TEST PASSED** (`false`).
- HTML document with `.pdf` extension: **TEST PASSED** (`false`).
- Windows executable (MZ binary) with `.pdf` extension: **TEST PASSED** (`false`).
- Empty / truncated (< 5 bytes) buffer: **TEST PASSED** (`false`).
- Extraction throws clear error on fake PDF: **TEST PASSED**.

---

## 9. Quality Gate Verification

### 9.1 `npm test`
- **Command**: `node --experimental-strip-types --test src/lib/__tests__/*.test.js src/lib/__tests__/*.test.ts src/lib/discovery/__tests__/*.test.ts src/app/applications/__tests__/draft.test.ts`
- **Result**: **288 passed, 0 failures, 1 suite** (duration ~75s)
- **Status**: **TEST PASSED**

### 9.2 `npm run typecheck`
- **Command**: `tsc --noEmit`
- **Result**: Exit code 0, 0 type errors across all application, library, and test files.
- **Status**: **TEST PASSED**

### 9.3 `npm run lint`
- **Command**: `eslint`
- **Result**: Exit code 0, 0 errors, 0 warnings.
- **Status**: **TEST PASSED**

### 9.4 `npm run build`
- **Command**: `next build` (Next.js 16.4.3 Turbopack)
- **Result**: Exit code 0. Compiled successfully in 3.5s. All 15 routes generated cleanly (including partial prerender on `/applications/[id]/draft`).
- **Status**: **TEST PASSED**

---

## 10. Tests Not Run & Rationale

- **Live Database RPC Execution**: Tests requiring live PostgreSQL invocation of `save_email_draft_atomic` or `transition_application_status_atomic` against Supabase Cloud were **NOT RUN** because migration 007 has not yet been applied to the remote catalog. This strictly obeys the READ-ONLY authorization boundary.
- **Real SMTP Delivery**: Real email dispatch tests were **NOT RUN** because the application operates strictly in deterministic MOCK simulation mode.

---

## 11. Remaining Database-Dependent Tasks

The following database items are **PENDING DATABASE MIGRATION** and must be reviewed before deployment:
1. **Migration 007 Creation & Execution**:
   - Implement `acquire_mock_dispatch_lease` with mandatory TTL bounds ($5 \le \text{ttl} \le 300$), worker validation, and lease reset on `tracking_key` alteration.
   - Implement `transition_application_status_atomic` with mandatory fencing token validation (rejecting `NULL` and $\le 0$), atomic lease finalization, and collision-safe `email_events` insertion.
   - Implement `save_email_draft_atomic` distinguishing parameter omission from explicit NULLs, and preserving `conflict_resolution` metadata.
2. **Native PostgreSQL Deletion Triggers**:
   - Create trigger `trg_prevent_sent_application_deletion` on `public.applications` to block `DELETE` when `status in ('sending', 'sent')`.
   - Create trigger `trg_email_events_immutable` on `public.email_events` to unconditionally block `UPDATE` and `DELETE` even for `service_role`.

---

## 12. Remaining Supabase and Vercel Prerequisites

- **PENDING EXTERNAL CONFIGURATION**:
  - Verification that Supabase Cloud PostgreSQL connection pooler and PostgREST schema cache reload cleanly after migration 007.
  - Verification that Vercel serverless function execution timeouts are configured to $\le 15$ seconds, well within the 60-second lease TTL.

---

## 13. Risks That Remain Unresolved

1. **Pre-Migration Cloud Send Block**:
   Until migration 007 is deployed, clicking "Send" in the UI will encounter the safe block (`missing_rpc`) and redirect with a clear advisory message. This is intentional and necessary for security.
2. **Database-Level Delete Enforcement**:
   Local Server Action `deleteApplication` guards deletion in the application layer. However, direct database deletions via SQL or Supabase dashboard will only be prevented once the PostgreSQL trigger is deployed.

---

## 14. Final Git Status Confirmation

- **Current Branch**: `master`
- **Head Commit**: `5c37cc5` (Unchanged)
- **Commits Made**: **0** (No git commit executed)
- **Pushes Made**: **0** (No remote push executed)
- **Remote Infrastructure**: **UNTOUCHED** (Zero SQL, zero Supabase Cloud calls, zero Vercel mutations)

---

## Final Verdict

### **READY FOR DATABASE MIGRATION REVIEW**
All local source files, Server Components, Server Actions, state machine logic, upload handlers, and test suites are completely repaired, hardened, and verified with 100% passing quality gates. The project is ready for formal review of the database migration script.
