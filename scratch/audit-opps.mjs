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

const { data: opps, error } = await supabase
  .from("opportunities")
  .select("id, title, company_id, type, source_platform, source_url, application_url, date_posted, valid_through, last_checked_at, verification_status, is_active, closed_at, updated_at_source, verification_evidence, companies(name)")
  .order("created_at", { ascending: false });

if (error) {
  console.error("Error:", error);
} else {
  console.log("Total opportunities in DB:", opps.length);
  fs.writeFileSync("scratch/all-opportunities-audit.json", JSON.stringify(opps, null, 2), "utf8");
  console.log("Saved to scratch/all-opportunities-audit.json");
}
