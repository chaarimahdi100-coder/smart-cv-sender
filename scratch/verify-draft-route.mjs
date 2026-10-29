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
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  console.log("1. Authenticating as test user...");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: "chaarimahdi100@gmail.com",
    password: "Password123!",
  });

  if (authError || !authData.session) {
    console.error("Auth error:", authError);
    process.exit(1);
  }

  console.log("Auth successful! User ID:", authData.user.id);

  // Construct cookie header expected by @supabase/ssr
  // In @supabase/ssr, the auth token is stored in cookie: sb-<project_ref>-auth-token
  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0] || "127";
  // The local supabase project ref or standard supabase cookie
  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieVal = encodeURIComponent(JSON.stringify(authData.session));

  console.log("2. Fetching draft page at http://localhost:3000/applications/518667a5-92ed-4192-af96-87f5df616f05/draft ...");

  // We can also pass auth cookie via headers
  const res = await fetch("http://localhost:3000/applications/518667a5-92ed-4192-af96-87f5df616f05/draft", {
    headers: {
      Cookie: `${cookieName}=${cookieVal}; sb-access-token=${authData.session.access_token}; sb-refresh-token=${authData.session.refresh_token}`,
    },
    redirect: "manual",
  });

  console.log("HTTP Status:", res.status);
  console.log("Headers Location:", res.headers.get("location"));

  const html = await res.text();
  console.log("HTML length:", html.length);

  // Check key markers in response
  const hasSpontaneousTitle = html.includes("Candidature spontanée");
  const hasCandidateName = html.includes("Mahdi Chaari");
  const hasAvailability = html.includes("2027");
  const hasMedianet = html.includes("Medianet");
  const hasConvertedBanner = html.includes("Candidature Convertie en Candidature Spontanée");

  console.log("\n--- Verification Assertions ---");
  console.log("Has 'Candidature spontanée':", hasSpontaneousTitle);
  console.log("Has candidate name 'Mahdi Chaari':", hasCandidateName);
  console.log("Has '2027' availability:", hasAvailability);
  console.log("Has employer 'Medianet':", hasMedianet);
  console.log("Has 'Candidature Convertie en Candidature Spontanée' banner:", hasConvertedBanner);

  if (res.status === 200 && hasSpontaneousTitle && hasAvailability) {
    console.log("\n>>> SUCCESS: Draft route is verified, renders 200 OK, and saved draft data is intact! <<<");
  } else if (res.status === 307 || res.status === 302) {
    console.log("Redirected to:", res.headers.get("location"));
  } else {
    console.log("Preview of HTML:", html.slice(0, 500));
  }
}

main().catch(console.error);
