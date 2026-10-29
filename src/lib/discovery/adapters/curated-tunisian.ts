import { BaseDiscoveryProvider } from "./base.ts";
import type { DiscoveryLead } from "../types.ts";

/**
 * Curated Tunisian Tech Provider (Demo & Academic Simulation).
 *
 * Provides realistic, representative career opportunity models from technology employers
 * established in Tunisian tech hubs (El Ghazala, Charguia, Berges du Lac, Centre Urbain Nord, Sousse).
 * Tailored for students and graduates in Informatique de Gestion (BIS), BI, Web Development, and Software Engineering.
 *
 * NOTE: These opportunities are explicitly tagged [DEMO] and isolated in the simulation catalog
 * so they never leak into the real live opportunity discovery feed.
 */
export class CuratedTunisianProvider extends BaseDiscoveryProvider {
  public readonly id = "curated_tunisia_live";
  public readonly name = "Catalogue Tunisien Démo (Simulation Ciblée)";
  public readonly rateLimitPerMinute = 60;

  public async discoverLeads(): Promise<DiscoveryLead[]> {
    return [
      {
        title: "[DEMO] PFE : Plateforme SaaS Modulaire (Next.js & TypeScript)",
        companyName: "Sofrecom Tunisie",
        companyWebsite: "https://www.sofrecom.com",
        location: "Technopole El Ghazala, Ariana, Tunisie",
        sourceUrl: "https://www.sofrecom.com/carrieres/pfe-2025-nextjs-demo",
        sourceProvider: this.id,
        type: "PFE",
        domain: "Web Development",
        snippet: "Conception et réalisation d'une plateforme SaaS modulaire orientée micro-frontends avec Next.js 15, React 19, TypeScript, PostgreSQL et Tailwind CSS.",
        datePosted: null,
        rawPayload: {
          isDemo: true,
          contactEmail: "recrutement.tunisie@sofrecom-demo.tn",
          validThrough: null,
          companySector: "Télécommunications & IT",
          applicationUrl: "https://www.sofrecom.com/carrieres/pfe-2025-nextjs-demo",
        },
      },
      {
        title: "[DEMO] PFE : Business Intelligence & Reporting Décisionnel (BIS)",
        companyName: "Vermeg Tunisie",
        companyWebsite: "https://www.vermeg.com",
        location: "Les Berges du Lac, Tunis, Tunisie",
        sourceUrl: "https://www.vermeg.com/careers/pfe-bi-analytics-2025-demo",
        sourceProvider: this.id,
        type: "PFE",
        domain: "Business Information Systems & BI",
        snippet: "Conception d'un entrepôt de données et de tableaux de bord analytiques pour le suivi des transactions financières. Modélisation dimensionnelle SQL, flux ETL/ELT avec Python et PowerBI.",
        datePosted: null,
        rawPayload: {
          isDemo: true,
          contactEmail: "careers-tn@vermeg-demo.tn",
          validThrough: null,
          companySector: "Édition de Logiciels Financiers",
          applicationUrl: "https://www.vermeg.com/careers/pfe-bi-analytics-2025-demo",
        },
      },
      {
        title: "[DEMO] Stage d'été : Développeur Web Frontend (React & TypeScript)",
        companyName: "Expensya / Medius",
        companyWebsite: "https://www.expensya.com",
        location: "Centre Urbain Nord, Tunis, Tunisie",
        sourceUrl: "https://www.expensya.com/careers/summer-internship-frontend-demo",
        sourceProvider: this.id,
        type: "STAGE",
        domain: "Frontend Engineering",
        snippet: "Stage pratique au sein de l'équipe frontend d'Expensya. Développement de composants UI réactifs en React, TypeScript et Tailwind CSS avec tests automatisés.",
        datePosted: null,
        rawPayload: {
          isDemo: true,
          contactEmail: "jobs@expensya-demo.tn",
          validThrough: null,
          companySector: "Fintech & Gestion des Dépenses",
          applicationUrl: "https://www.expensya.com/careers/summer-internship-frontend-demo",
        },
      },
      {
        title: "[DEMO] Stage d'été : Développement Backend & API REST (Node.js & SQL)",
        companyName: "Wevioo",
        companyWebsite: "https://www.wevioo.com",
        location: "Pôle Technologique El Ghazala, Ariana, Tunisie",
        sourceUrl: "https://www.wevioo.com/carrieres/stage-ete-backend-nodejs-demo",
        sourceProvider: this.id,
        type: "STAGE",
        domain: "Backend Engineering",
        snippet: "Conception d'APIs RESTful avec Node.js, Express, TypeScript et PostgreSQL. Structuration des requêtes SQL et documentation OpenAPI.",
        datePosted: null,
        rawPayload: {
          isDemo: true,
          contactEmail: "rh@wevioo-demo.tn",
          validThrough: null,
          companySector: "Conseil & Intégration Numérique",
          applicationUrl: "https://www.wevioo.com/carrieres/stage-ete-backend-nodejs-demo",
        },
      },
      {
        title: "[DEMO] Emploi Junior : Développeur Fullstack (Next.js & Node.js)",
        companyName: "Actia Tunisie",
        companyWebsite: "https://www.actia.com",
        location: "Technopole Charguia II, Tunis, Tunisie",
        sourceUrl: "https://www.actia.com/carrieres/junior-fullstack-dev-tunis-demo",
        sourceProvider: this.id,
        type: "JUNIOR",
        domain: "Fullstack Development",
        snippet: "Poste junior pour jeune diplômé en informatique (Licence ou Master). Développement d'applications web de télématique avec React, Next.js, Node.js et PostgreSQL.",
        datePosted: null,
        rawPayload: {
          isDemo: true,
          contactEmail: "recrutement@actia-demo.tn",
          validThrough: null,
          companySector: "Systèmes Électroniques & Télématique",
          applicationUrl: "https://www.actia.com/carrieres/junior-fullstack-dev-tunis-demo",
        },
      },
      {
        title: "[DEMO] PFE : Assistant IA & Recherche Sémantique (NLP / RAG)",
        companyName: "InstaDeep",
        companyWebsite: "https://www.instadeep.com",
        location: "Tunis, Tunisie (Hybride)",
        sourceUrl: "https://www.instadeep.com/careers/pfe-ai-rag-tunis-demo",
        sourceProvider: this.id,
        type: "PFE",
        domain: "Artificial Intelligence",
        snippet: "Conception d'un agent conversationnel doté d'architecture RAG pour l'exploration de bases documentaires techniques. Python, bases vectorielles et conteneurs Docker.",
        datePosted: null,
        rawPayload: {
          isDemo: true,
          contactEmail: "careers@instadeep-demo.tn",
          validThrough: null,
          companySector: "Intelligence Artificielle & Deep Learning",
          applicationUrl: "https://www.instadeep.com/careers/pfe-ai-rag-tunis-demo",
        },
      },
      {
        title: "[DEMO] Emploi Junior : Consultant Systèmes d'Information & ERP",
        companyName: "Focus Tunisie",
        companyWebsite: "https://www.focus-corporation.com",
        location: "Les Berges du Lac 2, Tunis, Tunisie",
        sourceUrl: "https://www.focus-corporation.com/carrieres/junior-bis-consultant-demo",
        sourceProvider: this.id,
        type: "JUNIOR",
        domain: "Business Information Systems",
        snippet: "Poste junior idéal pour diplômé en Informatique de Gestion (Business Information Systems). Paramétrage et intégration d'ERP/CRM, modélisation SQL et support décisionnel.",
        datePosted: null,
        rawPayload: {
          isDemo: true,
          contactEmail: "recrutement@focus-corporation-demo.tn",
          validThrough: null,
          companySector: "Services Informatiques & Intégration",
          applicationUrl: "https://www.focus-corporation.com/carrieres/junior-bis-consultant-demo",
        },
      },
      {
        title: "[DEMO] Stage d'été : Développement Web & Responsive UI (React)",
        companyName: "Cynapsys",
        companyWebsite: "https://www.cynapsys.de",
        location: "Les Berges du Lac 1, Tunis, Tunisie",
        sourceUrl: "https://www.cynapsys.de/careers/summer-react-tunis-demo",
        sourceProvider: this.id,
        type: "STAGE",
        domain: "Web Development",
        snippet: "Stage d'immersion de 2 mois pour étudiants en informatique. Développement d'interfaces dynamiques et responsives avec React, TypeScript et CSS moderne.",
        datePosted: null,
        rawPayload: {
          isDemo: true,
          contactEmail: "jobs@cynapsys-demo.tn",
          validThrough: null,
          companySector: "Ingénierie Logicielle & Conseil IT",
          applicationUrl: "https://www.cynapsys.de/careers/summer-react-tunis-demo",
        },
      },
      {
        title: "[DEMO] PFE : Automatisation Cloud & CI/CD (Docker & Kubernetes)",
        companyName: "Telnet Tunisie",
        companyWebsite: "https://www.groupe-telnet.com",
        location: "Technopole El Ghazala, Ariana, Tunisie",
        sourceUrl: "https://www.groupe-telnet.com/carrieres/pfe-cloud-devops-demo",
        sourceProvider: this.id,
        type: "PFE",
        domain: "Cloud & DevOps",
        snippet: "Conception d'une chaîne CI/CD sécurisée pour le déploiement continu de microservices. Pipelines GitHub Actions, conteneurisation Docker et orchestration Kubernetes.",
        datePosted: null,
        rawPayload: {
          isDemo: true,
          contactEmail: "recrutement@groupe-telnet-demo.tn",
          validThrough: null,
          companySector: "Ingénierie & Technologies Avancées",
          applicationUrl: "https://www.groupe-telnet.com/carrieres/pfe-cloud-devops-demo",
        },
      },
      {
        title: "[DEMO] Emploi Junior : Développeur Web (PHP / Symfony & React)",
        companyName: "Vistaprint Tunisie",
        companyWebsite: "https://www.vistaprint.com",
        location: "Sousse, Tunisie",
        sourceUrl: "https://careers.cimpress.com/job/junior-web-developer-sousse-demo",
        sourceProvider: this.id,
        type: "JUNIOR",
        domain: "Web Development",
        snippet: "Développeur web junior au sein de l'équipe e-commerce de Sousse. Évolution et maintenance d'applications web scalables avec PHP (Symfony), PostgreSQL et React.",
        datePosted: null,
        rawPayload: {
          isDemo: true,
          contactEmail: "sousse-careers@vistaprint-demo.tn",
          validThrough: null,
          companySector: "E-Commerce & Impression Personnalisée",
          applicationUrl: "https://careers.cimpress.com/job/junior-web-developer-sousse-demo",
        },
      },
    ];
  }
}
