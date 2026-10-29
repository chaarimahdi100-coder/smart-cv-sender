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

const { data: opps } = await supabase.from("opportunities").select("*");

const platforms = {};
const statuses = {};
const types = {};
let provenDate = 0;
let nullDate = 0;
let provenDeadline = 0;
let nullDeadline = 0;
let closedOrExpired = 0;
let spontaneous = 0;

for (const o of opps) {
  const p = o.source_platform || "NULL";
  platforms[p] = (platforms[p] || 0) + 1;
  const s = o.verification_status || "NULL";
  statuses[s] = (statuses[s] || 0) + 1;
  const t = o.type || "NULL";
  types[t] = (types[t] || 0) + 1;
  if (o.date_posted) provenDate++; else nullDate++;
  if (o.valid_through) provenDeadline++; else nullDeadline++;
  if (o.verification_status === "closed" || o.verification_status === "expired" || o.is_active === false) closedOrExpired++;
  if (o.type === "SPONTANEOUS" || (o.status_reason && o.status_reason.includes("spontanée")) || (o.title && o.title.includes("Piste PFE"))) spontaneous++;
}

const stats = {
  total: opps.length,
  provenDate,
  nullDate,
  provenDeadline,
  nullDeadline,
  closedOrExpired,
  spontaneous,
  platforms,
  statuses,
  types,
};

fs.writeFileSync("scratch/final-stats.json", JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
