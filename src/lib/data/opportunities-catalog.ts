/**
 * Curated, typed catalog of tech opportunities in Tunisia.
 * Covers PFE, summer internships, and junior developer positions
 * with emphasis on Business Information Systems (Informatique de Gestion),
 * Web Development (React / Next.js / TypeScript), Databases, BI, and AI.
 *
 * Each listing is explicitly classified as either:
 * - "verified_live": Active vacancy verified from an official employer source.
 * - "illustrative_demo": High-fidelity illustrative vacancy created for training and simulation.
 */

export type OpportunityCategory = "PFE" | "STAGE" | "JUNIOR";
export type ListingKind = "verified_live" | "illustrative_demo";

export interface CatalogOpportunity {
  /** Unique stable slug used for idempotent seeding and duplicate prevention */
  slug: string;
  title: string;
  companyName: string;
  companySector: string;
  companyWebsite: string;
  location: string;
  type: OpportunityCategory;
  domain: string;
  description: string;
  requiredSkills: string[];
  contactEmail: string;
  sourceUrl: string;
  listingKind: ListingKind;
  isDemo: boolean;
  verifiedAt?: string;
}

export const TUNISIAN_OPPORTUNITIES_CATALOG: CatalogOpportunity[] = [
  {
    slug: "sofrecom-pfe-fullstack-nextjs-2025",
    title: "[DEMO] PFE : Plateforme SaaS Modulaire (Next.js & TypeScript)",
    companyName: "Sofrecom Tunisie",
    companySector: "Télécommunications & IT",
    companyWebsite: "https://www.sofrecom.com",
    location: "Technopole El Ghazala, Ariana, Tunisie",
    type: "PFE",
    domain: "Web Development",
    description:
      "Conception et réalisation d'une plateforme SaaS modulaire orientée micro-frontends. Stack technologique : Next.js 15, React 19, TypeScript, PostgreSQL et Tailwind CSS. Intégration de pipelines CI/CD et conteneurisation Docker. Encadrement par des ingénieurs seniors au sein de l'équipe Digital Solutions.",
    requiredSkills: ["Next.js", "React", "TypeScript", "PostgreSQL", "Tailwind CSS", "Docker", "Git"],
    contactEmail: "recrutement.pfe@sofrecom-demo.tn",
    sourceUrl: "https://demo.sofrecom.tn/pfe-2025/fullstack-nextjs",
    listingKind: "illustrative_demo",
    isDemo: true,
  },
  {
    slug: "vermeg-pfe-bi-data-analytics-2025",
    title: "[DEMO] PFE : Business Intelligence & Reporting Décisionnel (BIS)",
    companyName: "Vermeg Tunisie",
    companySector: "Édition de Logiciels Financiers",
    companyWebsite: "https://www.vermeg.com",
    location: "Les Berges du Lac, Tunis, Tunisie",
    type: "PFE",
    domain: "Business Information Systems & BI",
    description:
      "Conception d'un entrepôt de données et de tableaux de bord analytiques pour le suivi des transactions financières. Modélisation dimensionnelle SQL, flux ETL/ELT avec Python et visualisations PowerBI. Ce projet est particulièrement adapté aux étudiants en Informatique de Gestion (Business Information Systems).",
    requiredSkills: ["SQL", "Python", "PowerBI", "PostgreSQL", "Git"],
    contactEmail: "careers.pfe@vermeg-demo.tn",
    sourceUrl: "https://demo.vermeg.tn/pfe-2025/bi-analytics",
    listingKind: "illustrative_demo",
    isDemo: true,
  },
  {
    slug: "expensya-stage-ete-frontend-react-2025",
    title: "[DEMO] Stage d'été : Développeur Web Frontend (React & TypeScript)",
    companyName: "Expensya / Medius",
    companySector: "Fintech & Gestion des Dépenses",
    companyWebsite: "https://www.expensya.com",
    location: "Centre Urbain Nord, Tunis, Tunisie",
    type: "STAGE",
    domain: "Frontend Engineering",
    description:
      "Intégration au sein de l'équipe frontend d'Expensya pour un stage de 2 à 3 mois. Participation au développement de nouveaux composants UI accessibles et réactifs en React, TypeScript et Tailwind CSS. Écriture de tests unitaires et optimisation des performances du dashboard client.",
    requiredSkills: ["React", "TypeScript", "JavaScript", "HTML", "CSS", "Tailwind CSS", "Git"],
    contactEmail: "internships@expensya-demo.tn",
    sourceUrl: "https://demo.expensya.tn/summer-2025/frontend-react",
    listingKind: "illustrative_demo",
    isDemo: true,
  },
  {
    slug: "wevioo-stage-ete-backend-nodejs-2025",
    title: "[DEMO] Stage d'été : Développement Backend & API REST (Node.js & SQL)",
    companyName: "Wevioo",
    companySector: "Conseil & Intégration Numérique",
    companyWebsite: "https://www.wevioo.com",
    location: "Pôle Technologique El Ghazala, Ariana, Tunisie",
    type: "STAGE",
    domain: "Backend Engineering",
    description:
      "Stage pratique au pôle développement logiciel. Conception d'APIs RESTful sécurisées avec Node.js, Express, TypeScript et bases de données relationnelles PostgreSQL. Gestion de l'authentification sécurisée, structuration des requêtes SQL et documentation OpenAPI/Swagger.",
    requiredSkills: ["Node.js", "Express", "TypeScript", "PostgreSQL", "SQL", "Git"],
    contactEmail: "stages@wevioo-demo.tn",
    sourceUrl: "https://demo.wevioo.tn/summer-2025/backend-nodejs",
    listingKind: "illustrative_demo",
    isDemo: true,
  },
  {
    slug: "actia-junior-fullstack-developer-2025",
    title: "[DEMO] Emploi Junior : Développeur Fullstack (Next.js & Node.js)",
    companyName: "Actia Tunisie",
    companySector: "Électronique & Télématique Embarquée",
    companyWebsite: "https://www.actia.com",
    location: "Technopole Charguia II, Tunis, Tunisie",
    type: "JUNIOR",
    domain: "Fullstack Development",
    description:
      "Poste junior pour jeune diplômé en informatique (Licence ou Master). Développement d'applications web de supervision télématique avec React, Next.js, Node.js et bases de données PostgreSQL. Travail en méthodologie Agile Scrum avec revues de code et tests automatisés.",
    requiredSkills: ["Next.js", "React", "Node.js", "TypeScript", "PostgreSQL", "Tailwind CSS", "Docker", "Git"],
    contactEmail: "recrutement.junior@actia-demo.tn",
    sourceUrl: "https://demo.actia.tn/careers-2025/junior-fullstack",
    listingKind: "illustrative_demo",
    isDemo: true,
  },
  {
    slug: "instadeep-pfe-ai-agentic-rag-2025",
    title: "[DEMO] PFE : Assistant IA & Recherche Sémantique (NLP / RAG)",
    companyName: "InstaDeep Tunisia",
    companySector: "Intelligence Artificielle & Deep Learning",
    companyWebsite: "https://www.instadeep.com",
    location: "Tunis, Tunisie (Hybride)",
    type: "PFE",
    domain: "Artificial Intelligence",
    description:
      "Projet de fin d'études axé sur la conception d'un agent conversationnel doté d'architecture RAG (Retrieval-Augmented Generation) pour l'exploration de bases documentaires techniques. Implémentation en Python, intégration d'embeddings et de bases vectorielles, évaluation des performances et déploiement conteneurisé.",
    requiredSkills: ["Python", "Machine Learning", "Docker", "Git", "SQL"],
    contactEmail: "pfe.ai@instadeep-demo.tn",
    sourceUrl: "https://demo.instadeep.tn/pfe-2025/nlp-rag",
    listingKind: "illustrative_demo",
    isDemo: true,
  },
  {
    slug: "focus-junior-erp-bis-consultant-2025",
    title: "[DEMO] Emploi Junior : Consultant Systèmes d'Information & ERP",
    companyName: "Focus Corporation",
    companySector: "Services Numériques & IT",
    companyWebsite: "https://www.focus-corporation.com",
    location: "Les Berges du Lac 2, Tunis, Tunisie",
    type: "JUNIOR",
    domain: "Business Information Systems",
    description:
      "Poste junior idéal pour titulaire d'une formation en Informatique de Gestion (Business Information Systems). Participation au paramétrage, à l'intégration et au support d'applications de gestion d'entreprise (ERP/CRM). Modélisation de données, rédaction de requêtes SQL et accompagnement des utilisateurs métiers.",
    requiredSkills: ["SQL", "PostgreSQL", "Python", "Git"],
    contactEmail: "junior.careers@focus-demo.tn",
    sourceUrl: "https://demo.focus.tn/careers-2025/junior-bis",
    listingKind: "illustrative_demo",
    isDemo: true,
  },
  {
    slug: "cynapsys-stage-ete-web-mobile-2025",
    title: "[DEMO] Stage d'été : Développement Web & Responsive UI (React)",
    companyName: "Cynapsys Technologies",
    companySector: "Ingénierie Logicielle",
    companyWebsite: "https://www.cynapsys.de",
    location: "Les Berges du Lac 1, Tunis, Tunisie",
    type: "STAGE",
    domain: "Web Development",
    description:
      "Stage d'immersion de 2 mois pour étudiants en informatique. Développement d'interfaces utilisateurs web dynamiques et responsives avec React, JavaScript/TypeScript et CSS modern. Connexion avec des APIs REST et apprentissage des bonnes pratiques de clean code en équipe.",
    requiredSkills: ["React", "JavaScript", "HTML", "CSS", "Git"],
    contactEmail: "stages.ete@cynapsys-demo.tn",
    sourceUrl: "https://demo.cynapsys.tn/summer-2025/web-ui",
    listingKind: "illustrative_demo",
    isDemo: true,
  },
  {
    slug: "telnet-pfe-cloud-devops-automation-2025",
    title: "[DEMO] PFE : Automatisation Cloud & CI/CD (Docker & Kubernetes)",
    companyName: "Telnet Holding",
    companySector: "Ingénierie & Hautes Technologies",
    companyWebsite: "https://www.groupe-telnet.net",
    location: "Technopole El Ghazala, Ariana, Tunisie",
    type: "PFE",
    domain: "Cloud & DevOps",
    description:
      "Conception d'une chaîne CI/CD sécurisée pour le déploiement continu de microservices conteneurisés. Automatisation des builds avec GitHub Actions/GitLab CI, conteneurisation Docker, orchestration Kubernetes et monitoring d'infrastructure avec Prometheus et Grafana.",
    requiredSkills: ["Docker", "Linux", "Bash", "Python", "Git"],
    contactEmail: "pfe.devops@telnet-demo.tn",
    sourceUrl: "https://demo.telnet.tn/pfe-2025/cloud-devops",
    listingKind: "illustrative_demo",
    isDemo: true,
  },
  {
    slug: "vistaprint-junior-web-developer-sousse-2025",
    title: "[DEMO] Emploi Junior : Développeur Web (PHP / Symfony & React)",
    companyName: "Vistaprint Tunisie",
    companySector: "E-Commerce & Digital Manufacturing",
    companyWebsite: "https://www.cimpress.com",
    location: "Sousse, Tunisie",
    type: "JUNIOR",
    domain: "Web Development",
    description:
      "Développeur web junior au sein de l'équipe e-commerce de Sousse. Évolution et maintenance d'applications web scalables avec PHP (Symfony), PostgreSQL et React. Environnement international favorisant l'apprentissage continu, les revues de code rigoureuses et les tests automatisés.",
    requiredSkills: ["PHP", "Symfony", "React", "PostgreSQL", "SQL", "Git"],
    contactEmail: "sousse.careers@vistaprint-demo.tn",
    sourceUrl: "https://demo.vistaprint.tn/careers-2025/junior-sousse",
    listingKind: "illustrative_demo",
    isDemo: true,
  },
];

/**
 * Validates an opportunity payload before creation or import.
 * Rejects malformed fields, invalid emails, empty titles, or unsupported types.
 */
export function validateOpportunityPayload(data: unknown): {
  valid: boolean;
  data?: CatalogOpportunity;
  errors?: string[];
} {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Payload must be a non-null object."] };
  }

  const record = data as Record<string, unknown>;

  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title || title.length < 5 || title.length > 150) {
    errors.push("Title must be between 5 and 150 characters.");
  }

  const companyName = typeof record.companyName === "string" ? record.companyName.trim() : "";
  if (!companyName || companyName.length < 2 || companyName.length > 100) {
    errors.push("Company name must be between 2 and 100 characters.");
  }

  const rawType = typeof record.type === "string" ? record.type.trim().toUpperCase() : "";
  let normalizedType: OpportunityCategory = "JUNIOR";
  if (rawType === "PFE" || rawType === "STAGE" || rawType === "JUNIOR") {
    normalizedType = rawType as OpportunityCategory;
  } else if (rawType === "INTERNSHIP") {
    normalizedType = "STAGE";
  } else {
    errors.push("Type must be one of: PFE, STAGE (Internship), JUNIOR.");
  }

  const location = typeof record.location === "string" ? record.location.trim() : "";
  if (!location || location.length < 3) {
    errors.push("Location must be specified (e.g. 'Tunis, Tunisie').");
  }

  const description = typeof record.description === "string" ? record.description.trim() : "";
  if (!description || description.length < 20) {
    errors.push("Description must be at least 20 characters.");
  }

  const contactEmail = typeof record.contactEmail === "string" ? record.contactEmail.trim() : "";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!contactEmail || !emailRegex.test(contactEmail)) {
    errors.push("A valid contact email is required.");
  }

  const slug =
    typeof record.slug === "string" && record.slug.trim().length > 0
      ? record.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-")
      : `${companyName}-${title}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 60);

  const companySector = typeof record.companySector === "string" ? record.companySector.trim() : "Technologies";
  const companyWebsite = typeof record.companyWebsite === "string" ? record.companyWebsite.trim() : "https://example.tn";
  const domain = typeof record.domain === "string" ? record.domain.trim() : "Informatique";
  const sourceUrl = typeof record.sourceUrl === "string" && record.sourceUrl.trim().length > 0 ? record.sourceUrl.trim() : `https://example.tn/jobs/${slug}`;

  const requiredSkills: string[] = Array.isArray(record.requiredSkills)
    ? (record.requiredSkills as unknown[]).filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim())
    : [];

  const isDemo = Boolean(record.isDemo ?? (title.includes("[DEMO]") || sourceUrl.includes("demo")));
  const listingKind: ListingKind = isDemo ? "illustrative_demo" : "verified_live";
  const verifiedAt = typeof record.verifiedAt === "string" ? record.verifiedAt : undefined;

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      slug,
      title,
      companyName,
      companySector,
      companyWebsite,
      location,
      type: normalizedType,
      domain,
      description,
      requiredSkills,
      contactEmail,
      sourceUrl,
      listingKind,
      isDemo,
      verifiedAt,
    },
  };
}
