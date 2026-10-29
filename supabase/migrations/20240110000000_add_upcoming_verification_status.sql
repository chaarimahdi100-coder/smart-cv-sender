-- =========================================================================
-- Migration: 20240110000000_add_upcoming_verification_status.sql
-- Project: Smart CV Sender
-- Description: Update chk_opportunities_verification_status to include 'upcoming'
--              for future-dated opportunities and recruitment waves.
--
-- Prerequisite migrations: 20240101000000 through 20240109000000
-- =========================================================================

do $$
begin
  alter table public.opportunities 
    drop constraint if exists chk_opportunities_verification_status;

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
      'rejected',
      'upcoming'
    ));
end $$;
