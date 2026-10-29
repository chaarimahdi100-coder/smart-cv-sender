import fs from "fs";

const html = fs.readFileSync("scratch/chaarimahdi55-draft.html", "utf8");

const checks = [
  "Candidature Convertie en Candidature Spontanée",
  "Candidature spontanée — Stage PFE (Disponibilité à partir de février 2027) : E-business & Digital Solutions — Mahdi Chaari",
  "https://rh.medianet.tn/stages-pfe-2026_11_50",
  "février 2027",
  "Medianet",
  "Stage PFE 2026",
  "Convertie en candidature spontanée",
  "Postuler via le portail officiel",
];

console.log("=== Content Checks ===");
for (const phrase of checks) {
  console.log(`Contains "${phrase}":`, html.includes(phrase));
}

// Check headings
const headings = html.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi) || [];
console.log("\n=== Headings found ===");
headings.forEach((h) => console.log(" -", h.replace(/<[^>]+>/g, "").trim()));

// Extract subject input value
const subjectMatch = html.match(/<input[^>]*name="subject"[^>]*value="([^"]*)"/i) || html.match(/<input[^>]*value="([^"]*)"[^>]*name="subject"/i);
console.log("\n=== Subject Input Value ===");
console.log(subjectMatch ? subjectMatch[1] : "not found");

// Extract textarea content
const textareaMatch = html.match(/<textarea[^>]*name="body"[^>]*>([\s\S]*?)<\/textarea>/i) || html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i);
console.log("\n=== Email Body Preview ===");
console.log(textareaMatch ? textareaMatch[1].trim() : "not found");
