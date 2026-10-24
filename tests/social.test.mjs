import test from "node:test";
import assert from "node:assert/strict";
import { database, request } from "./helpers.mjs";
import { socialProfile, socialPostUrl } from "../shared/social.js";
import { fetchSocialPosts } from "../worker/social.js";

const token = "social-test-token-not-a-real-credential";
const source = (changes = {}) => ({
  id: "social-test",
  name: "Redaksi sosial",
  type: "Instagram",
  url: "https://www.instagram.com/redaksi/",
  region: "Indonesia",
  active: true,
  permission: "Izin uji lokal",
  social: { mode: "manual" },
  ...changes,
});
const post = (changes = {}) => ({
  caption: "Caption asli Surabaya.\nBaris kedua #berita 👋",
  url: "https://www.instagram.com/p/abc_123/?utm_source=test",
  publishedAt: "2026-10-20T08:00:00Z",
  ...changes,
});

test("profile and post validation reject foreign hosts and cross-account TikTok videos", () => {
  assert.equal(
    socialProfile("Instagram", "https://instagram.com/Redaksi/?hl=id").username,
    "redaksi",
  );
  assert.equal(
    socialProfile("TikTok", "https://tiktok.com/@Redaksi").username,
    "redaksi",
  );
  for (const value of [
    "https://instagram.com.evil.test/redaksi/",
    "https://instagram.com/p/abc/",
    "https://user:pass@instagram.com/redaksi/",
  ])
    assert.throws(() => socialProfile("Instagram", value));
  assert.throws(() =>
    socialPostUrl("TikTok", "https://tiktok.com/@other/video/123", "redaksi"),
  );
  assert.throws(() =>
    socialPostUrl("Instagram", "https://other.test/p/123/", "redaksi"),
  );
});

test("manual caption import needs no API, preserves attribution and dates, and requires approval to queue", async (t) => {
  const { sqlite, env } = database();
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Manual import must not call a remote service");
  });
  try {
    assert.equal((await request(env, "/sources", source())).status, 200);
    const manual = await request(env, "/refresh", {
      id: "social-test",
      force: true,
    });
    assert.match(manual.data.results[0].status, /Input caption manual/);
    const imported = await request(env, "/sources/social-test/caption", post());
    assert.equal(imported.status, 200);
    const story = imported.data;
    assert.equal(story.status, "draft");
    assert.equal(story.script, post().caption);
    assert.equal(story.social.caption, post().caption);
    assert.equal(story.published_at, post().publishedAt.replace("Z", ".000Z"));
    assert.equal(story.source_url, "https://www.instagram.com/p/abc_123/");
    assert.match(story.source_name, /Instagram @redaksi/);
    assert.equal(
      (
        await request(
          env,
          "/sources/social-test/caption",
          post({ url: "https://instagram.com/p/abc_123/?other=1" }),
        )
      ).status,
      409,
    );
    for (const invalid of [
      { caption: "" },
      { publishedAt: "" },
      { url: "https://other.test/p/a/" },
      { caption: "x".repeat(12001) },
    ])
      assert.equal(
        (await request(env, "/sources/social-test/caption", post(invalid)))
          .status,
        400,
      );
    const state = await request(env, "/bootstrap", null, "GET");
    const blocked = await request(
      env,
      "/queue",
      { ...state.data.queue, items: [story] },
      "PUT",
    );
    assert.equal(blocked.status, 400);
    const approved = await request(env, "/news", {
      ...story,
      status: "approved",
    });
    assert.equal(approved.status, 200);
    const queue = await request(
      env,
      "/queue",
      { ...state.data.queue, items: [approved.data] },
      "PUT",
    );
    assert.equal(queue.status, 200);
    const live = await request(env, "/live", null, "GET");
    assert.equal(live.data.queue.items[0].script, post().caption);
  } finally {
    sqlite.close();
  }
});

test("profile connector imports bounded matching posts, deduplicates, and keeps credentials out of API and backups", async (t) => {
  const { sqlite, env } = database();
  try {
    const input = source({
      region: "Kota Surabaya",
      social: { mode: "connector", connectorUrl: "https://social.example.com" },
      credential: token,
    });
    assert.equal((await request(env, "/sources", input)).status, 200);
    const stored = sqlite
      .prepare("SELECT ciphertext FROM app_credentials")
      .get();
    assert.ok(stored.ciphertext && !stored.ciphertext.includes(token));
    t.mock.method(globalThis, "fetch", async (url, options) => {
      assert.equal(url, "https://social.example.com/api/v1/social/posts");
      assert.equal(options.headers.Authorization, "Bearer " + token);
      assert.equal(options.redirect, "error");
      assert.equal(JSON.parse(options.body).username, "redaksi");
      return Response.json({
        profile: { username: "redaksi" },
        posts: [
          post(),
          post({
            url: "https://instagram.com/p/outside/",
            caption: "Berita Bandung",
          }),
          post({ publishedAt: "bad" }),
        ],
      });
    });
    const refreshed = await request(env, "/refresh", {
      id: input.id,
      force: true,
    });
    assert.equal(refreshed.data.results[0].added, 1);
    assert.equal(refreshed.data.results[0].skipped, 2);
    assert.equal(
      (await request(env, "/refresh", { id: input.id, force: true })).data
        .results[0].added,
      0,
    );
    const bootstrap = await request(env, "/bootstrap", null, "GET");
    assert.equal(bootstrap.data.sources[0].hasCredential, true);
    assert.equal(JSON.stringify(bootstrap.data).includes(token), false);
    const backup = await request(env, "/backup", null, "GET");
    assert.equal(JSON.stringify(backup.data).includes(token), false);
    assert.equal(JSON.stringify(backup.data).includes("ciphertext"), false);
    // Re-saving the same destination preserves the key, changing it clears it.
    assert.equal(
      (await request(env, "/sources", { ...input, credential: "" })).status,
      200,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) count FROM app_credentials").get().count,
      1,
    );
    assert.equal(
      (
        await request(env, "/sources", {
          ...input,
          credential: "",
          social: {
            mode: "connector",
            connectorUrl: "https://new.example.com",
          },
        })
      ).status,
      200,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) count FROM app_credentials").get().count,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("Instagram API reads owned and discovered profiles using server-side bearer auth", async (t) => {
  const { sqlite, env } = database();
  try {
    const input = source({
      social: { mode: "official", instagramUserId: "1234" },
      credential: token,
    });
    assert.equal((await request(env, "/sources", input)).status, 200);
    const calls = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
      calls.push(url);
      assert.equal(options.headers.Authorization, "Bearer " + token);
      assert.equal(new URL(url).searchParams.has("access_token"), false);
      if (new URL(url).searchParams.get("fields") === "id,username")
        return Response.json({ id: "1234", username: "redaksi" });
      return Response.json({
        data: [
          {
            id: "1",
            caption: post().caption,
            permalink: post().url,
            timestamp: post().publishedAt,
          },
        ],
      });
    });
    assert.equal(
      (await request(env, "/refresh", { id: input.id, force: true })).data
        .results[0].added,
      1,
    );
    assert.equal(calls.length, 2);
    const discoveryInput = { ...input, url: "https://instagram.com/another/" };
    assert.equal((await request(env, "/sources", discoveryInput)).status, 200);
    t.mock.method(globalThis, "fetch", async (url) => {
      const fields = new URL(url).searchParams.get("fields");
      if (fields === "id,username")
        return Response.json({ id: "1234", username: "redaksi" });
      assert.match(fields, /business_discovery.username\(another\)/);
      return Response.json({
        business_discovery: {
          username: "another",
          media: {
            data: [
              {
                caption: "Caption profil profesional lain",
                permalink: "https://instagram.com/p/other/",
                timestamp: post().publishedAt,
              },
            ],
          },
        },
      });
    });
    assert.equal(
      (await request(env, "/refresh", { id: input.id, force: true })).data
        .results[0].added,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("TikTok official access verifies profile identity and imports video descriptions", async (t) => {
  const { sqlite, env } = database();
  try {
    const input = source({
      type: "TikTok",
      url: "https://tiktok.com/@redaksi",
      social: { mode: "official" },
      credential: token,
    });
    assert.equal((await request(env, "/sources", input)).status, 200);
    t.mock.method(globalThis, "fetch", async (url, options) => {
      if (url.includes("user/info"))
        return Response.json({
          data: { user: { username: "redaksi" } },
          error: { code: "ok" },
        });
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(options.body).max_count, 10);
      return Response.json({
        data: {
          videos: [
            {
              id: "123",
              video_description: "Caption TikTok asli",
              share_url: "https://www.tiktok.com/@redaksi/video/123",
              create_time: 1792483200,
            },
          ],
        },
        error: { code: "ok" },
      });
    });
    assert.equal(
      (await request(env, "/refresh", { id: input.id, force: true })).data
        .results[0].added,
      1,
    );
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({
        data: { user: { username: "different" } },
        error: { code: "ok" },
      }),
    );
    const wrong = await request(env, "/refresh", { id: input.id, force: true });
    assert.equal(wrong.data.results[0].error, true);
    assert.match(wrong.data.results[0].status, /bukan milik profil ini/);
    assert.equal(
      sqlite.prepare("SELECT refresh_lock FROM news_sources").get()
        .refresh_lock,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("unconfigured or invalid social sources fail visibly without making up captions", async (t) => {
  const { sqlite, env } = database();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("denied", { status: 401 });
  });
  try {
    for (const change of [
      { url: "https://example.com/profile" },
      { social: { mode: "connector", connectorUrl: "https://localhost/" } },
      { credential: "short" },
    ])
      assert.equal(
        (await request(env, "/sources", source(change))).status,
        400,
      );
    const input = source({
      type: "TikTok",
      url: "https://tiktok.com/@redaksi",
      social: { mode: "official" },
    });
    assert.equal((await request(env, "/sources", input)).status, 200);
    const missing = await request(env, "/refresh", {
      id: input.id,
      force: true,
    });
    assert.match(missing.data.results[0].status, /Token sumber belum/);
    assert.equal(calls, 0);
    assert.equal(
      (await request(env, "/sources", { ...input, credential: token })).status,
      200,
    );
    const denied = await request(env, "/refresh", {
      id: input.id,
      force: true,
    });
    assert.match(denied.data.results[0].status, /HTTP 401/);
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) count FROM news_stories").get().count,
      0,
    );
    assert.equal(
      sqlite.prepare("SELECT refresh_lock FROM news_sources").get()
        .refresh_lock,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("an in-flight refresh cannot send a replacement token to an old connector", async (t) => {
  const { sqlite, env } = database();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({});
  });
  try {
    const input = source({
      social: { mode: "connector", connectorUrl: "https://old.example.com" },
      credential: token,
    });
    assert.equal((await request(env, "/sources", input)).status, 200);
    const stale = sqlite
      .prepare("SELECT * FROM news_sources WHERE id=?")
      .get(input.id);
    assert.equal(
      (
        await request(env, "/sources", {
          ...input,
          social: {
            mode: "connector",
            connectorUrl: "https://new.example.com",
          },
          credential: token + "-new",
        })
      ).status,
      200,
    );
    await assert.rejects(fetchSocialPosts(env, stale));
    assert.equal(calls, 0);
  } finally {
    sqlite.close();
  }
});
