import { chromium } from "playwright";
import assert from "node:assert/strict";
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const ctx = await b.newContext();
await ctx.addInitScript(() => {
  const synth = {
    getVoices: () => [],
    addEventListener() {},
    removeEventListener() {},
    cancel() {
      window.__cancelled = true;
    },
    pause() {
      window.__paused = true;
    },
    resume() {
      window.__paused = false;
    },
    speak(u) {
      window.__spoken = u.text;
      window.__cancelled = false;
    },
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth });
});
const live = await ctx.newPage();
await live.goto("http://127.0.0.1:5173/live");
await live.getByRole("button", { name: "Aktifkan audio & mulai" }).click();
await live.waitForTimeout(500);
assert.ok(
  await live.evaluate(() => window.__spoken),
  "Live audio activation calls TTS",
);
const admin = await ctx.newPage();
await admin.goto("http://127.0.0.1:5173/admin/broadcast");
await admin.waitForTimeout(3000);
await admin.getByRole("button", { name: "Jeda / lanjutkan" }).click();
await live.waitForTimeout(3000);
assert.equal(
  await live.evaluate(() => window.__paused),
  true,
  "Remote pause reaches live browser",
);
await admin.getByRole("button", { name: "Hentikan sekarang" }).click();
await live.waitForTimeout(3000);
assert.equal(
  await live.evaluate(() => window.__cancelled),
  true,
  "Emergency stop cancels live TTS",
);
console.log(
  "Cross-tab LIVE activation, remote pause, and emergency stop passed with simulated speech engine.",
);
await b.close();
