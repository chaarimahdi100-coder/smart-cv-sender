# Smart CV Sender

A complete, professional, secure, and responsive web application that helps candidates find relevant PFE opportunities, internships, and junior jobs in Tunisia and Europe.

---

## Dedicated Supabase Setup (Clean Project Integration)

> [!CAUTION]
> **Safety Warning:** Never run these migrations against an existing shared or production database without a backup. Use a dedicated, clean Supabase project or a local development container.

### Option A: Local Supabase Development (Recommended)

1. **Install Dependencies & Prerequisites:**
   ```bash
   npm install
   ```
   Ensure Docker Desktop is running on your machine if using the local Supabase CLI.

2. **Start Clean Local Supabase Instance:**
   ```bash
   npx supabase start
   ```
   This initializes local Postgres, Auth, and Storage services.

3. **Apply Chronological Migrations & Seed Data:**
   ```bash
   npx supabase db reset
   ```
   This executes all migrations in chronological order against the clean local database:
   - `20240101000000_initial_schema.sql` (Tables, Foreign Keys, RLS)
   - `20240102000000_storage.sql` (Private `resumes` bucket, Storage RLS)
   - `20240103000000_phase5_constraints.sql` (Unique application per opportunity)
   - `20240104000000_email_integrity_and_tracking.sql` (Approval attachment hash & send idempotency keys)
   - `20240105000000_schema_fixes.sql` (Profile creation trigger, storage update policy, opportunities location, unique email drafts)
   - `20240106000000_seed_demo_data.sql` (Public demo company, contact, and opportunities catalog)
   - `20240107000000_rate_limiting_and_security.sql` (Database-backed rate limiting, atomic draft & approval procedures, strict column grants)
   - `20240108000000_opportunity_metadata_and_constraints.sql` (Opportunity metadata columns, duplicate prevention index, and RLS documentation)

4. **Configure Local Environment Variables:**
   Copy `.env.example` to `.env.local` and configure local endpoints:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key-from-supabase-start>
   SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key-from-supabase-start>
   AI_PROVIDER_TYPE=gemini # or "mock" for deterministic fallback
   GEMINI_API_KEY=your-gemini-api-key
   ADMIN_EMAILS=admin@smartcv.dev,admin@example.com
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

---

### Option B: New Remote Dedicated Supabase Project

1. **Create a New Project:**
   Create a fresh project in the [Supabase Dashboard](https://supabase.com). Do NOT use an existing database with production data.

2. **Link the CLI to Your Dedicated Project:**
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-dedicated-project-ref>
   ```

3. **Deploy the Migration Sequence:**
   ```bash
   npx supabase db push
   ```

4. **Configure Remote Environment Variables in `.env.local`:**
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-project-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-project-service-role-key>
   AI_PROVIDER_TYPE=mock
   AI_API_KEY=your-ai-api-key
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

---

## Safe Integration Testing Checklist

Follow this checklist once connected to your dedicated Supabase instance to verify end-to-end functionality without sending real emails:

- [ ] **1. Authentication & Signup**
  - Sign up with a new candidate account at `/signup`.
  - Confirm redirection to `/dashboard`.
- [ ] **2. Automatic Profile Initialization**
  - Query table `public.profiles` or visit `/profile`.
  - Verify that a row in `profiles` was automatically created by the `on_auth_user_created` trigger for the candidate.
- [ ] **3. Candidate Multi-Tenant Data Isolation**
  - Sign up with a second candidate account in a separate private browser window.
  - Verify Candidate B cannot view Candidate A's profile at `/profile` or applications at `/dashboard`.
- [ ] **4. CV Upload, Storage RLS, & Signed URL Download**
  - Under Candidate A, upload a test PDF (<5MB) at `/cv`.
  - Verify file path in Supabase Storage is strictly prefixed with `<candidate-A-user-id>/`.
  - Verify file review page `/cv/review` displays mock extraction notice.
  - Test re-uploading an updated CV; verify that the storage update policy allows upserting.
  - Verify Candidate B cannot access Candidate A's CV file via direct storage path.
- [ ] **5. Opportunity Catalog & Application Creation**
  - Visit `/opportunities` and verify seeded demo opportunities are displayed with `(Demo)` labels.
  - Click "Draft Application" for an opportunity.
  - Select the uploaded CV and generate an application draft.
  - Attempt to apply a second time for the exact same opportunity; verify the duplicate application constraint blocks the operation.
- [ ] **6. Email Draft Editing & Approval Snapshot Invalidation**
  - Open `/applications/<id>/draft`.
  - Edit recipient, subject, or body; click "Save Draft". Verify application status reverts to `draft` and approval snapshot is cleared.
  - Click "Approve & Ready". Verify status transitions to `approved` and cryptographic SHA-256 hash is stored in `approved_hash`.
  - Make a minor edit to the subject or attached CV and save; verify approval is immediately invalidated.
- [ ] **7. Email Sending Safety Boundary**
  - Verify sending remains completely disabled (`disabledEmailProvider`).
  - Verify no emails are dispatched during any test workflow.

---

## Local Verification Suite

Run all local static analysis and automated test suites:

```bash
# Run automated unit and security regression tests
npm test

# Run ESLint checks
npm run lint

# Run TypeScript compilation checks
npm run typecheck

# Run Next.js production build
npm run build
```

---

## Security & Architecture Highlights

- **Pre-Send Approval Validation Gate:** Implemented in `src/lib/send-validation.ts`. Cryptographically re-verifies draft content, attachment storage path, candidate ownership, and send idempotency key before any future outbound operation.
- **Server-Only Credentials:** `SUPABASE_SERVICE_ROLE_KEY` and API keys are strictly restricted to server actions and backend routes.
- **Edge Route Protection:** All candidate routes (`/dashboard`, `/profile`, `/cv`, `/applications`) are guarded in middleware and redirect unauthenticated sessions to `/login`.
- **Opportunities Directory & Deterministic Scoring:**
  - Curated Tunisian catalog with 10 vetted entries (PFE, summer internships, junior positions in Web Development, Business Information Systems, BI, and AI).
  - Explicit labeling: illustrative demo simulation listings are marked as `[DEMO]` / `Exemple illustratif` and distinguished from verified live vacancies.
  - Transparent relevance scoring: deterministic algorithm (`src/lib/opportunity-matcher.ts`) comparing verified CV skills, projects, and degree against job requirements (0–100%). Explicitly declared as technical relevance, NOT a hiring probability.
  - Opportunity Management: server-side admin authorization (`ADMIN_EMAILS`) for creating, updating, activating/deactivating, and JSON batch importing without granting candidate write access.
- **Strict Factual Accuracy:** Candidate degree is strictly anchored to the uploaded CV (`Licence en Informatique de Gestion (Business Information Systems)`) and never rewritten as `Licence Appliquée` without CV confirmation.
- **Zero Real Email Sending:** Real email sending remains completely disabled. All outreach simulations use `sendEmailMock`.
