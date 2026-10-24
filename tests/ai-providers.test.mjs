import test from "node:test";
import assert from "node:assert/strict";
import { AI_PROVIDERS, mergeProviders } from "../shared/ai-catalog.js";
import { generateText, listModels } from "../worker/ai.js";

const ids = ["nvidia", "cohere", "huggingface", "mistral"];
const providers = AI_PROVIDERS.filter((provider) => ids.includes(provider.id));
const env = () => ({
  ...Object.fromEntries(
    providers.map((provider) => [
      provider.secret,
      `test-only-${provider.id}-key`,
    ]),
  ),
  DB: {
    prepare: () => ({
      bind() {
        return this;
      },
      async first() {
        return null;
      },
    }),
  },
});
const settingsFor = (order) => ({
  aiProviders: [
    ...order.map((id) => ({ id, enabled: true })),
    ...AI_PROVIDERS.filter((p) => !order.includes(p.id)).map((p) => ({
      id: p.id,
      enabled: false,
    })),
  ],
});
const chatUrls = {
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  cohere: "https://api.cohere.com/v2/chat",
  huggingface: "https://router.huggingface.co/v1/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
};

test("four new providers have distinct credentials and model choices; legacy order is retained", () => {
  assert.equal(AI_PROVIDERS.length, 10);
  assert.deepEqual(
    providers.map((p) => p.id),
    ids,
  );
  assert.equal(
    new Set(AI_PROVIDERS.filter((p) => p.secret).map((p) => p.secret)).size,
    9,
  );
  for (const provider of providers) {
    assert.ok(provider.models.length >= 3);
    assert.equal(provider.enabled, false);
    assert.equal(new Set(provider.models).size, provider.models.length);
  }
  const merged = mergeProviders([
    { id: "groq", enabled: true, model: "saved-model" },
  ]);
  assert.equal(merged[0].id, "groq");
  assert.equal(merged[0].model, "saved-model");
  assert.ok(merged.filter((p) => ids.includes(p.id)).every((p) => !p.enabled));
});

for (const provider of providers) {
  test(`${provider.name} uses its own endpoint, bearer key, model and text response`, async (t) => {
    const runtime = env();
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (url, options) => {
      calls++;
      assert.equal(url, chatUrls[provider.id]);
      assert.equal(
        options.headers.Authorization,
        "Bearer " + runtime[provider.secret],
      );
      assert.equal(options.redirect, "manual");
      assert.equal(options.method, "POST");
      const body = JSON.parse(options.body);
      assert.equal(body.model, provider.models[0]);
      assert.equal(body.max_tokens, 123);
      assert.deepEqual(body.messages, [
        { role: "system", content: "Instruksi" },
        { role: "user", content: "Pertanyaan" },
      ]);
      const content = [
        { type: "thinking", thinking: "Not a spoken answer" },
        { type: "text", text: "Jawaban " },
        { type: "text", text: provider.name },
      ];
      return Response.json(
        provider.id === "cohere"
          ? { message: { content } }
          : {
              choices: [
                {
                  message: {
                    content:
                      provider.id === "nvidia" ? "Jawaban NVIDIA NIM" : content,
                  },
                },
              ],
            },
      );
    });
    const result = await generateText(runtime, {}, "Instruksi", "Pertanyaan", {
      onlyProvider: provider.id,
      maxTokens: 123,
    });
    assert.equal(calls, 1);
    assert.equal(result.providerId, provider.id);
    assert.equal(result.text, "Jawaban " + provider.name);
    assert.ok(!JSON.stringify(result).includes(runtime[provider.secret]));
  });
}

test("new provider failures and empty responses fall back in the saved order", async (t) => {
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(url);
    if (url === chatUrls.nvidia) return new Response("quota", { status: 429 });
    if (url === chatUrls.cohere)
      return Response.json({ message: { content: [] } });
    return Response.json({
      choices: [{ message: { content: "Jawaban cadangan" } }],
    });
  });
  const result = await generateText(
    env(),
    settingsFor(["nvidia", "cohere", "huggingface"]),
    "system",
    "question",
  );
  assert.deepEqual(urls, [
    chatUrls.nvidia,
    chatUrls.cohere,
    chatUrls.huggingface,
  ]);
  assert.equal(result.providerId, "huggingface");
});

test("missing new keys make no external request; failed providers never return a fake answer", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("denied", { status: 401 });
  });
  const runtime = env();
  delete runtime.NVIDIA_API_KEY;
  await assert.rejects(
    generateText(runtime, {}, "s", "q", { onlyProvider: "nvidia" }),
    /key belum diisi/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    generateText(runtime, settingsFor(["cohere", "mistral"]), "s", "q"),
    /Cohere: Provider HTTP 401; Mistral: Provider HTTP 401/,
  );
});

const modelCases = [
  {
    id: "nvidia",
    url: "https://integrate.api.nvidia.com/v1/models",
    response: {
      data: [
        null,
        { id: "meta/llama-3.3-70b-instruct" },
        { id: "nvidia/nv-embedqa-e5-v5" },
        { id: "nvidia/llama-nemotron-rerank-v1" },
        { id: "meta/llama-3.3-70b-instruct" },
        { id: "not-chat", capabilities: { completion_chat: false } },
      ],
    },
    expected: ["meta/llama-3.3-70b-instruct"],
    hasMore: false,
  },
  {
    id: "cohere",
    url: "https://api.cohere.com/v1/models?endpoint=chat&page_size=1000",
    response: {
      models: [
        { name: "command-a-03-2025", endpoints: ["chat"] },
        { name: "embed-v4.0", endpoints: ["embed"] },
        { name: "command-r", endpoints: ["chat"], is_deprecated: true },
      ],
      next_page_token: "next-page",
    },
    expected: ["command-a-03-2025"],
    hasMore: true,
  },
  {
    id: "huggingface",
    url: "https://router.huggingface.co/v1/models",
    response: {
      data: [
        {
          id: "Qwen/Qwen3-4B-Instruct-2507",
          architecture: { output_modalities: ["text"] },
          providers: [{ status: "live" }],
        },
        { id: "image-model", architecture: { output_modalities: ["image"] } },
        { id: "unavailable-chat", providers: [{ status: "error" }] },
      ],
    },
    expected: ["Qwen/Qwen3-4B-Instruct-2507"],
    hasMore: false,
  },
  {
    id: "mistral",
    url: "https://api.mistral.ai/v1/models",
    response: {
      data: [
        { id: "mistral-small-latest", capabilities: { completion_chat: true } },
        { id: "mistral-embed", capabilities: { completion_chat: false } },
        {
          id: "archived-model",
          capabilities: { completion_chat: true },
          archived: true,
        },
        { id: "missing-capability" },
      ],
    },
    expected: ["mistral-small-latest"],
    hasMore: false,
  },
];
for (const fixture of modelCases) {
  test(`${fixture.id} loads and filters its live model catalog`, async (t) => {
    const runtime = env();
    t.mock.method(globalThis, "fetch", async (url, options) => {
      assert.equal(url, fixture.url);
      assert.equal(
        options.headers.Authorization,
        "Bearer " + runtime[providers.find((p) => p.id === fixture.id).secret],
      );
      assert.equal(options.redirect, "manual");
      return Response.json(fixture.response);
    });
    const result = await listModels(runtime, fixture.id);
    assert.deepEqual(
      result.models.map((m) => m.id),
      fixture.expected,
    );
    assert.equal(result.hasMore, fixture.hasMore);
  });
}

test("public Hugging Face catalog works before a key is saved and oversized lists report truncation", async (t) => {
  const runtime = env();
  delete runtime.HUGGINGFACE_API_KEY;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://router.huggingface.co/v1/models");
    assert.deepEqual(options.headers, {});
    return Response.json({
      data: [
        ...Array.from({ length: 1001 }, (_, i) => ({ id: `org/model-${i}` })),
        { id: "" },
        { id: "x".repeat(161) },
      ],
    });
  });
  const result = await listModels(runtime, "huggingface");
  assert.equal(result.models.length, 1000);
  assert.equal(result.hasMore, true);
});
