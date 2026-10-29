-- Migration: 20240105000000_schema_fixes.sql
-- Resolves schema inconsistencies and adds missing constraints identified during security audit.

-- 1. Add location column to opportunities table to match application code
alter table opportunities add column if not exists location text;

-- 2. Add unique constraint to email_drafts to guarantee 1-to-1 relationship per application
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'unique_email_draft_per_application') then
    alter table email_drafts 
      add constraint unique_email_draft_per_application unique (application_id);
  end if;
end $$;

-- 3. Automatic Profile Creation Trigger on Supabase Auth Signup
-- Ensures public.profiles row exists immediately when auth.users is created,
-- preventing foreign key violations in resumes, applications, and connected_accounts.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, created_at, updated_at)
  values (new.id, coalesce(new.email, ''), now(), now())
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if exists to allow idempotency
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Storage update policy for resume bucket
-- Required when uploads use upsert: true in Supabase Storage
drop policy if exists "Candidates can update their own CV" on storage.objects;
create policy "Candidates can update their own CV"
  on storage.objects for update
  using (
    bucket_id = 'resumes' and 
    auth.uid() = owner and
    (storage.foldername(name))[1] = auth.uid()::text
  );
