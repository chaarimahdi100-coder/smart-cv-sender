import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
const envVars = {};
for (const rawLine of env.split("\n")) {
  const line = rawLine.replace(/\r/g, "").trim();
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) envVars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:55431";
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: opps, error } = await supabase
    .from("opportunities")
    .select("id, title, company_id, companies(name), date_posted, valid_through, first_seen_at, last_checked_at, source_url, source_provider, verification_status, is_active, is_demo, verification_evidence");

  if (error) {
    console.error("Error querying opportunities:", error);
    return;
  }

  console.log(`Total opportunities in local DB: ${opps.length}`);

  // Summary by provider
  const byProvider = {};
  for (const o of opps) {
    const p = o.source_provider || "none";
    byProvider[p] = (byProvider[p] || 0) + 1;
  }
  console.log("By source_provider:", byProvider);

  // Group by date_posted
  const byDatePosted = {};
  for (const o of opps) {
    const d = o.date_posted ? o.date_posted.slice(0, 10) : "NULL";
    byDatePosted[d] = (byDatePosted[d] || 0) + 1;
  }
  console.log("By date_posted:", byDatePosted);

  // Inspect Tunisian opportunities specifically
  console.log("\n=== SPECIFIC / TUNISIAN OPPORTUNITIES ===");
  for (const o of opps) {
    const isTarget = 
      o.source_provider === "tunisian_vacancies_live" || 
      o.source_provider === "tunisian_pfe_live" ||
      o.title?.includes("Medianet") ||
      o.title?.includes("Silverprod") ||
      o.title?.includes("Vermeg") ||
      o.title?.includes("SMOFT");
      
    if (isTarget) {
      console.log({
        id: o.id,
        title: o.title,
        company: o.companies?.name,
        source_provider: o.source_provider,
        source_url: o.source_url,
        date_posted: o.date_posted,
        valid_through: o.valid_through,
        first_seen_at: o.first_seen_at,
        last_checked_at: o.last_checked_at,
        verification_status: o.verification_status,
        is_active: o.is_active,
        evidence_source_platform: o.verification_evidence?.sourcePlatformName,
        evidence_direct_apply: o.verification_evidence?.directApplicationUrl,
      });
    }
  }
}

run().catch(console.error);
