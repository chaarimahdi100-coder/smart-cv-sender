-- Enable UUID extension if needed (gen_random_uuid is built into PostgreSQL 13+)
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- 1. Profiles Table (Private candidate data)
create table profiles (
  id uuid references auth.users on delete cascade not null primary key,
  first_name text,
  last_name text,
  email text unique not null,
  country text,
  city text,
  school text,
  degree text,
  specialty text,
  languages text[],
  preferences jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index idx_profiles_email on profiles(email);

-- 2. Resumes Table (Private candidate data)
create table resumes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  storage_path text not null,
  extracted_data jsonb,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index idx_resumes_user_id on resumes(user_id);

-- 3. Companies Table (Public data)
create table companies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  website text,
  country text,
  sector text,
  description text,
  source text,
  verified_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index idx_companies_name on companies(name);

-- 4. Company Contacts Table (Public data)
create table company_contacts (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  email text not null,
  source_url text,
  is_verified boolean default false,
  verified_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index idx_company_contacts_company_id on company_contacts(company_id);

-- 5. Opportunities Table (Public data)
create table opportunities (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  title text not null,
  type text not null, -- 'PFE', 'STAGE', 'JUNIOR'
  domain text,
  description text,
  source_url text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index idx_opportunities_company_id on opportunities(company_id);
create index idx_opportunities_type on opportunities(type);

-- 6. Applications Table (Private candidate data)
create table applications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  company_id uuid references companies(id) on delete cascade not null,
  opportunity_id uuid references opportunities(id) on delete set null,
  resume_id uuid references resumes(id) on delete set null,
  status text not null default 'draft', -- draft, pending_approval, approved, sending, sent, failed, replied, closed
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index idx_applications_user_id on applications(user_id);
create index idx_applications_status on applications(status);

-- 7. Email Drafts Table (Private candidate data)
create table email_drafts (
  id uuid default gen_random_uuid() primary key,
  application_id uuid references applications(id) on delete cascade not null,
  recipient_email text not null,
  subject text not null,
  body text not null,
  approved_at timestamp with time zone,
  approved_hash text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index idx_email_drafts_application_id on email_drafts(application_id);

-- 8. Email Events Table (Private candidate data)
create table email_events (
  id uuid default gen_random_uuid() primary key,
  application_id uuid references applications(id) on delete cascade not null,
  event_type text not null,
  provider_id text,
  error_message text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index idx_email_events_application_id on email_events(application_id);

-- 9. Connected Accounts Table (Private candidate data)
create table connected_accounts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  provider text not null, -- e.g., 'google'
  external_id text,
  connection_state text default 'active',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, provider)
);
create index idx_connected_accounts_user_id on connected_accounts(user_id);

-- 10. Notifications Table (Private candidate data)
create table notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null,
  content jsonb not null,
  read_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index idx_notifications_user_id on notifications(user_id);

-- 11. Sync State Table (Internal System Data)
create table sync_state (
  id uuid default gen_random_uuid() primary key,
  connected_account_id uuid references connected_accounts(id) on delete cascade not null,
  sync_cursor text,
  last_success_at timestamp with time zone
);
create index idx_sync_state_account on sync_state(connected_account_id);


-- Row Level Security (RLS) Configuration

alter table profiles enable row level security;
alter table resumes enable row level security;
alter table companies enable row level security;
alter table company_contacts enable row level security;
alter table opportunities enable row level security;
alter table applications enable row level security;
alter table email_drafts enable row level security;
alter table email_events enable row level security;
alter table connected_accounts enable row level security;
alter table notifications enable row level security;
alter table sync_state enable row level security;

-- Profiles: Candidates can only access their own profile
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can delete own profile" on profiles for delete using (auth.uid() = id);

-- Resumes: Candidates can only access their own resumes
create policy "Users can view own resumes" on resumes for select using (auth.uid() = user_id);
create policy "Users can insert own resumes" on resumes for insert with check (auth.uid() = user_id);
create policy "Users can update own resumes" on resumes for update using (auth.uid() = user_id);
create policy "Users can delete own resumes" on resumes for delete using (auth.uid() = user_id);

-- Applications: Candidates can only access their own applications
create policy "Users can view own applications" on applications for select using (auth.uid() = user_id);
create policy "Users can insert own applications" on applications for insert with check (auth.uid() = user_id);
create policy "Users can update own applications" on applications for update using (auth.uid() = user_id);
create policy "Users can delete own applications" on applications for delete using (auth.uid() = user_id);

-- Email Drafts: Candidates can only access drafts related to their applications
create policy "Users can view own email drafts" on email_drafts for select using (
  exists (select 1 from applications where applications.id = email_drafts.application_id and applications.user_id = auth.uid())
);
create policy "Users can insert own email drafts" on email_drafts for insert with check (
  exists (select 1 from applications where applications.id = email_drafts.application_id and applications.user_id = auth.uid())
);
create policy "Users can update own email drafts" on email_drafts for update using (
  exists (select 1 from applications where applications.id = email_drafts.application_id and applications.user_id = auth.uid())
);

-- Email Events: Candidates can only view events for their applications
create policy "Users can view own email events" on email_events for select using (
  exists (select 1 from applications where applications.id = email_events.application_id and applications.user_id = auth.uid())
);

-- Connected Accounts: Candidates can only view and manage their own connected accounts
create policy "Users can view own connected accounts" on connected_accounts for select using (auth.uid() = user_id);
create policy "Users can insert own connected accounts" on connected_accounts for insert with check (auth.uid() = user_id);
create policy "Users can update own connected accounts" on connected_accounts for update using (auth.uid() = user_id);
create policy "Users can delete own connected accounts" on connected_accounts for delete using (auth.uid() = user_id);

-- Notifications: Candidates can view and update their own notifications
create policy "Users can view own notifications" on notifications for select using (auth.uid() = user_id);
create policy "Users can update own notifications" on notifications for update using (auth.uid() = user_id);

-- Companies, Company Contacts, and Opportunities: Publicly readable for authenticated users, but not writeable (requires admin or backend)
create policy "Authenticated users can read companies" on companies for select to authenticated using (true);
create policy "Authenticated users can read company contacts" on company_contacts for select to authenticated using (true);
create policy "Authenticated users can read opportunities" on opportunities for select to authenticated using (true);

-- Sync State: Accessible only by backend (Service Role), no policy for public users.
