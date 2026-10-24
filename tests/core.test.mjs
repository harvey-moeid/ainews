import test from "node:test";
import assert from "node:assert/strict";
import {
  validateStory,
  nextPosition,
  normalizeFingerprint,
  validateQueue,
} from "../worker/core.js";
import { REGION_GROUPS, matchesCoverage } from "../shared/regions.js";
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
test("social post deduplication preserves Instagram shortcode case and TikTok video identity", () => {
  assert.notEqual(
    normalizeFingerprint({ source_url: "https://instagram.com/p/AbC/" }),
    normalizeFingerprint({ source_url: "https://instagram.com/p/abc/" }),
  );
  assert.equal(
    normalizeFingerprint({
      source_url: "https://instagram.com/reel/AbC/?track=1",
    }),
    normalizeFingerprint({ source_url: "https://www.instagram.com/p/AbC/" }),
  );
  assert.equal(
    normalizeFingerprint({ source_url: "https://tiktok.com/@first/video/123" }),
    normalizeFingerprint({
      source_url: "https://www.tiktok.com/@changed/video/123?track=1",
    }),
  );
});
test("national and Indonesian city coverage replaces the Pasuruan restriction", () => {
  const regions = REGION_GROUPS.flatMap((group) => group.regions);
  assert.equal(REGION_GROUPS.length, 38);
  assert.equal(new Set(regions).size, 514);
  for (const region of ["Indonesia", ...regions])
    assert.equal(validateStory({ ...story, region }).region, region);
  for (const region of ["", "Semua wilayah", "Kota Fiktif", "Singapore"])
    assert.throws(() => validateStory({ ...story, region }), /kota\/kabupaten/);
});
test("RSS coverage accepts national items and matches the selected place only", () => {
  assert.ok(matchesCoverage("Kebijakan ekonomi nasional terbaru", "Indonesia"));
  assert.ok(matchesCoverage("BPBD SURABAYA membuka posko.", "Kota Surabaya"));
  assert.ok(
    matchesCoverage("Informasi Pasuruan terkini", "Kabupaten Pasuruan"),
  );
  assert.ok(
    matchesCoverage(
      "Jakarta  Selatan memperbaiki jalan.",
      "Kota Administrasi Jakarta Selatan",
    ),
  );
  assert.equal(matchesCoverage("Banjir Pasuruan surut", "Kota Bandung"), false);
  assert.equal(matchesCoverage("Berita Solok terbaru", "Kota Solo"), false);
  assert.equal(matchesCoverage("Solokan dibersihkan", "Kota Solok"), false);
  assert.equal(matchesCoverage("Berita nasional", "Semua wilayah"), false);
});
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
