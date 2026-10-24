import { ApiError } from "./core.js";
import { AI_PROVIDERS, mergeProviders } from "../shared/ai-catalog.js";
import { getCredential } from "./credentials.js";

export async function readBounded(response, max = 1024 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError("Respons kosong.", 502);
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max)
        throw new ApiError("Respons layanan terlalu besar.", 502);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}
async function jsonResponse(response, max) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new ApiError("Provider HTTP " + response.status, 502);
  }
  return JSON.parse(new TextDecoder().decode(await readBounded(response, max)));
}
const endpoints = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  huggingface: "https://router.huggingface.co/v1",
  mistral: "https://api.mistral.ai/v1",
};
const textContent = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .filter(
            (part) => part?.type === "text" && typeof part.text === "string",
          )
          .map((part) => part.text)
          .join("")
      : "";
export async function generateText(
  env,
  settings,
  system,
  user,
  { onlyProvider, maxTokens = 400 } = {},
) {
  const failures = [];
  for (const p of mergeProviders(settings.aiProviders).filter((p) =>
    onlyProvider ? p.id === onlyProvider : p.enabled,
  )) {
    try {
      const definition = AI_PROVIDERS.find((v) => v.id === p.id);
      const key = await getCredential(env, definition.secret);
      if (!key) {
        failures.push(p.name + ": key belum diisi");
        continue;
      }
      const options = {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(18000),
      };
      let data, text;
      if (p.id === "gemini") {
        data = await jsonResponse(
          await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`,
            {
              ...options,
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": key,
              },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents: [{ role: "user", parts: [{ text: user }] }],
                generationConfig: {
                  maxOutputTokens: /^gemini-2\.5-pro/.test(p.model)
                    ? maxTokens + 1024
                    : maxTokens,
                  ...(/^gemini-2\.5-/.test(p.model)
                    ? {
                        thinkingConfig: {
                          thinkingBudget: /^gemini-2\.5-pro/.test(p.model)
                            ? 1024
                            : 0,
                        },
                      }
                    : {}),
                },
              }),
            },
          ),
        );
        text = data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || "")
          .join("");
      } else if (p.id === "anthropic") {
        data = await jsonResponse(
          await fetch("https://api.anthropic.com/v1/messages", {
            ...options,
            headers: {
              "Content-Type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: p.model,
              max_tokens: maxTokens,
              system,
              messages: [{ role: "user", content: user }],
            }),
          }),
        );
        text = data.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("");
      } else if (p.id === "cohere") {
        data = await jsonResponse(
          await fetch("https://api.cohere.com/v2/chat", {
            ...options,
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + key,
            },
            body: JSON.stringify({
              model: p.model,
              max_tokens: maxTokens,
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
            }),
          }),
        );
        text = textContent(data.message?.content);
      } else {
        data = await jsonResponse(
          await fetch(endpoints[p.id] + "/chat/completions", {
            ...options,
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + key,
            },
            body: JSON.stringify({
              model: p.model,
              [p.id === "openai" ? "max_completion_tokens" : "max_tokens"]:
                /^(gpt-5|o[134])/.test(p.model)
                  ? Math.max(2048, maxTokens)
                  : maxTokens,
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
            }),
          }),
        );
        text = textContent(data.choices?.[0]?.message?.content);
      }
      if (typeof text !== "string" || !text.trim())
        throw new ApiError("Jawaban kosong", 502);
      return {
        text: text.trim().slice(0, 5000),
        provider: p.name,
        providerId: p.id,
        model: p.model,
      };
    } catch (error) {
      failures.push(
        p.name +
          ": " +
          (error instanceof ApiError ? error.message : "tidak merespons"),
      );
    }
  }
  throw new ApiError("AI belum siap. " + failures.join("; "), 503);
}

function isChatModel(provider, model) {
  if (!model || typeof model.id !== "string") return false;
  if (provider === "openai")
    return (
      /^(gpt-|o[134])/.test(model.id) &&
      !/audio|realtime|transcribe|tts|image|search|codex/.test(model.id)
    );
  if (provider === "mistral")
    return model.capabilities?.completion_chat === true && !model.archived;
  if (provider === "nvidia")
    return (
      model.capabilities?.completion_chat !== false &&
      !/embed|rerank|reward|guard|safety|gliner|nvclip|nv-dinov2|nemotron-parse|(?:^|\/)flux|stable-diffusion|riva|parakeet|canary|whisper/i.test(
        model.id,
      )
    );
  if (provider === "huggingface")
    return (
      (!model.architecture?.output_modalities ||
        model.architecture.output_modalities.includes("text")) &&
      (!Array.isArray(model.providers) ||
        model.providers.some((p) => p.status === "live"))
    );
  return true;
}

export async function listModels(env, id) {
  const provider = AI_PROVIDERS.find((p) => p.id === id);
  if (!provider) throw new ApiError("Provider tidak dikenal.");
  const key = await getCredential(env, provider.secret);
  if (!key && !["openrouter", "huggingface"].includes(id))
    throw new ApiError("Isi API key provider sebelum memuat model.");
  let url, headers;
  if (id === "gemini") {
    url =
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";
    headers = { "x-goog-api-key": key };
  } else if (id === "anthropic") {
    url = "https://api.anthropic.com/v1/models?limit=1000";
    headers = { "x-api-key": key, "anthropic-version": "2023-06-01" };
  } else if (id === "cohere") {
    url = "https://api.cohere.com/v1/models?endpoint=chat&page_size=1000";
    headers = { Authorization: "Bearer " + key };
  } else {
    url = endpoints[id] + "/models";
    headers = key ? { Authorization: "Bearer " + key } : {};
  }
  const data = await jsonResponse(
    await fetch(url, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    }),
    8 * 1024 * 1024,
  );
  const rawModels =
    id === "gemini" || id === "cohere" ? data.models : data.data;
  if (!Array.isArray(rawModels))
    throw new ApiError("Daftar model dari provider tidak valid.", 502);
  const values =
    id === "gemini"
      ? rawModels
          .filter(
            (m) =>
              typeof m?.name === "string" &&
              m.supportedGenerationMethods?.includes("generateContent"),
          )
          .map((m) => ({
            id: m.name.replace(/^models\//, ""),
            name: m.displayName || m.name,
          }))
      : id === "cohere"
        ? rawModels
            .filter(
              (m) => m && !m.is_deprecated && m.endpoints?.includes("chat"),
            )
            .map((m) => ({ id: m.name, name: m.name }))
        : rawModels
            .filter((m) => isChatModel(id, m))
            .map((m) => ({ id: m.id, name: m.display_name || m.name || m.id }));
  const seen = new Set();
  const models = values.filter((m) => {
    if (
      typeof m.id !== "string" ||
      !m.id.trim() ||
      m.id.length > 160 ||
      seen.has(m.id)
    )
      return false;
    seen.add(m.id);
    return true;
  });
  return {
    models: models.slice(0, 1000),
    hasMore: Boolean(
      data.has_more ||
      data.nextPageToken ||
      data.next_page_token ||
      models.length > 1000,
    ),
    source: "provider",
  };
}

export async function synthesize(env, text, voice = "onyx") {
  const key = await getCredential(env, "OPENAI_API_KEY");
  if (!key)
    throw new ApiError(
      "Suara AI memerlukan key OpenAI di Konfigurasi AI.",
      503,
    );
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(25000),
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice,
      input: text.slice(0, 1600),
      response_format: "mp3",
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new ApiError("Suara AI gagal: HTTP " + response.status, 502);
  }
  return readBounded(response, 8 * 1024 * 1024);
}
