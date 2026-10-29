import test from "node:test";
import assert from "node:assert/strict";
import { formatLanguages, sanitizeProfileData } from "../profile-utils.ts";

test("Profile: formatLanguages correctly handles null, empty, and comma-separated languages", () => {
  assert.deepEqual(formatLanguages(null), []);
  assert.deepEqual(formatLanguages(""), []);
  assert.deepEqual(formatLanguages("  "), []);
  assert.deepEqual(formatLanguages("French, English, Arabic"), ["French", "English", "Arabic"]);
  assert.deepEqual(formatLanguages(" French ,  , English  "), ["French", "English"]);
});

test("Profile: sanitizeProfileData correctly sanitizes inputs, binds user ID and email, and formats timestamp", () => {
  const user = { id: "user-abc-123", email: "candidate@example.com" };
  const formData = new FormData();
  formData.append("first_name", "  Jane  ");
  formData.append("last_name", "Doe");
  formData.append("country", "Tunisia");
  formData.append("city", "Tunis");
  formData.append("school", "ENIT");
  formData.append("degree", "Engineer");
  formData.append("specialty", "Computer Science");
  formData.append("languages", "French, English");

  const sanitized = sanitizeProfileData(user, formData);

  assert.equal(sanitized.id, "user-abc-123");
  assert.equal(sanitized.email, "candidate@example.com");
  assert.equal(sanitized.first_name, "Jane");
  assert.equal(sanitized.last_name, "Doe");
  assert.equal(sanitized.country, "Tunisia");
  assert.equal(sanitized.city, "Tunis");
  assert.equal(sanitized.school, "ENIT");
  assert.equal(sanitized.degree, "Engineer");
  assert.equal(sanitized.specialty, "Computer Science");
  assert.deepEqual(sanitized.languages, ["French", "English"]);
  assert.ok(sanitized.updated_at, "Should include updated_at timestamp");
  assert.ok(!isNaN(Date.parse(sanitized.updated_at)), "updated_at should be a valid ISO date");
});

test("Profile: sanitizeProfileData converts blank inputs to null", () => {
  const user = { id: "user-456", email: "user@test.com" };
  const formData = new FormData();
  formData.append("first_name", "   ");
  formData.append("last_name", "");

  const sanitized = sanitizeProfileData(user, formData);
  assert.equal(sanitized.first_name, null);
  assert.equal(sanitized.last_name, null);
  assert.equal(sanitized.country, null);
  assert.deepEqual(sanitized.languages, []);
});
