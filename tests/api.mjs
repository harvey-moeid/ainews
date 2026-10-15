import assert from "node:assert/strict";
const origin = "http://127.0.0.1:8787";
const req = async (path, data, method = "POST") => {
  const r = await fetch(origin + "/api" + path, {
    method,
    headers: { "Content-Type": "application/json", Origin: origin },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return { status: r.status, data: await r.json() };
};
const story = {
  title: "Uji snapshot " + Date.now(),
  text: "Bahan pengujian sah dan tersedia.",
  script: "Naskah awal yang tetap terikat pada antrean.",
  source_name: "Pengujian lokal",
  source_url: "",
  region: "Kota Pasuruan",
  category: "Pemerintahan",
  priority: "utama",
  status: "approved",
  published_at: new Date().toISOString(),
};
let r = await req("/news", { ...story, sensitive: true });
assert.equal(r.status, 400, "Sensitive story blocked");
r = await req("/news", story);
assert.equal(r.status, 200);
const old = r.data;
assert.equal(old.revision, 1);
assert.ok(old.r2_key);
let state = (await req("/bootstrap", null, "GET")).data;
let q = state.queue;
r = await req("/queue", { ...q, items: [old] }, "PUT");
assert.equal(r.status, 200);
q = r.data;
r = await req("/queue", { ...q, version: q.version - 1 }, "PUT");
assert.equal(r.status, 409, "Stale playlist version rejected");
r = await req("/news", {
  ...old,
  script: "Naskah revisi kedua untuk pengujian.",
});
assert.equal(r.status, 200);
assert.equal(r.data.revision, 2);
assert.notEqual(r.data.r2_key, old.r2_key);
let live = (await req("/live", null, "GET")).data;
assert.equal(
  live.queue.items[0].script,
  old.script,
  "Queue preserves immutable first revision",
);
assert.equal(live.queue.items[0].revision, 1);
assert.equal(
  live.settings.aiProviders,
  undefined,
  "No provider config on live endpoint",
);
r = await req("/news", { ...old, title: "Revisi yang basi" });
assert.equal(r.status, 409, "Stale story revision rejected");
r = await req("/news", { ...story, id: undefined });
assert.equal(r.status, 409, "Duplicate story rejected");
r = await req("/ai", { text: "Materi sumber untuk pengujian. ".repeat(10) });
assert.equal(
  r.status,
  503,
  "Missing provider fails without fabricated summary",
);
r = await req("/lease", { id: "browser-test-a" });
assert.equal(r.status, 200);
r = await req("/lease", { id: "browser-test-b" });
assert.equal(r.status, 409, "Second audio controller blocked");
q = (await req("/live", null, "GET")).data.queue;
r = await req(
  "/queue",
  { ...q, status: "standby", command: "stop", commandId: crypto.randomUUID() },
  "PUT",
);
assert.equal(r.status, 200);
assert.equal(r.data.lease, null, "Emergency stop releases audio lease");
r = await req("/sources", {
  name: "Akses tidak sah",
  type: "RSS",
  url: "http://localhost/feed",
  region: "Kota Pasuruan",
  permission: "",
});
assert.equal(r.status, 400);
const cross = await fetch(origin + "/api/news", {
  method: "POST",
  headers: {
    Origin: "https://evil.example",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(story),
});
assert.equal(cross.status, 403, "Cross origin mutation blocked");
console.log(
  "API integration passed: editorial, R2 revisions, queue snapshot, concurrency, deduplication, AI failure, controller lease, and origin checks.",
);
