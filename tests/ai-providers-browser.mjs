import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { AI_PROVIDERS } from "../shared/ai-catalog.js";

await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const providers = AI_PROVIDERS.filter((p) =>
  ["nvidia", "cohere", "huggingface", "mistral"].includes(p.id),
);
const keys = new Set(),
  tested = new Set();

// Only credential/provider calls are simulated. Settings save and reload use local D1.
await page.route("**/api/ai/**", async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.pathname === "/api/ai/catalog") {
    const response = await route.fetch(),
      catalog = await response.json();
    for (const p of providers)
      catalog.credentials[p.secret] = keys.has(p.secret)
        ? "encrypted"
        : "missing";
    await route.fulfill({ json: { ...catalog, keyStorageReady: true } });
  } else if (url.pathname === "/api/ai/keys") {
    const input = request.postDataJSON();
    assert.ok(providers.some((p) => p.secret === input.name));
    assert.equal(input.value, "test-key-browser-only-123456");
    keys.add(input.name);
    await route.fulfill({ json: { ok: true } });
  } else if (url.pathname === "/api/ai/models") {
    const provider = providers.find(
      (p) => p.id === url.searchParams.get("provider"),
    );
    assert.ok(provider);
    await route.fulfill({
      json: {
        models: [
          {
            id: `${provider.id}-live-model`,
            name: `${provider.name} live model`,
          },
        ],
        source: "provider",
        hasMore: false,
      },
    });
  } else if (url.pathname === "/api/ai/test") {
    const input = request.postDataJSON(),
      provider = providers.find((p) => p.id === input.provider);
    assert.ok(provider);
    tested.add(provider.id);
    await route.fulfill({
      json: {
        provider: provider.name,
        providerId: provider.id,
        model: `${provider.id}-live-model`,
        text: "koneksi AI siap",
      },
    });
  } else await route.continue();
});

const card = (provider) =>
  page.locator(".provider-card").filter({
    has: page.getByRole("heading", { name: provider.name, exact: false }),
  });
try {
  await page.goto("http://127.0.0.1:5173/admin/ai");
  await page.getByText("Sistem terhubung", { exact: true }).waitFor();
  assert.equal(await page.locator(".provider-card").count(), 10);
  for (const provider of providers) {
    const select = page.getByLabel(`Model ${provider.name}`, { exact: true });
    const options = await select
      .locator("option")
      .evaluateAll((elements) => elements.map((el) => el.value));
    for (const model of provider.models) assert.ok(options.includes(model));
    await page
      .getByLabel(`API key ${provider.name}`, { exact: true })
      .fill("test-key-browser-only-123456");
    await card(provider)
      .getByRole("button", { name: `Simpan key ${provider.name}`, exact: true })
      .click();
    await card(provider)
      .getByText("Key tersimpan terenkripsi", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByLabel(`API key ${provider.name}`, { exact: true })
        .inputValue(),
      "",
    );
    const previousModel = await select.inputValue();
    await card(provider)
      .getByRole("button", { name: "Muat model dari provider", exact: true })
      .click();
    await select
      .locator(`option[value="${provider.id}-live-model"]`)
      .waitFor({ state: "attached" });
    assert.equal(await select.inputValue(), previousModel);
    if (previousModel !== `${provider.id}-live-model`)
      assert.ok(
        (await select.locator("option").allTextContents()).some((name) =>
          name.includes("tersimpan"),
        ),
      );
    await select.selectOption(`${provider.id}-live-model`);
    const toggle = page.getByRole("button", {
      name: `Aktifkan ${provider.name}`,
      exact: true,
    });
    if ((await toggle.getAttribute("aria-pressed")) !== "true")
      await toggle.click();
  }
  const orderBefore = await page.locator(".provider-card h2").allTextContents();
  const oldPosition = orderBefore.findIndex((name) =>
    name.startsWith("NVIDIA NIM"),
  );
  if (oldPosition > 0)
    await page
      .getByRole("button", { name: "Naikkan NVIDIA NIM", exact: true })
      .click();
  const [saved] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/settings") &&
        response.request().method() === "PUT",
    ),
    page
      .getByRole("button", { name: "Simpan konfigurasi", exact: true })
      .click(),
  ]);
  assert.equal(saved.status(), 200);
  await page.reload();
  await page.getByText("Sistem terhubung", { exact: true }).waitFor();
  for (const provider of providers) {
    assert.equal(
      await page
        .getByLabel(`Model ${provider.name}`, { exact: true })
        .inputValue(),
      `${provider.id}-live-model`,
    );
    assert.equal(
      await page
        .getByRole("button", { name: `Aktifkan ${provider.name}`, exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith("/api/ai/test"),
      ),
      card(provider)
        .getByRole("button", { name: "Tes respons", exact: true })
        .click(),
    ]);
  }
  assert.equal(tested.size, 4);
  assert.equal(keys.size, 4);
  assert.ok(
    (await page.locator(".provider-card").allTextContents())[
      Math.max(0, oldPosition - 1)
    ].includes("NVIDIA NIM"),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await card(providers[2]).scrollIntoViewIfNeeded();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "test-results/ai-providers-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Provider browser passed: ten cards, four model menus, key controls, fetched/saved model selection, fallback order, enable state, save/reload, response tests and mobile layout.",
  );
} finally {
  await browser.close();
}
