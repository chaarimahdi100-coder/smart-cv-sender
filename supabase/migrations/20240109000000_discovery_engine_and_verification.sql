-- =========================================================================
-- Migration: 20240109000000_discovery_engine_and_verification.sql
-- Project: Smart CV Sender
-- Description: Extends opportunities with real-time discovery engine metadata,
--              verification provenance, deduplication canonical URLs, and
--              freshness tracking fields.
--
-- Prerequisite migrations: 20240101000000 through 20240108000000
-- NOTE: FOR CODE REVIEW ONLY. DO NOT EXECUTE AUTOMATICALLY AGAINST REMOTE DATABASE.
-- =========================================================================

-- 1. Idempotently add verification, provenance, and freshness columns
alter table public.opportunities 
  add column if not exists verification_status text default 'unverified',
  add column if not exists status_reason text,
  add column if not exists verification_evidence jsonb default '{}'::jsonb,
  add column if not exists source_provider text default 'manual',
  add column if not exists canonical_url text,
  add column if not exists date_posted timestamp with time zone,
  add column if not exists valid_through timestamp with time zone,
  add column if not exists first_seen_at timestamp with time zone default timezone('utc'::text, now()),
  add column if not exists last_checked_at timestamp with time zone default timezone('utc'::text, now()),
  add column if not exists remote_policy text default 'unknown',
  add column if not exists application_method text default 'direct_url',
  add column if not exists required_skills text[] default '{}'::text[];

-- 2. Add validation check constraint on verification_status
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'chk_opportunities_verification_status'
  ) then
    alter table public.opportunities 
      add constraint chk_opportunities_verification_status 
      check (verification_status in (
        'new',
        'verified_open',
        'likely_open',
        'unverified',
        'expired',
        'closed',
        'broken_source',
        'rejected'
      ));
  end if;
end $$;

-- 3. Add performance indexes for real-time querying and filtering
create index if not exists idx_opportunities_verification_status 
  on public.opportunities (verification_status);

create index if not exists idx_opportunities_canonical_url 
  on public.opportunities (canonical_url);

create index if not exists idx_opportunities_source_provider 
  on public.opportunities (source_provider);

create index if not exists idx_opportunities_last_checked_at 
  on public.opportunities (last_checked_at);

-- 4. Source Registry Table (Tracks provider health, rate limits, and sync telemetry)
create table if not exists public.discovery_sources (
  id text primary key,
  name text not null,
  source_type text not null,
  access_method text not null,
  homepage_url text not null,
  enabled boolean default true,
  requires_auth boolean default false,
  is_configured boolean default true,
  rate_limit_per_minute integer default 30,
  last_sync_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on discovery_sources
alter table public.discovery_sources enable row level security;

-- Candidates can view registered sources (idempotent guard prevents rerun errors)
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'discovery_sources' 
      and policyname = 'Candidates can view registered discovery sources'
  ) then
    create policy "Candidates can view registered discovery sources"
      on public.discovery_sources for select
      to authenticated
      using (true);
  end if;
end $$;

-- 5. Data Integrity Guarantee: Preserves candidate applications and drafts on expiry
-- (Existing foreign keys on applications.opportunity_id are ON DELETE SET NULL,
-- ensuring that even if an opportunity is archived, candidate history is never deleted).
