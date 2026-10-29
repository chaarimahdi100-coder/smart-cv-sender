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

const { data: app } = await supabase
  .from("applications")
  .select("id, user_id, opportunity_id, created_at")
  .eq("id", "518667a5-92ed-4192-af96-87f5df616f05")
  .single();

console.log("Application:", app);

const { data: users } = await supabase.auth.admin.listUsers();
console.log("Users in Auth:");
users.users.forEach((u) => console.log("User id:", u.id, "email:", u.email));
