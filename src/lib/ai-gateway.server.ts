// App AI via Google Gemini (direct) — not Lovable AI gateway credits.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export type GeminiTier = "flash" | "flash-lite";

const MODEL_IDS: Record<GeminiTier, string> = {
  /** Morning brief, replies, assistant — richer generation */
  flash: "gemini-3.6-flash",
  /** Parse, classify, extract — high volume / cheap */
  "flash-lite": "gemini-3.5-flash-lite",
};

/** Prefer GOOGLE_GENERATIVE_AI_API_KEY (AI SDK default); GEMINI_API_KEY also accepted. */
export function getGeminiApiKey(): string | null {
  const key =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || "";
  return key || null;
}

export function createGeminiProvider(apiKey?: string) {
  const key = apiKey ?? getGeminiApiKey();
  if (!key) {
    throw new Error(
      "Missing GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY). Create a key in Google AI Studio.",
    );
  }
  return createGoogleGenerativeAI({ apiKey: key });
}

/** Provider instance with `.tools` (e.g. googleSearch). */
export type GeminiProvider = ReturnType<typeof createGeminiProvider>;

/** Language model for in-app AI. Flash for quality, Flash Lite for bulk/cheap. */
export function getGeminiModel(tier: GeminiTier = "flash"): LanguageModel {
  const google = createGeminiProvider();
  return google(MODEL_IDS[tier]);
}

export function geminiModelId(tier: GeminiTier = "flash"): string {
  return MODEL_IDS[tier];
}
