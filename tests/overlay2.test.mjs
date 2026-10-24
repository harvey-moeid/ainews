import test from "node:test";
import assert from "node:assert/strict";
import { saveStory } from "../worker/index.js";
import { database, request } from "./helpers.mjs";
import {
  normalizeEvent,
  ingestEvents,
  validateOverlay2,
} from "../worker/overlay2.js";
import {
  encryptCredential,
  decryptCredential,
  getCredential,
} from "../worker/credentials.js";
import { AI_PROVIDERS } from "../shared/ai-catalog.js";
import { answerWithNews, retrieveNews } from "../worker/rag.js";
import { generateText, listModels } from "../worker/ai.js";
import { initialSettings } from "../src/data.js";

const settings = {
  ...initialSettings,
  aiProviders: initialSettings.aiProviders.map((p) => ({
    ...p,
    enabled: p.id === "openai",
  })),
};
const event = (id, kind, username, room = "room-a", extra = {}) => ({
  id,
  event: kind,
  roomId: room,
  timestamp: new Date().toISOString(),
  data: {
    username,
    nickname: "Nama sama",
    message: "Bagaimana membuat nasi goreng?",
    ...extra,
  },
});
const story = {
  title: "Banjir Pasuruan surut",
  text: "Banjir Pasuruan surut pada Selasa. BPBD membuka dua posko bantuan di kecamatan Bugul Kidul.",
  script: "BPBD membuka dua posko untuk banjir Pasuruan.",
  source_name: "BPBD",
  source_url: "https://example.com/berita",
  region: "Kota Pasuruan",
  category: "Pemerintahan",
  priority: "reguler",
  status: "approved",
  published_at: "2026-10-20T08:00:00Z",
};

test("Overlay 2 title, transcript layout and character persist through settings and player state", async () => {
  const { sqlite, env } = database();
  try {
    const title = "Kabar Warga · Pasuruan";
    const saved = await request(
      env,
      "/settings",
      {
        ...settings,
        overlay2: {
          ...settings.overlay2,
          title,
          transcriptX: 25,
          transcriptY: 90,
          transcriptWidth: 70,
          hairStyle: "bob",
          accessory: "glasses",
          hairColor: "#9b537b",
          faceColor: "#3479ab",
          eyeColor: "#45da92",
        },
      },
      "PUT",
    );
    assert.equal(saved.status, 200);
    const state = await request(env, "/overlay2/state", undefined, "GET");
    assert.equal(state.data.config.title, title);
    assert.equal(state.data.config.transcriptX, 25);
    assert.equal(state.data.config.transcriptY, 90);
    assert.equal(state.data.config.transcriptWidth, 70);
    assert.equal(state.data.config.hairStyle, "bob");
    assert.equal(state.data.config.accessory, "glasses");
    assert.equal(state.data.config.hairColor, "#9b537b");
    assert.equal(state.data.config.faceColor, "#3479ab");
    assert.equal(state.data.config.eyeColor, "#45da92");
    const { title: unused, ...legacy } = state.data.config;
    assert.equal(
      validateOverlay2(legacy).title,
      initialSettings.overlay2.title,
    );
    for (const invalid of ["", "   ", "x".repeat(101), null, 123]) {
      const result = await request(
        env,
        "/settings",
        {
          ...settings,
          version: saved.data.version,
          overlay2: { ...settings.overlay2, title: invalid },
        },
        "PUT",
      );
      assert.equal(result.status, 400);
    }
    assert.equal(
      (await request(env, "/overlay2/state", undefined, "GET")).data.config
        .title,
      title,
    );
  } finally {
    sqlite.close();
  }
});

test("event validation rejects stale/replayed streaks and nickname-only identity", () => {
  const now = Date.now();
  assert.equal(
    normalizeEvent(
      event("1", "gift", "", "room-a", { nickname: "Alice" }),
      now - 1000,
    ),
    null,
  );
  assert.equal(
    normalizeEvent(
      event("2", "gift", "alice", "room-a", {
        streakable: true,
        repeatEnd: false,
      }),
      now - 1000,
    ),
    null,
  );
  assert.equal(
    normalizeEvent(
      {
        ...event("3", "chat", "alice"),
        timestamp: new Date(now - 121000).toISOString(),
      },
      now - 200000,
    ),
    null,
  );
  assert.equal(normalizeEvent(event("4", "chat", "alice"), now + 10000), null);
  assert.equal(
    normalizeEvent(event("5", "chat", "@Alice"), now - 1000).username,
    "alice",
  );
  assert.throws(() =>
    validateOverlay2({ connectorUrl: "http://127.0.0.1:8080" }),
  );
  assert.throws(() =>
    validateOverlay2({ connectorUrl: "https://example.com/path" }),
  );
});

test("stored credentials are authenticated ciphertext; catalog never returns plaintext", async () => {
  const { sqlite, env } = database();
  try {
    const secret = "sk-test-not-a-real-api-key";
    const cipher = await encryptCredential(env, "OPENAI_API_KEY", secret);
    assert.ok(!cipher.includes(secret));
    assert.equal(
      await decryptCredential(env, "OPENAI_API_KEY", cipher),
      secret,
    );
    await assert.rejects(decryptCredential(env, "GROQ_API_KEY", cipher));
    await assert.rejects(
      decryptCredential(
        {
          ...env,
          AI_KEY_ENCRYPTION_SECRET:
            "another-master-key-of-at-least-32-characters",
        },
        "OPENAI_API_KEY",
        cipher,
      ),
    );
    assert.equal(
      (
        await request(
          env,
          "/ai/keys",
          { name: "OPENAI_API_KEY", value: secret },
          "PUT",
        )
      ).status,
      200,
    );
    const catalog = await request(env, "/ai/catalog", null, "GET");
    assert.equal(catalog.data.credentials.OPENAI_API_KEY, "encrypted");
    assert.ok(!JSON.stringify(catalog).includes(secret));
    assert.ok(
      !sqlite
        .prepare("SELECT ciphertext FROM app_credentials")
        .get()
        .ciphertext.includes(secret),
    );
  } finally {
    sqlite.close();
  }
});

test("new provider keys save encrypted through the API and model settings persist", async () => {
  const { sqlite, env } = database();
  try {
    const ids = ["nvidia", "cohere", "huggingface", "mistral"];
    for (const provider of AI_PROVIDERS.filter((p) => ids.includes(p.id))) {
      const value = "test-provider-key-" + provider.id;
      assert.equal(
        (
          await request(
            env,
            "/ai/keys",
            { name: provider.secret, value },
            "PUT",
          )
        ).status,
        200,
      );
      assert.equal(await getCredential(env, provider.secret), value);
      const catalog = await request(env, "/ai/catalog", null, "GET");
      assert.equal(catalog.data.credentials[provider.secret], "encrypted");
      assert.ok(!JSON.stringify(catalog).includes(value));
      assert.ok(
        !sqlite
          .prepare("SELECT ciphertext FROM app_credentials WHERE id=?")
          .get(provider.secret)
          .ciphertext.includes(value),
      );
    }
    const aiProviders = [...settings.aiProviders].reverse().map((p) => ({
      ...p,
      enabled: ids.includes(p.id),
      model: AI_PROVIDERS.find((d) => d.id === p.id).models.at(-1),
    }));
    assert.equal(
      (await request(env, "/settings", { ...settings, aiProviders }, "PUT"))
        .status,
      200,
    );
    const persisted = (await request(env, "/bootstrap", null, "GET")).data
      .settings.aiProviders;
    assert.deepEqual(
      persisted.map(({ id, enabled, model }) => ({ id, enabled, model })),
      aiProviders.map(({ id, enabled, model }) => ({ id, enabled, model })),
    );
  } finally {
    sqlite.close();
  }
});

test("RAG uses approved current revisions, excludes demo/drafts, and gates general AI on gifts", async (t) => {
  const { sqlite, env } = database();
  let calls = 0,
    lastBody;
  env.OPENAI_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    lastBody = JSON.parse(options.body);
    return Response.json({
      choices: [{ message: { content: "BPBD membuka dua posko bantuan." } }],
    });
  });
  try {
    const saved = await saveStory(env, story, "test");
    assert.equal(
      (await retrieveNews(env, "Banjir Pasuruan di mana?")).length,
      1,
    );
    const answer = await answerWithNews(
      env,
      settings,
      "Banjir Pasuruan di mana?",
    );
    assert.equal(answer.mode, "rag");
    assert.equal(answer.citations[0].revision, 1);
    assert.match(lastBody.messages[0].content, /HANYA fakta/);
    const before = calls;
    assert.equal(
      (await answerWithNews(env, settings, "Bagaimana membuat nasi goreng?"))
        .mode,
      "no_context",
    );
    assert.equal(calls, before, "No unearned generic AI call");
    assert.equal(
      (
        await answerWithNews(env, settings, "Bagaimana membuat nasi goreng?", {
          gifted: true,
        })
      ).mode,
      "general",
    );
    assert.match(
      lastBody.messages[0].content,
      /bukan laporan berita terverifikasi/,
    );
    await saveStory(env, { ...saved, status: "draft" }, "test");
    assert.equal(
      (await retrieveNews(env, "banjir Pasuruan", saved.id)).length,
      0,
    );
    await saveStory(
      env,
      {
        ...story,
        title: "Banjir Pasuruan contoh",
        source_url: "https://example.com/demo",
        demo: true,
      },
      "test",
    );
    assert.equal((await retrieveNews(env, "banjir Pasuruan")).length, 0);
  } finally {
    sqlite.close();
  }
});

test("TikTok ingestion deduplicates events and binds gift entitlement to account, room, and session", async (t) => {
  const { sqlite, env } = database();
  env.OPENAI_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      choices: [{ message: { content: "Ini jawaban AI umum." } }],
    }),
  );
  try {
    await request(env, "/settings", settings, "PUT");
    assert.equal(
      (
        await request(env, "/overlay2/session", {
          controller: "other",
          action: "start",
        })
      ).status,
      409,
    );
    await request(env, "/lease", { id: "player" });
    await request(env, "/overlay2/session", {
      controller: "player",
      action: "start",
    });
    const runtime = sqlite.prepare("SELECT * FROM overlay2_runtime").get();
    const events = [
      event("g", "gift", "alice"),
      event("a", "chat", "ALICE"),
      event("b", "chat", "bob"),
      event("c", "chat", "alice", "room-b"),
    ];
    await ingestEvents(env, runtime, events, settings.overlay2);
    await ingestEvents(env, runtime, events, settings.overlay2);
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) n FROM overlay2_comments").get().n,
      3,
    );
    const comments = sqlite.prepare("SELECT * FROM overlay2_comments").all();
    for (const comment of comments) {
      const result = await request(env, "/overlay2/answer", {
        controller: "player",
        id: comment.id,
      });
      assert.equal(result.status, 200);
      assert.equal(
        result.data.mode,
        comment.username === "alice" && comment.room === "room-a"
          ? "general"
          : "no_context",
      );
      await request(env, "/overlay2/ack", {
        controller: "player",
        id: comment.id,
      });
      assert.equal(
        (
          await request(env, "/overlay2/answer", {
            controller: "player",
            id: comment.id,
          })
        ).status,
        404,
      );
    }
    await request(env, "/overlay2/session", {
      controller: "player",
      action: "stop",
    });
    await request(env, "/overlay2/session", {
      controller: "player",
      action: "start",
    });
    const next = sqlite.prepare("SELECT * FROM overlay2_runtime").get();
    assert.notEqual(next.session_id, runtime.session_id);
    await ingestEvents(
      env,
      next,
      [event("new", "chat", "alice")],
      settings.overlay2,
    );
    const fresh = sqlite
      .prepare("SELECT id FROM overlay2_comments WHERE session_id=?")
      .get(next.session_id);
    assert.equal(
      (
        await request(env, "/overlay2/answer", {
          controller: "player",
          id: fresh.id,
        })
      ).data.mode,
      "no_context",
    );
    assert.equal(
      (
        await request(env, "/overlay2/speech", {
          controller: "other",
          text: "arbitrary",
        })
      ).status,
      409,
    );
  } finally {
    sqlite.close();
  }
});

test("provider fallback skips failed provider and live model list filters non-chat models", async (t) => {
  const { sqlite, env } = database();
  env.GEMINI_API_KEY = "test";
  env.OPENAI_API_KEY = "test";
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    urls.push(url);
    if (url.includes("generativelanguage"))
      return new Response("quota", { status: 429 });
    if (url.endsWith("/models"))
      return Response.json({
        data: [
          { id: "gpt-4.1-mini" },
          { id: "whisper-1" },
          { id: "gpt-image-1" },
        ],
      });
    assert.equal(JSON.parse(options.body).model, "gpt-4.1-mini");
    return Response.json({
      choices: [{ message: { content: "Respons cadangan." } }],
    });
  });
  try {
    const result = await generateText(
      env,
      {
        aiProviders: [
          { id: "gemini", enabled: true },
          { id: "openai", enabled: true },
        ],
      },
      "system",
      "question",
    );
    assert.equal(result.providerId, "openai");
    assert.equal(urls.length, 2);
    assert.deepEqual(
      (await listModels(env, "openai")).models.map((m) => m.id),
      ["gpt-4.1-mini"],
    );
  } finally {
    sqlite.close();
  }
});

test("national and city sources persist coverage and refresh RSS outside Pasuruan", async (t) => {
  const { sqlite, env } = database();
  const feed = `<rss><channel>
    <item><title>Bandung membuka layanan warga</title><description>Layanan baru di Bandung.</description><link>https://example.com/bandung</link></item>
    <item><title>Surabaya memperbaiki jalan</title><description>Perbaikan jalan di Surabaya.</description><link>https://example.com/surabaya</link></item>
    <item><title>Kebijakan ekonomi nasional</title><description>Pengumuman pemerintah pusat.</description><link>https://example.com/nasional</link></item>
  </channel></rss>`;
  t.mock.method(globalThis, "fetch", async () => new Response(feed));
  try {
    for (const region of ["Kota Bandung", "Indonesia"]) {
      const result = await request(env, "/sources", {
        id: region,
        name: region,
        type: "RSS",
        url: "https://example.com/feed",
        region,
        active: true,
        permission: "Feed untuk pengujian lokal.",
      });
      assert.equal(result.status, 200);
      assert.equal(
        sqlite.prepare("SELECT region FROM news_sources WHERE id=?").get(region)
          .region,
        region,
      );
      const refresh = await request(env, "/refresh", {
        id: region,
        force: true,
      });
      assert.equal(
        refresh.data.results[0].added,
        region === "Indonesia" ? 2 : 1,
      );
    }
    const news = sqlite.prepare("SELECT title,region FROM news_stories").all();
    assert.equal(news.length, 3);
    assert.equal(
      news.find((item) => item.title.startsWith("Bandung")).region,
      "Kota Bandung",
    );
    assert.equal(
      news.find((item) => item.title.startsWith("Surabaya")).region,
      "Indonesia",
    );
    const invalid = await request(env, "/sources", {
      name: "Invalid",
      type: "RSS",
      url: "https://example.com/feed",
      region: "Kota Fiktif",
      permission: "Uji",
    });
    assert.equal(invalid.status, 400);
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) count FROM news_sources").get().count,
      2,
    );
    const saved = await request(env, "/news", {
      ...story,
      source_url: "https://example.com/new-story",
      region: "Kota Jayapura",
    });
    assert.equal(saved.status, 200);
    const reloaded = await request(env, "/news/" + saved.data.id, null, "GET");
    assert.equal(reloaded.data.region, "Kota Jayapura");
  } finally {
    sqlite.close();
  }
});
