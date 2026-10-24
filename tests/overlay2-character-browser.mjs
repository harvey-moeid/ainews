import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { CHARACTER_DEFAULTS } from "../shared/character.js";

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
page.on("pageerror", (error) => errors.push(error.message));
// Observe the real face instance without replacing its renderer or appearance code.
await page.route("**/src/overlay2/face.js*", async (route) => {
  const response = await route.fetch();
  await route.fulfill({
    response,
    body:
      (await response.text()) +
      `
    const observeAppearance = VirtualFace.prototype.setAppearance;
    VirtualFace.prototype.setAppearance = function (...args) {
      window.testFace = this;
      return observeAppearance.apply(this, args);
    };
  `,
  });
});
const waitForAppearance = (expected) =>
  page.waitForFunction(
    (values) =>
      Object.entries(values).every(
        ([key, value]) => window.testFace?.appearance?.[key] === value,
      ),
    expected,
  );
const nextFrame = () =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
try {
  await page.goto("http://127.0.0.1:5173/admin/overlay2");
  await page.getByText("Sistem terhubung", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Reset karakter", exact: true })
    .click();
  await waitForAppearance(CHARACTER_DEFAULTS);
  await page.evaluate(() => {
    window.originalFace = window.testFace;
    window.originalRenderer = window.testFace.renderer;
  });
  for (const hairStyle of ["short", "bob", "mohawk", "none"]) {
    await page
      .getByLabel("Gaya rambut", { exact: true })
      .selectOption(hairStyle);
    await waitForAppearance({ hairStyle });
    assert.equal(
      await page.evaluate(() =>
        Boolean(window.testFace.details.getObjectByName("hair")),
      ),
      hairStyle !== "none",
    );
  }
  for (const accessory of ["headset", "glasses", "none"]) {
    await page
      .getByLabel("Aksesori karakter", { exact: true })
      .selectOption(accessory);
    await waitForAppearance({ accessory });
    assert.equal(
      await page.evaluate(() =>
        Boolean(window.testFace.details.getObjectByName("accessory")),
      ),
      accessory !== "none",
    );
  }
  const chosen = {
    hairStyle: "bob",
    accessory: "glasses",
    hairColor: "#9b537b",
    faceColor: "#3479ab",
    eyeColor: "#45da92",
  };
  await page
    .getByLabel("Gaya rambut", { exact: true })
    .selectOption(chosen.hairStyle);
  await page
    .getByLabel("Aksesori karakter", { exact: true })
    .selectOption(chosen.accessory);
  await page.getByLabel("Warna rambut").fill(chosen.hairColor);
  await page.getByLabel("Warna wajah").fill(chosen.faceColor);
  await page.getByLabel("Warna mata").fill(chosen.eyeColor);
  await waitForAppearance(chosen);
  assert.deepEqual(
    await page.evaluate(() => ({
      sameFace: window.testFace === window.originalFace,
      sameRenderer: window.testFace.renderer === window.originalRenderer,
      faceColor: "#" + window.testFace.wireMaterial.color.getHexString(),
      eyeColor: "#" + window.testFace.eyeColors[0].iris.color.getHexString(),
    })),
    {
      sameFace: true,
      sameRenderer: true,
      faceColor: chosen.faceColor,
      eyeColor: chosen.eyeColor,
    },
  );
  await nextFrame();
  await page
    .locator(".o2-preview .o2-stage")
    .screenshot({ path: "test-results/overlay2-character-bob-glasses.png" });
  const [saved] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/settings") &&
        response.request().method() === "PUT",
    ),
    page.getByRole("button", { name: "Simpan Overlay 2", exact: true }).click(),
  ]);
  assert.equal(saved.status(), 200);
  await page.reload();
  await page.getByText("Sistem terhubung", { exact: true }).waitFor();
  await waitForAppearance(chosen);
  assert.equal(
    await page.getByLabel("Gaya rambut", { exact: true }).inputValue(),
    chosen.hairStyle,
  );
  assert.equal(
    await page.getByLabel("Aksesori karakter", { exact: true }).inputValue(),
    chosen.accessory,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByLabel("Gaya rambut", { exact: true })
    .scrollIntoViewIfNeeded();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.goto("http://127.0.0.1:5173/overlay2");
  await waitForAppearance(chosen);
  await page
    .getByRole("button", { name: "Layar penuh untuk siaran", exact: true })
    .click();
  await nextFrame();
  await page.screenshot({
    path: "test-results/overlay2-character-player-mobile.png",
  });
  assert.equal(await page.locator(".o2-webgl-error").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Character browser passed: all hair/accessory choices, live colors without renderer recreation, reset, save/reload, mobile admin and fullscreen player.",
  );
} finally {
  await browser.close();
}
