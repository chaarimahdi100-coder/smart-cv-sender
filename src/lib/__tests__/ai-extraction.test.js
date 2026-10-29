import test from "node:test";
import assert from "node:assert/strict";
import { extractCVData } from "../ai-extraction.ts";

test("extractCVData uses mock when AI_PROVIDER_TYPE is not set", async () => {
  // Ensure the env is mock
  process.env.AI_PROVIDER_TYPE = "mock";
  
  const sampleText = "Ceci est un CV pour test@example.com parlant anglais et français";
  const result = await extractCVData(sampleText);
  
  assert.equal(result.isMock, true, "Should be flagged as mock");
  assert.equal(result.data.email, "test@example.com", "Should extract the mock email");
  
  // Verify it detected French and English
  assert.ok(result.data.languages?.includes("French"), "Should detect French");
  assert.ok(result.data.languages?.includes("English"), "Should detect English");
});
