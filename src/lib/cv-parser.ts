import { extractText } from "unpdf";
import { CURATED_UNIVERSITIES } from "./education/universities.ts";
import { DEGREE_QUALIFICATIONS } from "./education/degrees.ts";
import type { ExtractedCVData } from "./ai-extraction.ts";

export interface ExtractionResult {
  data: ExtractedCVData;
  method: "local_pdf_text" | "ai" | "unreadable";
  rawTextLength: number;
  rawText?: string;
  totalPages: number;
  unreadable: boolean;
  warnings: string[];
}

/**
 * Extracts raw textual content from PDF binary data using unpdf.
 */
export async function extractRawPdfText(
  data: Uint8Array
): Promise<{ text: string; totalPages: number }> {
  if (!data || data.byteLength === 0) {
    throw new Error("Empty PDF data provided");
  }

  try {
    const result = await extractText(data);
    const textArray = Array.isArray(result.text) ? result.text : [result.text || ""];
    const text = textArray.join("\n").trim();
    const totalPages = result.totalPages || 0;
    return { text, totalPages };
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF extraction failed";
    throw new Error(`Failed to read PDF text: ${message}`);
  }
}

/**
 * Deterministically extracts candidate email address.
 */
export function extractEmail(text: string): string | undefined {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i;
  const match = text.match(emailRegex);
  return match ? match[0].toLowerCase() : undefined;
}

/**
 * Deterministically extracts candidate phone number.
 */
export function extractPhone(text: string): string | undefined {
  const phoneRegex = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}/;
  const match = text.match(phoneRegex);
  return match && match[0].replace(/\D/g, "").length >= 8 ? match[0].trim() : undefined;
}

/**
 * Normalizes text by lowercasing, stripping diacritics/accents, and standardizing apostrophes.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u0060\u00B4]/g, "'");
}

/**
 * Extracts recognized university or higher education institution from the text.
 */
export function extractUniversity(text: string): string | undefined {
  const normText = normalizeText(text);

  // 1. Search for acronyms with word boundary and optional apostrophes
  for (const univ of CURATED_UNIVERSITIES) {
    if (univ.acronym) {
      const cleanAcr = univ.acronym.replace(/['’\s]/g, "");
      const acrPattern = cleanAcr.split("").join("['’]?");
      const acronymRegex = new RegExp(`\\b${acrPattern}\\b`, "i");
      if (acronymRegex.test(normText)) {
        return univ.name;
      }
    }
  }

  // 2. Search for exact institution names or aliases
  for (const univ of CURATED_UNIVERSITIES) {
    if (normText.includes(normalizeText(univ.name))) {
      return univ.name;
    }
    if (univ.aliases) {
      for (const alias of univ.aliases) {
        if (normText.includes(normalizeText(alias))) {
          return univ.name;
        }
      }
    }
  }

  return undefined;
}

/**
 * Extracts recognized degree or qualification from the text.
 */
export function extractDegree(text: string): string | undefined {
  const normText = normalizeText(text);

  for (const deg of DEGREE_QUALIFICATIONS) {
    // Check main qualification title (accent & apostrophe insensitive)
    if (normText.includes(normalizeText(deg.name))) {
      return deg.name;
    }

    // Check aliases with properly escaped regex characters
    for (const alias of deg.aliases) {
      const normAlias = normalizeText(alias);
      const escaped = normAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Short acronyms (<= 2 chars like "LA", "LF", "MS") must be checked case-sensitively against original text to avoid matching French articles like "la"
      const isShort = alias.length <= 2;
      const aliasRegex = isShort ? new RegExp(`\\b${alias}\\b`) : new RegExp(`\\b${escaped}\\b`, "i");
      if (aliasRegex.test(isShort ? text : normText)) {
        return deg.name;
      }
    }
  }

  return undefined;
}

/**
 * Extracts languages explicitly mentioned in the CV text.
 */
export function extractLanguages(text: string): string[] {
  const lower = text.toLowerCase();
  const languages: string[] = [];

  const langPatterns: Array<{ name: string; regex: RegExp }> = [
    { name: "French", regex: /\b(français|francais|french)\b/i },
    { name: "English", regex: /\b(anglais|english)\b/i },
    { name: "Arabic", regex: /\b(arabe|arabic)\b/i },
    { name: "German", regex: /\b(allemand|german|deutsch)\b/i },
    { name: "Spanish", regex: /\b(espagnol|spanish|español)\b/i },
    { name: "Italian", regex: /\b(italien|italian|italiano)\b/i },
  ];

  for (const { name, regex } of langPatterns) {
    if (regex.test(lower) && !languages.includes(name)) {
      languages.push(name);
    }
  }

  return languages;
}

/**
 * Extracts engineering / tech specialty if explicitly mentioned.
 */
export function extractSpecialty(text: string): string | undefined {
  const lower = text.toLowerCase();

  const specialties: Array<{ title: string; regex: RegExp }> = [
    { title: "Business Information Systems", regex: /\b(business information systems|informatique de gestion|systèmes d'information|systemes d'information)\b/i },
    { title: "Software Engineering", regex: /\b(software engineering|génie logiciel|genie logiciel|ingénierie logicielle)\b/i },
    { title: "Data Science", regex: /\b(data science|science des données|big data|data analytics)\b/i },
    { title: "Artificial Intelligence", regex: /\b(artificial intelligence|intelligence artificielle|machine learning|deep learning)\b/i },
    { title: "Cloud & DevOps", regex: /\b(devops|cloud computing|kubernetes|docker|aws|azure)\b/i },
    { title: "Cybersecurity", regex: /\b(cybersecurity|cybersécurité|sécurité informatique|infosec)\b/i },
    { title: "Embedded Systems", regex: /\b(embedded systems|systèmes embarqués|systemes embarques|iot)\b/i },
    { title: "Networks & Telecommunications", regex: /\b(telecommunications|télécommunications|réseaux|networks)\b/i },
    { title: "Web & Mobile Development", regex: /\b(full stack|frontend|backend|développeur web|mobile developer)\b/i },
  ];

  for (const { title, regex } of specialties) {
    if (regex.test(lower)) {
      return title;
    }
  }

  return undefined;
}

/**
 * Attempts to reliably extract first and last name from header lines or email,
 * discarding typical CV keywords and labels.
 */
export function extractCandidateName(
  text: string,
  email?: string
): { first_name?: string; last_name?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const ignoredKeywords = [
    "curriculum",
    "vitae",
    "resume",
    "cv",
    "profile",
    "profil",
    "contact",
    "formation",
    "education",
    "experience",
    "skills",
    "compétences",
    "summary",
    "page",
    "email",
    "phone",
    "tel",
  ];

  // Examine the first 6 non-empty lines for a clean 2-4 word personal name
  for (const line of lines.slice(0, 6)) {
    const normalizedLine = line
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const hasIgnored = ignoredKeywords.some((kw) => normalizedLine.includes(kw));
    if (hasIgnored) continue;
    if (line.includes("@") || line.includes("http") || /\d/.test(line)) continue;

    const words = line.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 4) {
      // Validate that all words look like name tokens (letters only)
      const allAlphabetic = words.every((w) => /^[\p{L}'-]+$/u.test(w));
      if (allAlphabetic) {
        return {
          first_name: words[0],
          last_name: words.slice(1).join(" "),
        };
      }
    }
  }

  // Fallback: If email has firstname.lastname@domain
  if (email) {
    const localPart = email.split("@")[0];
    const parts = localPart.split(/[._-]/).filter((p) => p.length >= 2 && /^[a-zA-Z]+$/.test(p));
    if (parts.length >= 2) {
      const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      return {
        first_name: capitalize(parts[0]),
        last_name: capitalize(parts.slice(1).join(" ")),
      };
    }
  }

  return { first_name: undefined, last_name: undefined };
}

/**
 * Main parsing pipeline: reads PDF bytes and extracts verifiable candidate data.
 * Does NOT invent mock data when fields are absent.
 */
export async function parseAndExtractCV(data: Uint8Array): Promise<ExtractionResult> {
  let rawText = "";
  let totalPages = 0;
  const warnings: string[] = [];

  try {
    const pdfData = await extractRawPdfText(data);
    rawText = pdfData.text;
    totalPages = pdfData.totalPages;
  } catch (error) {
    return {
      data: {},
      method: "unreadable",
      rawTextLength: 0,
      totalPages: 0,
      unreadable: true,
      warnings: [
        error instanceof Error ? error.message : "Unable to read binary PDF content.",
      ],
    };
  }

  // Check if text is empty (scanned image PDF or non-selectable text)
  if (!rawText || rawText.trim().length === 0) {
    return {
      data: {},
      method: "unreadable",
      rawTextLength: 0,
      totalPages,
      unreadable: true,
      warnings: [
        "This PDF does not contain a selectable text layer (it may be a scanned image or flattened canvas). Please enter your details manually or use the autocompletes below.",
      ],
    };
  }

  const email = extractEmail(rawText);
  const { first_name, last_name } = extractCandidateName(rawText, email);
  const school = extractUniversity(rawText);
  const degree = extractDegree(rawText);
  const specialty = extractSpecialty(rawText);
  const languages = extractLanguages(rawText);

  if (!school) {
    warnings.push("University / School could not be automatically detected from the CV text.");
  }
  if (!degree) {
    warnings.push("Degree / Qualification could not be automatically detected from the CV text.");
  }
  if (!specialty) {
    warnings.push("Specialty / Major could not be automatically detected from the CV text.");
  }

  return {
    data: {
      email,
      first_name,
      last_name,
      school,
      degree,
      specialty,
      languages: languages.length > 0 ? languages : undefined,
    },
    method: "local_pdf_text",
    rawTextLength: rawText.length,
    rawText,
    totalPages,
    unreadable: false,
    warnings,
  };
}
