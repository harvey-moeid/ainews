import test from "node:test";
import assert from "node:assert/strict";
import { AI_PROVIDERS, mergeProviders } from "../shared/ai-catalog.js";
import { generateText, listModels } from "../worker/ai.js";
import { database, request } from "./helpers.mjs";
import { initialSettings } from "../src/data.js";

const definition = AI_PROVIDERS.find((p) => p.id === "workersai");
const model = definition.models[0];
const settings = (...ids) => ({
  aiProviders: AI_PROVIDERS.map((p) => ({
    ...p,
    enabled: ids.includes(p.id),
  })).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)),
});

test("Workers AI appends to saved provider order without an API key or automatic activation", () => {
  assert.equal(definition.binding, "AI");
  assert.equal(definition.secret, undefined);
  const merged = mergeProviders([
    { id: "groq", model: "saved-model", enabled: true },
  ]);
  assert.equal(merged[0].id, "groq");
  assert.equal(merged[0].model, "saved-model");
  assert.equal(merged.find((p) => p.id === "workersai").enabled, false);
  assert.ok(definition.models.every((name) => name.startsWith("@cf/")));
});

test("native inference sends messages and token limit through the binding without credentials or REST", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw Error("REST should not be called");
  });
  let calls = 0;
  const env = {
    AI: {
      async run(name, input, options) {
        assert.equal(this, env.AI);
        assert.equal(name, model);
        assert.deepEqual(input, {
          messages: [
            { role: "system", content: "Instruksi" },
            { role: "user", content: "Pertanyaan" },
          ],
          max_tokens: 123,
          stream: false,
        });
        assert.ok(options.signal instanceof AbortSignal);
        calls++;
        return calls === 1
          ? { response: " Jawaban native " }
          : {
              choices: [
                {
                  message: {
                    content: [
                      { type: "reasoning", text: "Internal" },
                      { type: "text", text: "Jawaban chat" },
                    ],
                  },
                },
              ],
            };
      },
    },
  };
  assert.equal(
    (
      await generateText(env, {}, "Instruksi", "Pertanyaan", {
        onlyProvider: "workersai",
        maxTokens: 123,
      })
    ).text,
    "Jawaban native",
  );
  const chat = await generateText(env, {}, "Instruksi", "Pertanyaan", {
    onlyProvider: "workersai",
    maxTokens: 123,
  });
  assert.equal(chat.text, "Jawaban chat");
  assert.equal(chat.providerId, "workersai");
  assert.equal(calls, 2);
});

test("missing or failed Workers AI falls back in saved order; all failures remain explicit", async (t) => {
  const called = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    called.push(url);
    return Response.json({ choices: [{ message: { content: "Cadangan" } }] });
  });
  const env = { OPENAI_API_KEY: "test-only" };
  assert.equal(
    (await generateText(env, settings("workersai", "openai"), "s", "u"))
      .providerId,
    "openai",
  );
  assert.equal(called.length, 1);
  for (const response of [
    undefined,
    { response: " " },
    { choices: [{ message: { reasoning_content: "Internal" } }] },
  ]) {
    env.AI = { run: async () => response };
    assert.equal(
      (await generateText(env, settings("workersai", "openai"), "s", "u")).text,
      "Cadangan",
    );
    await assert.rejects(
      generateText(env, {}, "s", "u", { onlyProvider: "workersai" }),
      /Jawaban kosong/,
    );
  }
  env.AI = {
    run: async () => {
      throw Error("private-account-detail");
    },
  };
  await assert.rejects(
    generateText(env, {}, "s", "u", { onlyProvider: "workersai" }),
    (error) =>
      error.status === 503 && !error.message.includes("private-account-detail"),
  );
  await assert.rejects(
    generateText({}, {}, "s", "u", { onlyProvider: "workersai" }),
    /Binding AI belum tersedia/,
  );
});

test("live binding catalog uses model names and excludes non-chat, deprecated, and incompatible models", async () => {
  const catalog = [
    {
      id: "uuid-not-model-name",
      name: model,
      task: { name: "Text Generation" },
    },
    { name: model, task: { name: "Text Generation" } },
    {
      name: "@cf/openai/whisper",
      task: { name: "Automatic Speech Recognition" },
    },
    { name: "@cf/baai/bge-m3", task: { name: "Text Embeddings" } },
    { name: "@cf/meta/llama-guard-3-8b", task: { name: "Text Generation" } },
    { name: "@cf/openai/gpt-oss-120b", task: { name: "Text Generation" } },
    {
      name: "@cf/test/old",
      task: { name: "Text Generation" },
      tags: ["Deprecated"],
    },
    {
      name: "@cf/test/expired",
      task: { name: "Text Generation" },
      properties: [{ property_id: "deprecation_date", value: "2020-01-01" }],
    },
    { name: "openai/external-model", task: { name: "Text Generation" } },
    null,
  ];
  const env = {
    AI: {
      run() {},
      async models(options) {
        assert.equal(this, env.AI);
        assert.equal(options.per_page, 100);
        return catalog;
      },
    },
  };
  const result = await listModels(env, "workersai");
  assert.deepEqual(result.models, [{ id: model, name: model }]);
  assert.equal(result.hasMore, false);
  env.AI.models = async () =>
    Array.from({ length: 100 }, (_, i) => ({
      name: `@cf/test/chat-${i}`,
      task: { name: "Text Generation" },
    }));
  assert.equal((await listModels(env, "workersai")).hasMore, true);
  env.AI.models = async () => {
    throw Error("private detail");
  };
  await assert.rejects(
    listModels(env, "workersai"),
    /Katalog Workers AI tidak dapat dimuat/,
  );
  delete env.AI.models;
  await assert.rejects(listModels(env, "workersai"), /model bawaan/);
  await assert.rejects(
    listModels({}, "workersai"),
    /Binding AI belum tersedia/,
  );
});

test("catalog and health distinguish a missing binding; saved Workers AI powers tests and editor generation", async () => {
  const { sqlite, env } = database();
  try {
    assert.equal(
      (await request(env, "/ai/health", null, "GET")).data.workersai,
      false,
    );
    let catalog = (await request(env, "/ai/catalog", null, "GET")).data;
    assert.equal(catalog.bindings.AI, "missing");
    assert.equal(Object.hasOwn(catalog.credentials, "undefined"), false);
    assert.equal(
      (
        await request(
          env,
          "/ai/keys",
          { name: "AI", value: "not-a-real-key-value" },
          "PUT",
        )
      ).status,
      400,
    );
    let calls = 0;
    env.AI = {
      async run() {
        calls++;
        return { response: "Naskah Workers AI untuk pengujian." };
      },
    };
    assert.equal(
      (await request(env, "/ai/health", null, "GET")).data.workersai,
      true,
    );
    catalog = (await request(env, "/ai/catalog", null, "GET")).data;
    assert.equal(catalog.bindings.AI, "available");
    assert.equal(
      (
        await request(
          env,
          "/settings",
          { ...initialSettings, ...settings("workersai") },
          "PUT",
        )
      ).status,
      200,
    );
    const reloaded = (await request(env, "/bootstrap", null, "GET")).data
      .settings.aiProviders;
    assert.equal(reloaded.find((p) => p.id === "workersai").enabled, true);
    assert.equal(
      (await request(env, "/ai/test", { provider: "workersai" })).data
        .providerId,
      "workersai",
    );
    assert.equal(
      (
        await request(env, "/ai", {
          text: "Materi sumber untuk pengujian naskah. ".repeat(5),
        })
      ).data.script,
      "Naskah Workers AI untuk pengujian.",
    );
    assert.equal(calls, 2);
  } finally {
    sqlite.close();
  }
});
