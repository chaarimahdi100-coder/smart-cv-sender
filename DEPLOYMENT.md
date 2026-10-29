# Smart CV Sender — Production Deployment & Operations Guide

This guide provides the complete setup, migration, and release instructions for deploying **Smart CV Sender** to production environments (Vercel, Supabase, or custom infrastructure).

---

## 1. System Architecture Overview

Smart CV Sender is a production-grade Next.js application built with:
- **Framework**: Next.js 15 (App Router, Server Actions, React 19).
- **Authentication & Database**: Supabase (PostgreSQL with strict Row-Level Security, Supabase Auth).
- **File Storage**: Supabase Storage (`resumes` private bucket with candidate folder isolation).
- **AI Processing**: Dual-mode engine — deterministic CV-grounded local synthesis with optional Google Gemini integration (`AI_PROVIDER_TYPE=gemini`).
- **Email Dispatch**: Secure multi-step verification pipeline (drafting &rarr; candidate approval &rarr; SHA-256 cryptographic hashing &rarr; simulated/mock dispatch in demo mode).

---

## 2. Environment Variables

Configure the following variables in your production environment (e.g., Vercel Project Settings > Environment Variables or `.env.production`):

| Variable Name | Required | Description | Example / Notes |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Supabase project API URL | `https://xyzcompany.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Supabase public anonymous API key | Safe for client-side bundle |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Secret administrative key | Server-side only (never expose in client) |
| `NEXT_PUBLIC_APP_URL` | **Yes** | Base canonical URL of the application | `https://smart-cv-sender.example.com` |
| `AI_PROVIDER_TYPE` | Optional | AI generation backend (`mock` or `gemini`) | Default: `mock` (deterministic local synthesis) |
| `GEMINI_API_KEY` | Optional | Google Gemini API key if using `gemini` | Required only when `AI_PROVIDER_TYPE=gemini` |
| `AI_API_KEY` | Optional | Alias for Gemini API key | Supported fallback |

> [!WARNING]
> Never commit `.env.local` or any service role keys to Git. Keep `SUPABASE_SERVICE_ROLE_KEY` strictly inside secure server environments if used.

---

## 3. Database Migration Sequence

All schema migrations are stored under [`supabase/migrations/`](./supabase/migrations). Run them in sequential timestamp order against your Supabase Postgres instance:

### Migration Order

1. **`20240101000000_initial_schema.sql`**
   - Core tables: `profiles`, `resumes`, `companies`, `opportunities`, `applications`, `email_drafts`, `email_events`.
   - Initial RLS policies ensuring candidate data isolation.
2. **`20240102000000_storage.sql`**
   - Creates the `resumes` storage bucket.
   - Enforces RLS policies so candidates can only upload, read, and delete objects in their own folder (`userId/*`).
3. **`20240103000000_phase5_constraints.sql`**
   - Adds unique constraint `(application_id)` on `email_drafts`.
   - Adds validation triggers and foreign key performance indexes.
4. **`20240104000000_email_integrity_and_tracking.sql`**
   - Adds cryptographic approval integrity fields (`approved_hash`, `approved_attachment_hash`, `approved_at`).
   - Adds `send_idempotency_key` and state machine columns to `applications`.
5. **`20240105000000_schema_fixes.sql`**
   - Ensures column compatibility across schema versions.
6. **`20240106000000_seed_demo_data.sql`** *(Optional Seed)*
   - Seeds realistic French tech opportunities and companies (e.g., Doctolib, Qonto, Alan, Payfit, Algolia).
   - Designed for staging/demo environments.
7. **`20240107000000_rate_limiting_and_security.sql`** *(Critical Hardening)*
   - Creates `rate_limits` table with Row-Level Security.
   - Adds atomic Postgres stored procedure `check_rate_limit(p_key, p_limit, p_window_seconds)`.
   - Adds `DELETE` policy for `email_drafts`.
   - Adds atomic stored procedures `save_email_draft_atomic`, `approve_email_draft_atomic`, and `transition_application_status_atomic` (`SECURITY DEFINER`) to enforce state machine rules, approval prerequisites, and ownership at the database level.
   - Revokes direct PostgREST `UPDATE` privileges on sensitive columns (`status`, `send_idempotency_key` on `applications`; `approved_hash`, `approved_attachment_hash`, `approved_at` on `email_drafts`) from the `authenticated` role.

### Execution Methods

#### Option A: Supabase CLI (Recommended for CI/CD)
```bash
# Link your project
supabase link --project-ref <your-project-id>

# Push pending migrations
supabase db push
```

#### Option B: Supabase Dashboard SQL Editor
If managing the database via web console, open the **SQL Editor** in the Supabase Dashboard and execute the files in order:
1. Copy and run `20240101000000_initial_schema.sql` through `20240105000000_schema_fixes.sql`.
2. Run `20240106000000_seed_demo_data.sql` (if you want sample opportunities in the catalog).
3. Run `20240107000000_rate_limiting_and_security.sql`.

---

## 4. Multi-Layer Security Architecture

Smart CV Sender separates security controls into two distinct, complementary tiers:

```mermaid
flowchart TD
    Client[Browser / Attacker] -->|HTTP Request| Middleware[Next.js Middleware Proxy]
    Middleware -->|Unauthenticated| LoginRedirect[/login]
    Middleware -->|Authenticated Session| ServerAction[Next.js Server Actions]
    
    subgraph AppTier [Application-Layer Safeguards]
      ServerAction --> AuthCheck[Verify auth.getUser]
      AuthCheck --> InputVal[Validate Inputs & Emails]
      InputVal --> HashCheck[Verify SHA-256 Draft Signature]
      HashCheck --> StateCheck[Enforce Lifecycle Transition]
    end

    subgraph DbTier [Database-Layer Enforcement]
      ServerAction --> RPC["SECURITY DEFINER Stored Procedures"]
      RPC --> DbAuth["Verify auth.uid() = user_id"]
      DbAuth --> DbStateLock["Verify Terminal State (Sent is Final)"]
      DbAuth --> DbMutate["Mutate Sensitive Columns"]
      
      Client -.->|Direct PostgREST Mutation Attempt| PostgRESTDirect[PostgREST REST Endpoint]
      PostgRESTDirect -->|Blocked by REVOKE UPDATE| DbDenied["42501 Permission Denied"]
    end
```

### Application-Layer Safeguards
1. **Middleware Proxy Route Protection**:
   - `src/utils/supabase/middleware.ts` intercepts requests to `/dashboard`, `/cv`, `/opportunities`, `/applications`, and `/profile`.
   - Unauthenticated visitors are redirected to `/login?next=...` before any Server Component or Server Action executes.
2. **Cryptographic Draft Integrity**:
   - Every approved draft is signed with an SHA-256 digest covering `recipient_email`, `subject`, `body`, `resume_id`, and `storage_path`.
   - `validateApprovedEmailForSend` verifies that the current draft content exactly matches this signature immediately before dispatch.
3. **Send Idempotency & Simulated Dispatch**:
   - Outbound dispatch produces a unique `send_idempotency_key` and operates via `sendEmailMock`, preventing accidental external transmissions.
4. **Resilient Rate Limiting**:
   - Rate limits: Max 5 CV uploads / 10 min; max 10 draft regenerations / 5 min.
   - If migration `20240107000000` is missing, the limiter fails open safely (`source: "unmigrated_fallback"`, `isDatabaseEnforced: false`) and logs an operational warning without locking out candidates.

### Database-Layer Enforcement
1. **Postgres Row-Level Security (RLS)**:
   - All tables (`profiles`, `resumes`, `applications`, `email_drafts`, `rate_limits`) have RLS enabled with candidate tenant isolation.
2. **Column-Level Privilege Revocation**:
   - Direct `UPDATE` on `status`, `send_idempotency_key`, and `approved_hash` is revoked from the `authenticated` role.
   - Even if a candidate attempts to bypass the UI using `curl` or PostgREST directly, Postgres rejects direct column mutations with error `42501`.
3. **Atomic Stored Procedures**:
   - `approve_email_draft_atomic` and `transition_application_status_atomic` run with `SECURITY DEFINER` and explicitly verify `auth.uid() = user_id` and prevent re-opening sent applications.

---

## 5. Local Verification & Pre-Flight Checks

Before deploying any release, run the complete verification suite locally:

```bash
# 1. Run unit, integration, and security tests
npm test

# 2. Check for ESLint errors
npm run lint

# 3. Verify TypeScript type safety
npm run typecheck

# 4. Create production build
npm run build

# 5. Run local HTTP smoke test
node scripts/smoke-test.mjs
```

All 5 steps must exit with code `0`.

---

## 6. Vercel Deployment Guide

1. **Connect Repository**: Import the repository in Vercel.
2. **Framework Preset**: Select **Next.js**.
3. **Environment Variables**: Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, and optional AI provider settings.
4. **Deploy**: Trigger a production deployment.
5. **Verify Supabase Auth Redirects**: In your Supabase Dashboard under **Authentication > URL Configuration**, add your production URL (`https://your-domain.vercel.app/**`) to **Redirect URLs**.

---

## 7. Post-Deployment Smoke Test Checklist

- [ ] Sign up a new test candidate or sign in with an existing account.
- [ ] Upload a test PDF CV and verify parsing into verified profile data.
- [ ] Browse `/opportunities` and apply to an opportunity.
- [ ] Review the auto-generated French email draft grounded strictly in the candidate's CV.
- [ ] Click **Approuver le brouillon** and verify the draft status changes to `approved` with an integrity hash.
- [ ] Click **Envoyer (Mode Démo)** and confirm simulated dispatch logs an event and locks the draft into immutable `sent` state.

---

## 8. Known Operational Notes & Pending Database Operations

1. **Pending Migration Execution**:
   - Migration `20240107000000_rate_limiting_and_security.sql` must be applied by the database administrator in the Supabase Dashboard SQL Editor or via CLI.
   - Until applied, rate limiting operates in unmigrated fallback mode (`isDatabaseEnforced: false`), and column-level protection relies on the application tier.
2. **Real SMTP / Provider Integration**:
   - To enable real email delivery beyond demo mode in the future, connect an authorized OAuth2 provider or transactional email API (e.g., Resend, Gmail API) within `sendEmailMock` / `email-sender.ts`, while maintaining the mandatory candidate approval hash and state-machine checks.
