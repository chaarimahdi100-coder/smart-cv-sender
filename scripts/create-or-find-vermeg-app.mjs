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
  const { data: vermegOpps } = await supabase
    .from("opportunities")
    .select("id, company_id, title, date_posted, source_platform, verification_status")
    .ilike("title", "%Business Analyst%");
  console.log("Vermeg opportunities:", vermegOpps);

  if (vermegOpps && vermegOpps.length > 0) {
    const opp = vermegOpps[0];
    const { data: user } = await supabase.auth.admin.listUsers();
    const candidateUser = user.users.find((u) => u.email === "chaarimahdi100@gmail.com") || user.users[0];
    const { data: existingApp } = await supabase
      .from("applications")
      .select("id")
      .eq("opportunity_id", opp.id)
      .eq("user_id", candidateUser.id)
      .maybeSingle();

    const appId = existingApp ? existingApp.id : newApp?.id;
    if (appId) {
      const { data: existingDraft } = await supabase.from("email_drafts").select("id").eq("application_id", appId).maybeSingle();
      if (!existingDraft) {
        const { error: insErr } = await supabase.from("email_drafts").insert({
          application_id: appId,
          recipient_email: "",
          subject: "Candidature Business Analyst - Mahdi Chaari",
          body: "Madame, Monsieur,\n\nJe vous adresse ma candidature pour le poste de Business Analyst...",
        });
        console.log("Inserted email draft for Vermeg BA:", insErr);
      } else {
        console.log("Existing draft found:", existingDraft.id);
      }
    }
  }

  // Ensure Medianet application is owned by candidate user
  const { data: user } = await supabase.auth.admin.listUsers();
  const candidateUser = user.users.find((u) => u.email === "chaarimahdi100@gmail.com") || user.users[0];
  await supabase
    .from("applications")
    .update({ user_id: candidateUser.id })
    .eq("id", "af04aa14-a2de-4c49-a563-ee9364429ca4");
  console.log("Assigned Medianet application af04aa14 to user:", candidateUser.email);
}

run().catch(console.error);
