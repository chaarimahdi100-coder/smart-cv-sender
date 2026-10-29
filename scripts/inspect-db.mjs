import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envText = fs.readFileSync(".env.local", "utf8");
const env = {};
envText.split("\n").forEach((line) => {
  const [k, ...v] = line.trim().split("=");
  if (k && v.length) {
    env[k.trim()] = v.join("=").trim().replace(/^["']|["']$/g, "");
  }
});

const url = env["NEXT_PUBLIC_SUPABASE_URL"];
const anon = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const supabase = createClient(url, anon);

async function inspect() {
  // Test sign in or sign up
  const testEmail = "candidate.tester@gmail.com";
  const testPass = "TestPassword123!";

  let authRes = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPass,
  });

  let session = authRes.data?.session;

  if (authRes.error) {
    console.log("Sign-in failed, attempting sign-up:", authRes.error.message);
    const signUpRes = await supabase.auth.signUp({
      email: testEmail,
      password: testPass,
    });
    if (signUpRes.error) {
      console.log("Sign-up error:", signUpRes.error.message);
    } else {
      console.log("Sign-up successful! User ID:", signUpRes.data.user?.id);
      session = signUpRes.data.session;
      console.log("Session present on sign-up:", Boolean(session));
    }
  } else {
    console.log("Signed in successfully as authenticated candidate:", authRes.data.user?.id);
  }

  // If we already have a session, use it
  if (session) {
    console.log("Active JWT token verified for user role:", session.user?.role);
  } else {
    // Try sign in again now that user exists
    const retry = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPass,
    });
    console.log("Retry sign-in session:", Boolean(retry.data?.session), "Error:", retry.error?.message);
    session = retry.data?.session;
  }

  // Now query opportunities as authenticated user
  const { data, error } = await supabase
    .from("opportunities")
    .select("*, companies(name, website)")
    .order("created_at", { ascending: false });

  console.log("Opportunities Query Error:", error);
  console.log("Total opportunities returned to authenticated candidate:", data?.length);

  if (data && data.length > 0) {
    data.forEach((op, i) => {
      console.log(
        `[${i + 1}] ID: ${op.id} | Title: "${op.title}" | Company: "${op.companies?.name}" | Active: ${op.is_active} | URL: ${op.source_url}`
      );
    });
  } else {
    console.log("Zero opportunities returned from database query.");
  }
}

inspect();
