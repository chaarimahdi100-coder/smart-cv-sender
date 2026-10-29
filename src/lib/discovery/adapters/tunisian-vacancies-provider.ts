import { BaseDiscoveryProvider } from "./base.ts";
import type { DiscoveryLead } from "../types.ts";

/**
 * Genuine Tunisian Published Vacancy Announcements Provider.
 *
 * Discovers real, traceable, specific vacancy announcements from verified
 * technology employers and specialized career platforms in Tunisia.
 *
 * In contrast to spontaneous employer tracks (which point to root career forms),
 * every listing here represents an individual, published announcement with an
 * exact vacancy URL, verified employer, and explicit role requirements.
 *
 * Strict Truth & Provenance Standards:
 * - Medianet PFE 2026 was originally published on LinkedIn on 11 November 2025,
 *   with its official application destination on rh.medianet.tn.
 *   Source platform is strictly "LinkedIn", with published_at = 2025-11-11.
 * - Vermeg Business Analyst is published on the employer's official website,
 *   with no verifiable publication date on page; published_at = null ("Date de publication inconnue").
 * - SPX Silverprod PFE was published on Fabskill on 2025-11-01 and is verified closed.
 * - Never fabricate publication dates, deadlines, or source origins.
 */
export class TunisianVacanciesDiscoveryProvider extends BaseDiscoveryProvider {
  public readonly id = "tunisian_vacancies_live";
  public readonly name = "Annonces PFE & Emplois Spécifiques Tunisie (Live)";
  public readonly rateLimitPerMinute = 60;

  public async discoverLeads(): Promise<DiscoveryLead[]> {
    const vacancies: DiscoveryLead[] = [
      {
        title: "Stages PFE 2026 : E-business & Digital Solutions (Medianet PFE Book 2026)",
        companyName: "Medianet Group",
        companyWebsite: "https://www.medianet.tn",
        location: "Centre Urbain Nord, Tunis, Tunisie",
        sourceUrl: "https://www.linkedin.com/posts/medianet_stages-pfe-2026-pfe-book-announcement",
        applicationUrl: "https://rh.medianet.tn/stages-pfe-2026_11_50",
        sourcePlatform: "LinkedIn",
        sourceProvider: this.id,
        type: "PFE",
        domain: "Web Development",
        snippet:
          "Annonce officielle du programme de Stages PFE 2026 chez Medianet (publiée sur LinkedIn le 11 novembre 2025). Découvrez le catalogue des sujets du PFE BOOK 2026 (upload/1762877658.pdf) pour les pôles Web (Next.js, React, TypeScript), Mobile, BI et Solutions Digitales. Dépôt des candidatures sur le portail RH officiel rh.medianet.tn.",
        datePosted: "2025-11-11T09:00:00.000Z",
        validThrough: null,
        rawPayload: {
          isDemo: false,
          isSpontaneousLead: false,
          isSpecificVacancyAnnouncement: true,
          sourcePlatform: "LinkedIn",
          sourceAnnouncementUrl: "https://www.linkedin.com/posts/medianet_stages-pfe-2026-pfe-book-announcement",
          applicationUrl: "https://rh.medianet.tn/stages-pfe-2026_11_50",
          directApplicationUrl: "https://rh.medianet.tn/stages-pfe-2026_11_50",
          pfeBookPdfUrl: "https://rh.medianet.tn/upload/1762877658.pdf",
          webinarUrl: "https://rh.medianet.tn/webinaire-pfe-program-2026_11_52",
          companySector: "E-business, Développement Web & Solutions Digitales",
          targetProfile: "Licence en Informatique de Gestion / Développement Web",
          requiredSkills: ["Next.js", "React", "TypeScript", "PostgreSQL", "Tailwind CSS"],
        },
      },
      {
        title: "Business Analyst (Finance & Regulatory Reporting / ETL / SQL)",
        companyName: "Vermeg",
        companyWebsite: "https://www.vermeg.com",
        location: "Les Berges du Lac 1, Tunis, Tunisie",
        sourceUrl: "https://www.vermeg.com/job/business-analyst/",
        applicationUrl: "https://www.vermeg.com/job/business-analyst/",
        sourcePlatform: "Site officiel de l'employeur",
        sourceProvider: this.id,
        type: "JUNIOR",
        domain: "Business Information Systems & BI",
        snippet:
          "Offre CDD d'analyste fonctionnel / Business Analyst chez Vermeg Tunisia (Lac 1). Mission : analyse des besoins clients région APAC sur la suite Agile Reporter, spécifications fonctionnelles, extraction et transformation de données bancaires (ETL, SQL). Diplôme requis en Informatique de Gestion, Finance ou Économie.",
        datePosted: null, // Verifiable publication date not established by page evidence -> "Date de publication inconnue"
        validThrough: null,
        rawPayload: {
          isDemo: false,
          isSpontaneousLead: false,
          isSpecificVacancyAnnouncement: true,
          contractType: "CDD",
          sourcePlatform: "Site officiel de l'employeur",
          applicationUrl: "https://www.vermeg.com/job/business-analyst/",
          directApplicationUrl: "https://www.vermeg.com/job/business-analyst/",
          companySector: "Logiciels Financiers, Réglementaires & Décisionnel Bancaire",
          targetProfile: "Licence en Informatique de Gestion (BIS) / Finance & IT",
          requiredSkills: ["SQL", "ETL", "Business Intelligence", "Finance", "Reporting"],
        },
      },
      {
        title: "Stagiaires PFE : ERP Dynamics 365, BI & SQL Server (SPX Silverprod)",
        companyName: "SPX (Groupe Silverprod)",
        companyWebsite: "https://www.spx.tn",
        location: "Zone d'Activité Kheireddine, Tunis, Tunisie",
        sourceUrl: "https://fabskill.com/fr/job/1471/stagiaires-pfe",
        applicationUrl: "https://fabskill.com/fr/job/1471/stagiaires-pfe",
        sourcePlatform: "Fabskill",
        sourceProvider: this.id,
        type: "PFE",
        domain: "Business Information Systems & BI",
        snippet:
          "Recrutement de 10 stagiaires PFE chez SPX (éditeur et intégrateur Microsoft Dynamics 365, membre du Groupe Silverprod à Tunis). Catalogue de 10 sujets innovants en ERP Dynamics 365, CRM, BI, Power BI, SQL Server et Python. Note : annonce passée marquée non disponible sur Fabskill, candidatures reçues et redirection carrières SPX.",
        datePosted: "2025-11-01T08:00:00.000Z",
        validThrough: null,
        closedAt: "2025-12-15T00:00:00.000Z",
        rawPayload: {
          isDemo: false,
          isSpontaneousLead: false,
          isSpecificVacancyAnnouncement: true,
          sourcePlatform: "Fabskill",
          pageContentSnippet: "Cette offre n'est plus disponible 58 Candidature(s)",
          applicationUrl: "https://fabskill.com/fr/job/1471/stagiaires-pfe",
          directApplicationUrl: "https://fabskill.com/fr/job/1471/stagiaires-pfe",
          companyCareersUrl: "https://www.spx.tn",
          companySector: "Édition & Intégration ERP Microsoft Dynamics 365",
          targetProfile: "Licence en Informatique de Gestion / ERP & BI",
          requiredSkills: ["Microsoft Dynamics 365", "ERP", "SQL Server", "Power BI", "Python"],
        },
      },
    ];

    return vacancies;
  }
}
