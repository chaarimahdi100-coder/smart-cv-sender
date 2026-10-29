import fs from "fs";

const opps = JSON.parse(fs.readFileSync("scratch/all-opportunities-audit.json", "utf8"));

const grouped = {
  greenhouse: [],
  googleSearch: [],
  pisteLeads: [],
  specificVacancies: [],
};

for (const o of opps) {
  if (o.source_platform === "Greenhouse ATS" || o.source_url?.includes("greenhouse.io")) {
    grouped.greenhouse.push(o);
  } else if (o.source_url?.includes("google.com/search")) {
    grouped.googleSearch.push(o);
  } else if (o.title?.startsWith("Piste PFE") || o.title?.startsWith("Piste Ciblée")) {
    grouped.pisteLeads.push(o);
  } else {
    grouped.specificVacancies.push(o);
  }
}

console.log(`Greenhouse: ${grouped.greenhouse.length}`);
console.log(`Google Search URLs: ${grouped.googleSearch.length}`);
console.log(`Piste Leads (career sites): ${grouped.pisteLeads.length}`);
console.log(`Specific Vacancies (Medianet, Vermeg, SPX, etc.): ${grouped.specificVacancies.length}`);

console.log("\nSpecific Vacancies titles:");
grouped.specificVacancies.forEach((o) => {
  console.log(`- [${o.id}] "${o.title}" | Company: ${o.companies?.name} | Platform: ${o.source_platform} | Date: ${o.date_posted} | Status: ${o.verification_status} | AppURL: ${o.application_url}`);
});

console.log("\nPiste Leads titles:");
grouped.pisteLeads.forEach((o) => {
  console.log(`- [${o.id}] "${o.title}" | Company: ${o.companies?.name} | Type: ${o.type} | AppURL: ${o.application_url}`);
});

console.log("\nGoogle Search URLs:");
grouped.googleSearch.forEach((o) => {
  console.log(`- [${o.id}] "${o.title}" | URL: ${o.source_url}`);
});
