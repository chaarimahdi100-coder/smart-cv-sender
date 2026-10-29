import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const [k, ...v] = l.trim().split("=");
      return [k.trim(), v.join("=").trim().replace(/^["']|["']$/g, "")];
    })
);

const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Generate magic link / token for chaarimahdi55@gmail.com
const { data, error } = await supabaseAdmin.auth.admin.generateLink({
  type: "magiclink",
  email: "chaarimahdi55@gmail.com",
});

console.log("Generate link error:", error);
if (data) {
  console.log("Properties:", Object.keys(data));
  const hashed_token = data.properties?.hashed_token;
  const action_link = data.properties?.action_link;
  console.log("Action link generated:", action_link);

  // We can verify the otp with anon client to get session:
  const supabaseAnon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: verifyData, error: verifyError } = await supabaseAnon.auth.verifyOtp({
    token_hash: hashed_token,
    type: "magiclink",
  });
  console.log("Verify error:", verifyError);
  console.log("Got session for:", verifyData?.user?.email);

  if (verifyData?.session) {
    const session = verifyData.session;
    // Test SSR cookie structure
    const cookieStore = [];
    const ssrClient = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return cookieStore;
        },
        setAll(toSet) {
          toSet.forEach((c) => {
            const idx = cookieStore.findIndex((x) => x.name === c.name);
            if (idx >= 0) cookieStore[idx] = c;
            else cookieStore.push(c);
          });
        },
      },
    });

    await ssrClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    console.log("Cookie store length:", cookieStore.length);
    console.log("Cookie names:", cookieStore.map((c) => c.name));

    const cookieHeader = cookieStore.map((c) => `${c.name}=${c.value}`).join("; ");

    const res = await fetch("http://localhost:3000/applications/518667a5-92ed-4192-af96-87f5df616f05/draft", {
      headers: {
        Cookie: cookieHeader,
      },
      redirect: "manual",
    });

    console.log("Fetch response status:", res.status);
    const html = await res.text();
    fs.writeFileSync("scratch/chaarimahdi55-draft.html", html, "utf8");
    console.log("Saved chaarimahdi55 draft HTML length:", html.length);
  }
}
