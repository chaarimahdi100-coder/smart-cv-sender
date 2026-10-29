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

const { data: apps, error: err1 } = await supabase
  .from("applications")
  .select("*")
  .limit(10);

if (err1) console.error("Error fetching apps:", err1);
console.log("All applications:");
console.log(apps);

const { data: drafts, error: err2 } = await supabase
  .from("email_drafts")
  .select("*")
  .limit(10);

if (err2) console.error("Error fetching drafts:", err2);
console.log("\nAll email drafts:");
console.log(drafts);
