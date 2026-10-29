import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { formatDisplayDate } from "../date-utils.ts";

test("formatDisplayDate: returns deterministic ISO dates without invoking Date.now() or locale differences", () => {
  assert.equal(formatDisplayDate("2025-05-15T14:30:00Z"), "2025-05-15");
  assert.equal(formatDisplayDate("2024-01-01T00:00:00.000Z"), "2024-01-01");
  assert.equal(formatDisplayDate(new Date("2023-12-25T10:00:00Z")), "2023-12-25");
});

test("formatDisplayDate: handles null, undefined, and invalid inputs gracefully with default fallback", () => {
  assert.equal(formatDisplayDate(null), "recently");
  assert.equal(formatDisplayDate(undefined), "recently");
  assert.equal(formatDisplayDate("not-a-valid-date"), "recently");
  assert.equal(formatDisplayDate(null, "No date"), "No date");
});

test("Prerender Guard: DashboardLayout and auth-dependent routes must await connection()", () => {
  const layoutPath = path.resolve(process.cwd(), "src/app/dashboard/layout.tsx");
  const layoutContent = fs.readFileSync(layoutPath, "utf-8");

  assert.ok(
    layoutContent.includes("import { connection } from \"next/server\""),
    "DashboardLayout must import connection from next/server"
  );
  assert.ok(
    layoutContent.includes("await connection()"),
    "DashboardLayout must await connection() before calling Supabase auth.getUser() to prevent prerender Date.now() failures"
  );

  // Verify that await connection() appears before supabase.auth.getUser()
  const connIndex = layoutContent.indexOf("await connection()");
  const authIndex = layoutContent.indexOf("auth.getUser()");
  assert.ok(
    connIndex !== -1 && authIndex !== -1 && connIndex < authIndex,
    "await connection() must precede auth.getUser() in DashboardLayout"
  );
});

test("Prerender Guard: all pages calling supabase.auth.getUser() must await connection()", () => {
  const appDir = path.resolve(process.cwd(), "src/app");
  function checkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        checkDir(fullPath);
      } else if (entry.isFile() && (entry.name === "page.tsx" || entry.name === "layout.tsx")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        if (content.includes("auth.getUser()")) {
          assert.ok(
            content.includes("await connection()"),
            `${fullPath} calls auth.getUser() so it must await connection() to prevent Next.js prerender Date.now() errors`
          );
        }
      }
    }
  }

  checkDir(appDir);
});
