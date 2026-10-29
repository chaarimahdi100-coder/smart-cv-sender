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

async function run() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "chaarimahdi100@gmail.com",
    password: "Password123!",
  });

  if (error) {
    console.error("Auth error:", error);
    return;
  }

  const session = data.session;
  console.log("Logged in:", data.user.email);

  // Next.js @supabase/ssr creates cookie named `sb-127-auth-token` as JSON stringified array of tokens or base64
  // Let's test what `src/utils/supabase/server.ts` receives
  // In @supabase/ssr, the cookie value format is:
  // `base64-` + Buffer.from(JSON.stringify(session)).toString('base64')
  // OR plain JSON string: JSON.stringify(session)
  const sessionData = [session.access_token, session.refresh_token];
  const cookieValue = "base64-" + Buffer.from(JSON.stringify(sessionData)).toString("base64");
  
  // Or standard @supabase/ssr format:
  // `sb-127-auth-token.0` and `sb-127-auth-token.1` if chunked, or `sb-127-auth-token`
  const cookies = [
    `sb-127-auth-token=${encodeURIComponent(cookieValue)}`,
    `sb-127-auth-token=${encodeURIComponent(JSON.stringify(session))}`,
    `sb-localhost-auth-token=${encodeURIComponent(JSON.stringify(session))}`,
    `sb-access-token=${session.access_token}`,
    `sb-refresh-token=${session.refresh_token}`
  ].join("; ");

  const res = await fetch("http://localhost:3000/applications/518667a5-92ed-4192-af96-87f5df616f05/draft", {
    headers: {
      Cookie: cookies,
      "User-Agent": "Mozilla/5.0",
    },
    redirect: "manual",
  });

  console.log("Status:", res.status);
  console.log("Location:", res.headers.get("location"));
  const html = await res.text();
  console.log("HTML length:", html.length);
  
  // Print title tag or body text
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  console.log("Title tag:", titleMatch ? titleMatch[1] : "None");

  // Check if it's the login page
  if (html.includes("Sign in to Smart CV Sender") || html.includes("/login")) {
    console.log("Rendered Login page!");
  }
  if (html.includes("Personalized Email Draft")) {
    console.log("SUCCESS! Rendered Personalized Email Draft page!");
  }
  if (html.includes("Candidature spontanée")) {
    console.log("SUCCESS! Draft content contains 'Candidature spontanée'!");
  }
  if (html.includes("518667a5-92ed-4192-af96-87f5df616f05")) {
    console.log("SUCCESS! Draft page contains application ID!");
  }
}

run();
