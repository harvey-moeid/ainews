import { chromium } from "playwright";
import assert from "node:assert/strict";
import { AI_PROVIDERS } from "../shared/ai-catalog.js";

const provider = AI_PROVIDERS.find((p) => p.id === "workersai");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:8787/admin/ai");
  await page.getByText("Sistem terhubung", { exact: true }).waitFor();
  const card = page
    .locator(".provider-card")
    .filter({
      has: page.getByRole("heading", { name: provider.name, exact: false }),
    });
  await card.getByText("Binding AI belum tersedia", { exact: true }).waitFor();
  assert.equal(await page.locator(".provider-card").count(), 10);
  assert.equal(await card.locator('input[type="password"]').count(), 0);
  assert.equal(
    await card
      .getByRole("button", { name: "Simpan key " + provider.name })
      .count(),
    0,
  );
  await card.getByRole("button", { name: "Tes respons", exact: true }).click();
  await page.getByText(/Binding AI belum tersedia\. Pasang binding/).waitFor();
  let tested = false;
  // Simulate binding calls only. Settings use the real local Worker and D1.
  await page.route("**/api/ai/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/ai/catalog") {
      const response = await route.fetch();
      await route.fulfill({
        json: { ...(await response.json()), bindings: { AI: "available" } },
      });
    } else if (url.pathname === "/api/ai/models") {
      assert.equal(url.searchParams.get("provider"), "workersai");
      await route.fulfill({
        json: {
          models: [{ id: provider.models[1], name: provider.models[1] }],
          source: "provider",
          hasMore: false,
        },
      });
    } else if (url.pathname === "/api/ai/test") {
      assert.equal(route.request().postDataJSON().provider, "workersai");
      tested = true;
      await route.fulfill({
        json: {
          text: "koneksi AI siap",
          provider: provider.name,
          providerId: provider.id,
          model: provider.models[1],
        },
      });
    } else await route.continue();
  });
  await page.reload();
  await page.getByText("Sistem terhubung", { exact: true }).waitFor();
  await card
    .getByText("Binding AI tersedia · tanpa API key", { exact: true })
    .waitFor();
  const select = page.getByLabel("Model " + provider.name, { exact: true });
  assert.equal(await select.inputValue(), provider.models[0]);
  await card
    .getByRole("button", { name: "Muat model dari provider", exact: true })
    .click();
  await select
    .locator(`option[value="${provider.models[1]}"]`)
    .waitFor({ state: "attached" });
  assert.equal(await select.inputValue(), provider.models[0]);
  await select.selectOption(provider.models[1]);
  await page
    .getByRole("button", { name: "Aktifkan " + provider.name, exact: true })
    .click();
  const up = page.getByRole("button", {
    name: "Naikkan " + provider.name,
    exact: true,
  });
  while (await up.isEnabled()) await up.click();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/settings") &&
        response.request().method() === "PUT" &&
        response.status() === 200,
    ),
    page
      .getByRole("button", { name: "Simpan konfigurasi", exact: true })
      .click(),
  ]);
  await page.reload();
  await page.getByText("Sistem terhubung", { exact: true }).waitFor();
  await card.waitFor();
  assert.equal(await select.inputValue(), provider.models[1]);
  assert.equal(
    await page
      .getByRole("button", { name: "Aktifkan " + provider.name, exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.ok(
    (await page.locator(".provider-card").first().innerText()).includes(
      provider.name,
    ),
  );
  await card.getByRole("button", { name: "Tes respons", exact: true }).click();
  await page.waitForFunction(() =>
    document.body.innerText.includes("koneksi AI siap"),
  );
  assert.equal(tested, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Workers AI browser passed: binding status, no key controls, models, save/reload, priority, response test, mobile.",
  );
} finally {
  await browser.close();
}
