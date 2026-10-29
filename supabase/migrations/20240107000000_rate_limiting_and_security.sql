-- Migration: 20240107000000_rate_limiting_and_security.sql
-- Hardens database authorization, adds missing RLS policies, establishes
-- database-backed rate limiting, enforces strict column-level PostgREST privileges,
-- and provides atomic stored procedures for draft saving, approval, and lifecycle transitions.

-- 0. Prerequisites and Idempotent Schema Guards
-- Ensures dependent columns and constraints from prior migrations (20240104000000, 20240105000000)
-- exist idempotently before stored procedures and privilege rules are established.
alter table email_drafts add column if not exists approved_attachment_hash text;
alter table applications add column if not exists send_idempotency_key text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'unique_email_draft_per_application') then
    alter table email_drafts 
      add constraint unique_email_draft_per_application unique (application_id);
  end if;
end $$;

-- 1. Rate Limits Table
create table if not exists rate_limits (
  id text primary key,
  request_count int not null default 1,
  window_start timestamp with time zone default now() not null
);
create index if not exists idx_rate_limits_window on rate_limits (window_start);

alter table rate_limits enable row level security;

-- Candidates can ONLY view their own rate limit buckets.
-- Direct INSERT, UPDATE, and DELETE are strictly disallowed via table privileges and RLS
-- to prevent users from resetting or manipulating their own counters.
drop policy if exists "Users can manage own rate limits" on rate_limits;
drop policy if exists "Users can view own rate limits" on rate_limits;
create policy "Users can view own rate limits" on rate_limits
  for select using (
    id ~ '^[a-zA-Z0-9_-]+:[0-9a-fA-F-]{36}$' and
    split_part(id, ':', 2) = auth.uid()::text
  );

-- 2. Stored Procedure for Atomic Rate Limiting
-- Runs as SECURITY DEFINER with search_path = public so it can atomically manage counters
-- even though direct write access to rate_limits is revoked from authenticated clients.
-- Safe under concurrent bursts (atomic initial insert + row-level lock) and strictly validates key ownership.
create or replace function check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamp with time zone := now();
  v_record rate_limits%rowtype;
  v_reset_in int;
begin
  -- 1. Validate authentication
  if auth.uid() is null then
    return jsonb_build_object('allowed', false, 'error', 'Authentication required for rate limiting');
  end if;

  -- 2. Validate parameters
  if p_key is null or trim(p_key) = '' then
    return jsonb_build_object('allowed', false, 'error', 'Rate limit key cannot be empty');
  end if;

  if p_limit is null or p_limit <= 0 or p_window_seconds is null or p_window_seconds <= 0 then
    return jsonb_build_object('allowed', false, 'error', 'Invalid limit or window parameters');
  end if;

  -- 3. Strictly enforce key format: '<action_name>:<auth.uid()>'
  -- Disallows arbitrary substrings, extra colons, or spoofing another user's bucket
  if p_key !~ '^[a-zA-Z0-9_-]+:[0-9a-fA-F-]{36}$' then
    return jsonb_build_object('allowed', false, 'error', 'Invalid rate limit key format');
  end if;

  if split_part(p_key, ':', 2) <> auth.uid()::text then
    return jsonb_build_object('allowed', false, 'error', 'Unauthorized rate limit key: user ID mismatch');
  end if;

  -- 4. Atomic row creation: ensure row exists so FOR UPDATE row-level locking works safely on initial request
  insert into rate_limits (id, request_count, window_start)
  values (p_key, 0, v_now)
  on conflict (id) do nothing;

  -- 5. Acquire row-level lock on the guaranteed-existing record
  select * into v_record from rate_limits where id = p_key for update;

  -- 6. Check if window has expired or this is initial record
  if v_record.request_count = 0 or (v_now - v_record.window_start) > (p_window_seconds || ' seconds')::interval then
    update rate_limits
    set request_count = 1,
        window_start = v_now
    where id = p_key;

    return jsonb_build_object('allowed', true, 'remaining', p_limit - 1, 'reset_in_seconds', p_window_seconds);
  end if;

  -- 7. Active window: calculate remaining time
  v_reset_in := greatest(1, p_window_seconds - extract(epoch from (v_now - v_record.window_start))::int);

  if v_record.request_count >= p_limit then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'reset_in_seconds', v_reset_in);
  else
    update rate_limits
    set request_count = v_record.request_count + 1
    where id = p_key;

    return jsonb_build_object('allowed', true, 'remaining', p_limit - (v_record.request_count + 1), 'reset_in_seconds', v_reset_in);
  end if;
end;
$$;

-- 3. Add Safe DELETE Policy and Remove Legacy Direct UPDATE Policies
-- Prevents deleting drafts or applications while in-flight (sending) or after sent
drop policy if exists "Users can delete own email drafts" on email_drafts;
create policy "Users can delete own email drafts" on email_drafts
  for delete using (
    exists (
      select 1 from applications 
      where applications.id = email_drafts.application_id 
        and applications.user_id = auth.uid()
        and applications.status not in ('sending', 'sent')
    )
  );

drop policy if exists "Users can delete own applications" on applications;
create policy "Users can delete own applications" on applications
  for delete using (
    auth.uid() = user_id
    and status not in ('sending', 'sent')
  );

-- Drop legacy direct UPDATE policies. Direct UPDATE via PostgREST is completely disallowed.
-- All draft edits, CV switches, approvals, and status transitions must be executed through
-- the atomic SECURITY DEFINER functions below.
drop policy if exists "Users can update own applications" on applications;
drop policy if exists "Users can update own email drafts" on email_drafts;
drop policy if exists "Users can update own email_drafts" on email_drafts;

-- 4. Atomic Stored Procedures for Secure Draft Operations & Lifecycle Transitions
-- Direct table-level and column-level updates on applications and email_drafts
-- are completely REVOKED from authenticated PostgREST clients. All lifecycle mutations are managed
-- through these validated SECURITY DEFINER functions.

-- 4a. Atomic Draft Save, Resume Update, & Approval Reset
create or replace function save_email_draft_atomic(
  p_application_id uuid,
  p_recipient text default null,
  p_subject text default null,
  p_body text default null,
  p_resume_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app applications%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  if p_application_id is null then
    return jsonb_build_object('success', false, 'error', 'Application ID required');
  end if;

  select * into v_app
  from applications
  where id = p_application_id and user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Application not found or unauthorized');
  end if;

  -- Reject editing if application is in-flight (sending) or terminal (sent)
  if v_app.status in ('sending', 'sent') then
    return jsonb_build_object('success', false, 'error', 'Application is currently ' || v_app.status || ' and cannot be edited');
  end if;

  -- If resume is specified, verify ownership
  if p_resume_id is not null then
    if not exists (select 1 from resumes where id = p_resume_id and user_id = auth.uid()) then
      return jsonb_build_object('success', false, 'error', 'Resume not found or unauthorized');
    end if;
    update applications
    set resume_id = p_resume_id,
        status = 'draft',
        updated_at = now()
    where id = p_application_id;
  else
    update applications
    set status = 'draft',
        updated_at = now()
    where id = p_application_id;
  end if;

  -- Unconditionally invalidate any prior approval on email_drafts whenever content or resume changes
  update email_drafts
  set approved_at = null,
      approved_hash = null,
      approved_attachment_hash = null,
      updated_at = now()
  where application_id = p_application_id;

  -- If draft content is provided, validate and upsert
  if p_recipient is not null or p_subject is not null or p_body is not null then
    if p_recipient is null or trim(p_recipient) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      return jsonb_build_object('success', false, 'error', 'Valid recipient email address is required');
    end if;

    if p_subject is null or trim(p_subject) = '' then
      return jsonb_build_object('success', false, 'error', 'Subject line cannot be empty');
    end if;

    if p_body is null or trim(p_body) = '' then
      return jsonb_build_object('success', false, 'error', 'Message body cannot be empty');
    end if;

    insert into email_drafts (
      application_id, recipient_email, subject, body,
      approved_at, approved_hash, approved_attachment_hash, updated_at
    )
    values (
      p_application_id, trim(p_recipient), trim(p_subject), p_body,
      null, null, null, now()
    )
    on conflict (application_id) do update
      set recipient_email = excluded.recipient_email,
          subject = excluded.subject,
          body = excluded.body,
          approved_at = null,
          approved_hash = null,
          approved_attachment_hash = null,
          updated_at = now();
  end if;

  return jsonb_build_object('success', true);
end;
$$;

-- 4b. Atomic Draft Approval
-- Validates candidate ownership, complete draft content, attached resume, and valid SHA-256 hash formats.
-- Note: Cryptographic matching of hash to email/attachment content is enforced at the trusted
-- server-side boundary (validateApprovedEmailForSend in Server Actions) prior to dispatch.
-- The database enforces hash format integrity, state transition validity, and immutability.
create or replace function approve_email_draft_atomic(
  p_application_id uuid,
  p_hash text,
  p_attachment_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app applications%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  if p_application_id is null then
    return jsonb_build_object('success', false, 'error', 'Application ID is required');
  end if;

  -- Validate hash format: strictly 64-character hex string (SHA-256)
  if p_hash is null or p_hash !~ '^[0-9a-fA-F]{64}$' or
     p_attachment_hash is null or p_attachment_hash !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('success', false, 'error', 'Invalid approval hash format: expected 64-character hex SHA-256');
  end if;

  if p_hash = p_attachment_hash then
    return jsonb_build_object('success', false, 'error', 'Invalid approval hashes: draft hash and attachment hash cannot be identical');
  end if;

  select * into v_app
  from applications
  where id = p_application_id and user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Application not found or unauthorized');
  end if;

  -- Reject approval if application is in-flight (sending) or terminal (sent)
  if v_app.status in ('sending', 'sent') then
    return jsonb_build_object('success', false, 'error', 'Application is currently ' || v_app.status || ' and cannot be approved');
  end if;

  -- Verify application has an attached resume owned by candidate
  if v_app.resume_id is null then
    return jsonb_build_object('success', false, 'error', 'Cannot approve draft: application must have an attached resume');
  end if;

  if not exists (select 1 from resumes where id = v_app.resume_id and user_id = auth.uid()) then
    return jsonb_build_object('success', false, 'error', 'Cannot approve draft: attached resume not found or unauthorized');
  end if;

  -- Verify draft exists and contains all required non-empty fields
  if not exists (
    select 1 from email_drafts
    where application_id = p_application_id
      and recipient_email is not null and trim(recipient_email) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
      and subject is not null and trim(subject) <> ''
      and body is not null and trim(body) <> ''
  ) then
    return jsonb_build_object('success', false, 'error', 'Draft content is incomplete or invalid and cannot be approved');
  end if;

  update email_drafts
  set approved_at = now(),
      approved_hash = p_hash,
      approved_attachment_hash = p_attachment_hash,
      updated_at = now()
  where application_id = p_application_id;

  update applications
  set status = 'approved',
      updated_at = now()
  where id = p_application_id;

  return jsonb_build_object('success', true);
end;
$$;

-- 4c. Atomic Application Status Transition
-- Strictly enforces the state machine, validates draft approval prerequisites,
-- and locks in-flight idempotency keys
create or replace function transition_application_status_atomic(
  p_application_id uuid,
  p_new_status text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app applications%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  if p_application_id is null or p_new_status is null then
    return jsonb_build_object('success', false, 'error', 'Application ID and target status are required');
  end if;

  if p_new_status not in ('approved', 'sending', 'sent', 'failed') then
    return jsonb_build_object('success', false, 'error', 'Invalid target status');
  end if;

  select * into v_app
  from applications
  where id = p_application_id and user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Application not found or unauthorized');
  end if;

  -- Terminal state immutability
  if v_app.status = 'sent' then
    return jsonb_build_object('success', false, 'error', 'Application is in terminal sent state and cannot be modified');
  end if;

  -- 1. Transition to 'approved'
  -- Callers cannot bypass approve_email_draft_atomic: draft must possess valid approval hashes
  if p_new_status = 'approved' then
    if v_app.status not in ('draft', 'approved', 'failed') then
      return jsonb_build_object('success', false, 'error', 'Invalid status transition to approved from ' || v_app.status);
    end if;

    if v_app.resume_id is null or not exists (select 1 from resumes where id = v_app.resume_id and user_id = auth.uid()) then
      return jsonb_build_object('success', false, 'error', 'Cannot transition to approved: application must have an owned resume');
    end if;

    if not exists (
      select 1 from email_drafts
      where application_id = p_application_id
        and approved_at is not null
        and approved_hash is not null and approved_hash ~ '^[0-9a-fA-F]{64}$'
        and approved_attachment_hash is not null and approved_attachment_hash ~ '^[0-9a-fA-F]{64}$'
        and recipient_email is not null and trim(recipient_email) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
        and subject is not null and trim(subject) <> ''
        and body is not null and trim(body) <> ''
    ) then
      return jsonb_build_object('success', false, 'error', 'Cannot transition to approved: email draft must be approved via approve_email_draft_atomic first');
    end if;

  -- 2. Transition to 'sending'
  elsif p_new_status = 'sending' then
    if v_app.status not in ('approved', 'sending', 'failed') then
      return jsonb_build_object('success', false, 'error', 'Application must be approved before entering sending state');
    end if;

    if p_idempotency_key is null or trim(p_idempotency_key) = '' then
      return jsonb_build_object('success', false, 'error', 'Idempotency key required for sending transition');
    end if;

    -- Prevent changing idempotency key during repeated transitions into sending
    if v_app.status = 'sending' and v_app.send_idempotency_key is not null and v_app.send_idempotency_key <> p_idempotency_key then
      return jsonb_build_object('success', false, 'error', 'Idempotency key mismatch: in-flight sending key cannot be modified');
    end if;

    -- Verify draft approval fields remain intact
    if not exists (
      select 1 from email_drafts
      where application_id = p_application_id
        and approved_at is not null
        and approved_hash is not null and approved_hash ~ '^[0-9a-fA-F]{64}$'
        and approved_attachment_hash is not null and approved_attachment_hash ~ '^[0-9a-fA-F]{64}$'
    ) then
      return jsonb_build_object('success', false, 'error', 'Cannot send: email draft approval has been invalidated or is missing');
    end if;

  -- 3. Transition to 'sent'
  elsif p_new_status = 'sent' then
    if v_app.status <> 'sending' then
      return jsonb_build_object('success', false, 'error', 'Cannot mark sent without sending state');
    end if;

  -- 4. Transition to 'failed'
  elsif p_new_status = 'failed' then
    if v_app.status <> 'sending' then
      return jsonb_build_object('success', false, 'error', 'Cannot mark failed without sending state');
    end if;
  end if;

  update applications
  set status = p_new_status,
      send_idempotency_key = coalesce(p_idempotency_key, send_idempotency_key),
      updated_at = now()
  where id = p_application_id;

  return jsonb_build_object('success', true);
end;
$$;

-- 5. Revoke execution from PUBLIC and grant exclusively to authenticated role
revoke execute on function check_rate_limit(text, int, int) from public;
revoke execute on function save_email_draft_atomic(uuid, text, text, text, uuid) from public;
revoke execute on function approve_email_draft_atomic(uuid, text, text) from public;
revoke execute on function transition_application_status_atomic(uuid, text, text) from public;

grant execute on function check_rate_limit(text, int, int) to authenticated;
grant execute on function save_email_draft_atomic(uuid, text, text, text, uuid) to authenticated;
grant execute on function approve_email_draft_atomic(uuid, text, text) to authenticated;
grant execute on function transition_application_status_atomic(uuid, text, text) to authenticated;

-- 6. Rate Limits Table Privilege Hardening
-- Strip all direct mutating permissions (mutations and administrative privileges)
-- from public, anon, and authenticated.
-- Counters cannot be reset or manipulated directly via PostgREST.
-- Rate limit increments and resets occur strictly via check_rate_limit (SECURITY DEFINER).
revoke all on rate_limits from public, anon;
revoke all on rate_limits from authenticated;
grant select on rate_limits to authenticated;

-- 7. PostgREST Privilege Hardening for Applications and Email Drafts
-- Direct UPDATE privileges on both applications and email_drafts are completely REVOKED
-- from public, anon, and authenticated users.
--
-- Security Rationale:
-- 1. Direct updates on email_drafts (recipient_email, subject, body):
--    If authenticated users had direct UPDATE privilege on email content columns, a client
--    could alter the approved email text after human review while preserving approved_at,
--    approved_hash, and applications.status = 'approved'.
-- 2. Direct updates on applications (resume_id):
--    If authenticated users had direct UPDATE privilege on resume_id, a client could swap
--    the attached CV after approval without invalidating the approved status or attachment hash.
-- 3. Direct updates on applications (status, send_idempotency_key):
--    If direct updates were permitted, clients could forge state machine transitions.
--
-- Enforcement Architecture:
-- - All draft modifications and CV updates MUST pass through save_email_draft_atomic (SECURITY DEFINER),
--   which enforces ownership, validates in-flight state, updates records, and unconditionally
--   invalidates approval hashes and resets status back to 'draft'.
-- - All approvals MUST pass through approve_email_draft_atomic (SECURITY DEFINER).
-- - All lifecycle transitions MUST pass through transition_application_status_atomic (SECURITY DEFINER).
--
-- Authenticated users retain SELECT, INSERT, and DELETE (each governed by strict RLS policies).

-- 7a. Applications Table Privileges
revoke all on applications from public, anon;
revoke all on applications from authenticated;
grant select, insert, delete on applications to authenticated;

-- 7b. Email Drafts Table Privileges
revoke all on email_drafts from public, anon;
revoke all on email_drafts from authenticated;
grant select, insert, delete on email_drafts to authenticated;

-- 8. PostgREST Insert Hardening
-- Ensure direct inserts cannot bypass the approval workflow or inject pre-approved states.
drop policy if exists "Users can insert own applications" on applications;
create policy "Users can insert own applications" on applications
  for insert with check (
    auth.uid() = user_id and
    (status is null or status = 'draft') and
    send_idempotency_key is null
  );

drop policy if exists "Users can insert own email drafts" on email_drafts;
create policy "Users can insert own email drafts" on email_drafts
  for insert with check (
    exists (
      select 1 from applications 
      where applications.id = email_drafts.application_id 
        and applications.user_id = auth.uid()
    ) and
    approved_at is null and
    approved_hash is null and
    approved_attachment_hash is null
  );
