import test from "node:test";
import assert from "node:assert/strict";
import { loadFeed, parseFeed } from "../worker/feeds.js";
import { database, request } from "./helpers.mjs";
import { refreshSources } from "../src/api.js";

const rss = (count = 1) =>
  `<rss version="2.0"><channel>${Array.from({ length: count }, (_, index) => `<item><title>Berita Surabaya nomor ${index}</title><description><![CDATA[<p>Materi berita &amp; keterangan tambahan.</p>]]></description><link>https://news.example.com/story-${index}</link><pubDate>2026-10-20T08:00:00Z</pubDate></item>`).join("")}</channel></rss>`;
const source = (id = "rss", extra = {}) => ({
  id,
  name: id,
  type: "RSS",
  url: "https://news.example.com/feed",
  region: "Indonesia",
  active: true,
  permission: "Feed uji lokal",
  ...extra,
});

test("HTTPS redirects and feed discovery support homepage URLs without importing HTML", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, "manual");
    if (url === "https://example.com/")
      return new Response(null, {
        status: 301,
        headers: { Location: "https://www.example.com/" },
      });
    if (url === "https://www.example.com/")
      return new Response(
        '<!doctype html><html><head><link href="/feed/" type="application/rss+xml" rel="alternate"></head><body>Beranda</body></html>',
      );
    assert.equal(url, "https://www.example.com/feed/");
    return new Response(rss());
  });
  const feed = await loadFeed("https://example.com/");
  assert.equal(feed.discovered, true);
  assert.equal(feed.entries.length, 1);
  assert.equal(feed.entries[0].text, "Materi berita & keterangan tambahan.");
  assert.equal(feed.url, "https://www.example.com/feed/");
  assert.equal(calls.length, 3);
});

test("RSS namespaces, Atom links, CDATA and empty feeds parse correctly", () => {
  const atom =
    '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Berita Atom terbaru</title><link rel="self" href="https://example.com/self"/><link rel="alternate" href="/berita"/><summary>Informasi &quot;penting&quot; &#38; terkini.</summary><updated>2026-10-20T08:00:00Z</updated></entry></feed>';
  const item = parseFeed(atom, "https://example.com/feed")[0];
  assert.equal(item.url, "https://example.com/berita");
  assert.equal(item.text, 'Informasi "penting" & terkini.');
  const namespaced =
    '<rss xmlns:content="urn:content"><channel><item><title>Berita RSS terbaru</title><content:encoded><![CDATA[<p>Materi lengkap</p>]]></content:encoded><guid isPermaLink="true">https://example.com/berita</guid></item></channel></rss>';
  assert.equal(
    parseFeed(namespaced, "https://example.com/")[0].text,
    "Materi lengkap",
  );
  assert.equal(
    parseFeed(namespaced, "https://example.com/")[0].url,
    "https://example.com/berita",
  );
  assert.deepEqual(
    parseFeed(
      '<feed xmlns="http://www.w3.org/2005/Atom"/>',
      "https://example.com/",
    ),
    [],
  );
});

for (const code of [401, 403, 404, 429, 503]) {
  test(`HTTP ${code} has an actionable source error`, async (t) => {
    t.mock.method(
      globalThis,
      "fetch",
      async () => new Response("not a feed", { status: code }),
    );
    await assert.rejects(
      loadFeed("https://example.com/feed"),
      (error) =>
        error.code === "http_" + code && error.message.includes("HTTP " + code),
    );
  });
}

test("invalid HTML, malformed XML, external entities and oversized feeds never look like successful imports", async (t) => {
  const cases = [
    ["<html><head></head><body>Beranda</body></html>", "not_feed"],
    ["<rss><channel><item></channel>", "invalid_xml"],
    [
      '<!DOCTYPE rss [<!ENTITY x SYSTEM "https://evil.example.com">]><rss/>',
      "unsafe_xml",
    ],
    ["x".repeat(1000001), "feed_too_large"],
  ];
  for (const [body, code] of cases) {
    t.mock.method(globalThis, "fetch", async () => new Response(body));
    await assert.rejects(
      loadFeed("https://example.com/feed"),
      (error) => error.code === code,
    );
  }
});

test("redirects cannot escape to HTTP/private URLs or loop indefinitely", async (t) => {
  for (const location of [
    "http://example.com/feed",
    "https://127.0.0.1/feed",
    "https://metadata.internal/feed",
    "https://user:pass@example.com/feed",
    "https://example.com/feed",
  ]) {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls++;
      return new Response(null, {
        status: 302,
        headers: { Location: location },
      });
    });
    await assert.rejects(loadFeed("https://example.com/feed"));
    assert.equal(calls, 1);
  }
});

test("network errors and timeouts get distinct safe diagnostics", async (t) => {
  for (const [name, code] of [
    ["TimeoutError", "timeout"],
    ["AbortError", "timeout"],
    ["TypeError", "network"],
  ]) {
    t.mock.method(globalThis, "fetch", async () => {
      const error = Error("private connection detail");
      error.name = name;
      throw error;
    });
    await assert.rejects(
      loadFeed("https://example.com/feed"),
      (error) =>
        error.code === code && !error.message.includes("private connection"),
    );
  }
});

test("a full feed stays below the free D1 per-invocation query budget, with cache and persisted errors", async (t) => {
  const { sqlite, env } = database();
  t.mock.method(console, "warn", () => {});
  try {
    assert.equal((await request(env, "/sources", source())).status, 200);
    let queries = 0;
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (...args) => {
      assert.ok(++queries <= 50, "Refresh must fit D1's query limit");
      return prepare(...args);
    };
    t.mock.method(globalThis, "fetch", async () => new Response(rss(12)));
    const first = await request(env, "/refresh", { id: "rss", force: true });
    assert.equal(first.data.results[0].added, 10);
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) count FROM news_stories").get().count,
      10,
    );
    queries = 0;
    const cached = await request(env, "/refresh", { id: "rss" });
    assert.equal(cached.data.results[0].cached, true);
    queries = 0;
    t.mock.method(
      globalThis,
      "fetch",
      async () => new Response("denied", { status: 403 }),
    );
    const failure = await request(env, "/refresh", { id: "rss", force: true });
    assert.equal(failure.data.results[0].error, true);
    assert.equal(failure.data.results[0].code, "http_403");
    const row = sqlite
      .prepare("SELECT status,refresh_lock FROM news_sources")
      .get();
    assert.match(row.status, /HTTP 403/);
    assert.equal(row.refresh_lock, 0);
    queries = 0;
    assert.equal((await request(env, "/refresh", { force: true })).status, 400);
  } finally {
    sqlite.close();
  }
});

test("one invalid item does not prevent importing the rest, and an explicitly selected source beyond 15 works", async (t) => {
  const { sqlite, env } = database();
  try {
    for (let i = 0; i < 16; i++)
      await request(env, "/sources", source("s" + i));
    t.mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(
          rss(2).replace(
            "https://news.example.com/story-0",
            "http://news.example.com/story-0",
          ),
        ),
    );
    const result = await request(env, "/refresh", { id: "s15", force: true });
    assert.equal(result.data.results[0].added, 1);
    assert.equal(result.data.results[0].invalid, 1);
  } finally {
    sqlite.close();
  }
});

test("refresh all invokes each active source separately and continues after a failed request", async () => {
  const calls = [];
  const sources = [
    source("a"),
    source("b"),
    source("c"),
    source("off", { active: false }),
  ];
  const result = await refreshSources(sources, {
    force: true,
    request: async (path, body) => {
      assert.equal(path, "/refresh");
      calls.push(body.id);
      if (body.id === "b") throw Error("URL RSS tidak ditemukan (HTTP 404).");
      return { results: [{ added: 1 }] };
    },
  });
  assert.deepEqual(calls, ["a", "b", "c"]);
  assert.equal(result.results.length, 3);
  assert.equal(result.results[1].error, true);
  assert.equal(result.results[2].added, 1);
});
