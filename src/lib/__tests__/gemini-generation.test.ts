import test from "node:test";
import assert from "node:assert/strict";
import {
  generateProfessionalEmailDraft,
  type CandidateData,
  type OpportunityData,
} from "../email-generator.ts";

const mockCandidate: CandidateData = {
  first_name: "Mahdi",
  last_name: "Chaari",
  email: "mahdi.chaari@esprit.tn",
  phone: "+216 22 123 456",
  school: "Esprit School of Business",
  degree: "Licence en Informatique de Gestion",
  specialty: "Business Information Systems",
  city: "Tunis",
  country: "Tunisie",
  rawCvText: "Projet développé avec PHP, Laravel, TypeScript, Next.js, PostgreSQL et Docker. Ecom Doctor: Plateforme d analytics e-commerce.",
};

const mockOpportunity: OpportunityData = {
  title: "Stage PFE - Développeur Fullstack Next.js",
  companyName: "TechCorp Solutions",
  description: "Conception et développement d une application web moderne avec Next.js, TypeScript et PostgreSQL.",
  type: "PFE",
};

test("generateProfessionalEmailDraft: falls back to deterministic mode when AI_PROVIDER_TYPE is mock", async () => {
  const origProvider = process.env.AI_PROVIDER_TYPE;
  process.env.AI_PROVIDER_TYPE = "mock";

  try {
    const draft = await generateProfessionalEmailDraft(mockCandidate, mockOpportunity);

    assert.equal(draft.isAiGenerated, false);
    assert.equal(draft.provider, "mock");
    assert.ok(draft.subject.includes("PFE"));
    assert.ok(draft.body.includes("Mahdi Chaari"));
    assert.ok(draft.body.includes("Esprit School of Business"));
  } finally {
    process.env.AI_PROVIDER_TYPE = origProvider;
  }
});

test("generateProfessionalEmailDraft: falls back to deterministic mode when GEMINI_API_KEY is missing", async () => {
  const origProvider = process.env.AI_PROVIDER_TYPE;
  const origKey = process.env.GEMINI_API_KEY;
  const origAiKey = process.env.AI_API_KEY;

  process.env.AI_PROVIDER_TYPE = "gemini";
  delete process.env.GEMINI_API_KEY;
  delete process.env.AI_API_KEY;

  try {
    const draft = await generateProfessionalEmailDraft(mockCandidate, mockOpportunity);

    assert.equal(draft.isAiGenerated, false);
    assert.equal(draft.provider, "mock");
    assert.ok(draft.subject.includes("Stage PFE"));
    assert.ok(draft.body.includes("TechCorp Solutions"));
  } finally {
    process.env.AI_PROVIDER_TYPE = origProvider;
    if (origKey !== undefined) process.env.GEMINI_API_KEY = origKey;
    if (origAiKey !== undefined) process.env.AI_API_KEY = origAiKey;
  }
});

test("generateProfessionalEmailDraft: successfully parses valid Gemini JSON response", async () => {
  const origProvider = process.env.AI_PROVIDER_TYPE;
  const origKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;

  process.env.AI_PROVIDER_TYPE = "gemini";
  process.env.GEMINI_API_KEY = "test-dummy-gemini-key";

  globalThis.fetch = async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    subject: "Candidature Stage PFE Développeur - Mahdi Chaari",
                    body: "Madame, Monsieur,\n\nJe vous adresse ma candidature pour le stage PFE au sein de TechCorp Solutions.\n\nCordialement,\nMahdi Chaari",
                  }),
                },
              ],
            },
          },
        ],
      }),
    } as unknown as Response;
  };

  try {
    const draft = await generateProfessionalEmailDraft(mockCandidate, mockOpportunity);

    assert.equal(draft.isAiGenerated, true);
    assert.equal(draft.provider, "gemini");
    assert.equal(draft.subject, "Candidature Stage PFE Développeur - Mahdi Chaari");
    assert.ok(draft.body.includes("TechCorp Solutions"));
    assert.ok(draft.body.includes("Mahdi Chaari"));
  } finally {
    process.env.AI_PROVIDER_TYPE = origProvider;
    if (origKey !== undefined) process.env.GEMINI_API_KEY = origKey;
    globalThis.fetch = origFetch;
  }
});

test("generateProfessionalEmailDraft: falls back gracefully on Gemini API failure without throwing", async () => {
  const origProvider = process.env.AI_PROVIDER_TYPE;
  const origKey = process.env.GEMINI_API_KEY;
  const origFetch = globalThis.fetch;

  process.env.AI_PROVIDER_TYPE = "gemini";
  process.env.GEMINI_API_KEY = "test-dummy-gemini-key";

  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 404,
      json: async () => ({
        error: { message: "Model not found" },
      }),
    } as unknown as Response;
  };

  try {
    const draft = await generateProfessionalEmailDraft(mockCandidate, mockOpportunity);

    assert.equal(draft.isAiGenerated, false);
    assert.equal(draft.provider, "mock");
    assert.ok(draft.fallbackReason?.includes("404") || draft.fallbackReason?.includes("Model not found"));
    assert.ok(draft.subject.includes("PFE"));
    assert.ok(draft.body.includes("TechCorp Solutions"));
  } finally {
    process.env.AI_PROVIDER_TYPE = origProvider;
    if (origKey !== undefined) process.env.GEMINI_API_KEY = origKey;
    globalThis.fetch = origFetch;
  }
});
