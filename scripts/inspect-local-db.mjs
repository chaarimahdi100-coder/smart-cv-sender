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
  const { data: opps } = await supabase
    .from("opportunities")
    .select("id, title, description, type, location, companies(name)")
    .ilike("title", "%Engineering Manager%");

  console.log("Found opportunities:", opps?.length);
  if (opps && opps[0]) {
    console.log("Opportunity title:", opps[0].title);
    console.log("Company:", opps[0].companies?.name);
    console.log("FULL DESCRIPTION:\n", opps[0].description);
  }

  const { data: allProfiles } = await supabase.from("profiles").select("*");
  console.log("All profiles:", allProfiles?.map(p => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    school: p.school,
    degree: p.degree,
    specialty: p.specialty,
  })));

  const { data: allResumes } = await supabase.from("resumes").select("id, user_id, storage_path, extracted_data");
  console.log("All resumes:", allResumes?.map(r => ({
    id: r.id,
    user_id: r.user_id,
    hasExtracted: Boolean(r.extracted_data),
    hasRawText: Boolean(r.extracted_data?.rawText),
    skills: r.extracted_data?.data?.skills || r.extracted_data?.skills,
  })));

  const { data: drafts } = await supabase.from("email_drafts").select("id, application_id, recipient_email, subject, body");
  console.log("Drafts count:", drafts?.length);
  if (drafts && drafts.length > 0) {
    const d = drafts[drafts.length - 1];
    console.log("=== LAST DRAFT ===");
    console.log("Recipient:", d.recipient_email);
    console.log("Subject:", d.subject);
    console.log("Body:\n", d.body);
  }

  const { data: mahdiResume } = await supabase.from("resumes").select("*").eq("id", "f0221759-fcac-474d-a64a-100c52501028").single();
  console.log("=== MAHDI RESUME ===");
  console.log("RawText:\n", mahdiResume?.extracted_data?.rawText);
  console.log("Extracted data:", mahdiResume?.extracted_data?.data);
}

run().catch(console.error);
