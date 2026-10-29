import test from "node:test";
import assert from "node:assert/strict";
import {
  generateDeterministicDraft,
  extractVerifiableSkills,
  extractVerifiableProjects,
  matchCandidateToOpportunity,
  detectApplicationCategory,
  resolveExactProgramName,
  fixUnmatchedParentheses,
  cleanEducationLine,
  formatNaturalProjectDescription,
  isDanglingEnding,
  cleanProjectDescription,
  isTechnicalNoteOrWorkflowLine,
  getNaturalCollaborativeWorkflowSentence,
  type CandidateData,
  type OpportunityData,
} from "../email-generator.ts";

test("detectApplicationCategory correctly identifies PFE, internship, and job roles", () => {
  const pfeOpp: OpportunityData = { title: "PFE - Assistant Recrutement IA", type: "PFE" };
  assert.equal(detectApplicationCategory(pfeOpp), "pfe");

  const internOpp: OpportunityData = { title: "Stage d'été Développeur Web", type: "STAGE" };
  assert.equal(detectApplicationCategory(internOpp), "internship");

  const jobOpp: OpportunityData = { title: "Ingénieur Fullstack Next.js", type: "JUNIOR" };
  assert.equal(detectApplicationCategory(jobOpp), "job");
});

test("extractVerifiableSkills only extracts technologies explicitly present in candidate CV or profile", () => {
  const candidateWithSkills: CandidateData = {
    skills: ["TypeScript", "Next.js"],
    rawCvText: "Projet Marketplace développé avec PHP, Laravel et PostgreSQL. Utilisation de Docker et Git.",
  };

  const extracted = extractVerifiableSkills(candidateWithSkills);

  assert.ok(extracted.includes("TypeScript"), "Should include profile skill TypeScript");
  assert.ok(extracted.includes("Next.js"), "Should include profile skill Next.js");
  assert.ok(extracted.includes("PHP"), "Should include CV keyword PHP");
  assert.ok(extracted.includes("Laravel"), "Should include CV keyword Laravel");
  assert.ok(extracted.includes("PostgreSQL"), "Should include CV keyword PostgreSQL");
  assert.ok(extracted.includes("Docker"), "Should include CV keyword Docker");
  assert.ok(extracted.includes("Git"), "Should include CV keyword Git");

  // MUST NOT include technologies never mentioned in CV or profile
  assert.equal(extracted.includes("Kubernetes"), false, "Must not hallucinate Kubernetes");
  assert.equal(extracted.includes("Rust"), false, "Must not hallucinate Rust");
  assert.equal(extracted.includes("Spring Boot"), false, "Must not hallucinate Spring Boot");
});

test("generateDeterministicDraft generates high quality French PFE email using candidate's verified data", () => {
  const candidate: CandidateData = {
    first_name: "Mahdi",
    last_name: "Chaari",
    email: "mahdi.chaari@esprit.tn",
    phone: "+216 22 123 456",
    school: "Esprit School of Business",
    degree: "Licence en Informatique de Gestion",
    specialty: "Business Information Systems",
    city: "Tunis",
    country: "Tunisie",
    rawCvText: "Projet développé avec PHP, Laravel, TypeScript, Next.js, PostgreSQL et Docker.",
  };

  const opportunity: OpportunityData = {
    title: "Stage PFE Développement Logiciel",
    companyName: "TechCorp Tunisie",
    description: "Recherche d'un stagiaire PFE pour développer des applications avec Next.js et TypeScript.",
    type: "PFE",
  };

  const draft = generateDeterministicDraft(candidate, opportunity);

  // Subject line
  assert.ok(draft.subject.includes("PFE"), "Subject must indicate PFE");
  assert.ok(draft.subject.includes("Stage PFE Développement Logiciel"), "Subject must include title");
  assert.ok(draft.subject.includes("Mahdi Chaari"), "Subject must include candidate name");

  // Greeting
  assert.ok(draft.body.includes("Bonjour,"), "Must include professional greeting");

  // Verified education
  assert.ok(draft.body.includes("Esprit School of Business"), "Must include verified institution");
  assert.ok(draft.body.includes("Licence en Informatique de Gestion"), "Must include verified degree");

  // Real skills
  assert.ok(draft.body.includes("TypeScript"), "Must mention verified skill TypeScript");
  assert.ok(draft.body.includes("Next.js"), "Must mention verified skill Next.js");

  // Motivation & Company
  assert.ok(draft.body.includes("TechCorp Tunisie"), "Must mention target company name");

  // Signature with verified candidate details
  assert.ok(draft.body.includes("Mahdi Chaari"), "Must include candidate name in signature");
  assert.ok(draft.body.includes("mahdi.chaari@esprit.tn"), "Must include candidate email in signature");
  assert.ok(draft.body.includes("+216 22 123 456"), "Must include phone in signature");

  // Provider metadata & demo notice
  assert.equal(draft.provider, "mock");
  assert.equal(draft.isAiGenerated, false);
  assert.ok(draft.notice?.includes("Mode Démo"), "Must include demo notice");
});

test("generateDeterministicDraft never invents skills or education when candidate data is missing", () => {
  const candidateWithoutData: CandidateData = {
    first_name: "Yassine",
    email: "yassine@example.com",
    // No school, no degree, no skills, no raw text
  };

  const opportunity: OpportunityData = {
    title: "Junior Developer",
    companyName: "Acme Corp",
    type: "JUNIOR",
  };

  const draft = generateDeterministicDraft(candidateWithoutData, opportunity);

  // Must NOT invent universities or degrees
  assert.equal(draft.body.includes("Esprit"), false);
  assert.equal(draft.body.includes("INSAT"), false);
  assert.equal(draft.body.includes("Master"), false);
  assert.equal(draft.body.includes("Ingénieur"), false);

  // Must NOT invent skills
  assert.equal(draft.body.includes("React"), false);
  assert.equal(draft.body.includes("Laravel"), false);

  // Must use neutral professional phrasing
  assert.ok(draft.body.includes("rigueur méthodologique"), "Should use neutral phrasing");
  assert.ok(draft.body.includes("Acme Corp"), "Should mention Acme Corp");
  assert.ok(draft.body.includes("Yassine"), "Should sign with actual name");
});

test("generateDeterministicDraft handles completely missing CV text without crashing or inventing data", () => {
  const candidateWithProfileOnly: CandidateData = {
    first_name: "Amina",
    last_name: "Ben Salah",
    email: "amina.bensalah@insat.ucar.tn",
    school: "INSAT",
    degree: "Diplôme National d'Ingénieur",
    specialty: "Génie Logiciel",
    rawCvText: null, // No CV text available
    skills: null,
  };

  const opportunity: OpportunityData = {
    title: "Stage PFE Ingénierie Cloud",
    companyName: "CloudServices SARL",
    description: "Recherche d'un stagiaire pour concevoir des architectures cloud avec AWS et Terraform.",
    type: "PFE",
  };

  const draft = generateDeterministicDraft(candidateWithProfileOnly, opportunity);

  // Verifies real profile education is preserved
  assert.ok(draft.body.includes("INSAT"), "Must mention verified school INSAT");
  assert.ok(draft.body.includes("Diplôme National d'Ingénieur"), "Must mention verified degree");
  assert.ok(draft.body.includes("Génie Logiciel"), "Must mention verified specialty");
  assert.ok(draft.body.includes("CloudServices SARL"), "Must mention target company");

  // Anti-hallucination check: candidate had no skills, must not claim AWS or Terraform expertise
  assert.equal(draft.body.includes("AWS"), false, "Must not claim AWS when candidate has no AWS in profile/CV");
  assert.equal(draft.body.includes("Terraform"), false, "Must not claim Terraform when candidate has no Terraform in profile/CV");
  assert.ok(draft.body.includes("rigueur méthodologique"), "Must use neutral methodology phrasing when skills are absent");
});

test("generateDeterministicDraft handles missing skills when CV contains non-technical text", () => {
  const candidateNonTech: CandidateData = {
    first_name: "Sami",
    last_name: "Trabelsi",
    email: "sami@example.com",
    school: "IHEC Carthage",
    degree: "Licence en Management",
    rawCvText: "Gestion d'équipes, organisation d'événements universitaires et accueil des délégations.",
  };

  const opportunity: OpportunityData = {
    title: "Stage d'immersion opérationnelle",
    companyName: "Nexus Group",
    description: "Stage pratique dans la gestion et coordination de projets.",
    type: "STAGE",
  };

  const verifiedSkills = extractVerifiableSkills(candidateNonTech);
  assert.equal(verifiedSkills.length, 0, "Non-technical text must yield 0 IT skills");

  const draft = generateDeterministicDraft(candidateNonTech, opportunity);

  // Must not hallucinate tech stack
  assert.equal(draft.body.includes("Python"), false);
  assert.equal(draft.body.includes("JavaScript"), false);
  assert.equal(draft.body.includes("React"), false);

  // Must include candidate's real education and company
  assert.ok(draft.body.includes("IHEC Carthage"));
  assert.ok(draft.body.includes("Licence en Management"));
  assert.ok(draft.body.includes("Nexus Group"));
  assert.ok(draft.body.includes("rigueur méthodologique"));
});

test("generateDeterministicDraft tailors structure and vocabulary to all opportunity types", () => {
  const candidate: CandidateData = {
    first_name: "Nour",
    last_name: "Khemir",
    email: "nour@example.com",
    school: "ENIT",
    degree: "Diplôme d'Ingénieur",
    skills: ["Python", "FastAPI"],
  };

  // 1. PFE
  const pfeDraft = generateDeterministicDraft(candidate, {
    title: "Développement Backend IA",
    companyName: "InnovCorp",
    type: "PFE",
  });
  assert.ok(pfeDraft.subject.includes("PFE"));
  assert.ok(pfeDraft.body.includes("stage de fin d'études (PFE)"));
  assert.ok(pfeDraft.body.includes("mener mon projet de fin d'études"));

  // 2. Summer Internship
  const internDraft = generateDeterministicDraft(candidate, {
    title: "Stage Développeur Python",
    companyName: "InnovCorp",
    type: "STAGE",
  });
  assert.ok(internDraft.subject.includes("pour un stage"));
  assert.ok(internDraft.body.includes("un stage pour"));
  assert.ok(internDraft.body.includes("Effectuer ce stage"));

  // 3. Junior Job
  const jobDraft = generateDeterministicDraft(candidate, {
    title: "Ingénieur Backend Junior",
    companyName: "InnovCorp",
    type: "JUNIOR",
  });
  assert.ok(jobDraft.subject.includes("Candidature au poste de"));
  assert.ok(jobDraft.body.includes("le poste de Ingénieur Backend Junior"));
  assert.ok(jobDraft.body.includes("Intégrer InnovCorp sur cette opportunité"));
});

test("generateDeterministicDraft handles company-specific personalization and missing company name gracefully", () => {
  const candidate: CandidateData = {
    first_name: "Karim",
    skills: ["PostgreSQL", "Prisma"],
  };

  // With specific company
  const withCompany = generateDeterministicDraft(candidate, {
    title: "Database Specialist",
    companyName: "Carthage Data Lab",
    description: "PostgreSQL et modélisation de données Prisma.",
  });
  assert.ok(withCompany.body.includes("Carthage Data Lab"));
  assert.ok(withCompany.body.includes("PostgreSQL"));
  assert.ok(withCompany.body.includes("Prisma"));

  // Without company name (fallback to 'votre entreprise')
  const withoutCompany = generateDeterministicDraft(candidate, {
    title: "Database Specialist",
    companyName: null,
  });
  assert.ok(withoutCompany.body.includes("votre entreprise"));
  assert.equal(withoutCompany.body.includes("null"), false);
  assert.equal(withoutCompany.body.includes("undefined"), false);
  assert.equal(withoutCompany.body.includes("[object Object]"), false);
});

test("extractVerifiableProjects extracts projects from CV text and matches them to opportunity", () => {
  const cvTextWithProjects = `
CURRICULUM VITAE
Yassine Gharbi - Ingénieur Logiciel

COMPÉTENCES TECHNIQUES
Langages: TypeScript, Python, PHP, SQL
Frameworks: Next.js, Laravel, FastAPI, React

PROJETS ACADÉMIQUES
• Plateforme Marketplace : Développement d'une solution e-commerce multi-vendeurs avec PHP, Laravel et PostgreSQL.
• Dashboard Analytique RH : Application de visualisation de données avec Next.js, TypeScript et Tailwind CSS.
• Système de détection d'anomalies : Modèle en Python avec Scikit-Learn et FastAPI.
`;

  const extractedProjects = extractVerifiableProjects(cvTextWithProjects);
  assert.equal(extractedProjects.length, 3, "Must extract 3 projects");

  const marketplace = extractedProjects.find((p) => p.title.toLowerCase().includes("marketplace"));
  assert.ok(marketplace, "Must extract Marketplace project");
  assert.ok(marketplace?.technologies.includes("PHP"));
  assert.ok(marketplace?.technologies.includes("Laravel"));
  assert.ok(marketplace?.technologies.includes("PostgreSQL"));

  const dashboard = extractedProjects.find((p) => p.title.toLowerCase().includes("dashboard"));
  assert.ok(dashboard, "Must extract Dashboard project");
  assert.ok(dashboard?.technologies.includes("Next.js"));
  assert.ok(dashboard?.technologies.includes("TypeScript"));

  // Match against a Next.js / TypeScript opportunity
  const candidate: CandidateData = {
    first_name: "Yassine",
    last_name: "Gharbi",
    rawCvText: cvTextWithProjects,
  };

  const oppNextjs: OpportunityData = {
    title: "Développeur Frontend Next.js",
    companyName: "FinTech Hub",
    description: "Conception d'applications web avec Next.js et TypeScript.",
    type: "STAGE",
  };

  const match = matchCandidateToOpportunity(candidate, oppNextjs);
  assert.ok(match.matchedSkills.includes("Next.js"));
  assert.ok(match.matchedSkills.includes("TypeScript"));
  assert.ok(match.matchedProjects.some((p) => p.title.includes("Dashboard")));

  // Generate email and verify that the matching project is highlighted
  const draft = generateDeterministicDraft(candidate, oppNextjs);
  assert.ok(draft.body.includes("Next.js"), "Must mention matched skill Next.js");
  assert.ok(draft.body.includes("TypeScript"), "Must mention matched skill TypeScript");
  assert.ok(draft.body.includes("Dashboard Analytique RH"), "Must mention matched project Dashboard");
  assert.ok(draft.body.includes("FinTech Hub"), "Must mention company");
});

test("extractVerifiableProjects handles unpdf extracted text with bare titles and multi-line tech stacks", () => {
  const unpdfText = `
Mohamed Ali Trabelsi
Génie Logiciel INSAT
mohamedalit@insat.u-carthage.tn

Compétences Techniques
JavaScript TypeScript Python PHP SQL
Next.js React Laravel FastAPI
PostgreSQL MySQL MongoDB Redis Docker Git

Projets
Plateforme Marketplace
PHP Laravel PostgreSQL Bootstrap
Plateforme d'analyse e-commerce
Next.js TypeScript Prisma PostgreSQL TailwindCSS

Langues
Français Anglais Arabe
`;

  const projects = extractVerifiableProjects(unpdfText);
  assert.ok(projects.length >= 2, `Must extract at least 2 projects, got ${projects.length}`);

  const marketplace = projects.find((p) => p.title.toLowerCase().includes("marketplace"));
  assert.ok(marketplace, "Must extract Plateforme Marketplace");
  assert.ok(marketplace?.technologies.includes("PHP"), "Marketplace must have PHP");
  assert.ok(marketplace?.technologies.includes("Laravel"), "Marketplace must have Laravel");

  const analytics = projects.find((p) => p.title.toLowerCase().includes("analyse"));
  assert.ok(analytics, "Must extract Plateforme d'analyse e-commerce");
  assert.ok(analytics?.technologies.includes("Next.js"), "Analytics must have Next.js");
  assert.ok(analytics?.technologies.includes("TypeScript"), "Analytics must have TypeScript");
  assert.ok(analytics?.technologies.includes("Prisma"), "Analytics must have Prisma");
});

test("extractVerifiableProjects handles French CV with 'Projet:' prefix and em-dash delimiters", () => {
  const cvWithPrefix = `
Yassine Gharbi
EXPÉRIENCE & PROJETS
Projet: Application de gestion RH — React, Node.js, MongoDB
Projet: Site e-commerce — Next.js, TypeScript, Stripe, PostgreSQL
Projet: API REST d'authentification — Django, Python, JWT
COMPÉTENCES
React, Node.js, Next.js, TypeScript, Python, Django, PostgreSQL, MongoDB
`;

  const projects = extractVerifiableProjects(cvWithPrefix);
  assert.equal(projects.length, 3, `Must extract 3 projects, got ${projects.length}`);
  assert.ok(projects.some((p) => p.title.includes("Application de gestion RH")));
  assert.ok(projects.some((p) => p.title.includes("Site e-commerce")));
  assert.ok(projects.some((p) => p.title.includes("API REST d'authentification")));
});

test("Diagnostic: realistic CV with PHP/Laravel marketplace and Next.js/TypeScript analytics platform references projects ONLY when present", () => {
  const realisticCvWithProjects: CandidateData = {
    first_name: "Farah",
    last_name: "Mejri",
    email: "farah.mejri@insat.ucar.tn",
    phone: "+216 20 333 444",
    school: "INSAT",
    degree: "Diplôme National d'Ingénieur",
    specialty: "Génie Logiciel",
    rawCvText: `
Farah Mejri
Étudiante Ingénieur en Génie Logiciel à l'INSAT
farah.mejri@insat.ucar.tn | +216 20 333 444

COMPÉTENCES TECHNIQUES
Langages : JavaScript, TypeScript, PHP, Python, SQL
Frameworks & Outils : Next.js, React, Laravel, PostgreSQL, Prisma, Docker, Git

PROJETS SIGNIFICATIFS
Plateforme Marketplace avec PHP/Laravel
Développement d'une plateforme e-commerce multi-vendeurs avec gestion des commandes et paiements. Technologies : PHP, Laravel, PostgreSQL, Blade.
Plateforme d'analyse e-commerce avec Next.js, TypeScript, PostgreSQL, Prisma
Dashboard analytique en temps réel pour le suivi des ventes et métriques business. Technologies : Next.js, TypeScript, PostgreSQL, Prisma, Tailwind CSS.

FORMATION
INSAT — Institut National des Sciences Appliquées et de Technologie (2021 - 2026)
Cycle Ingénieur en Génie Logiciel
`,
  };

  const targetOpportunityNextjs: OpportunityData = {
    title: "Développeur Full Stack Next.js / TypeScript",
    companyName: "TechCorp",
    description: "Recherche d'un stagiaire pour concevoir et faire évoluer notre plateforme web avec Next.js, TypeScript et PostgreSQL.",
    type: "STAGE",
  };

  // Case A: When the CV contains the projects
  const draftWithProjects = generateDeterministicDraft(realisticCvWithProjects, targetOpportunityNextjs);

  // 1. Must reference the matching Next.js/TypeScript analytics platform
  assert.ok(
    draftWithProjects.body.toLowerCase().includes("analyse") ||
    draftWithProjects.body.toLowerCase().includes("analytique"),
    "Generated email MUST reference the analytics platform when present in CV"
  );
  assert.ok(
    draftWithProjects.body.includes("Next.js"),
    "Generated email MUST reference Next.js"
  );
  assert.ok(
    draftWithProjects.body.includes("TypeScript"),
    "Generated email MUST reference TypeScript"
  );

  // 2. Must reference the PHP/Laravel marketplace as concrete project evidence
  assert.ok(
    draftWithProjects.body.toLowerCase().includes("marketplace"),
    "Generated email MUST reference the Marketplace project when present in CV"
  );
  assert.ok(
    draftWithProjects.body.includes("Laravel") || draftWithProjects.body.includes("PHP"),
    "Generated email MUST mention Laravel or PHP from the verified marketplace project"
  );

  // 3. Must reference the candidate's verified institution and degree
  assert.ok(draftWithProjects.body.includes("INSAT"), "Must mention verified school INSAT");
  assert.ok(draftWithProjects.body.includes("Génie Logiciel"), "Must mention verified specialty Génie Logiciel");

  // 4. Must treat TechCorp (demo company) cleanly as a test opportunity
  assert.ok(
    draftWithProjects.body.includes("opportunité test"),
    "Must clearly treat demo opportunity as a test opportunity"
  );

  // Case B: When the CV does NOT contain those projects
  const candidateWithoutThoseProjects: CandidateData = {
    first_name: "Karim",
    last_name: "Mansour",
    email: "karim.mansour@enit.utm.tn",
    school: "ENIT",
    degree: "Ingénieur Télécom",
    rawCvText: `
Karim Mansour
Étudiant Ingénieur Télécommunications à l'ENIT
COMPÉTENCES
Python, Bash, Linux, Réseaux, C++
PROJETS
Simulateur de protocoles réseau en Python
`,
  };

  const draftWithoutProjects = generateDeterministicDraft(candidateWithoutThoseProjects, targetOpportunityNextjs);

  // MUST NOT reference Marketplace or Next.js analytics platform because they are absent!
  assert.equal(
    draftWithoutProjects.body.toLowerCase().includes("marketplace"),
    false,
    "MUST NOT reference Marketplace when absent from candidate CV"
  );
  assert.equal(
    draftWithoutProjects.body.toLowerCase().includes("analyse e-commerce"),
    false,
    "MUST NOT reference analytics platform when absent from candidate CV"
  );
  assert.equal(
    draftWithoutProjects.body.includes("Laravel"),
    false,
    "MUST NOT reference Laravel when absent from candidate CV"
  );
  assert.equal(
    draftWithoutProjects.body.includes("Blade"),
    false,
    "MUST NOT reference Blade when absent from candidate CV"
  );
});

test("resolveExactProgramName strips internal UI glosses like (LA) and properly formats specialty", () => {
  // Case 1: Degree with UI acronym gloss '(LA)' and lowercase specialty
  const candidateUI: CandidateData = {
    school: "Esprit School of Business",
    degree: "Licence Appliquée (LA)",
    specialty: "business information",
  };
  const resolved1 = resolveExactProgramName(candidateUI);
  assert.equal(resolved1, "Licence Appliquée en Business Information");
  assert.equal(resolved1.includes("(LA)"), false, "Must not include (LA)");

  // Case 2: Verbatim program line present in rawCvText
  const candidateWithVerbatimCv: CandidateData = {
    school: "Esprit School of Business",
    degree: "Licence Appliquée (LA)",
    specialty: "business information",
    rawCvText: `
Mohamed Chaari
Étudiante en Licence Appliquée en Business Information Systems à l'ESB
Contact: mohamed@example.com
FORMATION
Licence Appliquée en Business Information Systems (BIS)
Institut Supérieur de Gestion
`,
  };
  const resolved2 = resolveExactProgramName(candidateWithVerbatimCv);
  assert.ok(
    resolved2.includes("Licence Appliquée en Business Information Systems"),
    `Must extract official program title, got: ${resolved2}`
  );
  assert.equal(resolved2.includes("(LA)"), false);

  // Case 3: Engineering degree with English gloss
  const candidateEng: CandidateData = {
    school: "INSAT",
    degree: "Diplôme d'ingénieur (National Engineering Degree)",
    specialty: "Génie Logiciel",
  };
  const resolved3 = resolveExactProgramName(candidateEng);
  assert.equal(resolved3, "Diplôme d'ingénieur en Génie Logiciel");
  assert.equal(resolved3.includes("(National Engineering Degree)"), false);

  // Case 4: Degree already containing "en" avoids awkward double "en"
  const candidateDoubleEn: CandidateData = {
    school: "ISG Tunis",
    degree: "Licence en Informatique de Gestion",
    specialty: "Business Information Systems",
  };
  const resolved4 = resolveExactProgramName(candidateDoubleEn);
  assert.equal(resolved4, "Licence en Informatique de Gestion, spécialité Business Information Systems");
  assert.equal(resolved4.includes("en Licence en Informatique de Gestion en Business"), false);
});

test("generateDeterministicDraft generates natural French without awkward UI glosses or generic clichés", () => {
  const candidate: CandidateData = {
    first_name: "Sarra",
    last_name: "Bouazizi",
    email: "sarra@example.com",
    school: "Esprit School of Business",
    degree: "Licence Appliquée (LA)",
    specialty: "business information",
    skills: ["React", "JavaScript"],
    rawCvText: `
Sarra Bouazizi
Licence Appliquée en Business Information Systems à l'ESB
COMPÉTENCES
React, JavaScript, HTML, CSS
PROJETS
Application de gestion de stock
Application web développée en React et JavaScript pour la gestion des stocks.
`,
  };

  const opportunity: OpportunityData = {
    title: "Stage PFE Frontend React",
    companyName: "Digital Dynamics",
    description: "Stage PFE pour développer des interfaces web en React.",
    type: "PFE",
  };

  const draft = generateDeterministicDraft(candidate, opportunity);

  // 1. Natural French without "(LA)" or awkward lowercase "business information"
  assert.equal(draft.body.includes("(LA)"), false, "Must not contain (LA)");
  assert.equal(draft.body.includes("Licence Appliquée (LA) en business information"), false);
  assert.ok(
    draft.body.includes("Licence Appliquée"),
    "Must include clean degree title"
  );
  assert.ok(
    draft.body.includes("Business Information"),
    "Must include properly formatted specialty"
  );

  // 2. Strict anti-cliché check: No generic filler
  assert.equal(
    draft.body.toLowerCase().includes("forte capacité d'adaptation"),
    false,
    "Must not contain generic cliché 'forte capacité d'adaptation'"
  );
  assert.equal(
    draft.body.toLowerCase().includes("adaptation"),
    false,
    "Must not claim adaptation unless grounded"
  );

  // 3. Strict anti-hallucination check: Unmentioned skills are NEVER claimed
  assert.equal(draft.body.includes("Docker"), false, "Must not mention Docker when candidate lacks Docker");
  assert.equal(draft.body.includes("CI/CD"), false, "Must not mention CI/CD when candidate lacks CI/CD");
  assert.equal(/\bJava\b(?!Script)/i.test(draft.body), false, "Must not mention Java when candidate lacks Java");
  assert.equal(draft.body.includes("Python"), false, "Must not mention Python when candidate lacks Python");
  assert.equal(draft.body.includes("PHP"), false, "Must not mention PHP when candidate lacks PHP");
  assert.equal(draft.body.includes("SQL"), false, "Must not mention SQL when candidate lacks SQL");
  assert.equal(draft.body.includes("TypeScript"), false, "Must not mention TypeScript when candidate lacks TypeScript");

  // 4. Genuine skills and project are highlighted
  assert.ok(draft.body.includes("React"), "Must highlight verified skill React");
  assert.ok(draft.body.includes("Application de gestion de stock"), "Must highlight verified project");

  // 5. Tailored PFE subject and introduction
  assert.ok(draft.subject.includes("Candidature pour un stage PFE :"));
  assert.ok(draft.body.includes("Digital Dynamics"));
  assert.ok(draft.body.includes("stage de fin d'études (PFE)"));
});

test("Strict verification: candidate with React only is NEVER credited with Docker, CI/CD, Java, PHP, SQL, TypeScript", () => {
  const candidateWithReactOnly: CandidateData = {
    first_name: "Yassine",
    last_name: "Kacem",
    email: "yassine.kacem@example.com",
    school: "ISET'Com",
    degree: "Licence Appliquée",
    specialty: "Télécommunications",
    skills: ["React"],
    rawCvText: "Projet interface utilisateur avec React. Aucune autre technologie.",
  };

  // Opportunity requiring a massive tech stack
  const bigStackOpportunity: OpportunityData = {
    title: "Développeur Full Stack Senior / Lead",
    companyName: "Enterprise Solutions",
    description: "Recherche un profil maîtrisant Docker, CI/CD, Java, PHP, SQL, TypeScript, React et Kubernetes.",
    type: "STAGE",
  };

  const draft = generateDeterministicDraft(candidateWithReactOnly, bigStackOpportunity);

  // The ONLY matched tech is React
  assert.ok(draft.body.includes("React"), "Must mention verified React");

  // Every other tech in the job post MUST NOT be claimed for the candidate
  assert.equal(draft.body.includes("Docker"), false, "Candidate has no Docker");
  assert.equal(draft.body.includes("CI/CD"), false, "Candidate has no CI/CD");
  assert.equal(draft.body.includes("Java"), false, "Candidate has no Java");
  assert.equal(draft.body.includes("PHP"), false, "Candidate has no PHP");
  assert.equal(draft.body.includes("SQL"), false, "Candidate has no SQL");
  assert.equal(draft.body.includes("TypeScript"), false, "Candidate has no TypeScript");
  assert.equal(draft.body.includes("Kubernetes"), false, "Candidate has no Kubernetes");
});

test("isDanglingEnding correctly detects malformed and incomplete French fragments", () => {
  // Dangling prepositions & articles
  assert.equal(isDanglingEnding("automatisée avec un"), true);
  assert.equal(isDanglingEnding("automatisée avec une"), true);
  assert.equal(isDanglingEnding("automatisée avec"), true);
  assert.equal(isDanglingEnding("développée pour le"), true);
  assert.equal(isDanglingEnding("mise en place dans"), true);
  assert.equal(isDanglingEnding("déployée sur"), true);

  // Dangling conjunctions & relative pronouns
  assert.equal(isDanglingEnding("application et"), true);
  assert.equal(isDanglingEnding("système ou"), true);
  assert.equal(isDanglingEnding("plateforme qui"), true);
  assert.equal(isDanglingEnding("solution dont"), true);
  assert.equal(isDanglingEnding("conçue afin de"), true);
  assert.equal(isDanglingEnding("automatisée via"), true);
  assert.equal(isDanglingEnding("intégration grâce à"), true);

  // Dangling punctuation
  assert.equal(isDanglingEnding("conteneurisée avec Docker -"), true);
  assert.equal(isDanglingEnding("architecture microservices,"), true);
  assert.equal(isDanglingEnding("application web :"), true);

  // Clean, valid French sentences
  assert.equal(isDanglingEnding("conteneurisée avec Docker"), false);
  assert.equal(isDanglingEnding("automatisée avec un pipeline CI/CD"), false);
  assert.equal(isDanglingEnding("Dashboard analytique en temps réel"), false);
  assert.equal(isDanglingEnding("gestion des commandes et des paiements"), false);
});

test("cleanProjectDescription safely recovers complete clause and omits un-cleanable fragments", () => {
  // Case 1: Exact bug report - safely recovers the preceding complete clause
  const malformedInput = "Développé en équipe une application e-commerce responsive, conteneurisée avec Docker et automatisée avec un.";
  const cleaned1 = cleanProjectDescription(malformedInput);
  assert.ok(cleaned1, "Must return a recovered clause");
  assert.equal(cleaned1?.includes("avec un"), false, "Must never contain 'avec un'");
  assert.equal(
    cleaned1,
    "Développé en équipe une application e-commerce responsive, conteneurisée avec Docker"
  );

  // Case 2: Short un-cleanable fragment - must be omitted (undefined)
  const uncleanable1 = "automatisée avec un.";
  assert.equal(cleanProjectDescription(uncleanable1), undefined, "Short broken fragment must be omitted");

  const uncleanable2 = "développée pour une.";
  assert.equal(cleanProjectDescription(uncleanable2), undefined, "Dangling preposition must be omitted");

  const uncleanable3 = "solution web et.";
  assert.equal(cleanProjectDescription(uncleanable3), undefined, "Dangling conjunction must be omitted");

  // Case 3: Valid full description remains intact (with metadata header stripped if present)
  const fullDesc = "Développement d'une plateforme e-commerce multi-vendeurs avec gestion des commandes. Technologies : PHP, MySQL";
  const cleanedFull = cleanProjectDescription(fullDesc);
  assert.equal(
    cleanedFull,
    "Développement d'une plateforme e-commerce multi-vendeurs avec gestion des commandes"
  );
});

test("Regression: generated email never produces 'automatisée avec un.' or malformed dangling endings", () => {
  const candidateWithMalformedDesc: CandidateData = {
    first_name: "Yassine",
    last_name: "Gharbi",
    email: "yassine@example.com",
    skills: ["Docker"],
    projects: [
      {
        title: "Application E-Commerce",
        technologies: ["Docker"],
        description: "Développé en équipe une application e-commerce responsive, conteneurisée avec Docker et automatisée avec un.",
      },
    ],
  };

  const opportunity: OpportunityData = {
    title: "Ingénieur DevOps / Cloud",
    companyName: "CloudTech",
    description: "Recherche un profil Docker et conteneurisation.",
    type: "STAGE",
  };

  const draft = generateDeterministicDraft(candidateWithMalformedDesc, opportunity);

  // MUST NOT contain the malformed phrase
  assert.equal(
    draft.body.includes("automatisée avec un."),
    false,
    "Generated email must NEVER contain 'automatisée avec un.'"
  );
  assert.equal(
    draft.body.includes("avec un."),
    false,
    "Generated email must NEVER contain dangling 'avec un.'"
  );

  // MUST retain verified project title and verified skill
  assert.ok(draft.body.includes("Application E-Commerce"), "Must retain verified project title");
  assert.ok(draft.body.includes("Docker"), "Must retain verified skill Docker");

  // MUST output a grammatically complete sentence
  assert.ok(
    draft.body.includes("conteneurisée avec Docker"),
    "Must preserve the valid clause 'conteneurisée avec Docker'"
  );
});

test("Regression: un-cleanable project description is omitted while project title and skills are retained", () => {
  const candidateWithBrokenDesc: CandidateData = {
    first_name: "Amira",
    last_name: "Hammami",
    email: "amira@example.com",
    skills: ["React"],
    projects: [
      {
        title: "Portail Client",
        technologies: ["React"],
        description: "automatisée avec un.", // Completely broken description
      },
    ],
  };

  const opportunity: OpportunityData = {
    title: "Développeur Frontend React",
    companyName: "WebSolutions",
    description: "Développement d'interfaces en React.",
    type: "STAGE",
  };

  const draft = generateDeterministicDraft(candidateWithBrokenDesc, opportunity);

  // Must not have broken description
  assert.equal(draft.body.includes("automatisée avec un"), false);
  assert.equal(draft.body.includes("avec un."), false);

  // Must retain verified project and skill cleanly without trailing colon
  assert.ok(draft.body.includes("Portail Client"), "Must retain project title");
  assert.ok(draft.body.includes("React"), "Must retain skill React");
  assert.equal(draft.body.includes("Portail Client (React) : ."), false, "Must not have empty description colon");
});

test("Regression: multiline description wrapped across lines in raw CV is joined without truncation", () => {
  const multilineCv = `
PROJETS
Projet: Application E-commerce
Développé en équipe une application e-commerce responsive, conteneurisée avec Docker et automatisée avec un
pipeline CI/CD avec GitHub Actions.
COMPÉTENCES
Docker, React, Node.js
`;

  const extracted = extractVerifiableProjects(multilineCv);
  assert.ok(extracted.length >= 1, "Must extract the project");
  const project = extracted.find((p) => p.title.toLowerCase().includes("commerce") || p.title.toLowerCase().includes("application"));
  assert.ok(project, "Project must be extracted");
  assert.ok(
    project?.description?.includes("pipeline CI/CD"),
    `Description must include continuation line, got: ${project?.description}`
  );
  assert.equal(
    project?.description?.includes("automatisée avec un."),
    false,
    "Description must not end with 'avec un.'"
  );
});

test("isTechnicalNoteOrWorkflowLine correctly detects raw technical notes and workflow metadata", () => {
  // Raw collaboration and Git/GitHub workflow notes
  assert.equal(isTechnicalNoteOrWorkflowLine("Collaboration via Git/GitHub Actions (branches, pull requests)"), true);
  assert.equal(isTechnicalNoteOrWorkflowLine("• Collaboration via Git/GitHub Actions (branches, pull requests)"), true);
  assert.equal(isTechnicalNoteOrWorkflowLine("Gestion des versions : Git / GitHub"), true);
  assert.equal(isTechnicalNoteOrWorkflowLine("(branches, pull requests)"), true);
  assert.equal(isTechnicalNoteOrWorkflowLine("Travail collaboratif avec Git et GitLab"), true);

  // Agile / Scrum ritual notes
  assert.equal(isTechnicalNoteOrWorkflowLine("Méthodologie Agile Scrum (sprints, stand-ups)"), true);
  assert.equal(isTechnicalNoteOrWorkflowLine("Sprints de 2 semaines et daily meetings"), true);

  // Metadata headers
  assert.equal(isTechnicalNoteOrWorkflowLine("Environnement technique : Next.js, Node.js, Docker"), true);
  assert.equal(isTechnicalNoteOrWorkflowLine("Stack technique : React, TailwindCSS"), true);
  assert.equal(isTechnicalNoteOrWorkflowLine("Outils : VS Code, Postman, Figma"), true);
  assert.equal(isTechnicalNoteOrWorkflowLine("Technologies utilisées : Laravel, MySQL"), true);
  assert.equal(isTechnicalNoteOrWorkflowLine("Missions : Développement de fonctionnalités"), true);

  // Genuine project titles MUST return false
  assert.equal(isTechnicalNoteOrWorkflowLine("Application e-commerce responsive"), false);
  assert.equal(isTechnicalNoteOrWorkflowLine("Plateforme Marketplace"), false);
  assert.equal(isTechnicalNoteOrWorkflowLine("Dashboard analytique en temps réel"), false);
  assert.equal(isTechnicalNoteOrWorkflowLine("Système de gestion des stocks"), false);
  assert.equal(isTechnicalNoteOrWorkflowLine("API REST de paiement"), false);
});

test("extractVerifiableProjects never extracts raw technical notes like 'Collaboration via Git/GitHub Actions' as projects", () => {
  const cvText = `
PROJETS
• Application E-commerce (Next.js, TypeScript, Docker)
  Développé une application e-commerce responsive pour la vente en ligne.
• Collaboration via Git/GitHub Actions (branches, pull requests)
• Plateforme Marketplace (Laravel, PHP, MySQL)
  Conception d'une marketplace multi-vendeurs avec gestion des commandes.
• Environnement technique : VS Code, Git, Docker
`;

  const projects = extractVerifiableProjects(cvText);

  // Must extract genuine projects
  const titles = projects.map((p) => p.title.toLowerCase());
  assert.ok(titles.some((t) => t.includes("application e-commerce")), "Must extract Application E-commerce");
  assert.ok(titles.some((t) => t.includes("plateforme marketplace")), "Must extract Plateforme Marketplace");

  // Must NEVER extract technical notes as projects
  assert.equal(
    titles.some((t) => t.includes("collaboration")),
    false,
    "Must NEVER extract 'Collaboration via Git' as a project"
  );
  assert.equal(
    titles.some((t) => t.includes("environnement technique")),
    false,
    "Must NEVER extract 'Environnement technique' as a project"
  );
});

test("Concise project selection: selects at most two relevant verified projects", () => {
  const candidateWithManyProjects: CandidateData = {
    first_name: "Youssef",
    last_name: "Ben Salah",
    skills: ["Next.js", "TypeScript", "Docker", "PHP", "Laravel", "React", "Node.js"],
    projects: [
      { title: "Application E-commerce", technologies: ["Next.js", "TypeScript", "Docker"] },
      { title: "Plateforme Marketplace", technologies: ["Laravel", "PHP"] },
      { title: "Dashboard Analytics", technologies: ["React", "Node.js"] },
      { title: "Portail RH", technologies: ["Next.js", "Node.js"] },
    ],
  };

  const opportunity: OpportunityData = {
    title: "Développeur Fullstack Next.js / TypeScript",
    companyName: "WebAgency",
    description: "Nous recherchons un développeur maîtrisant Next.js et TypeScript.",
    type: "STAGE",
  };

  const draft = generateDeterministicDraft(candidateWithManyProjects, opportunity);

  // Must select at most two projects in email prose
  let projectMentions = 0;
  if (draft.body.includes("Application E-commerce")) projectMentions++;
  if (draft.body.includes("Plateforme Marketplace")) projectMentions++;
  if (draft.body.includes("Dashboard Analytics")) projectMentions++;
  if (draft.body.includes("Portail RH")) projectMentions++;

  assert.ok(projectMentions >= 1 && projectMentions <= 2, `Expected at most 2 projects, got ${projectMentions}`);
  assert.ok(draft.body.includes("Application E-commerce"), "Must include the top matching project");
});

test("Removal or natural rewriting of raw Git/GitHub workflow note fragments in email generation", () => {
  const candidateWithGitInCv: CandidateData = {
    first_name: "Mohamed",
    last_name: "Trabelsi",
    skills: ["Next.js", "TypeScript", "Docker", "Git"],
    rawCvText: `
PROJETS
• Application E-commerce (Next.js, TypeScript, Docker)
  Développé une boutique en ligne.
• Collaboration via Git/GitHub Actions (branches, pull requests)
COMPÉTENCES
Next.js, TypeScript, Docker, Git, GitHub Actions
`,
  };

  // Case A: Opportunity mentions Git/teamwork -> Rewritten naturally in French
  const opportunityWithGit: OpportunityData = {
    title: "Développeur Fullstack (Git & travail en équipe)",
    companyName: "InnovCorp",
    description: "Recherche un profil autonome maîtrisant Git, GitHub et les flux d'équipe.",
    type: "PFE",
  };

  const draftWithGit = generateDeterministicDraft(candidateWithGitInCv, opportunityWithGit);

  // Raw fragment MUST be removed
  assert.equal(
    draftWithGit.body.includes("Collaboration via Git/GitHub Actions (branches, pull requests)"),
    false,
    "Raw fragment must NOT appear in email body"
  );
  assert.equal(
    draftWithGit.body.includes("(branches, pull requests)"),
    false,
    "Parenthetical git notes must NOT appear in email body"
  );

  // Natural French rewritten sentence MUST be present
  assert.ok(
    draftWithGit.body.includes("travail collaboratif sous Git"),
    "Must naturally mention collaborative Git workflow when relevant"
  );

  const directWorkflow = getNaturalCollaborativeWorkflowSentence(candidateWithGitInCv, opportunityWithGit, ["Git"], false);
  assert.ok(directWorkflow?.includes("travail collaboratif sous Git"), "Direct helper call must generate French sentence");

  // Case B: Opportunity does NOT mention Git or teamwork -> Fragment and extra sentence are omitted
  const opportunityWithoutGit: OpportunityData = {
    title: "Développeur TypeScript",
    companyName: "DataSoft",
    description: "Conception de modules TypeScript et Next.js.",
    type: "STAGE",
  };

  const draftWithoutGit = generateDeterministicDraft(candidateWithGitInCv, opportunityWithoutGit);

  assert.equal(
    draftWithoutGit.body.includes("Collaboration via Git/GitHub Actions (branches, pull requests)"),
    false
  );
  assert.equal(
    draftWithoutGit.body.includes("travail collaboratif sous Git"),
    false,
    "Should not add collaborative workflow sentence if opportunity did not seek it"
  );
});

test("avoid repeating project details in formatted sentence when description echoes title", () => {
  const redundantDesc = "Développé en équipe une application e-commerce responsive.";
  const cleaned = cleanProjectDescription(redundantDesc, "Application e-commerce responsive");

  // When description has no substantive content beyond the title, it must be omitted (undefined)
  assert.equal(cleaned, undefined, "Redundant description must be omitted");

  // But when description adds distinct substantive features, it must be retained
  const substantiveDesc = "Développé une application e-commerce responsive : intégration d'un panier d'achat et passerelle Stripe.";
  const cleanedSubstantive = cleanProjectDescription(substantiveDesc, "Application e-commerce responsive");
  assert.ok(cleanedSubstantive, "Substantive feature details must be retained");
});

test("Regression: fixUnmatchedParentheses balances unclosed parentheses and removes stray closing parentheses", () => {
  // Unclosed short qualifier/acronym
  assert.equal(
    fixUnmatchedParentheses("Licence en Informatique de Gestion (Business Information"),
    "Licence en Informatique de Gestion (Business Information)"
  );
  assert.equal(
    fixUnmatchedParentheses("Licence Appliquée (LA"),
    "Licence Appliquée (LA)"
  );

  // Stray closing parenthesis without opening
  assert.equal(
    fixUnmatchedParentheses("Licence en Informatique de Gestion)"),
    "Licence en Informatique de Gestion"
  );

  // Already balanced
  assert.equal(
    fixUnmatchedParentheses("Licence en Informatique de Gestion (Business Information Systems)"),
    "Licence en Informatique de Gestion (Business Information Systems)"
  );

  // Trailing incomplete parenthesis fragment
  assert.equal(
    fixUnmatchedParentheses("Diplôme d'ingénieur ("),
    "Diplôme d'ingénieur"
  );
});

test("Regression: education wording never produces unmatched parentheses or concatenated institution names", () => {
  // Case A: Candidate profile reproducing the exact user bug
  const candidateMalformed: CandidateData = {
    first_name: "Mahdi",
    last_name: "Chaari",
    school: "Esprit School of Business",
    degree: "Licence en Informatique de Gestion (Business Information à Esprit School of Business",
    specialty: "Business Information",
    rawCvText: `
FORMATION
Licence en Informatique de Gestion (Business Information à Esprit School of Business
`,
  };

  const oppPfe: OpportunityData = {
    title: "Stage PFE Business Intelligence",
    companyName: "FinTech Tunisia",
    description: "Recherche stagiaire PFE pour missions de Business Intelligence.",
    type: "PFE",
  };

  const draft = generateDeterministicDraft(candidateMalformed, oppPfe);

  // 1. Must NOT contain the malformed unclosed parenthesis string
  assert.equal(
    draft.body.includes("Licence en Informatique de Gestion (Business Information à Esprit School of Business"),
    false,
    "Must NOT contain malformed unclosed parenthesis string"
  );

  // 2. Parentheses across the entire generated email body MUST be balanced
  let openParenCount = 0;
  for (const ch of draft.body) {
    if (ch === "(") openParenCount++;
    else if (ch === ")") openParenCount--;
    assert.ok(openParenCount >= 0, "Closing parenthesis must not precede opening parenthesis");
  }
  assert.equal(openParenCount, 0, "All parentheses in generated email body must be balanced");

  // 3. Program name must be clean, grounded, and free of concatenated school
  const resolved = resolveExactProgramName(candidateMalformed);
  assert.equal(
    resolved.includes("Esprit School of Business"),
    false,
    "Degree program name must never contain or concatenate the institution name"
  );
  assert.ok(
    resolved.includes("Licence en Informatique de Gestion"),
    "Must retain official degree title"
  );
  assert.ok(
    resolved.includes("Business Information"),
    "Must retain verified specialty"
  );

  // 4. Institution must only be introduced once in the intro paragraph via 'à [School]'
  const schoolOccurrences = (draft.body.match(/Esprit School of Business/g) || []).length;
  assert.equal(schoolOccurrences, 1, "School name must only appear once in education intro");
  assert.ok(
    draft.body.includes("à Esprit School of Business"),
    "Must cleanly introduce school with 'à Esprit School of Business'"
  );

  // 5. Direct cleanEducationLine verification
  const cleanedCvLine = cleanEducationLine(
    "Licence en Informatique de Gestion (Business Information à Esprit School of Business",
    "Esprit School of Business"
  );
  assert.equal(
    cleanedCvLine,
    "Licence en Informatique de Gestion, spécialité Business Information",
    "cleanEducationLine must strip school and turn unclosed parenthetical into French specialty phrase"
  );
});

test("Regression: project formatting removes raw colons and awkward taglines in favor of natural French apposition", () => {
  // Test direct helper formatting
  const naturalDesc = formatNaturalProjectDescription("Ecom Doctor", "Intelligent E-commerce Analytics Platform");
  assert.equal(
    naturalDesc,
    ", une plateforme d'analyse e-commerce intelligente",
    "Must adapt English tagline to natural French with comma apposition"
  );

  // Redundant description echoing title must be omitted
  const redundant = formatNaturalProjectDescription("Ecom Doctor", "Ecom Doctor");
  assert.equal(redundant, undefined, "Redundant description must be omitted");

  // In full email draft generation
  const candidateWithProject: CandidateData = {
    first_name: "Amine",
    last_name: "Gharbi",
    school: "Esprit School of Business",
    degree: "Licence en Informatique de Gestion",
    specialty: "Business Information Systems",
    skills: ["Next.js", "TypeScript"],
    projects: [
      {
        title: "Ecom Doctor",
        technologies: ["Next.js", "TypeScript"],
        description: "Intelligent E-commerce Analytics Platform",
      },
    ],
  };

  const opp: OpportunityData = {
    title: "Développeur Web Next.js / TypeScript",
    companyName: "WebCorp",
    description: "Recherche stagiaire Next.js et TypeScript.",
    type: "STAGE",
  };

  const draft = generateDeterministicDraft(candidateWithProject, opp);

  // Must NOT contain colon syntax like ': Intelligent E-commerce Analytics Platform'
  assert.equal(
    draft.body.includes("Ecom Doctor (Next.js, TypeScript):"),
    false,
    "Must NOT contain raw colon after project title/technologies"
  );
  assert.equal(
    draft.body.includes(": Intelligent E-commerce Analytics Platform"),
    false,
    "Must NOT contain awkward English colon construction"
  );

  // Must contain natural French apposition with comma
  assert.ok(
    draft.body.includes("Ecom Doctor (Next.js, TypeScript), une plateforme d'analyse e-commerce intelligente"),
    "Must format project with natural French prose and comma"
  );
});

test("Regression: project sentence composition does not repeat 'développé' or produce redundant wording (MN Cosmetics Website)", () => {
  // Candidate with the exact project and description from the user prompt
  const candidateWithMNCosmetics: CandidateData = {
    first_name: "Nour",
    last_name: "Ben Salem",
    school: "Esprit School of Business",
    degree: "Licence en Informatique de Gestion",
    specialty: "Business Information Systems",
    skills: ["Docker", "Next.js", "TypeScript"],
    projects: [
      {
        title: "MN Cosmetics Website",
        technologies: ["Docker"],
        description: "Développé en équipe une application e-commerce responsive, conteneurisée avec Docker.",
      },
    ],
  };

  const opp: OpportunityData = {
    title: "Stagiaire Développeur Web / DevOps",
    companyName: "CosmeticLab",
    description: "Recherche d'un stagiaire pour maintenir nos plateformes avec Docker.",
    type: "STAGE",
  };

  const draft = generateDeterministicDraft(candidateWithMNCosmetics, opp);

  // 1. Must NOT contain the repetitive "développé le projet ..., développé en équipe" wording
  assert.equal(
    draft.body.includes("développé le projet MN Cosmetics Website (Docker), développé en équipe"),
    false,
    "Must NOT repeat 'développé' immediately after the project title and comma"
  );
  assert.equal(
    draft.body.includes("développé en équipe une application"),
    false,
    "Must NOT retain the redundant action verb in appositive description"
  );

  // 2. Must use clean, natural French apposition with comma
  assert.ok(
    draft.body.includes("MN Cosmetics Website (Docker), une application e-commerce responsive, conteneurisée avec Docker"),
    "Must compose a clean, fluent French apposition sentence without verb repetition"
  );

  // 3. Must remain strictly grounded in CV/profile facts
  assert.ok(draft.body.includes("MN Cosmetics Website"), "Must mention verified project title");
  assert.ok(draft.body.includes("Docker"), "Must mention verified technology Docker");
  assert.ok(draft.body.includes("application e-commerce responsive"), "Must mention verified project feature");

  // 4. Test direct formatNaturalProjectDescription helper behavior
  const naturalDesc = formatNaturalProjectDescription(
    "MN Cosmetics Website",
    "Développé en équipe une application e-commerce responsive, conteneurisée avec Docker."
  );
  assert.equal(
    naturalDesc,
    ", une application e-commerce responsive, conteneurisée avec Docker",
    "Helper must strip redundant action verb and return natural French noun apposition"
  );

  // 5. Test another verb variant ("Conçu en binôme...")
  const naturalDescConcu = formatNaturalProjectDescription(
    "Tableau de Bord RH",
    "Conçu en binôme un tableau de bord analytique pour le suivi RH."
  );
  assert.equal(
    naturalDescConcu,
    ", un tableau de bord analytique pour le suivi RH",
    "Helper must strip 'Conçu en binôme' and return natural French noun apposition"
  );
});




