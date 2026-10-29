-- =========================================================================
-- Migration: 20240112000000_draft_conflict_resolution.sql
-- Project: Smart CV Sender
-- Description: Adds conflict_resolution and conflict_resolution_note to email_drafts
--              to persist candidate choices when availability conflicts are detected.
-- =========================================================================

alter table public.email_drafts
  add column if not exists conflict_resolution text default null,
  add column if not exists conflict_resolution_note text default null;

create index if not exists idx_email_drafts_conflict_resolution
  on public.email_drafts (conflict_resolution);
