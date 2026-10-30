# Smart CV Sender

[![Next.js](https://img.shields.io/badge/Next.js-16.4.3-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.3.0-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.x-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20Storage-3ecf8e?logo=supabase)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Smart CV Sender** is an intelligent, privacy-first web application designed for students, graduates, and junior professionals in Tunisia and EMEA to discover authentic internship (PFE) and junior opportunities, evaluate technical fit transparently, and generate grounded, personalized cover emails backed by verified CV facts.

---

## 🌟 Key Features

### 1. Transparent Opportunity Relevance Engine
- **Deterministic 4-Pillar Scoring (0–100%)**: Evaluates technical alignment based strictly on verified candidate CV evidence (Skills 40 pts, Projects 25 pts, Education 15 pts, Seniority 20 pts).
- **Realism & Seniority Guardrails**: Enforces transparent caps (e.g., student applying to Manager/Lead roles capped at $\le 25\%$) with explicit mismatch notices.
- **Calendar Availability Intelligence**: Detects availability conflicts (e.g., candidate available in 2027 vs. 2026 session) and provides candidate decision flows (compatible confirmation, spontaneous application conversion, or postponement).

### 2. Fact-Grounded Cover Email Generation
- **Zero Hallucination Guarantee**: Grounded exclusively in verified candidate data (exact degree names, universities like ESPRIT/INSAT, authentic project details like *Ecom Doctor* and *MN Cosmetics*).
- **Multi-Provider AI with Deterministic Fallback**: Powered by Google Gemini API with fallback to deterministic rule-based generation.
- **Cryptographic Draft Integrity**: Generates SHA-256 hashes locking the recipient, subject, body, and attached CV PDF. Any post-approval tamper invalidates approval immediately.

### 3. Trustworthy Opportunity Directory & Multi-Source Discovery
- **Authentic Lifecycle Tracking**: Preserves original publication dates, source URLs, and originating platforms (LinkedIn, Tanitjobs, Keejob, direct employer portals).
- **Freshness & Staleness Detection**: Flags postings older than 90 days with clear recheck advisories.
- **Accessible Pagination**: Responsive navigation with 12 opportunities per page, boundary clamping, and dynamic filter resets.
- **Strict Separation of Real vs. Demo Feeds**: Dedicated filters separating live verified vacancies from demo test fixtures.

### 4. Enterprise-Grade Security & Privacy
- **SSRF Defense Engine**: Validates all outbound crawl/recheck targets against private, loopback (IPv4/IPv6), and cloud metadata IP ranges.
- **Prompt Injection Defense**: Sanitizes inputs and utilizes strict context isolation delimiters.
- **Supabase Row-Level Security (RLS)**: Enforces multi-tenant isolation across all profiles, applications, and storage objects.
- **Safe Sending Boundary**: Outbound dispatch is disabled by default; approvals require a verified recruiter email and cryptographic snapshot verification.

---

## 🛠️ Architecture & Tech Stack

- **Framework**: [Next.js 16.4.3](https://nextjs.org/) (App Router, Turbopack, Server Actions, Partial Prerendering)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/) (Strict typing, no `any` leaks)
- **Frontend**: [React 19.3.0](https://react.dev/), [Tailwind CSS 4](https://tailwindcss.com/)
- **Backend & Database**: [Supabase](https://supabase.com/) (PostgreSQL 15+, Auth, Private Object Storage, RLS)
- **AI & Processing**: [Google Gemini API](https://ai.google.dev/), [unpdf](https://github.com/unjs/unpdf)
- **Testing**: Node.js Native Test Runner (`node:test`) with 263+ automated regression tests.

---

## 🚀 Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v20+ (v24 recommended)
- [npm](https://www.npmjs.com/) v10+
- [Docker Desktop](https://www.docker.com/) (optional, for local Supabase development)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/chaarimahdi100-coder/smart-cv-sender.git
cd smart-cv-sender

# Install exact dependencies
npm install
```

### 3. Environment Setup
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Configure your environment variables:
```env
NEXT_PUBLIC_SUPABASE_URL="https://your-project-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

# AI Provider ("gemini" or "mock")
AI_PROVIDER_TYPE="mock"
GEMINI_API_KEY="your-gemini-api-key"

NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 4. Database Initialization (Local or Remote)
Using the [Supabase CLI](https://supabase.com/docs/guides/cli):
```bash
# Start local Supabase instance
npx supabase start

# Apply chronological migrations and schema
npx supabase db reset
```

### 5. Running the Application
```bash
# Start Next.js development server with Turbopack
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Quality Gates & Verification

Run the full validation suite locally:

```bash
# Run 263+ automated unit, integration, and security regression tests
npm test

# Run TypeScript typecheck
npm run typecheck

# Run ESLint validation
npm run lint

# Run Next.js optimized production build
npm run build
```

---

## 📂 Repository Structure

```
smart-cv-sender/
├── src/
│   ├── app/                    # Next.js App Router routes & Server Actions
│   │   ├── api/                # Discovery recheck & education APIs
│   │   ├── applications/       # Outreach editor & draft management
│   │   ├── auth/               # Sign in, Sign up & session management
│   │   ├── cv/                 # CV upload & review workflows
│   │   ├── dashboard/          # Candidate outreach dashboard
│   │   ├── opportunities/      # Directory, filtering & pagination
│   │   └── profile/            # Academic & career profile settings
│   ├── components/             # Reusable UI & layout components
│   ├── lib/                    # Core business logic, scoring & security
│   │   ├── discovery/          # Multi-source discovery engine & SSRF guard
│   │   ├── education/          # Vetted Tunisian degree & university catalog
│   │   ├── availability-detector.ts # Calendar conflict & session intelligence
│   │   ├── cv-parser.ts        # PDF parsing & fact extraction
│   │   ├── email-generator.ts  # Grounded email generation (Gemini / deterministic)
│   │   ├── opportunity-matcher.ts   # Deterministic 4-pillar relevance scorer
│   │   ├── opportunity-pagination.ts# Accessible pagination utilities
│   │   └── send-validation.ts  # Cryptographic approval snapshot validation
│   └── utils/supabase/         # Authenticated SSR & server clients
├── supabase/
│   ├── migrations/             # Chronological schema, security & RLS migrations
│   └── seed_tunisian_opportunities.sql
└── README.md
```

---

## 🔒 Security & Safe Outreach Rules

1. **Strict Multi-Tenant Isolation**: RLS policies prevent users from viewing or altering other candidates' profiles, applications, or CV attachments.
2. **Deterministic Pre-Send Validation**: Approval signatures (`approved_hash`) verify that the email recipient, subject, body, and attached resume file have not been altered after approval.
3. **No Unsolicited Spam**: Outbound real email delivery remains disabled by default; applications default to the employer's official recruitment portal when no verified recruiter contact exists.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
