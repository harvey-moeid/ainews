import { CHARACTER_DEFAULTS } from "./character.js";

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
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    secret: "NVIDIA_API_KEY",
    models: [
      "meta/llama-3.3-70b-instruct",
      "meta/llama-3.1-8b-instruct",
      "meta/llama-3.1-70b-instruct",
      "microsoft/phi-4-mini-instruct",
    ],
    enabled: false,
    keyHelp: "Gunakan API key NVIDIA API Catalog dari build.nvidia.com.",
    docsUrl: "https://docs.api.nvidia.com/nim/reference/llm-apis",
  },
  {
    id: "cohere",
    name: "Cohere",
    secret: "COHERE_API_KEY",
    models: [
      "command-a-03-2025",
      "command-a-plus-05-2026",
      "command-r7b-12-2024",
      "command-r-08-2024",
      "command-r-plus-08-2024",
    ],
    enabled: false,
    keyHelp: "Gunakan API key dari dashboard Cohere.",
    docsUrl: "https://docs.cohere.com/docs/models",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    secret: "HUGGINGFACE_API_KEY",
    models: [
      "Qwen/Qwen3-4B-Instruct-2507",
      "meta-llama/Llama-3.3-70B-Instruct",
      "Qwen/Qwen3-235B-A22B-Instruct-2507",
      "openai/gpt-oss-120b",
    ],
    enabled: false,
    keyHelp:
      "Gunakan token Hugging Face dengan izin Inference Providers. Model gated memerlukan akses akun.",
    docsUrl:
      "https://huggingface.co/docs/inference-providers/en/tasks/chat-completion",
  },
  {
    id: "mistral",
    name: "Mistral",
    secret: "MISTRAL_API_KEY",
    models: [
      "mistral-small-latest",
      "mistral-medium-latest",
      "mistral-large-latest",
      "ministral-8b-2512",
      "mistral-large-4",
    ],
    enabled: false,
    keyHelp: "Gunakan API key dari Mistral Studio/La Plateforme.",
    docsUrl: "https://docs.mistral.ai/models",
  },
  {
    id: "workersai",
    name: "Cloudflare Workers AI",
    binding: "AI",
    models: [
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "@cf/meta/llama-3.1-8b-instruct-fast",
      "@cf/meta/llama-4-scout-17b-16e-instruct",
    ],
    enabled: false,
    keyHelp:
      "Menggunakan binding AI pada Worker tanpa API key terpisah. Pemakaian mengikuti kuota akun Cloudflare.",
    docsUrl:
      "https://developers.cloudflare.com/workers-ai/configuration/bindings/",
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
  connectorMode: "rest",
  connectorAccount: "",
  comments: true,
  readComment: true,
  cooldown: 15,
  maxQueue: 20,
  voiceMode: "browser",
  voice: "onyx",
  loopNews: true,
  transcriptX: 50,
  transcriptY: 60,
  transcriptWidth: 88,
  ...CHARACTER_DEFAULTS,
  prompt:
    "Kamu Nara, host berita lokal berbahasa Indonesia. Jawab dengan hangat, ringkas, dan netral. Jangan mengarang informasi aktual. Maksimal 60 kata.",
};
