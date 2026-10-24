import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import worker from "../worker/index.js";
import { ingestEvents, validateOverlay2 } from "../worker/overlay2.js";
import { overlayEvent } from "../worker/tiktok-webhook.js";
import { database, request } from "./helpers.mjs";
import { initialSettings } from "../src/data.js";

const secret = "synthetic-koneklive-secret-for-test-only";
const event = (id = "comment-1", type = "comment", extra = {}) => ({
  id,
  type,
  timestamp: new Date().toISOString(),
  source: {
    platform: "tiktok",
    account: "@jalurtarot",
    room_id: "room-1",
    engine: "node",
  },
  user: { id: "viewer-1", username: "Alice", nickname: "Penonton" },
  data:
    type === "gift"
      ? { delta_count: 1, is_final: false }
      : { comment: "Berita hari ini?" },
  is_test: false,
  ...extra,
});
function deliver(env, value, options = {}) {
  const body = options.body ?? JSON.stringify(value);
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  // Same exact signing contract as koneklive/apps/server/security.js.
  const signature =
    "sha256=" +
    createHmac("sha256", options.secret ?? secret)
      .update(timestamp + ".")
      .update(body)
      .digest("hex");
  return worker.fetch(
    new Request("https://ainews.test" + (options.path || "/api/hooks/tiktok"), {
      method: options.method || "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-Signature": signature,
        "X-Event-ID": value?.id || "bad-json",
        ...options.headers,
      },
      body: ["GET", "HEAD"].includes(options.method) ? undefined : body,
    }),
    env,
  );
}
async function setup() {
  const db = database();
  await request(
    db.env,
    "/settings",
    {
      ...initialSettings,
      overlay2: {
        ...initialSettings.overlay2,
        connectorMode: "webhook",
        connectorAccount: "@JalurTarot",
      },
    },
    "PUT",
  );
  await request(db.env, "/lease", { id: "player" });
  await request(db.env, "/overlay2/session", {
    controller: "player",
    action: "start",
  });
  db.env.KONEKLIVE_WEBHOOK_SECRET = secret;
  return db;
}

test("signed koneklive comments/gifts reach Overlay 2 once; Unicode raw bytes work", async () => {
  const { env, sqlite } = await setup();
  try {
    const input = event("unicode", "comment", {
      data: { comment: "Kabar warga 🌏 di mana?" },
    });
    assert.equal((await deliver(env, input)).status, 200);
    const replay = await deliver(env, input);
    assert.equal((await replay.json()).accepted, 0);
    const comment = sqlite.prepare("SELECT * FROM overlay2_comments").get();
    assert.equal(comment.question, input.data.comment);
    assert.equal(comment.username, "alice");
    assert.equal(comment.room, "jalurtarot:room-1");
    assert.equal((await deliver(env, event("gift-1", "gift"))).status, 200);
    await deliver(env, event("gift-1", "gift"));
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) n FROM overlay2_comments").get().n,
      1,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) n FROM overlay2_gifts").get().n,
      1,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) n FROM overlay2_events").get().n,
      2,
    );
  } finally {
    sqlite.close();
  }
});

test("HMAC rejects missing/incorrect/expired/future signatures and changed bytes before parsing", async () => {
  const { env, sqlite } = await setup();
  try {
    for (const options of [
      { secret: "wrong-secret" },
      { timestamp: String(Math.floor(Date.now() / 1000) - 301) },
      { timestamp: String(Math.floor(Date.now() / 1000) + 302) },
      { headers: { "X-Webhook-Signature": "" } },
      { headers: { "X-Webhook-Timestamp": "Infinity" } },
      {
        body: "{broken",
        headers: { "X-Webhook-Signature": "sha256=" + "0".repeat(64) },
      },
    ])
      assert.equal((await deliver(env, event(), options)).status, 401);
    assert.equal(
      (await deliver(env, event(), { body: "{broken" })).status,
      400,
    );
    assert.equal(
      (await deliver(env, event(), { headers: { "X-Event-ID": "other" } }))
        .status,
      400,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) n FROM overlay2_events").get().n,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("tests, wrong accounts, old events, disabled sessions and unrelated types have no side effects", async () => {
  const { env, sqlite } = await setup();
  try {
    for (const input of [
      event("test", "gift", { is_test: true }),
      event("wrong", "comment", {
        source: { platform: "tiktok", account: "@other", room_id: "room-1" },
      }),
      event("old", "comment", {
        timestamp: new Date(Date.now() - 121000).toISOString(),
      }),
      event("unsupported", "like"),
      event("zero-gift", "gift", { data: { is_final: false, delta_count: 0 } }),
    ]) {
      const response = await deliver(env, input);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).accepted, 0);
    }
    await request(env, "/overlay2/session", {
      controller: "player",
      action: "stop",
    });
    assert.equal(
      (await (await deliver(env, event())).json()).ignored,
      "session_inactive",
    );
    for (const table of [
      "overlay2_comments",
      "overlay2_gifts",
      "overlay2_events",
    ])
      assert.equal(
        sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,
        0,
      );
  } finally {
    sqlite.close();
  }
});

test("only exact webhook path bypasses browser authentication, and still requires HMAC", async () => {
  const { env, sqlite } = await setup();
  try {
    Object.assign(env, { AUTH_MODE: "cloudflare-access" });
    assert.equal((await deliver(env, event())).status, 200);
    for (const path of [
      "/api/hooks/tiktok/",
      "/api/hooks/tiktok/evil",
      "/api/overlay2/state",
      "/api/settings",
      "/api/bootstrap",
    ])
      assert.equal((await deliver(env, event(), { path })).status, 401);
    assert.equal(
      (await deliver(env, event(), { secret: "wrong" })).status,
      401,
    );
    assert.equal((await deliver(env, event(), { method: "GET" })).status, 405);
    assert.equal(
      (
        await deliver(env, event(), {
          headers: { "Content-Type": "text/plain" },
        })
      ).status,
      415,
    );
    assert.equal(
      (await deliver(env, event(), { body: "x".repeat(32769) })).status,
      413,
    );
    delete env.KONEKLIVE_WEBHOOK_SECRET;
    assert.equal((await deliver(env, event())).status, 503);
  } finally {
    sqlite.close();
  }
});

test("webhook mode persists, stores its secret encrypted, and never polls legacy REST", async (t) => {
  const { env, sqlite } = await setup();
  try {
    delete env.KONEKLIVE_WEBHOOK_SECRET;
    assert.equal(
      (
        await request(
          env,
          "/ai/keys",
          { name: "KONEKLIVE_WEBHOOK_SECRET", value: secret },
          "PUT",
        )
      ).status,
      200,
    );
    const catalog = (await request(env, "/ai/catalog", null, "GET")).data;
    assert.equal(catalog.credentials.KONEKLIVE_WEBHOOK_SECRET, "encrypted");
    assert.ok(!JSON.stringify(catalog).includes(secret));
    assert.ok(
      !sqlite
        .prepare("SELECT ciphertext FROM app_credentials")
        .get()
        .ciphertext.includes(secret),
    );
    t.mock.method(globalThis, "fetch", () => {
      throw Error("No legacy network request allowed");
    });
    const state = (await request(env, "/overlay2/state", null, "GET")).data;
    assert.equal(state.config.connectorMode, "webhook");
    assert.equal(state.config.connectorAccount, "jalurtarot");
    assert.equal((await request(env, "/overlay2/check", {})).data.ready, true);
    assert.equal(
      (await request(env, "/overlay2/poll", { controller: "player" })).data
        .webhook,
      true,
    );
    assert.equal((await deliver(env, event())).status, 200);
  } finally {
    sqlite.close();
  }
});

test("legacy mode stays default and rejects webhook delivery until explicitly enabled", async () => {
  const { env, sqlite } = database();
  try {
    env.KONEKLIVE_WEBHOOK_SECRET = secret;
    assert.equal(validateOverlay2({}).connectorMode, "rest");
    assert.throws(() => validateOverlay2({ connectorMode: "invalid" }));
    assert.throws(() =>
      validateOverlay2({ connectorAccount: "https://example.com" }),
    );
    assert.equal((await deliver(env, event())).status, 409);
  } finally {
    sqlite.close();
  }
});

test("in-flight ingestion cannot write gifts/comments into a stopped or replaced session", async () => {
  const { env, sqlite } = await setup();
  try {
    const previous = sqlite.prepare("SELECT * FROM overlay2_runtime").get();
    await request(env, "/overlay2/session", {
      controller: "player",
      action: "stop",
    });
    await request(env, "/overlay2/session", {
      controller: "player",
      action: "start",
    });
    await ingestEvents(
      env,
      previous,
      [
        overlayEvent(event("late-gift", "gift")),
        overlayEvent(event("late-chat")),
      ],
      initialSettings.overlay2,
    );
    for (const table of [
      "overlay2_comments",
      "overlay2_gifts",
      "overlay2_events",
    ])
      assert.equal(
        sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,
        0,
      );
    const a = overlayEvent(event("a", "gift"));
    const b = overlayEvent(
      event("b", "gift", {
        source: { platform: "tiktok", account: "@other", room_id: "room-1" },
      }),
    );
    assert.notEqual(a.roomId, b.roomId);
  } finally {
    sqlite.close();
  }
});

test("D1 ingestion failure returns retryable 503 instead of acknowledging delivery", async () => {
  const { env, sqlite } = await setup();
  try {
    env.DB.batch = async () => {
      throw Error("Synthetic D1 outage");
    };
    assert.equal((await deliver(env, event())).status, 503);
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) n FROM overlay2_comments").get().n,
      0,
    );
  } finally {
    sqlite.close();
  }
});
