-- =========================================================================
-- Migration: 20240111000000_opportunity_provenance_and_dates.sql
-- Project: Smart CV Sender
-- Description: Non-destructively adds explicit columns for source platform,
--              application destination URL, source update date, and closure date.
-- =========================================================================

alter table public.opportunities 
  add column if not exists source_platform text,
  add column if not exists application_url text,
  add column if not exists updated_at_source timestamp with time zone,
  add column if not exists closed_at timestamp with time zone;

create index if not exists idx_opportunities_source_platform 
  on public.opportunities (source_platform);
