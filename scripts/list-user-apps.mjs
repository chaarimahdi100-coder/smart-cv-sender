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
  const { data: apps, error } = await supabase
    .from("applications")
    .select("id, user_id, opportunity_id, status, opportunities(id, title, date_posted, source_platform, verification_status)");
  if (error) {
    console.error(error);
    return;
  }
  console.log(JSON.stringify(apps, null, 2));
}

run().catch(console.error);
