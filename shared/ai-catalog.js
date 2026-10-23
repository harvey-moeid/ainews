export const AI_PROVIDERS = [
  {
    id: "gemini",
    name: "Google Gemini",
    secret: "GEMINI_API_KEY",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
    enabled: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    secret: "ANTHROPIC_API_KEY",
    models: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
    enabled: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    secret: "OPENROUTER_API_KEY",
    models: [
      "openai/gpt-4.1-mini",
      "google/gemini-2.5-flash",
      "anthropic/claude-sonnet-4",
    ],
    enabled: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    secret: "OPENAI_API_KEY",
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
    enabled: false,
  },
  {
    id: "groq",
    name: "Groq",
    secret: "GROQ_API_KEY",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    enabled: false,
  },
];
export function mergeProviders(saved = []) {
  const result = [],
    seen = new Set();
  for (const value of [...saved, ...AI_PROVIDERS]) {
    const provider = AI_PROVIDERS.find((p) => p.id === value.id);
    if (!provider || seen.has(value.id)) continue;
    seen.add(value.id);
    result.push({
      id: provider.id,
      name: provider.name,
      model: value.model || provider.models[0],
      enabled: Boolean(value.enabled),
    });
  }
  return result;
}

export const OVERLAY2_DEFAULTS = {
  name: "NARA",
  title: "PASURUAN AI NEWS TV · OVERLAY 2",
  banner: "KABAR PASURUAN · TANYA LEWAT KOMENTAR",
  connectorUrl: "https://tiktok-live-konektor.onrender.com",
  comments: true,
  readComment: true,
  cooldown: 15,
  maxQueue: 20,
  voiceMode: "browser",
  voice: "onyx",
  loopNews: true,
  prompt:
    "Kamu Nara, host berita lokal berbahasa Indonesia. Jawab dengan hangat, ringkas, dan netral. Jangan mengarang informasi aktual. Maksimal 60 kata.",
};
