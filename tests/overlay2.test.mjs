import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { saveStory } from "../worker/index.js";
import {
  normalizeEvent,
  ingestEvents,
  validateOverlay2,
} from "../worker/overlay2.js";
import { encryptCredential, decryptCredential } from "../worker/credentials.js";
import { answerWithNews, retrieveNews } from "../worker/rag.js";
import { generateText, listModels } from "../worker/ai.js";
import { initialSettings } from "../src/data.js";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of ["0000_newsroom.sql", "0001_overlay2.sql"])
    sqlite.exec(
      readFileSync(new URL("../drizzle/" + name, import.meta.url), "utf8"),
    );
  const DB = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async first() {
          return statement.get(...args) || null;
        },
        async all() {
          return { results: statement.all(...args) };
        },
        execute() {
          return { meta: { changes: Number(statement.run(...args).changes) } };
        },
        async run() {
          return this.execute();
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const result = statements.map((s) => s.execute());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const objects = new Map();
  return {
    sqlite,
    env: {
      DB,
      DEV_AUTH: "1",
      AI_KEY_ENCRYPTION_SECRET: "test-master-key-only-not-a-real-secret-123",
      BUCKET: {
        async put(key, value) {
          objects.set(key, value);
        },
        async get(key) {
          return objects.has(key)
            ? { json: async () => JSON.parse(objects.get(key)) }
            : null;
        },
      },
    },
  };
}
const settings = {
  ...initialSettings,
  aiProviders: initialSettings.aiProviders.map((p) => ({
    ...p,
    enabled: p.id === "openai",
  })),
};
const request = async (env, path, value, method = "POST") => {
  const response = await worker.fetch(
    new Request("https://ainews.test/api" + path, {
      method,
      headers: {
        Origin: "https://ainews.test",
        "Content-Type": "application/json",
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(value) }),
    }),
    env,
  );
  return { status: response.status, data: await response.json() };
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

test("Overlay 2 title persists through settings and player state; legacy settings retain the default", async () => {
  const { sqlite, env } = database();
  try {
    const title = "Kabar Warga · Pasuruan";
    const saved = await request(
      env,
      "/settings",
      {
        ...settings,
        overlay2: { ...settings.overlay2, title },
      },
      "PUT",
    );
    assert.equal(saved.status, 200);
    const state = await request(env, "/overlay2/state", undefined, "GET");
    assert.equal(state.data.config.title, title);
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
