-- =========================================================================
-- Script: seed_tunisian_opportunities.sql
-- Project: Smart CV Sender
-- Description: Idempotently seeds 10 curated Tunisian tech opportunities
--              (PFE, summer internships, junior positions) into Supabase.
--
-- Guarantees:
-- 1. Strictly IDEMPOTENT: Safe to rerun repeatedly; produces zero duplicate rows.
-- 2. NON-DESTRUCTIVE: Preserves all existing companies, contacts, opportunities,
--    candidate profiles, CVs, applications, and drafts. Zero DELETE/DROP/TRUNCATE.
-- 3. DYNAMIC COMPANY RESOLUTION: If a company already exists under ANY UUID
--    (e.g. created via UI or prior seed), its existing UUID is discovered and reused.
-- 4. NO UNCONFIRMED SCHEMA ASSUMPTIONS: Inserts ONLY verified base schema columns.
--    Does NOT assume `is_demo`, `verified_at`, or `expires_at` exist on `opportunities`.
-- 5. ZERO UNCONFIRMED UNIQUE CONSTRAINT RELIANCE: Uses explicit conditional checks
--    (WHERE NOT EXISTS) rather than ON CONFLICT, avoiding schema assumption errors.
-- 6. CONCURRENCY SAFE: Uses a transaction-level advisory lock (pg_advisory_xact_lock)
--    to serialize concurrent executions and prevent race conditions.
-- 7. DEMO ISOLATION: Explicit [DEMO] prefixes, non-routable demo emails (@...-demo.tn),
--    and is_verified = false prevent accidental outbound communication.
-- =========================================================================

do $$
declare
  v_sofrecom_id uuid;
  v_vermeg_id uuid;
  v_expensya_id uuid;
  v_wevioo_id uuid;
  v_actia_id uuid;
  v_instadeep_id uuid;
  v_focus_id uuid;
  v_cynapsys_id uuid;
  v_telnet_id uuid;
  v_vistaprint_id uuid;
begin

  -- 0. Acquire transaction advisory lock to serialize concurrent seed runs
  perform pg_advisory_xact_lock(hashtext('seed_tunisian_opportunities_lock'));

  -- =========================================================================
  -- 1. Idempotently resolve or insert Tunisian Companies
  -- =========================================================================

  -- Sofrecom Tunisie
  select id into v_sofrecom_id from public.companies where lower(trim(name)) = lower('Sofrecom Tunisie') limit 1;
  if v_sofrecom_id is null then
    if exists (select 1 from public.companies where id = 'b0000000-0000-0000-0000-000000000001') then
      v_sofrecom_id := gen_random_uuid();
    else
      v_sofrecom_id := 'b0000000-0000-0000-0000-000000000001';
    end if;
    insert into public.companies (id, name, sector, website, country, source)
    values (v_sofrecom_id, 'Sofrecom Tunisie', 'Télécommunications & IT', 'https://www.sofrecom.com', 'Tunisia', 'curated-catalog');
  end if;

  -- Vermeg Tunisie
  select id into v_vermeg_id from public.companies where lower(trim(name)) = lower('Vermeg Tunisie') limit 1;
  if v_vermeg_id is null then
    if exists (select 1 from public.companies where id = 'b0000000-0000-0000-0000-000000000002') then
      v_vermeg_id := gen_random_uuid();
    else
      v_vermeg_id := 'b0000000-0000-0000-0000-000000000002';
    end if;
    insert into public.companies (id, name, sector, website, country, source)
    values (v_vermeg_id, 'Vermeg Tunisie', 'Édition de Logiciels Financiers', 'https://www.vermeg.com', 'Tunisia', 'curated-catalog');
  end if;

  -- Expensya / Medius
  select id into v_expensya_id from public.companies where lower(trim(name)) = lower('Expensya / Medius') limit 1;
  if v_expensya_id is null then
    if exists (select 1 from public.companies where id = 'b0000000-0000-0000-0000-000000000003') then
      v_expensya_id := gen_random_uuid();
    else
      v_expensya_id := 'b0000000-0000-0000-0000-000000000003';
    end if;
    insert into public.companies (id, name, sector, website, country, source)
    values (v_expensya_id, 'Expensya / Medius', 'Fintech & Gestion des Dépenses', 'https://www.expensya.com', 'Tunisia', 'curated-catalog');
  end if;

  -- Wevioo
  select id into v_wevioo_id from public.companies where lower(trim(name)) = lower('Wevioo') limit 1;
  if v_wevioo_id is null then
    if exists (select 1 from public.companies where id = 'b0000000-0000-0000-0000-000000000004') then
      v_wevioo_id := gen_random_uuid();
    else
      v_wevioo_id := 'b0000000-0000-0000-0000-000000000004';
    end if;
    insert into public.companies (id, name, sector, website, country, source)
    values (v_wevioo_id, 'Wevioo', 'Conseil & Intégration Numérique', 'https://www.wevioo.com', 'Tunisia', 'curated-catalog');
  end if;

  -- Actia Tunisie
  select id into v_actia_id from public.companies where lower(trim(name)) = lower('Actia Tunisie') limit 1;
  if v_actia_id is null then
    if exists (select 1 from public.companies where id = 'b0000000-0000-0000-0000-000000000005') then
      v_actia_id := gen_random_uuid();
    else
      v_actia_id := 'b0000000-0000-0000-0000-000000000005';
    end if;
    insert into public.companies (id, name, sector, website, country, source)
    values (v_actia_id, 'Actia Tunisie', 'Électronique & Télématique Embarquée', 'https://www.actia.com', 'Tunisia', 'curated-catalog');
  end if;

  -- InstaDeep Tunisia
  select id into v_instadeep_id from public.companies where lower(trim(name)) = lower('InstaDeep Tunisia') limit 1;
  if v_instadeep_id is null then
    if exists (select 1 from public.companies where id = 'b0000000-0000-0000-0000-000000000006') then
      v_instadeep_id := gen_random_uuid();
    else
      v_instadeep_id := 'b0000000-0000-0000-0000-000000000006';
    end if;
    insert into public.companies (id, name, sector, website, country, source)
    values (v_instadeep_id, 'InstaDeep Tunisia', 'Intelligence Artificielle & Deep Learning', 'https://www.instadeep.com', 'Tunisia', 'curated-catalog');
  end if;

  -- Focus Corporation
  select id into v_focus_id from public.companies where lower(trim(name)) = lower('Focus Corporation') limit 1;
  if v_focus_id is null then
    if exists (select 1 from public.companies where id = 'b0000000-0000-0000-0000-000000000007') then
      v_focus_id := gen_random_uuid();
    else
      v_focus_id := 'b0000000-0000-0000-0000-000000000007';
    end if;
    insert into public.companies (id, name, sector, website, country, source)
    values (v_focus_id, 'Focus Corporation', 'Services Numériques & IT', 'https://www.focus-corporation.com', 'Tunisia', 'curated-catalog');
  end if;

  -- Cynapsys Technologies
  select id into v_cynapsys_id from public.companies where lower(trim(name)) = lower('Cynapsys Technologies') limit 1;
  if v_cynapsys_id is null then
    if exists (select 1 from public.companies where id = 'b0000000-0000-0000-0000-000000000008') then
      v_cynapsys_id := gen_random_uuid();
    else
      v_cynapsys_id := 'b0000000-0000-0000-0000-000000000008';
    end if;
    insert into public.companies (id, name, sector, website, country, source)
    values (v_cynapsys_id, 'Cynapsys Technologies', 'Ingénierie Logicielle', 'https://www.cynapsys.de', 'Tunisia', 'curated-catalog');
  end if;

  -- Telnet Holding
  select id into v_telnet_id from public.companies where lower(trim(name)) = lower('Telnet Holding') limit 1;
  if v_telnet_id is null then
    if exists (select 1 from public.companies where id = 'b0000000-0000-0000-0000-000000000009') then
      v_telnet_id := gen_random_uuid();
    else
      v_telnet_id := 'b0000000-0000-0000-0000-000000000009';
    end if;
    insert into public.companies (id, name, sector, website, country, source)
    values (v_telnet_id, 'Telnet Holding', 'Ingénierie & Hautes Technologies', 'https://www.groupe-telnet.net', 'Tunisia', 'curated-catalog');
  end if;

  -- Vistaprint Tunisie
  select id into v_vistaprint_id from public.companies where lower(trim(name)) = lower('Vistaprint Tunisie') limit 1;
  if v_vistaprint_id is null then
    if exists (select 1 from public.companies where id = 'b0000000-0000-0000-0000-000000000010') then
      v_vistaprint_id := gen_random_uuid();
    else
      v_vistaprint_id := 'b0000000-0000-0000-0000-000000000010';
    end if;
    insert into public.companies (id, name, sector, website, country, source)
    values (v_vistaprint_id, 'Vistaprint Tunisie', 'E-Commerce & Digital Manufacturing', 'https://www.cimpress.com', 'Tunisia', 'curated-catalog');
  end if;

  -- =========================================================================
  -- 2. Idempotently insert Company Contacts (Demo Simulation Addresses)
  --    is_verified is explicitly FALSE; verified_at is NULL.
  -- =========================================================================

  insert into public.company_contacts (company_id, email, source_url, is_verified)
  select v_sofrecom_id, 'recrutement.pfe@sofrecom-demo.tn', 'https://demo.sofrecom.tn/pfe-2025/fullstack-nextjs', false
  where not exists (
    select 1 from public.company_contacts 
    where lower(trim(email)) = lower('recrutement.pfe@sofrecom-demo.tn')
       or (company_id = v_sofrecom_id and source_url = 'https://demo.sofrecom.tn/pfe-2025/fullstack-nextjs')
  );

  insert into public.company_contacts (company_id, email, source_url, is_verified)
  select v_vermeg_id, 'careers.pfe@vermeg-demo.tn', 'https://demo.vermeg.tn/pfe-2025/bi-analytics', false
  where not exists (
    select 1 from public.company_contacts 
    where lower(trim(email)) = lower('careers.pfe@vermeg-demo.tn')
       or (company_id = v_vermeg_id and source_url = 'https://demo.vermeg.tn/pfe-2025/bi-analytics')
  );

  insert into public.company_contacts (company_id, email, source_url, is_verified)
  select v_expensya_id, 'internships@expensya-demo.tn', 'https://demo.expensya.tn/summer-2025/frontend-react', false
  where not exists (
    select 1 from public.company_contacts 
    where lower(trim(email)) = lower('internships@expensya-demo.tn')
       or (company_id = v_expensya_id and source_url = 'https://demo.expensya.tn/summer-2025/frontend-react')
  );

  insert into public.company_contacts (company_id, email, source_url, is_verified)
  select v_wevioo_id, 'stages@wevioo-demo.tn', 'https://demo.wevioo.tn/summer-2025/backend-nodejs', false
  where not exists (
    select 1 from public.company_contacts 
    where lower(trim(email)) = lower('stages@wevioo-demo.tn')
       or (company_id = v_wevioo_id and source_url = 'https://demo.wevioo.tn/summer-2025/backend-nodejs')
  );

  insert into public.company_contacts (company_id, email, source_url, is_verified)
  select v_actia_id, 'recrutement.junior@actia-demo.tn', 'https://demo.actia.tn/careers-2025/junior-fullstack', false
  where not exists (
    select 1 from public.company_contacts 
    where lower(trim(email)) = lower('recrutement.junior@actia-demo.tn')
       or (company_id = v_actia_id and source_url = 'https://demo.actia.tn/careers-2025/junior-fullstack')
  );

  insert into public.company_contacts (company_id, email, source_url, is_verified)
  select v_instadeep_id, 'pfe.ai@instadeep-demo.tn', 'https://demo.instadeep.tn/pfe-2025/nlp-rag', false
  where not exists (
    select 1 from public.company_contacts 
    where lower(trim(email)) = lower('pfe.ai@instadeep-demo.tn')
       or (company_id = v_instadeep_id and source_url = 'https://demo.instadeep.tn/pfe-2025/nlp-rag')
  );

  insert into public.company_contacts (company_id, email, source_url, is_verified)
  select v_focus_id, 'junior.careers@focus-demo.tn', 'https://demo.focus.tn/careers-2025/junior-bis', false
  where not exists (
    select 1 from public.company_contacts 
    where lower(trim(email)) = lower('junior.careers@focus-demo.tn')
       or (company_id = v_focus_id and source_url = 'https://demo.focus.tn/careers-2025/junior-bis')
  );

  insert into public.company_contacts (company_id, email, source_url, is_verified)
  select v_cynapsys_id, 'stages.ete@cynapsys-demo.tn', 'https://demo.cynapsys.tn/summer-2025/web-ui', false
  where not exists (
    select 1 from public.company_contacts 
    where lower(trim(email)) = lower('stages.ete@cynapsys-demo.tn')
       or (company_id = v_cynapsys_id and source_url = 'https://demo.cynapsys.tn/summer-2025/web-ui')
  );

  insert into public.company_contacts (company_id, email, source_url, is_verified)
  select v_telnet_id, 'pfe.devops@telnet-demo.tn', 'https://demo.telnet.tn/pfe-2025/cloud-devops', false
  where not exists (
    select 1 from public.company_contacts 
    where lower(trim(email)) = lower('pfe.devops@telnet-demo.tn')
       or (company_id = v_telnet_id and source_url = 'https://demo.telnet.tn/pfe-2025/cloud-devops')
  );

  insert into public.company_contacts (company_id, email, source_url, is_verified)
  select v_vistaprint_id, 'sousse.careers@vistaprint-demo.tn', 'https://demo.vistaprint.tn/careers-2025/junior-sousse', false
  where not exists (
    select 1 from public.company_contacts 
    where lower(trim(email)) = lower('sousse.careers@vistaprint-demo.tn')
       or (company_id = v_vistaprint_id and source_url = 'https://demo.vistaprint.tn/careers-2025/junior-sousse')
  );

  -- =========================================================================
  -- 3. Idempotently insert 10 Curated Tunisian Opportunities
  --    Uses only verified base schema columns (location text from 20240105000000).
  --    Does NOT assume is_demo, verified_at, or expires_at exist on opportunities.
  -- =========================================================================

  -- 1. Sofrecom PFE
  if not exists (
    select 1 from public.opportunities 
    where source_url = 'https://demo.sofrecom.tn/pfe-2025/fullstack-nextjs'
       or title = '[DEMO] PFE : Plateforme SaaS Modulaire (Next.js & TypeScript)'
       or (company_id = v_sofrecom_id and title ilike '%Plateforme SaaS Modulaire%')
  ) then
    insert into public.opportunities (company_id, title, type, domain, description, location, source_url, is_active)
    values (
      v_sofrecom_id,
      '[DEMO] PFE : Plateforme SaaS Modulaire (Next.js & TypeScript)',
      'PFE',
      'Web Development',
      'Conception et réalisation d''une plateforme SaaS modulaire orientée micro-frontends. Stack technologique : Next.js 15, React 19, TypeScript, PostgreSQL et Tailwind CSS. Intégration de pipelines CI/CD et conteneurisation Docker. Encadrement par des ingénieurs seniors au sein de l''équipe Digital Solutions.',
      'Technopole El Ghazala, Ariana, Tunisie',
      'https://demo.sofrecom.tn/pfe-2025/fullstack-nextjs',
      true
    );
  end if;

  -- 2. Vermeg PFE
  if not exists (
    select 1 from public.opportunities 
    where source_url = 'https://demo.vermeg.tn/pfe-2025/bi-analytics'
       or title = '[DEMO] PFE : Business Intelligence & Reporting Décisionnel (BIS)'
       or (company_id = v_vermeg_id and title ilike '%Business Intelligence%')
  ) then
    insert into public.opportunities (company_id, title, type, domain, description, location, source_url, is_active)
    values (
      v_vermeg_id,
      '[DEMO] PFE : Business Intelligence & Reporting Décisionnel (BIS)',
      'PFE',
      'Business Information Systems & BI',
      'Conception d''un entrepôt de données et de tableaux de bord analytiques pour le suivi des transactions financières. Modélisation dimensionnelle SQL, flux ETL/ELT avec Python et visualisations PowerBI. Ce projet est particulièrement adapté aux étudiants en Informatique de Gestion (Business Information Systems).',
      'Les Berges du Lac, Tunis, Tunisie',
      'https://demo.vermeg.tn/pfe-2025/bi-analytics',
      true
    );
  end if;

  -- 3. Expensya Stage d'été
  if not exists (
    select 1 from public.opportunities 
    where source_url = 'https://demo.expensya.tn/summer-2025/frontend-react'
       or title = '[DEMO] Stage d''été : Développeur Web Frontend (React & TypeScript)'
       or (company_id = v_expensya_id and title ilike '%Développeur Web Frontend%')
  ) then
    insert into public.opportunities (company_id, title, type, domain, description, location, source_url, is_active)
    values (
      v_expensya_id,
      '[DEMO] Stage d''été : Développeur Web Frontend (React & TypeScript)',
      'STAGE',
      'Frontend Engineering',
      'Intégration au sein de l''équipe frontend d''Expensya pour un stage de 2 à 3 mois. Participation au développement de nouveaux composants UI accessibles et réactifs en React, TypeScript et Tailwind CSS. Écriture de tests unitaires et optimisation des performances du dashboard client.',
      'Centre Urbain Nord, Tunis, Tunisie',
      'https://demo.expensya.tn/summer-2025/frontend-react',
      true
    );
  end if;

  -- 4. Wevioo Stage d'été
  if not exists (
    select 1 from public.opportunities 
    where source_url = 'https://demo.wevioo.tn/summer-2025/backend-nodejs'
       or title = '[DEMO] Stage d''été : Développement Backend & API REST (Node.js & SQL)'
       or (company_id = v_wevioo_id and title ilike '%Développement Backend & API REST%')
  ) then
    insert into public.opportunities (company_id, title, type, domain, description, location, source_url, is_active)
    values (
      v_wevioo_id,
      '[DEMO] Stage d''été : Développement Backend & API REST (Node.js & SQL)',
      'STAGE',
      'Backend Engineering',
      'Stage pratique au pôle développement logiciel. Conception d''APIs RESTful sécurisées avec Node.js, Express, TypeScript et bases de données relationnelles PostgreSQL. Gestion de l''authentification sécurisée, structuration des requêtes SQL et documentation OpenAPI/Swagger.',
      'Pôle Technologique El Ghazala, Ariana, Tunisie',
      'https://demo.wevioo.tn/summer-2025/backend-nodejs',
      true
    );
  end if;

  -- 5. Actia Emploi Junior
  if not exists (
    select 1 from public.opportunities 
    where source_url = 'https://demo.actia.tn/careers-2025/junior-fullstack'
       or title = '[DEMO] Emploi Junior : Développeur Fullstack (Next.js & Node.js)'
       or (company_id = v_actia_id and title ilike '%Développeur Fullstack%')
  ) then
    insert into public.opportunities (company_id, title, type, domain, description, location, source_url, is_active)
    values (
      v_actia_id,
      '[DEMO] Emploi Junior : Développeur Fullstack (Next.js & Node.js)',
      'JUNIOR',
      'Fullstack Development',
      'Poste junior pour jeune diplômé en informatique (Licence ou Master). Développement d''applications web de supervision télématique avec React, Next.js, Node.js et bases de données PostgreSQL. Travail en méthodologie Agile Scrum avec revues de code et tests automatisés.',
      'Technopole Charguia II, Tunis, Tunisie',
      'https://demo.actia.tn/careers-2025/junior-fullstack',
      true
    );
  end if;

  -- 6. InstaDeep PFE
  if not exists (
    select 1 from public.opportunities 
    where source_url = 'https://demo.instadeep.tn/pfe-2025/nlp-rag'
       or title = '[DEMO] PFE : Assistant IA & Recherche Sémantique (NLP / RAG)'
       or (company_id = v_instadeep_id and title ilike '%Assistant IA & Recherche Sémantique%')
  ) then
    insert into public.opportunities (company_id, title, type, domain, description, location, source_url, is_active)
    values (
      v_instadeep_id,
      '[DEMO] PFE : Assistant IA & Recherche Sémantique (NLP / RAG)',
      'PFE',
      'Artificial Intelligence',
      'Projet de fin d''études axé sur la conception d''un agent conversationnel doté d''architecture RAG (Retrieval-Augmented Generation) pour l''exploration de bases documentaires techniques. Implémentation en Python, intégration d''embeddings et de bases vectorielles, évaluation des performances et déploiement conteneurisé.',
      'Tunis, Tunisie (Hybride)',
      'https://demo.instadeep.tn/pfe-2025/nlp-rag',
      true
    );
  end if;

  -- 7. Focus Emploi Junior
  if not exists (
    select 1 from public.opportunities 
    where source_url = 'https://demo.focus.tn/careers-2025/junior-bis'
       or title = '[DEMO] Emploi Junior : Consultant Systèmes d''Information & ERP'
       or (company_id = v_focus_id and title ilike '%Consultant Systèmes d''Information%')
  ) then
    insert into public.opportunities (company_id, title, type, domain, description, location, source_url, is_active)
    values (
      v_focus_id,
      '[DEMO] Emploi Junior : Consultant Systèmes d''Information & ERP',
      'JUNIOR',
      'Business Information Systems',
      'Poste junior idéal pour titulaire d''une formation en Informatique de Gestion (Business Information Systems). Participation au paramétrage, à l''intégration et au support d''applications de gestion d''entreprise (ERP/CRM). Modélisation de données, rédaction de requêtes SQL et accompagnement des utilisateurs métiers.',
      'Les Berges du Lac 2, Tunis, Tunisie',
      'https://demo.focus.tn/careers-2025/junior-bis',
      true
    );
  end if;

  -- 8. Cynapsys Stage d'été
  if not exists (
    select 1 from public.opportunities 
    where source_url = 'https://demo.cynapsys.tn/summer-2025/web-ui'
       or title = '[DEMO] Stage d''été : Développement Web & Responsive UI (React)'
       or (company_id = v_cynapsys_id and title ilike '%Développement Web & Responsive UI%')
  ) then
    insert into public.opportunities (company_id, title, type, domain, description, location, source_url, is_active)
    values (
      v_cynapsys_id,
      '[DEMO] Stage d''été : Développement Web & Responsive UI (React)',
      'STAGE',
      'Web Development',
      'Stage d''immersion de 2 mois pour étudiants en informatique. Développement d''interfaces utilisateurs web dynamiques et responsives avec React, JavaScript/TypeScript et CSS moderne. Connexion avec des APIs REST et apprentissage des bonnes pratiques de clean code en équipe.',
      'Les Berges du Lac 1, Tunis, Tunisie',
      'https://demo.cynapsys.tn/summer-2025/web-ui',
      true
    );
  end if;

  -- 9. Telnet PFE
  if not exists (
    select 1 from public.opportunities 
    where source_url = 'https://demo.telnet.tn/pfe-2025/cloud-devops'
       or title = '[DEMO] PFE : Automatisation Cloud & CI/CD (Docker & Kubernetes)'
       or (company_id = v_telnet_id and title ilike '%Automatisation Cloud & CI/CD%')
  ) then
    insert into public.opportunities (company_id, title, type, domain, description, location, source_url, is_active)
    values (
      v_telnet_id,
      '[DEMO] PFE : Automatisation Cloud & CI/CD (Docker & Kubernetes)',
      'PFE',
      'Cloud & DevOps',
      'Conception d''une chaîne CI/CD sécurisée pour le déploiement continu de microservices conteneurisés. Automatisation des builds avec GitHub Actions/GitLab CI, conteneurisation Docker, orchestration Kubernetes et monitoring d''infrastructure avec Prometheus et Grafana.',
      'Technopole El Ghazala, Ariana, Tunisie',
      'https://demo.telnet.tn/pfe-2025/cloud-devops',
      true
    );
  end if;

  -- 10. Vistaprint Emploi Junior
  if not exists (
    select 1 from public.opportunities 
    where source_url = 'https://demo.vistaprint.tn/careers-2025/junior-sousse'
       or title = '[DEMO] Emploi Junior : Développeur Web (PHP / Symfony & React)'
       or (company_id = v_vistaprint_id and title ilike '%Développeur Web (PHP / Symfony%')
  ) then
    insert into public.opportunities (company_id, title, type, domain, description, location, source_url, is_active)
    values (
      v_vistaprint_id,
      '[DEMO] Emploi Junior : Développeur Web (PHP / Symfony & React)',
      'JUNIOR',
      'Web Development',
      'Développeur web junior au sein de l''équipe e-commerce de Sousse. Évolution et maintenance d''applications web scalables avec PHP (Symfony), PostgreSQL et React. Environnement international favorisant l''apprentissage continu, les revues de code rigoureuses et les tests automatisés.',
      'Sousse, Tunisie',
      'https://demo.vistaprint.tn/careers-2025/junior-sousse',
      true
    );
  end if;

end $$;

-- =========================================================================
-- 4. Post-Run Verification Queries
--    (Run in Supabase SQL Editor to independently verify insertion counts and status)
-- =========================================================================

-- Summary Verification Query: Counts existing opportunities vs. seeded demo entries
select
  count(*) filter (where title not in (
    '[DEMO] PFE : Plateforme SaaS Modulaire (Next.js & TypeScript)',
    '[DEMO] PFE : Business Intelligence & Reporting Décisionnel (BIS)',
    '[DEMO] Stage d''été : Développeur Web Frontend (React & TypeScript)',
    '[DEMO] Stage d''été : Développement Backend & API REST (Node.js & SQL)',
    '[DEMO] Emploi Junior : Développeur Fullstack (Next.js & Node.js)',
    '[DEMO] PFE : Assistant IA & Recherche Sémantique (NLP / RAG)',
    '[DEMO] Emploi Junior : Consultant Systèmes d''Information & ERP',
    '[DEMO] Stage d''été : Développement Web & Responsive UI (React)',
    '[DEMO] PFE : Automatisation Cloud & CI/CD (Docker & Kubernetes)',
    '[DEMO] Emploi Junior : Développeur Web (PHP / Symfony & React)'
  )) as existing_opportunities_count,
  count(*) filter (where title in (
    '[DEMO] PFE : Plateforme SaaS Modulaire (Next.js & TypeScript)',
    '[DEMO] PFE : Business Intelligence & Reporting Décisionnel (BIS)',
    '[DEMO] Stage d''été : Développeur Web Frontend (React & TypeScript)',
    '[DEMO] Stage d''été : Développement Backend & API REST (Node.js & SQL)',
    '[DEMO] Emploi Junior : Développeur Fullstack (Next.js & Node.js)',
    '[DEMO] PFE : Assistant IA & Recherche Sémantique (NLP / RAG)',
    '[DEMO] Emploi Junior : Consultant Systèmes d''Information & ERP',
    '[DEMO] Stage d''été : Développement Web & Responsive UI (React)',
    '[DEMO] PFE : Automatisation Cloud & CI/CD (Docker & Kubernetes)',
    '[DEMO] Emploi Junior : Développeur Web (PHP / Symfony & React)'
  )) as seeded_demo_opportunities_count,
  count(*) as total_opportunities_count
from public.opportunities;

-- Detailed Audit Query: Lists all opportunities, their companies, and classification
select
  o.id,
  coalesce(c.name, 'Entreprise non associée') as company_name,
  o.title,
  o.type,
  o.location,
  o.is_active,
  case 
    when o.title ilike '[DEMO]%' or o.source_url ilike '%demo%' then 'DEMO (Simulation)'
    else 'VERIFIED (Live Vacancy)'
  end as classification,
  o.source_url
from public.opportunities o
left join public.companies c on o.company_id = c.id
order by o.created_at asc;
