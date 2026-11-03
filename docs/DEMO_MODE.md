# Smart CV Sender — Public Demo Mode Architecture & Administration

## 1. Overview & Purpose

Smart CV Sender includes a dedicated **Public Demo Access Mode** designed to provide prospective recruiters, partners, and public evaluators with an immediate, frictionless demonstration experience without requiring email delivery verification.

Visitors can explore the platform in one click directly from:
- Landing Page (`/`): "Tester la Démo (1-clic)"
- Login Page (`/login`): "Accéder au Mode Démo (1-clic)"
- Signup Page (`/signup`): Direct demo invitation banner

---

## 2. Security Architecture

### A. Server-Only Isolation (`src/lib/demo-mode.server.ts`)
- Marked with `import "server-only";` to guarantee at build time that server credentials, secrets, and environment variables can **never** be imported into Client Components or browser JavaScript bundles.
- Exposes `getDemoCredentials()` which requires `DEMO_USER_PASSWORD` strictly from environment variables (failing safely with `null` when unconfigured). Zero hardcoded fallback secrets exist in the repository.
- Keeps client-safe utilities (`isDemoUser()`, `SHARED_DEMO_RESTRICTION_MESSAGE`, `DEMO_USER_EMAIL`) in `src/lib/demo-mode.ts` without secret leakage.

### B. Public Abuse Mitigation (Instance-Local Sliding-Window Rate Limiting)
- Server action `loginAsDemo()` verifies rate limits via `checkDemoLoginRateLimit()`.
- **Architecture**: In-memory, process-level sliding window designed for lightweight burst protection on warm serverless containers. Note: As an in-memory mechanism, counters are instance-local to each serverless container and reset on cold starts.
- **Trusted IP Extraction**: Inspects trusted edge headers first (`x-real-ip`, `x-vercel-ip`, `cf-connecting-ip`) injected by upstream infrastructure (Vercel / Cloudflare) to prevent client IP spoofing via fabricated `X-Forwarded-For` chains.
- **Per-IP Limit**: Max 5 demo logins per 60 seconds per IP address.
- **Instance Limit**: Max 30 demo logins per 60 seconds per container instance.
- Violators receive a localized redirect error notice specifying the exact retry delay in seconds.

### C. Non-Admin Invariant
- The demo account (`demo@smartcv.dev`) is strictly non-admin.
- Evaluated against `isAuthorizedOpportunityManager()` in `src/lib/auth/admin-auth.ts`: access is denied with zero management privileges.
- Admin routes (`/opportunities/new`, manual URL scrape import) reject the demo session.

### D. Shared Demo Guardrails
- **Profile Mutations Disabled**: `updateProfile` in `src/app/profile/actions.ts` blocks mutations for `demo@smartcv.dev` with an explanatory message.
- **Resume Upload Blocked**: `uploadCV` in `src/app/cv/actions.ts` blocks overwriting the sample CV.
- **Zero Real Email Transmission**: All email operations use `sendEmailMock` simulation with deterministic masking (`h***@company.tn`).

---

## 3. Safe Demo Data Reset Procedure

If the shared demo account's sample applications or state need to be refreshed, an administrator can execute the safe provisioning script.

### Command
```bash
node scripts/seed-demo-account.mjs --reset
```

### Safety Guarantees
1. **Target User Validation**: The script retrieves the user by email (`demo@smartcv.dev`) and asserts that `demoUser.email.toLowerCase() === DEMO_CONFIG.email.toLowerCase()`.
2. **Strict User Scoping**: Deletions are strictly filtered by `eq("user_id", userId)` and `in("application_id", demoAppIds)`.
3. **Zero Impact on Real Users**: No generic `DELETE` or un-scoped queries exist. Production candidate accounts, resumes, applications, and settings remain untouched.
4. **Idempotent Restoration**: Recreates the standard profile ("Yassine Ben Salem"), sample CV text, and 3 realistic applications (`draft`, `approved`, `sent`).
