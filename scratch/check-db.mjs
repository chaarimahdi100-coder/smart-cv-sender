import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envFile = fs.readFileSync(".env.local", "utf8");
const env = {};
for (const rawLine of envFile.split("\n")) {
  const line = rawLine.trim();
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
  const { data: drafts, error } = await supabase
    .from("email_drafts")
    .select("id, application_id, recipient_email, subject, body, conflict_resolution, conflict_resolution_note, updated_at");
  
  if (error) {
    console.error("Error:", error);
    return;
  }

  for (const d of drafts) {
    console.log("=== DRAFT", d.id, "APP:", d.application_id, "RESOLUTION:", d.conflict_resolution);
    console.log("SUBJECT:", d.subject);
    console.log("BODY:\n" + d.body);
    console.log("=========================================\n");
  }
}

check();
