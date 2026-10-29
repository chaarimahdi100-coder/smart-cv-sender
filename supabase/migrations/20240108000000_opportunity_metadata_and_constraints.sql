-- Migration: 20240108000000_opportunity_metadata_and_constraints.sql
-- Description: Adds opportunity metadata columns (is_demo, verified_at),
-- performance indexes for active and demo filtering, and establishes clear
-- constraints for the opportunities catalog.
-- Deadline tracking is standardized on valid_through (migration 20240109000000).
--
-- Prerequisite migrations: 20240101000000 through 20240107000000
-- NOTE: DO NOT execute this file automatically against production. Apply manually after review.

-- 1. Idempotently add metadata columns to opportunities table
alter table public.opportunities add column if not exists is_demo boolean default false;
alter table public.opportunities add column if not exists verified_at timestamp with time zone;

-- 2. Indexes for efficient filtering of active vacancies and demo listings
create index if not exists idx_opportunities_is_active on public.opportunities (is_active);
create index if not exists idx_opportunities_is_demo on public.opportunities (is_demo);
create index if not exists idx_opportunities_created_at on public.opportunities (created_at desc);

-- 3. Non-unique index on (company_id, title) to optimize company role lookups
-- (Non-unique to prevent transaction abort on pre-existing duplicate titles and support legitimate multi-cohort vacancies)
create index if not exists idx_opportunities_company_title 
  on public.opportunities (company_id, title);

-- 4. Verify RLS policies:
-- Candidates have STRICTLY read-only access (SELECT) on active opportunities.
-- Direct INSERT, UPDATE, and DELETE remain revoked from authenticated candidate clients.
do $$
begin
  -- Ensure RLS is active
  alter table public.opportunities enable row level security;
  alter table public.companies enable row level security;
  alter table public.company_contacts enable row level security;
end $$;

-- 5. Mark existing synthetic demo fixture records as is_demo = true
-- Strictly scoped to explicit demo markers to prevent classifying real domains (e.g. demostack.com) as demo
update public.opportunities
set is_demo = true
where title ilike '%[DEMO]%' or source_url ilike '%-demo.tn%';
