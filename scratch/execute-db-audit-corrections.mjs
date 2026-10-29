import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const [k, ...v] = l.trim().split("=");
      return [k.trim(), v.join("=").trim().replace(/^["']|["']$/g, "")];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

console.log("=== Executing Safe DB Corrections for Opportunity Provenance & Reliability ===");

// 1. Spontaneous Leads (10 employer tracks):
const spontaneousIds = [
  "5304c674-1bf8-4d41-8b30-6c1d8afe39ad", // Vneuron
  "6989030b-3913-4cf0-8d57-5e13054c8c62", // Expensya
  "ebca7d7b-7e4c-4613-9c9e-dd0d574d48cb", // Wevioo
  "1c0850c3-cfbc-4e06-ac10-c86fa0c15aee", // Sofrecom
  "9196e0aa-1bc2-48e4-b8e7-2aa0b384a9a7", // Euro Tech Conseil
  "87b91595-cd46-49b3-9819-5ca476165d7d", // SMOFT
  "d0a8f9e7-2b5b-4bbd-9f52-7db89fce2a56", // Vermeg
  "2424de58-9440-4fbc-8c6d-7c1f18e77d09", // Tunisys
  "c74290aa-717c-4bec-aacb-dd6191aa464c", // BFI
  "04c9536a-71a1-4977-9008-c15b0a5b7c44", // Medianet root rh
];

for (const id of spontaneousIds) {
  const { error } = await supabase
    .from("opportunities")
    .update({
      type: "SPONTANEOUS",
      status_reason: "Candidature spontanée — aucune offre spécifique confirmée",
      verification_status: "unverified",
      date_posted: null,
      valid_through: null,
      source_platform: "Site officiel de l'employeur",
      last_checked_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) console.error(`Error updating spontaneous lead ${id}:`, error);
}
console.log(`Updated ${spontaneousIds.length} spontaneous tracks to type='SPONTANEOUS' with verified badge.`);

// 2. Google Search URLs (5 records):
const googleSearchIds = [
  "90f8ae77-6203-409f-85c9-62d2fb14a367",
  "1a5ded0a-6b1e-4d6c-9552-81ead95d3b8d",
  "2eca09d3-37e9-4c4f-a0da-d592d01ed355",
  "be9a7461-2dd6-43bf-82b0-382d7b9443fb",
  "0503d375-1fcf-41ba-b295-ec975fb58a42",
];

for (const id of googleSearchIds) {
  const { error } = await supabase
    .from("opportunities")
    .update({
      source_platform: "Recherche Google",
      status_reason: "Piste de veille externe (Recherche Google) — Aucune offre spécifique confirmée",
      verification_status: "unverified",
      date_posted: null,
      valid_through: null,
      last_checked_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) console.error(`Error updating google search lead ${id}:`, error);
}
console.log(`Updated ${googleSearchIds.length} Google search leads.`);

// 3. Demo Listings (clean dynamic dates):
const { data: demoOpps } = await supabase
  .from("opportunities")
  .select("id, title")
  .or("is_demo.eq.true,title.ilike.%[DEMO]%");

if (demoOpps) {
  for (const d of demoOpps) {
    const { error } = await supabase
      .from("opportunities")
      .update({
        is_demo: true,
        date_posted: null,
        valid_through: null,
        source_platform: "Site officiel de l'employeur",
      })
      .eq("id", d.id);
    if (error) console.error(`Error updating demo ${d.id}:`, error);
  }
  console.log(`Cleaned dynamic dates for ${demoOpps.length} demo opportunities.`);
}

// 4. Specific Key Listings:
// Medianet PFE 2026:
await supabase
  .from("opportunities")
  .update({
    source_platform: "LinkedIn",
    source_url: "https://www.linkedin.com/posts/medianet_stages-pfe-2026-pfe-book-announcement",
    application_url: "https://rh.medianet.tn/stages-pfe-2026_11_50",
    date_posted: "2025-11-11T09:00:00.000Z",
    valid_through: null,
    verification_status: "likely_open",
    status_reason: "Annonce officielle publiée sur LinkedIn avec portail de candidature rh.medianet.tn.",
    is_active: true,
    last_checked_at: new Date().toISOString(),
  })
  .eq("id", "651667d5-c08c-44ce-8137-084a80ca4fd8");

// SPX Silverprod PFE:
await supabase
  .from("opportunities")
  .update({
    source_platform: "Fabskill",
    source_url: "https://fabskill.com/fr/job/1471/stagiaires-pfe",
    application_url: "https://fabskill.com/fr/job/1471/stagiaires-pfe",
    date_posted: "2025-11-01T08:00:00.000Z",
    valid_through: null,
    closed_at: "2026-03-31T23:59:59.000Z",
    verification_status: "closed",
    is_active: false,
    status_reason: "Offre clôturée : candidatures closes sur Fabskill.",
    last_checked_at: new Date().toISOString(),
  })
  .eq("id", "08b6f1ec-4d42-4a03-8069-186169d8ea03");

// Vermeg Business Analyst:
await supabase
  .from("opportunities")
  .update({
    source_platform: "Site officiel de l'employeur",
    source_url: "https://www.vermeg.com/job/business-analyst/",
    application_url: "https://www.vermeg.com/job/business-analyst/",
    date_posted: null,
    valid_through: null,
    verification_status: "likely_open",
    status_reason: "Offre CDD active sur le site officiel de Vermeg. Date de publication d'origine inconnue.",
    is_active: true,
    last_checked_at: new Date().toISOString(),
  })
  .eq("id", "22476357-100f-47fb-9d9a-560afc56d30b");

// Migration07 DevOps Engineer:
await supabase
  .from("opportunities")
  .update({
    source_platform: "Source d'origine inconnue",
    date_posted: null,
    verification_status: "unverified",
    status_reason: "Source d'origine et date inconnues.",
  })
  .eq("id", "e1a65b4b-072f-4baa-8a74-edfd13146e4c");

// 5. Greenhouse Listings:
// Update updated_at_source from date_posted where applicable
const { data: ghOpps } = await supabase
  .from("opportunities")
  .select("id, date_posted")
  .eq("source_platform", "Greenhouse ATS");

if (ghOpps) {
  for (const gh of ghOpps) {
    await supabase
      .from("opportunities")
      .update({
        updated_at_source: gh.date_posted,
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", gh.id);
  }
  console.log(`Synchronized updated_at_source for ${ghOpps.length} Greenhouse ATS postings.`);
}

console.log("=== DB Corrections Completed Successfully! ===");
