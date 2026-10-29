import test from "node:test";
import assert from "node:assert/strict";
import { computeDraftHash } from "../draft-integrity.js";

test("draft hash changes when body or attachment changes", () => {
  const original = computeDraftHash("hr@example.com", "Application", "Hello", "resume-1", "user/resume-1.pdf");
  assert.notEqual(original, computeDraftHash("hr@example.com", "Application", "Changed", "resume-1", "user/resume-1.pdf"));
  assert.notEqual(original, computeDraftHash("hr@example.com", "Application", "Hello", "resume-2", "user/resume-2.pdf"));
});

test("draft hash is stable for the same approval snapshot", () => {
  assert.equal(
    computeDraftHash("hr@example.com", "Application", "Hello", "resume-1", "user/resume-1.pdf"),
    computeDraftHash("hr@example.com", "Application", "Hello", "resume-1", "user/resume-1.pdf"),
  );
});
