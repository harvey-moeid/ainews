import { chromium } from "playwright";
import assert from "node:assert/strict";

const origin = "http://127.0.0.1:8787";
const suffix = Date.now();
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
  const ids = ["blocked", "storage", "ok"].map((name) => `${name}-${suffix}`);
  for (const id of ids) {
    const response = await page.request.post(origin + "/api/sources", {
      data: {
        id,
        name: id,
        type: "RSS",
        url: "https://example.com/feed",
        region: "Indonesia",
        active: true,
        permission: "Pengujian lokal",
      },
    });
    assert.equal(response.status(), 200);
  }
  const calls = [],
    statuses = new Map();
  await page.route("**/api/refresh", async (route) => {
    const input = route.request().postDataJSON();
    assert.equal(
      typeof input.id,
      "string",
      "Every refresh request must select one source",
    );
    if (!ids.includes(input.id))
      return route.fulfill({ json: { results: [{ cached: true }] } });
    calls.push(input.id);
    const index = ids.indexOf(input.id);
    const status =
      index === 0
        ? "Sumber menolak akses otomatis (HTTP 403). Gunakan feed berizin atau input manual."
        : index === 1
          ? "Penyimpanan hasil pengambilan gagal."
          : "Terhubung · 2 draft baru";
    statuses.set(input.id, status);
    if (index === 1)
      return route.fulfill({ status: 503, json: { error: status } });
    await route.fulfill({
      json: {
        results: [
          {
            id: input.id,
            status,
            error: index === 0,
            added: index === 0 ? 0 : 2,
          },
        ],
      },
    });
  });
  await page.route("**/api/bootstrap", async (route) => {
    const response = await route.fetch(),
      data = await response.json();
    data.sources = data.sources
      .filter((source) => ids.includes(source.id))
      .map((source) => ({
        ...source,
        status: statuses.get(source.id) || source.status,
      }));
    await route.fulfill({ json: data });
  });
  await page.goto(origin + "/admin/sources");
  await page.getByText("Sistem terhubung", { exact: true }).waitFor();
  const refresh = page.getByRole("button", {
    name: "Refresh semua sumber",
    exact: true,
  });
  await page
    .locator(".source-card")
    .filter({ hasText: ids[2] })
    .getByText("Terhubung · 2 draft baru", { exact: true })
    .waitFor();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find((button) =>
        button.textContent.includes("Refresh semua sumber"),
      )?.disabled,
  );
  calls.length = 0;
  await refresh.click();
  await page
    .getByRole("status")
    .filter({ hasText: "1/3 sumber selesai · 2 gagal" })
    .waitFor();
  assert.equal(new Set(calls).size, 3);
  const blocked = page.locator(".source-card").filter({ hasText: ids[0] });
  await blocked
    .getByRole("button", { name: "Periksa sumber", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: /HTTP 403/ })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Feed browser passed: one source per request, mixed failures, continued refresh, source error notification, mobile.",
  );
} finally {
  await browser.close();
}
