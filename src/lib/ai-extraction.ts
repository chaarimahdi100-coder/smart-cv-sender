export type ExtractedCVData = {
  first_name?: string;
  last_name?: string;
  email?: string;
  school?: string;
  degree?: string;
  specialty?: string;
  languages?: string[];
  skills?: string[];
  experience?: Array<{ title: string; company: string; duration: string }>;
};

/**
 * Extracts structured data from raw CV text.
 * Uses a mock fallback if AI_PROVIDER_TYPE is not set to a real provider.
 */
export async function extractCVData(text: string): Promise<{ data: ExtractedCVData; isMock: boolean }> {
  const provider = process.env.AI_PROVIDER_TYPE || "mock";

  if (provider === "mock") {
    // MOCK / DEMO EXTRACTION
    // We clearly distinguish this as a mock so users don't think it's actual AI.
    console.warn("⚠️ Using MOCK AI Extraction. Set AI_PROVIDER_TYPE='gemini' (or other) for real extraction.");
    
    // Very naive regex mock parsing just for demo purposes
    const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
    const hasFrench = text.toLowerCase().includes("fran");
    const hasEnglish = text.toLowerCase().includes("anglais") || text.toLowerCase().includes("english");
    
    const languages = [];
    if (hasFrench) languages.push("French");
    if (hasEnglish) languages.push("English");
    
    const isMock = true;

    return {
      isMock,
      data: {
        email: emailMatch ? emailMatch[1] : undefined,
        first_name: "MockFirst",
        last_name: "MockLast",
        school: "Mock University",
        degree: "Master",
        specialty: "Software Engineering",
        languages: languages.length > 0 ? languages : ["Arabic", "French"],
        skills: ["React", "TypeScript", "Next.js"],
        experience: [
          { title: "Intern", company: "MockCorp", duration: "3 months" }
        ]
      }
    };
  }

  // TODO: Implement actual LLM calls (e.g. Gemini, OpenAI) based on AI_API_KEY
  throw new Error(`Real AI provider '${provider}' is not fully implemented yet in this version.`);
}
