-- Migration: 20240106000000_seed_demo_data.sql
-- Seeds demo public data (companies, contacts, opportunities) in SQL 
-- avoiding RLS permission errors from client-side insert attempts.

do $$
declare
  demo_company_id uuid := 'a0000000-0000-0000-0000-000000000001';
begin
  -- 1. Insert Demo Company if not present
  if not exists (select 1 from companies where id = demo_company_id) then
    insert into companies (id, name, sector, website, country, source, verified_at)
    values (
      demo_company_id,
      '[DEMO] Tech Corp Tunisia',
      'Software Development',
      'https://demo-techcorp.tn',
      'Tunisia',
      'local demo fixture',
      now()
    );

    -- 2. Insert Demo Contact
    insert into company_contacts (company_id, email, source_url, is_verified)
    values (
      demo_company_id,
      'hr@demo-techcorp.tn',
      'https://demo-techcorp.tn/contact',
      true
    );

    -- 3. Insert Demo Opportunities
    insert into opportunities (company_id, title, description, location, domain, type, source_url)
    values 
      (
        demo_company_id,
        '[DEMO] Fullstack Next.js Developer (Junior)',
        'Looking for a junior developer with React and Next.js experience. This is a demo opportunity.',
        'Tunis, Tunisia',
        'Software Development',
        'JUNIOR',
        'https://demo-techcorp.tn/jobs'
      ),
      (
        demo_company_id,
        '[DEMO] PFE: AI Recruitment Assistant',
        'End of studies project to build an AI assistant using LLMs. This is a demo opportunity.',
        'Remote / Tunis',
        'Artificial Intelligence',
        'PFE',
        'https://demo-techcorp.tn/jobs'
      );
  end if;
end $$;
