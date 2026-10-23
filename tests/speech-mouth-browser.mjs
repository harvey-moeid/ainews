import { chromium } from "playwright";
import assert from "node:assert/strict";
import { OVERLAY2_DEFAULTS } from "../shared/ai-catalog.js";

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage();
const errors = [];
let faceModule;
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (new URL(request.url()).pathname === "/src/overlay2/face.js")
    faceModule = request.url();
});
try {
  let lease = null,
    active = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    const input = request.method() === "GET" ? {} : request.postDataJSON();
    if (path === "/api/lease")
      lease = input.release
        ? null
        : { id: input.id, expires: Date.now() + 90000 };
    if (path === "/api/overlay2/session") active = input.action === "start";
    await route.fulfill({
      json:
        path === "/api/overlay2/state"
          ? {
              config: {
                ...OVERLAY2_DEFAULTS,
                loopNews: false,
                comments: false,
              },
              audio: { rate: 0.5 },
              runtime: { active },
              connector: {},
              comments: [],
              queue: {
                lease,
                items: [
                  {
                    id: "vowels",
                    revision: 1,
                    title: "Uji vokal",
                    script: "A I U E O.",
                  },
                ],
              },
            }
          : { ok: true, lease },
    });
  });
  await page.addInitScript(() => {
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [],
        speak: (utterance) => {
          window.testUtterance = utterance;
          utterance.onstart?.();
        },
        cancel: () => {
          window.cancelled = true;
        },
      },
    });
  });
  await page.goto("http://127.0.0.1:5173/overlay2");
  await page
    .getByRole("button", { name: "Aktifkan suara & mulai", exact: false })
    .waitFor();
  // Inspect the real rendered face; only external speech and server state are mocked.
  await page.evaluate(async (url) => {
    const { VirtualFace } = await import(url);
    const original = VirtualFace.prototype.setAudio;
    VirtualFace.prototype.setAudio = function (...args) {
      window.testFace = this;
      original.apply(this, args);
    };
  }, faceModule);
  await page
    .getByRole("button", { name: "Aktifkan suara & mulai", exact: false })
    .click();
  await page.waitForFunction(() => window.testUtterance && window.testFace);
  const shapes = [];
  for (const [index, vowel] of ["A", "I", "U", "E", "O"].entries()) {
    await page.evaluate(
      (charIndex) =>
        window.testUtterance.onboundary({ name: "word", charIndex }),
      index * 2,
    );
    await page.waitForFunction(
      (expected) => window.testFace.level === expected,
      { A: 0.9, I: 0.3, U: 0.4, E: 0.5, O: 0.7 }[vowel],
    );
    // Pause freezes speech, so the rendered mesh must actually close.
    shapes.push(
      await page.evaluate(() => [window.testFace.level, window.testFace.width]),
    );
    await page.evaluate(() => window.testUtterance.onpause());
    await page.waitForFunction(() => window.testFace.mouth.scale.y < 0.009);
    await page.evaluate(() => window.testUtterance.onresume());
  }
  assert.equal(new Set(shapes.map(JSON.stringify)).size, 5);
  await page.evaluate(() => window.testUtterance.onend());
  await page.waitForFunction(
    () => window.testFace.level === 0 && window.testFace.mouth.scale.y < 0.009,
  );
  await page
    .getByRole("button", { name: "Hentikan sesi", exact: false })
    .click();
  // Repeat a session and verify emergency STOP during speech aborts the voice and mouth.
  await page
    .getByRole("button", { name: "Aktifkan suara & mulai", exact: false })
    .click();
  await page.waitForFunction(() => window.testFace.level > 0);
  await page.evaluate(() => {
    const channel = new BroadcastChannel("pasuruan-studio");
    channel.postMessage("STOP");
    channel.close();
  });
  await page.waitForFunction(
    () =>
      window.cancelled &&
      !window.testFace.speaking &&
      window.testFace.mouth.scale.y < 0.009,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser mouth passed: five vowel poses reach the 3D face, pause/end close the rendered mouth, emergency STOP cancels speech and animation.",
  );
} finally {
  await browser.close();
}
