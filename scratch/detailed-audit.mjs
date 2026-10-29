import fs from "fs";

const opps = JSON.parse(fs.readFileSync("scratch/all-opportunities-audit.json", "utf8"));

console.log(`Auditing all ${opps.length} opportunities:`);

const auditResults = opps.map((o) => {
  const issues = [];
  let isSpontaneous = false;
  let isGoogleSearch = false;
  let isDemo = false;
  let isGreenhouse = false;

  if (o.title?.startsWith("[DEMO]") || o.companies?.name?.includes("[DEMO]") || o.source_url?.includes("demo")) {
    isDemo = true;
  }

  if (o.source_url?.includes("google.com/search") || o.application_url?.includes("google.com/search")) {
    isGoogleSearch = true;
    issues.push("Google search URL stored as opportunity");
  }

  if (
    o.title?.toLowerCase().startsWith("piste pfe") ||
    o.title?.toLowerCase().startsWith("piste entreprise") ||
    o.title?.toLowerCase().includes("candidature spontanée") ||
    o.source_url?.match(/\/(careers|carrieres|carriere\.php|recrutement)\/?$/i) ||
    o.application_url?.match(/\/(careers|carrieres|carriere\.php|recrutement)\/?$/i)
  ) {
    isSpontaneous = true;
    if (o.type !== "SPONTANEOUS") {
      issues.push(`Spontaneous lead classified as type='${o.type}' instead of 'SPONTANEOUS'`);
    }
  }

  if (o.source_platform === "Greenhouse ATS" || o.source_url?.includes("greenhouse.io")) {
    isGreenhouse = true;
  }

  // Check date_posted: was it dynamic or proven?
  let dateProvenance = "unknown";
  if (o.date_posted) {
    if (isDemo) {
      dateProvenance = "demo_synthetic";
      issues.push("Demo opportunity has dynamic/synthetic date_posted");
    } else if (isGreenhouse) {
      dateProvenance = "greenhouse_api_updated_at";
    } else if (o.id === "651667d5-c08c-44ce-8137-084a80ca4fd8") {
      dateProvenance = "linkedin_post_proven_2025_11_11";
    } else if (o.id === "08b6f1ec-4d42-4a03-8069-186169d8ea03") {
      dateProvenance = "fabskill_listing_proven_2025_11_01";
    } else {
      dateProvenance = "unproven_or_synthetic";
      issues.push(`date_posted (${o.date_posted}) lacks proven publication evidence`);
    }
  }

  // Check valid_through:
  let deadlineProvenance = "none";
  if (o.valid_through) {
    if (isDemo) {
      deadlineProvenance = "demo_synthetic";
      issues.push("Demo opportunity has dynamic/synthetic valid_through");
    } else {
      deadlineProvenance = "proven_or_unproven";
    }
  }

  return {
    id: o.id,
    title: o.title,
    company: o.companies?.name,
    currentType: o.type,
    currentPlatform: o.source_platform,
    currentStatus: o.verification_status,
    isActive: o.is_active,
    datePosted: o.date_posted,
    validThrough: o.valid_through,
    lastChecked: o.last_checked_at,
    isDemo,
    isSpontaneous,
    isGoogleSearch,
    isGreenhouse,
    dateProvenance,
    deadlineProvenance,
    issues,
  };
});

fs.writeFileSync("scratch/detailed-audit-report.json", JSON.stringify(auditResults, null, 2), "utf8");

const issuesCount = auditResults.filter((r) => r.issues.length > 0).length;
console.log(`Opportunities with issues to resolve: ${issuesCount}/${opps.length}`);

// Group by classification
const spontaneousList = auditResults.filter((r) => r.isSpontaneous);
const googleList = auditResults.filter((r) => r.isGoogleSearch);
const demoList = auditResults.filter((r) => r.isDemo);
const greenhouseList = auditResults.filter((r) => r.isGreenhouse);
const realVacancies = auditResults.filter((r) => !r.isSpontaneous && !r.isGoogleSearch && !r.isDemo && !r.isGreenhouse);

console.log(`\nClassification Summary:`);
console.log(`- Spontaneous leads: ${spontaneousList.length}`);
console.log(`- Google search URLs: ${googleList.length}`);
console.log(`- Demo fixtures: ${demoList.length}`);
console.log(`- Greenhouse ATS postings: ${greenhouseList.length}`);
console.log(`- Other specific Tunisian vacancies: ${realVacancies.length}`);

console.log("\nSpecific Tunisian Vacancies details:");
realVacancies.forEach((v) => console.log(`  * [${v.id}] ${v.title} (${v.company}) - Type: ${v.currentType}, Date: ${v.datePosted}, Platform: ${v.currentPlatform}, Status: ${v.currentStatus}`));
