import fs from "fs";
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

const cookiesList = [];
const client = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: {
    getAll() {
      return cookiesList;
    },
    setAll(toSet) {
      toSet.forEach((c) => {
        const existing = cookiesList.findIndex((x) => x.name === c.name);
        if (existing >= 0) cookiesList[existing] = c;
        else cookiesList.push(c);
      });
    },
  },
});

const { data, error } = await client.auth.signInWithPassword({
  email: "chaarimahdi55@gmail.com",
  password: "Password123!",
});

console.log("Error:", error);
console.log("Cookies set count:", cookiesList.length);
console.log("Cookies:", cookiesList.map((c) => ({ name: c.name, len: c.value.length })));

// Now let's fetch the draft page using these exact cookies!
const cookieHeader = cookiesList.map((c) => `${c.name}=${c.value}`).join("; ");

const res = await fetch("http://localhost:3000/applications/518667a5-92ed-4192-af96-87f5df616f05/draft", {
  headers: {
    Cookie: cookieHeader,
  },
  redirect: "manual",
});

console.log("Response status:", res.status);
console.log("Response headers location:", res.headers.get("location"));
const html = await res.text();
fs.writeFileSync("scratch/authenticated-draft.html", html, "utf8");
console.log("Saved draft page HTML length:", html.length);
