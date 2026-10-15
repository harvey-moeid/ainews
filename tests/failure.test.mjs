import test from "node:test";
import assert from "node:assert/strict";
import { saveStory } from "../worker/index.js";
const story = {
  title: "Berita pengujian konsistensi",
  text: "Bahan sumber",
  script: "Naskah",
  source_name: "Sumber",
  region: "Kota Pasuruan",
  category: "Pemerintahan",
  priority: "reguler",
  status: "approved",
  published_at: "2026-10-15T00:00:00Z",
};
function mock({ r2Failure = false, d1Failure = false } = {}) {
  const events = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return this;
          },
          async first() {
            return null;
          },
          async run() {
            events.push("d1.write");
            if (d1Failure) throw new Error("D1 quota");
            return { meta: { changes: 1 } };
          },
        };
      },
    },
    BUCKET: {
      async put() {
        events.push("r2.put");
        if (r2Failure) throw new Error("R2 unavailable");
      },
    },
  };
  return { env, events };
}
test("R2 failure prevents any metadata mutation", async () => {
  const { env, events } = mock({ r2Failure: true });
  await assert.rejects(saveStory(env, story, "test"), /R2 unavailable/);
  assert.deepEqual(events, ["r2.put"]);
});
test("D1 failure happens after new R2 object is written; no old revision is overwritten", async () => {
  const { env, events } = mock({ d1Failure: true });
  await assert.rejects(saveStory(env, story, "test"), /D1 quota/);
  assert.deepEqual(events, ["r2.put", "d1.write"]);
});
