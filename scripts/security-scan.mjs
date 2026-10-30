import fs from "fs";
import { execSync } from "child_process";

const tracked = execSync("git ls-files", { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const secretPatterns = [
  { name: "JWT Token", regex: /eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}/ },
  { name: "Private Key", regex: /BEGIN (?:RSA |EC )?PRIVATE KEY/ },
  { name: "GitHub Token", regex: /gh[pousr]_[a-zA-Z0-9]{30,}/ },
  { name: "OpenAI/Anthropic/Gemini Key", regex: /(?:sk-[a-zA-Z0-9]{30,}|AIzaSy[a-zA-Z0-9_-]{33})/ },
  { name: "Generic Secret Assignment", regex: /(?:api[_-]?key|service_role_key|secret_key|private_key)\s*[:=]\s*["'][a-zA-Z0-9_\-\.]{20,}["']/i },
  { name: "Database URL with password", regex: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^/]+/i },
];

const binaryExts = [".docx", ".pdf", ".ico", ".svg", ".png", ".jpg", ".webp"];

console.log(`Scanning ${tracked.length} tracked files for secrets...`);

const findings = [];

for (const file of tracked) {
  if (binaryExts.some((ext) => file.endsWith(ext))) continue;

  try {
    const content = fs.readFileSync(file, "utf8");
    for (const { name, regex } of secretPatterns) {
      const match = content.match(regex);
      if (match) {
        // Exclude safe placeholders and dummy test tokens
        const snippet = match[0];
        const isSafePlaceholder =
          snippet.includes("your-") ||
          snippet.includes("test-dummy") ||
          snippet.includes("dummy-key") ||
          snippet.includes("<local-") ||
          file.includes("security-scan");

        if (!isSafePlaceholder) {
          findings.push({
            file,
            type: name,
            matchedSnippet: match[0].slice(0, 30) + "...",
          });
        }
      }
    }
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
  }
}

// Also check untracked files
const untracked = execSync("git status --porcelain", { encoding: "utf8" })
  .split(/\r?\n/)
  .filter((l) => l.startsWith("??"))
  .map((l) => l.slice(3).trim());

for (const file of untracked) {
  if (binaryExts.some((ext) => file.endsWith(ext))) continue;
  try {
    const content = fs.readFileSync(file, "utf8");
    for (const { name, regex } of secretPatterns) {
      const match = content.match(regex);
      if (match) {
        const snippet = match[0];
        const isSafePlaceholder =
          snippet.includes("your-") ||
          snippet.includes("test-dummy") ||
          snippet.includes("dummy-key") ||
          snippet.includes("<local-") ||
          file.includes("security-scan");

        if (!isSafePlaceholder) {
          findings.push({
            file: `(untracked) ${file}`,
            type: name,
            matchedSnippet: match[0].slice(0, 30) + "...",
          });
        }
      }
    }
  } catch (err) {
    console.error(`Error reading untracked ${file}:`, err.message);
  }
}

console.log("\nScan Results:");
if (findings.length === 0) {
  console.log("SUCCESS: 0 secrets detected across all tracked and untracked files.");
} else {
  console.log(`WARNING: ${findings.length} findings:`);
  console.log(JSON.stringify(findings, null, 2));
}

console.log("\nUntracked files inspected:", untracked);
