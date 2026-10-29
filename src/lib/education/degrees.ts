export interface DegreeQualification {
  id: string;
  name: string;
  category:
    | "Engineering & Grandes Écoles"
    | "Master & Postgraduate"
    | "Bachelor & Licence"
    | "Short Cycle & Vocational (Bac+2)"
    | "Doctorate & PhD"
    | "Executive & Business"
    | "Other";
  level: string; // e.g., "Bac+5", "Bac+3", "Bac+2", "Bac+8"
  aliases: string[];
}

export const DEGREE_QUALIFICATIONS: DegreeQualification[] = [
  // --- Engineering Degrees (Cycle Ingénieur / Bac+5) ---
  {
    id: "ing-diplome",
    name: "Diplôme d'ingénieur (National Engineering Degree)",
    category: "Engineering & Grandes Écoles",
    level: "Bac+5",
    aliases: [
      "Diplôme d'Ingénieur",
      "Diplôme National d'Ingénieur",
      "Engineering Degree",
      "Cycle Ingénieur",
      "Ingénieur d'État",
    ],
  },
  {
    id: "ing-specialise",
    name: "Mastère Spécialisé (MS / Post-Master)",
    category: "Engineering & Grandes Écoles",
    level: "Bac+6",
    aliases: ["Mastere Specialise", "MS", "Post-Master", "CGE"],
  },
  {
    id: "cpge",
    name: "CPGE - Classes Préparatoires aux Grandes Écoles",
    category: "Engineering & Grandes Écoles",
    level: "Bac+2",
    aliases: ["Classes Préparatoires", "Prépa", "Cycle Préparatoire Intégré"],
  },

  // --- Master & Postgraduate (Bac+5) ---
  {
    id: "master-pro",
    name: "Master Professionnel (MPro)",
    category: "Master & Postgraduate",
    level: "Bac+5",
    aliases: ["Master Professionnel", "MPro", "Master Pro", "M2 Pro"],
  },
  {
    id: "master-recherche",
    name: "Master de Recherche (MSc / MR)",
    category: "Master & Postgraduate",
    level: "Bac+5",
    aliases: ["Master de Recherche", "Master Recherche", "M2 Recherche", "Master thesis"],
  },
  {
    id: "master-science",
    name: "Master of Science (M.Sc.)",
    category: "Master & Postgraduate",
    level: "Bac+5",
    aliases: ["MSc", "M.Sc.", "Master of Science", "Master's Degree"],
  },
  {
    id: "master-arts",
    name: "Master of Arts (M.A.)",
    category: "Master & Postgraduate",
    level: "Bac+5",
    aliases: ["MA", "M.A.", "Master of Arts"],
  },
  {
    id: "mastere-univ",
    name: "Mastère Professionnel en Ingénierie",
    category: "Master & Postgraduate",
    level: "Bac+5",
    aliases: ["Mastère", "Mastere", "CMI"],
  },

  // --- Bachelor & Licence (Bac+3 / Bac+4) ---
  {
    id: "licence-informatique-gestion",
    name: "Licence en Informatique de Gestion (Business Information Systems)",
    category: "Bachelor & Licence",
    level: "Bac+3",
    aliases: [
      "Licence en Informatique de Gestion",
      "Informatique de Gestion",
      "Business Information Systems",
      "LIG",
      "BIS",
    ],
  },
  {
    id: "licence-appliquee",
    name: "Licence Appliquée (LA)",
    category: "Bachelor & Licence",
    level: "Bac+3",
    aliases: ["Licence Appliquee", "LA", "Licence Pro"],
  },
  {
    id: "licence-fondamentale",
    name: "Licence Fondamentale (LF)",
    category: "Bachelor & Licence",
    level: "Bac+3",
    aliases: ["Licence Fondamentale", "LF", "Licence Générale"],
  },
  {
    id: "bachelor-degree",
    name: "Bachelor's Degree (Honours)",
    category: "Bachelor & Licence",
    level: "Bac+3/4",
    aliases: ["Bachelor", "Bachelors Degree", "Bachelor of Science", "B.Sc.", "BSc"],
  },
  {
    id: "bachelor-engineering",
    name: "Bachelor of Engineering (B.Eng.)",
    category: "Bachelor & Licence",
    level: "Bac+3/4",
    aliases: ["B.Eng.", "BEng", "Bachelor of Engineering"],
  },
  {
    id: "bachelor-arts",
    name: "Bachelor of Arts (B.A.)",
    category: "Bachelor & Licence",
    level: "Bac+3",
    aliases: ["B.A.", "BA", "Bachelor of Arts"],
  },
  {
    id: "bachelor-tech-but",
    name: "BUT - Bachelor Universitaire de Technologie",
    category: "Bachelor & Licence",
    level: "Bac+3",
    aliases: ["BUT", "Bachelor Universitaire de Technologie", "IUT BUT"],
  },

  // --- Short Cycle & Vocational (Bac+2) ---
  {
    id: "bts",
    name: "BTS - Brevet de Technicien Supérieur",
    category: "Short Cycle & Vocational (Bac+2)",
    level: "Bac+2",
    aliases: ["BTS", "Brevet de Technicien Superieur"],
  },
  {
    id: "dut",
    name: "DUT - Diplôme Universitaire de Technologie",
    category: "Short Cycle & Vocational (Bac+2)",
    level: "Bac+2",
    aliases: ["DUT", "Diplome Universitaire de Technologie", "IUT"],
  },
  {
    id: "deug",
    name: "DEUG / DEUST - Diplôme d'Études Universitaires",
    category: "Short Cycle & Vocational (Bac+2)",
    level: "Bac+2",
    aliases: ["DEUG", "DEUST", "Bac+2 Universitaire"],
  },

  // --- Executive & Business ---
  {
    id: "mba",
    name: "MBA - Master of Business Administration",
    category: "Executive & Business",
    level: "Postgraduate",
    aliases: ["MBA", "Master of Business Administration", "Executive MBA", "EMBA"],
  },
  {
    id: "pge-commerce",
    name: "Programme Grande École de Management",
    category: "Executive & Business",
    level: "Bac+5",
    aliases: ["PGE", "Master in Management", "MiM", "École de Commerce"],
  },

  // --- Doctorate & PhD (Bac+8) ---
  {
    id: "phd-doctorat",
    name: "Doctorat / PhD (Doctor of Philosophy)",
    category: "Doctorate & PhD",
    level: "Bac+8",
    aliases: ["Doctorat", "PhD", "Ph.D.", "Thèse de doctorat", "Doctorate"],
  },
  {
    id: "postdoc",
    name: "Post-Doctorat (Postdoctoral Fellowship)",
    category: "Doctorate & PhD",
    level: "Post-doc",
    aliases: ["Post-Doctorat", "Postdoc", "Post-doc"],
  },
];

/**
 * Filter degree qualifications matching name, category, level, or aliases.
 */
export function searchDegrees(query: string, limit = 20): DegreeQualification[] {
  const q = query.trim().toLowerCase();
  if (!q) return DEGREE_QUALIFICATIONS.slice(0, limit);

  return DEGREE_QUALIFICATIONS.filter((d) => {
    if (d.name.toLowerCase().includes(q)) return true;
    if (d.category.toLowerCase().includes(q)) return true;
    if (d.level.toLowerCase().includes(q)) return true;
    if (d.aliases.some((a) => a.toLowerCase().includes(q))) return true;
    return false;
  }).slice(0, limit);
}
