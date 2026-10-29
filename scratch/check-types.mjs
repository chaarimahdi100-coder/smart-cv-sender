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

// Check if type is a custom enum or text
const { data, error } = await supabase.from("opportunities").select("type").limit(5);
console.log("Types:", data);

// Check if we can select distinct types
const { data: allTypes } = await supabase.from("opportunities").select("type");
const unique = [...new Set(allTypes.map((t) => t.type))];
console.log("Unique types present in DB:", unique);
