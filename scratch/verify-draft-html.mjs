import fs from "fs";

const html = fs.readFileSync("scratch/authenticated-draft.html", "utf8");

// Check key phrases
const checks = [
  "Candidature Convertie en Candidature Spontanée",
  "Candidature spontanée — Stage PFE (Disponibilité à partir de février 2027) : E-business & Digital Solutions — Mahdi Chaari",
  "https://rh.medianet.tn/stages-pfe-2026_11_50",
  "février 2027",
  "Medianet",
  "Stages PFE 2026",
  "Approuver et envoyer",
  "Postuler via le portail officiel",
];

for (const phrase of checks) {
  console.log(`Contains "${phrase}":`, html.includes(phrase));
}

// Extract headings
const headings = html.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi) || [];
console.log("\nHeadings found:");
headings.forEach((h) => console.log(" -", h.replace(/<[^>]+>/g, "").trim()));

// Extract input value for subject
const subjectMatch = html.match(/name="subject"[^>]*value="([^"]*)"/i) || html.match(/value="([^"]*)"[^>]*name="subject"/i);
console.log("\nSubject input value:", subjectMatch ? subjectMatch[1] : "not found by regex");

// Extract textarea content
const textareaMatch = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i);
console.log("\nEmail body preview (first 250 chars):", textareaMatch ? textareaMatch[1].slice(0, 250) : "not found");
