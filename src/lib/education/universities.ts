export interface University {
  name: string;
  country: string;
  countryCode?: string;
  acronym?: string;
  aliases?: string[];
  source?: "curated" | "hipolabs" | "custom";
}

export const CURATED_UNIVERSITIES: University[] = [
  // --- Tunisia (Comprehensive Higher Ed / Engineering / Business) ---
  {
    name: "INSAT - Institut National des Sciences Appliquées et de Technologie",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "INSAT",
    aliases: ["Institut National des Sciences Appliquées et de Technologie", "INSAT Tunis"],
    source: "curated",
  },
  {
    name: "ENIT - École Nationale d'Ingénieurs de Tunis",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "ENIT",
    aliases: ["Ecole Nationale d'Ingenieurs de Tunis", "ENIT Tunis", "Université de Tunis El Manar"],
    source: "curated",
  },
  {
    name: "SUP'COM - École Supérieure des Communications de Tunis",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "SUPCOM",
    aliases: ["Ecole Superieure des Communications de Tunis", "Supcom", "Université de Carthage"],
    source: "curated",
  },
  {
    name: "ESPRIT - École Supérieure Privée d'Ingénierie et de Technologies",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "ESPRIT",
    aliases: ["Ecole Superieure Privee d'Ingenierie et de Technologies", "Esprit Ingénieur"],
    source: "curated",
  },
  {
    name: "ENSI - École Nationale des Sciences de l'Informatique",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "ENSI",
    aliases: ["Ecole Nationale des Sciences de l'Informatique", "Université de la Manouba"],
    source: "curated",
  },
  {
    name: "EPT - École Polytechnique de Tunisie",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "EPT",
    aliases: ["Ecole Polytechnique de Tunisie", "Polytechnique Tunis"],
    source: "curated",
  },
  {
    name: "TBS - Tunis Business School",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "TBS",
    aliases: ["Tunis Business School", "Université de Tunis"],
    source: "curated",
  },
  {
    name: "IHEC Carthage - Institut des Hautes Études Commerciales de Carthage",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "IHEC",
    aliases: ["Institut des Hautes Etudes Commerciales de Carthage", "IHEC", "Université de Carthage"],
    source: "curated",
  },
  {
    name: "ISG Tunis - Institut Supérieur de Gestion de Tunis",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "ISG",
    aliases: ["Institut Superieur de Gestion de Tunis", "ISG Tunis", "Université de Tunis"],
    source: "curated",
  },
  {
    name: "ESSEC Tunis - École Supérieure des Sciences Économiques et Commerciales de Tunis",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "ESSEC",
    aliases: ["Ecole Superieure des Sciences Economiques et Commerciales de Tunis", "Université de Tunis"],
    source: "curated",
  },
  {
    name: "FST - Faculté des Sciences de Tunis",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "FST",
    aliases: ["Faculte des Sciences de Tunis", "FST El Manar", "Université de Tunis El Manar"],
    source: "curated",
  },
  {
    name: "ISI - Institut Supérieur d'Informatique",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "ISI",
    aliases: ["Institut Superieur d'Informatique", "ISI Ariana", "Université de Tunis El Manar"],
    source: "curated",
  },
  {
    name: "ENIS - École Nationale d'Ingénieurs de Sfax",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "ENIS",
    aliases: ["Ecole Nationale d'Ingenieurs de Sfax", "Université de Sfax"],
    source: "curated",
  },
  {
    name: "ENIM - École Nationale d'Ingénieurs de Monastir",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "ENIM",
    aliases: ["Ecole Nationale d'Ingenieurs de Monastir", "Université de Monastir"],
    source: "curated",
  },
  {
    name: "ENISO - École Nationale d'Ingénieurs de Sousse",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "ENISO",
    aliases: ["Ecole Nationale d'Ingenieurs de Sousse", "Université de Sousse"],
    source: "curated",
  },
  {
    name: "ENICarthage - École Nationale d'Ingénieurs de Carthage",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "ENICAR",
    aliases: ["Ecole Nationale d'Ingenieurs de Carthage", "ENICAR", "Université de Carthage"],
    source: "curated",
  },
  {
    name: "Université de Tunis El Manar",
    country: "Tunisia",
    countryCode: "TN",
    aliases: ["UTM", "Tunis El Manar"],
    source: "curated",
  },
  {
    name: "Université de Carthage",
    country: "Tunisia",
    countryCode: "TN",
    aliases: ["UCAR", "Carthage University"],
    source: "curated",
  },
  {
    name: "Université de Tunis",
    country: "Tunisia",
    countryCode: "TN",
    aliases: ["UTunis"],
    source: "curated",
  },
  {
    name: "Université de la Manouba",
    country: "Tunisia",
    countryCode: "TN",
    aliases: ["UMA", "Manouba University"],
    source: "curated",
  },
  {
    name: "Université de Sousse",
    country: "Tunisia",
    countryCode: "TN",
    aliases: ["Sousse University"],
    source: "curated",
  },
  {
    name: "Université de Sfax",
    country: "Tunisia",
    countryCode: "TN",
    aliases: ["Sfax University"],
    source: "curated",
  },
  {
    name: "Université de Monastir",
    country: "Tunisia",
    countryCode: "TN",
    aliases: ["Monastir University"],
    source: "curated",
  },
  {
    name: "Université Centrale",
    country: "Tunisia",
    countryCode: "TN",
    aliases: ["Honoris United Universities", "UC Tunis"],
    source: "curated",
  },
  {
    name: "SESAME University",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "SESAME",
    aliases: ["Sesame Institute", "Sesame IT"],
    source: "curated",
  },
  {
    name: "Polytech Intl (Polytechnique Internationale)",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "PI",
    aliases: ["Polytech Internationale Tunis", "Polytech Intl"],
    source: "curated",
  },
  {
    name: "ISAMM - Institut Supérieur des Arts Multimédia de la Manouba",
    country: "Tunisia",
    countryCode: "TN",
    acronym: "ISAMM",
    aliases: ["Institut Superieur des Arts Multimedia de la Manouba"],
    source: "curated",
  },

  // --- Europe & International ---
  {
    name: "Sorbonne Université",
    country: "France",
    countryCode: "FR",
    aliases: ["Sorbonne University", "Paris Sorbonne", "UPMC"],
    source: "curated",
  },
  {
    name: "École Polytechnique (Institut Polytechnique de Paris)",
    country: "France",
    countryCode: "FR",
    acronym: "X",
    aliases: ["Polytechnique Paris", "l'X", "IP Paris"],
    source: "curated",
  },
  {
    name: "CentraleSupélec",
    country: "France",
    countryCode: "FR",
    aliases: ["Centrale Paris", "Supélec", "Université Paris-Saclay"],
    source: "curated",
  },
  {
    name: "Télécom Paris",
    country: "France",
    countryCode: "FR",
    aliases: ["Telecom Paris", "ENST", "IP Paris"],
    source: "curated",
  },
  {
    name: "Université Paris-Saclay",
    country: "France",
    countryCode: "FR",
    aliases: ["Paris-Saclay", "Saclay University"],
    source: "curated",
  },
  {
    name: "Université Paris Dauphine - PSL",
    country: "France",
    countryCode: "FR",
    acronym: "Dauphine",
    aliases: ["Paris Dauphine", "PSL University"],
    source: "curated",
  },
  {
    name: "EPFL - École Polytechnique Fédérale de Lausanne",
    country: "Switzerland",
    countryCode: "CH",
    acronym: "EPFL",
    aliases: ["Ecole Polytechnique Federale de Lausanne", "EPFL Lausanne"],
    source: "curated",
  },
  {
    name: "ETH Zurich - Swiss Federal Institute of Technology",
    country: "Switzerland",
    countryCode: "CH",
    acronym: "ETH",
    aliases: ["ETH Zuerich", "Swiss Federal Institute of Technology"],
    source: "curated",
  },
  {
    name: "Technical University of Munich (TUM)",
    country: "Germany",
    countryCode: "DE",
    acronym: "TUM",
    aliases: ["Technische Universität München", "TU Munich"],
    source: "curated",
  },
  {
    name: "RWTH Aachen University",
    country: "Germany",
    countryCode: "DE",
    acronym: "RWTH",
    aliases: ["Rheinisch-Westfälische Technische Hochschule Aachen"],
    source: "curated",
  },
  {
    name: "University of Oxford",
    country: "United Kingdom",
    countryCode: "GB",
    aliases: ["Oxford University"],
    source: "curated",
  },
  {
    name: "University of Cambridge",
    country: "United Kingdom",
    countryCode: "GB",
    aliases: ["Cambridge University"],
    source: "curated",
  },
  {
    name: "Imperial College London",
    country: "United Kingdom",
    countryCode: "GB",
    aliases: ["Imperial College"],
    source: "curated",
  },
  {
    name: "Massachusetts Institute of Technology (MIT)",
    country: "United States",
    countryCode: "US",
    acronym: "MIT",
    aliases: ["MIT"],
    source: "curated",
  },
  {
    name: "Stanford University",
    country: "United States",
    countryCode: "US",
    aliases: ["Stanford"],
    source: "curated",
  },
  {
    name: "Harvard University",
    country: "United States",
    countryCode: "US",
    aliases: ["Harvard"],
    source: "curated",
  },
  {
    name: "University of Toronto",
    country: "Canada",
    countryCode: "CA",
    acronym: "UofT",
    aliases: ["U of T", "Toronto University"],
    source: "curated",
  },
  {
    name: "McGill University",
    country: "Canada",
    countryCode: "CA",
    aliases: ["McGill Montreal"],
    source: "curated",
  },
  {
    name: "KU Leuven",
    country: "Belgium",
    countryCode: "BE",
    aliases: ["Katholieke Universiteit Leuven"],
    source: "curated",
  },
  {
    name: "TU Delft - Delft University of Technology",
    country: "Netherlands",
    countryCode: "NL",
    acronym: "TUDelft",
    aliases: ["Delft University of Technology"],
    source: "curated",
  },
  {
    name: "École Mohammadia d'Ingénieurs (EMI)",
    country: "Morocco",
    countryCode: "MA",
    acronym: "EMI",
    aliases: ["EMI Rabat", "Université Mohammed V"],
    source: "curated",
  },
];

// In-memory cache for remote API lookups (key: normalized query, value: results)
const remoteCache = new Map<string, { timestamp: number; data: University[] }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

/**
 * Filter the curated universities list using query matching against
 * name, acronym, aliases, and country.
 */
export function searchCuratedUniversities(query: string, limit = 15): University[] {
  const q = query.trim().toLowerCase();
  if (!q) return CURATED_UNIVERSITIES.slice(0, limit);

  return CURATED_UNIVERSITIES.filter((u) => {
    if (u.name.toLowerCase().includes(q)) return true;
    if (u.acronym && u.acronym.toLowerCase().includes(q)) return true;
    if (u.country.toLowerCase().includes(q)) return true;
    if (u.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
    return false;
  }).slice(0, limit);
}

/**
 * Fetch universities from the public Hipolabs Universities API with a timeout
 * and graceful fallback.
 */
export async function fetchHipolabsUniversities(
  query: string,
  timeoutMs = 2500
): Promise<University[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const cacheKey = q.toLowerCase();
  const cached = remoteCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `http://universities.hipolabs.com/search?name=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    type HipoItem = {
      name: string;
      country: string;
      alpha_two_code?: string;
    };

    const parsed: University[] = (data as HipoItem[]).slice(0, 20).map((item) => ({
      name: item.name,
      country: item.country,
      countryCode: item.alpha_two_code,
      source: "hipolabs",
    }));

    remoteCache.set(cacheKey, { timestamp: Date.now(), data: parsed });
    return parsed;
  } catch {
    clearTimeout(timeoutId);
    // On abort or network failure, return empty array so caller falls back to curated
    return [];
  }
}

/**
 * Combined search: returns curated matches merged with remote Hipolabs results,
 * deduplicated by normalized name.
 */
export async function searchUniversities(query: string, limit = 20): Promise<University[]> {
  const trimmed = query.trim();
  const curated = searchCuratedUniversities(trimmed, limit);

  if (trimmed.length < 2) {
    return curated.slice(0, limit);
  }

  // Attempt live search with timeout
  const remote = await fetchHipolabsUniversities(trimmed, 2500);

  // Merge and deduplicate
  const seenNames = new Set<string>();
  const merged: University[] = [];

  for (const item of curated) {
    const key = item.name.toLowerCase().trim();
    if (!seenNames.has(key)) {
      seenNames.add(key);
      merged.push(item);
    }
  }

  for (const item of remote) {
    const key = item.name.toLowerCase().trim();
    if (!seenNames.has(key)) {
      seenNames.add(key);
      merged.push(item);
    }
  }

  return merged.slice(0, limit);
}
