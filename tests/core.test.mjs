import test from "node:test";
import assert from "node:assert/strict";
import {
  validateStory,
  nextPosition,
  normalizeFingerprint,
  validateQueue,
} from "../worker/core.js";
const story = {
  title: "Informasi Pasuruan terbaru",
  text: "Materi yang sah",
  script: "Naskah siap dibacakan.",
  source_name: "Sumber resmi",
  source_url: "https://example.org/news",
  region: "Kota Pasuruan",
  category: "Layanan Publik",
  priority: "reguler",
  status: "approved",
  published_at: "2026-10-15T00:00:00Z",
};
test("sensitive news requires explicit human review", () => {
  assert.throws(
    () => validateStory({ ...story, sensitive: true }),
    /persetujuan manusia/,
  );
  assert.equal(
    validateStory({ ...story, sensitive: true, humanReviewed: true }).status,
    "approved",
  );
});
test("incomplete source and script cannot be approved", () => {
  assert.throws(() => validateStory({ ...story, script: "" }), /wajib/);
  assert.throws(() => validateStory({ ...story, source_name: "" }), /wajib/);
  assert.equal(
    validateStory({ ...story, status: "draft", script: "" }).status,
    "draft",
  );
});
test("unsafe source URL and invalid dates rejected", () => {
  assert.throws(
    () => validateStory({ ...story, source_url: "javascript:alert(1)" }),
    /HTTPS/,
  );
  assert.throws(
    () => validateStory({ ...story, published_at: "invalid" }),
    /Tanggal/,
  );
});
test("duplicate fingerprint ignores source tracking query", () =>
  assert.equal(
    normalizeFingerprint({
      ...story,
      source_url: "https://example.org/news?track=1",
    }),
    normalizeFingerprint(story),
  ));
const q = {
  items: [{ id: "1" }, { id: "2" }],
  index: 1,
  mode: "standby",
  round: 1,
  loops: 2,
  status: "playing",
};
test("empty and standby playlists end safely", () => {
  assert.equal(nextPosition(q).status, "standby");
  assert.equal(nextPosition({ ...q, items: [] }).status, "standby");
});
test("loop wraps and increments replay round", () => {
  const n = nextPosition({ ...q, mode: "loop" });
  assert.equal(n.index, 0);
  assert.equal(n.round, 2);
  assert.equal(n.status, "playing");
});
test("count mode stops after configured number of total passes", () => {
  assert.equal(
    nextPosition({ ...q, mode: "count", round: 2 }).status,
    "standby",
  );
  assert.equal(nextPosition({ ...q, mode: "count", round: 1 }).round, 2);
});
test("queue bounds are enforced", () => {
  assert.throws(() => validateQueue({ ...q, mode: "bad" }));
  assert.throws(() => validateQueue({ ...q, items: new Array(101).fill({}) }));
  assert.equal(validateQueue({ ...q, loops: 999, delay: -1 }).loops, 100);
});
