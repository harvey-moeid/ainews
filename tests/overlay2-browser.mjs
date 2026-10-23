import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { OVERLAY2_DEFAULTS } from "../shared/ai-catalog.js";
await mkdir("test-results", { recursive: true });
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5173/admin/overlay2");
  await page.getByText("Sistem terhubung", { exact: true }).waitFor();
  await page.getByLabel("Nama host").waitFor();
  const title = "Kabar Warga · Pasuruan";
  await page.getByLabel("Judul Overlay 2", { exact: true }).fill(title);
  assert.equal(await page.locator(".o2-preview header p").textContent(), title);
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/settings") && r.request().method() === "PUT",
    ),
    page.getByRole("button", { name: "Simpan Overlay 2", exact: true }).click(),
  ]);
  await page.reload();
  await page.getByText("Sistem terhubung", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Judul Overlay 2", { exact: true }).inputValue(),
    title,
  );
  assert.equal(
    await page.getByLabel("Alamat konektor").inputValue(),
    OVERLAY2_DEFAULTS.connectorUrl,
  );
  assert.equal(await page.locator(".o2-face canvas").count(), 1);
  await page
    .getByRole("button", { name: "Provider & model AI", exact: true })
    .click();
  assert.equal(await page.locator(".provider-card select").count(), 5);
  await page.getByLabel("Model OpenAI").selectOption("gpt-4.1");
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/settings") && r.request().method() === "PUT",
    ),
    page
      .getByRole("button", { name: "Simpan konfigurasi", exact: true })
      .click(),
  ]);
  await page.reload();
  await page.getByLabel("Model OpenAI").waitFor();
  await page.getByText("Sistem terhubung", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Model OpenAI").inputValue(), "gpt-4.1");
  await page.goto("http://127.0.0.1:5173/overlay2");
  await page
    .getByRole("button", { name: "Aktifkan suara & mulai", exact: false })
    .waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".o2-stage header p").textContent(), title);
  const enterFullscreen = () =>
    page
      .getByRole("button", { name: "Layar penuh untuk siaran", exact: true })
      .click();
  const assertFillsViewport = () =>
    page.waitForFunction(() => {
      const rect = document.querySelector(".o2-stage").getBoundingClientRect();
      return (
        rect.x === 0 &&
        rect.y === 0 &&
        Math.abs(rect.width - innerWidth) < 2 &&
        Math.abs(rect.height - innerHeight) < 2
      );
    });
  await enterFullscreen();
  await assertFillsViewport();
  assert.equal(
    await page.evaluate(() =>
      document.fullscreenElement?.classList.contains("o2-stage"),
    ),
    true,
  );
  await page
    .getByRole("button", { name: "Keluar layar penuh", exact: true })
    .focus();
  await page
    .getByRole("button", { name: "Keluar layar penuh", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !document.fullscreenElement && !document.querySelector(".o2-expanded"),
  );
  await page.screenshot({
    path: "test-results/overlay2-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  // A rejected Fullscreen API still fills the mobile browser and Escape exits.
  await page.evaluate(() => {
    document.querySelector(".o2-stage").requestFullscreen = async () => {
      throw Error("Unsupported");
    };
  });
  await enterFullscreen();
  await assertFillsViewport();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".o2-expanded"));
  // Browsers without the API can also enter and exit via the on-screen control.
  await page.evaluate(() => {
    document.querySelector(".o2-stage").requestFullscreen = undefined;
  });
  await enterFullscreen();
  await assertFillsViewport();
  await page
    .getByRole("button", { name: "Keluar layar penuh", exact: true })
    .focus();
  await page
    .getByRole("button", { name: "Keluar layar penuh", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/overlay2-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );

  // Fake only external audio and API responses for deterministic timing checks.
  // SQL, provider, gift eligibility and authentication are tested separately.
  let lease = null,
    running = false,
    spoken = [],
    concurrent = 0,
    maximum = 0,
    acknowledged = false;
  const comment = {
    id: "c1",
    username: "alice",
    display_name: "Alice",
    question: "Posko banjir di mana?",
    status: "pending",
    created_at: Date.now(),
  };
  await page.exposeFunction("speechStarted", (text) => {
    spoken.push(text);
    concurrent++;
    maximum = Math.max(maximum, concurrent);
  });
  await page.exposeFunction("speechEnded", () => {
    concurrent--;
  });
  await page.addInitScript(() => {
    let timer;
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [],
        cancel: () => clearTimeout(timer),
        speak: (utterance) => {
          void window.speechStarted(utterance.text);
          utterance.onstart?.();
          timer = setTimeout(
            async () => {
              await window.speechEnded();
              utterance.onend?.();
            },
            utterance.text.startsWith("Kalimat pertama") ? 5000 : 150,
          );
        },
      },
    });
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    const input = request.method() === "GET" ? {} : request.postDataJSON();
    let value = { ok: true };
    if (path === "/api/lease") {
      lease = input.release
        ? null
        : { id: input.id, expires: Date.now() + 90000 };
      value = { lease };
    }
    if (path === "/api/overlay2/session") running = input.action === "start";
    if (path === "/api/overlay2/state")
      value = {
        config: { ...OVERLAY2_DEFAULTS, loopNews: false },
        audio: { rate: 1, pitch: 1 },
        runtime: { active: running },
        connector: { status: "Connected", username: "host" },
        queue: {
          lease,
          items: [
            {
              id: "n1",
              revision: 1,
              title: "Berita uji scheduler",
              script: "Kalimat pertama berita. Kalimat kedua berita.",
              source_name: "Redaksi uji",
              published_at: new Date().toISOString(),
            },
          ],
        },
        comments: spoken.length && !acknowledged ? [comment] : [],
      };
    if (path === "/api/overlay2/answer")
      value = {
        id: "c1",
        text: "Posko ada di Bugul Kidul.",
        mode: "rag",
        citations: [],
        gifted: false,
      };
    if (path === "/api/overlay2/ack") acknowledged = true;
    await route.fulfill({ json: value });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Aktifkan suara & mulai", exact: false })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".o2-transcript")
        ?.textContent.includes("Kalimat kedua"),
    { timeout: 15000 },
  );
  assert.equal(spoken[0], "Kalimat pertama berita.");
  assert.match(spoken[1], /Alice bertanya.*Posko ada di Bugul Kidul/);
  assert.equal(spoken[2], "Kalimat kedua berita.");
  assert.equal(maximum, 1, "News and replies must not overlap");
  assert.ok(acknowledged);
  await page
    .getByRole("button", { name: "Hentikan sesi", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Aktifkan suara & mulai", exact: false })
    .waitFor();
  assert.equal(running, false);
  assert.equal(lease, null);
  assert.deepEqual(errors, []);
  console.log(
    "Overlay 2 browser passed: editable title persistence and preview, native fullscreen in standby, mobile fullscreen fallback and exit, five model dropdowns, responsive canvas, sentence-boundary reply, news resume, one audio job, session stop.",
  );
} finally {
  await browser.close();
}
