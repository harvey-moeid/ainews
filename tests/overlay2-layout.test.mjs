import test from "node:test";
import assert from "node:assert/strict";
import { validateOverlay2 } from "../worker/overlay2.js";
import { OVERLAY2_DEFAULTS } from "../shared/ai-catalog.js";

test("legacy Overlay 2 settings receive default transcript positioning", () => {
  const config = validateOverlay2({ name: "Host lama" });
  for (const key of ["transcriptX", "transcriptY", "transcriptWidth"])
    assert.equal(config[key], OVERLAY2_DEFAULTS[key]);
});

test("transcript positioning accepts edges and rejects unsafe or invalid values", () => {
  for (const [key, min, max] of [
    ["transcriptX", 0, 100],
    ["transcriptY", 0, 100],
    ["transcriptWidth", 30, 100],
  ]) {
    for (const valid of [min, 50, max])
      assert.equal(validateOverlay2({ [key]: valid })[key], valid);
    for (const invalid of [min - 1, max + 1, 50.5, null, "50", NaN, Infinity])
      assert.throws(
        () => validateOverlay2({ [key]: invalid }),
        /Posisi\/lebar pertanyaan dan jawaban tidak valid/,
      );
  }
});
