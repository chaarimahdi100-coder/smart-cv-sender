import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.trim().split('=');
  return [k.trim(), v.join('=').trim().replace(/^["']|["']$/g, '')];
}));

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: { session } } = await supabase.auth.signInWithPassword({
  email: 'chaarimahdi100@gmail.com',
  password: 'Password123!'
});

// Use standard @supabase/ssr cookie format: base64-encoded JSON array:
const cookieVal = "base64-" + Buffer.from(JSON.stringify([session.access_token, session.refresh_token])).toString("base64");

const res = await fetch("http://localhost:3000/applications/518667a5-92ed-4192-af96-87f5df616f05/draft", {
  headers: {
    Cookie: `sb-127-auth-token=${encodeURIComponent(cookieVal)}`,
  }
});

const html = await res.text();
fs.writeFileSync("scratch/rendered-draft.html", html, "utf8");
console.log("Saved HTML of length:", html.length);

// Print any h1, h2, h3 or form inputs
const headings = html.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi) || [];
console.log("Headings found:", headings.map(h => h.replace(/<[^>]+>/g, '').trim()));

// Print input values
const inputs = html.match(/<input[^>]*value="([^"]*)"[^>]*>/gi) || [];
console.log("Input values found:", inputs.map(i => i.slice(0, 100)));

// Print textarea
const textareas = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/gi) || [];
console.log("Textareas found count:", textareas.length);
if (textareas.length > 0) {
  console.log("First textarea preview:", textareas[0].slice(0, 200));
}
