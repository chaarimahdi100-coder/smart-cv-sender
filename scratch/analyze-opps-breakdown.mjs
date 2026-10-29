import fs from "fs";

const opps = JSON.parse(fs.readFileSync("scratch/all-opportunities-audit.json", "utf8"));

console.log(`Total opportunities: ${opps.length}`);

// Breakdown by type
const byType = {};
const byPlatform = {};
const byStatus = {};
const byActive = { true: 0, false: 0 };
let withDatePosted = 0;
let withValidThrough = 0;
let withDifferentUrls = 0;
let spontaneousCount = 0;
let closedCount = 0;
let expiredCount = 0;

const sampleOpps = [];

for (const o of opps) {
  byType[o.type] = (byType[o.type] || 0) + 1;
  byPlatform[o.source_platform || "NULL"] = (byPlatform[o.source_platform || "NULL"] || 0) + 1;
  byStatus[o.verification_status || "NULL"] = (byStatus[o.verification_status || "NULL"] || 0) + 1;
  byActive[o.is_active ? "true" : "false"]++;
  if (o.date_posted) withDatePosted++;
  if (o.valid_through) withValidThrough++;
  if (o.source_url && o.application_url && o.source_url !== o.application_url) withDifferentUrls++;
  if (o.type === "spontaneous" || (o.title && o.title.toLowerCase().includes("spontanée"))) spontaneousCount++;
  if (o.closed_at || o.verification_status === "closed" || !o.is_active) closedCount++;
  if (o.valid_through && new Date(o.valid_through) < new Date("2026-10-23")) expiredCount++;
}

console.log("\n--- Breakdown by Type ---");
console.log(byType);

console.log("\n--- Breakdown by Source Platform ---");
console.log(byPlatform);

console.log("\n--- Breakdown by Verification Status ---");
console.log(byStatus);

console.log("\n--- Active vs Inactive ---");
console.log(byActive);

console.log("\n--- Specific Metrics ---");
console.log(`With date_posted: ${withDatePosted}/${opps.length}`);
console.log(`With valid_through: ${withValidThrough}/${opps.length}`);
console.log(`With different source_url vs application_url: ${withDifferentUrls}`);
console.log(`Spontaneous applications / leads: ${spontaneousCount}`);
console.log(`Closed / inactive: ${closedCount}`);
console.log(`Expired (valid_through in past): ${expiredCount}`);

// Inspect sample of entries
console.log("\n--- Sample of 10 opportunities ---");
for (let i = 0; i < Math.min(15, opps.length); i++) {
  const o = opps[i];
  console.log({
    id: o.id,
    title: o.title,
    company: o.companies?.name,
    type: o.type,
    platform: o.source_platform,
    date_posted: o.date_posted,
    valid_through: o.valid_through,
    last_checked_at: o.last_checked_at,
    status: o.verification_status,
    active: o.is_active,
    source_url: o.source_url?.slice(0, 50),
    app_url: o.application_url?.slice(0, 50),
  });
}
