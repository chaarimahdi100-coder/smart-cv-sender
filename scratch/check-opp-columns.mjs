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

const { data: cols, error } = await supabase.rpc("exec_sql", {
  sql: `
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'opportunities'
    ORDER BY ordinal_position;
  `,
});

if (error) {
  // If exec_sql RPC doesn't exist, we can select 1 row from opportunities
  const { data: sample } = await supabase.from("opportunities").select("*").limit(1).single();
  console.log("Columns from sample row:", Object.keys(sample || {}));
} else {
  console.log("Columns:", cols);
}
