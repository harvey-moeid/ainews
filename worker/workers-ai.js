import { ApiError } from "./core.js";

export function workersAiAvailable(env) {
  return typeof env.AI?.run === "function";
}
function binding(env) {
  if (!workersAiAvailable(env))
    throw new ApiError(
      "Binding AI belum tersedia. Pasang binding Workers AI bernama AI pada Worker.",
      503,
    );
  return env.AI;
}
function chatModel(name) {
  return (
    typeof name === "string" &&
    /^@(cf|hf)\/[a-zA-Z0-9._/-]+$/.test(name) &&
    !/gpt-oss|llama-guard|embed|rerank|m2m100/i.test(name)
  );
}
export async function runWorkersAi(env, model, system, user, maxTokens) {
  const ai = binding(env);
  if (!chatModel(model))
    throw new ApiError("Pilih model chat Workers AI yang mendukung messages.");
  return ai.run(
    model,
    {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      stream: false,
    },
    { signal: AbortSignal.timeout(18000) },
  );
}
export async function listWorkersAiModels(env) {
  const ai = binding(env);
  if (typeof ai.models !== "function")
    throw new ApiError(
      "Binding ini tidak menyediakan katalog model. Gunakan pilihan model bawaan.",
      503,
    );
  let result;
  try {
    result = await ai.models({
      page: 1,
      per_page: 100,
      hide_experimental: true,
    });
  } catch {
    throw new ApiError(
      "Katalog Workers AI tidak dapat dimuat. Periksa akses akun Cloudflare atau gunakan model bawaan.",
      502,
    );
  }
  if (!Array.isArray(result))
    throw new ApiError("Katalog Workers AI tidak valid.", 502);
  const seen = new Set();
  const models = result
    .filter((model) => {
      if (
        model?.task?.name !== "Text Generation" ||
        !chatModel(model.name) ||
        model.name.length > 160 ||
        seen.has(model.name)
      )
        return false;
      if (model.tags?.some((tag) => /deprecated/i.test(tag))) return false;
      if (
        model.properties?.some(
          (property) =>
            (property.property_id === "deprecated" &&
              [true, "true"].includes(property.value)) ||
            (property.property_id === "deprecation_date" &&
              Date.parse(property.value) <= Date.now()),
        )
      )
        return false;
      seen.add(model.name);
      return true;
    })
    .map((model) => ({ id: model.name, name: model.name }));
  return { models, hasMore: result.length >= 100, source: "provider" };
}
