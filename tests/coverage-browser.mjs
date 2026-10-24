import { chromium } from "playwright";
import assert from "node:assert/strict";

// Uses the local Worker and its local D1/R2 only.
const origin = "http://127.0.0.1:8787";
const suffix = Date.now();
const sourceName = `Sumber cakupan ${suffix}`;
const cityTitle = `Cakupan kota ${suffix}`;
const nationalTitle = `Cakupan nasional ${suffix}`;
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
  await page.goto(origin + "/admin/sources");
  await page
    .getByRole("button", { name: "Tambah sumber", exact: true })
    .click();
  const coverage = page.getByLabel("Cakupan", { exact: true });
  assert.equal(await coverage.inputValue(), "Indonesia");
  assert.equal(await coverage.locator("option").count(), 515);
  assert.equal(await coverage.locator("optgroup").count(), 38);
  await coverage.selectOption("Kota Surabaya");
  await page.getByLabel("Nama sumber").fill(sourceName);
  await page.getByLabel("URL / tautan feed").fill("https://example.com/feed");
  await page.getByLabel("Catatan izin & atribusi").fill("Pengujian lokal.");
  await page.getByLabel("Aktifkan sumber ini").uncheck();
  await page
    .getByRole("button", { name: "Simpan sumber", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.reload();
  let card = page.locator(".source-card").filter({ hasText: sourceName });
  await card.waitFor();
  assert.ok((await card.innerText()).includes("Kota Surabaya"));
  await card.getByRole("button", { name: "Sunting sumber" }).click();
  assert.equal(await coverage.inputValue(), "Kota Surabaya");
  await coverage.selectOption("Indonesia");
  await page
    .getByRole("button", { name: "Simpan sumber", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.reload();
  card = page.locator(".source-card").filter({ hasText: sourceName });
  await card.waitFor();
  assert.ok((await card.innerText()).includes("Indonesia"));

  await page
    .getByRole("button", { name: "Ruang redaksi", exact: true })
    .click();
  for (const [title, region] of [
    [cityTitle, "Kota Surabaya"],
    [nationalTitle, "Indonesia"],
  ]) {
    await page
      .getByRole("button", { name: "Tambah berita", exact: true })
      .click();
    await page.getByLabel("Judul berita").fill(title);
    await page
      .getByLabel("Bahan berita / teks sumber")
      .fill("Materi pengujian cakupan berita; bukan laporan aktual.");
    await page
      .locator(".script-textarea")
      .fill("Naskah pengujian cakupan berita.");
    await page.getByRole("button", { name: "Detail & sumber" }).click();
    assert.equal(
      await page.getByLabel("Cakupan berita").inputValue(),
      "Indonesia",
    );
    await page.getByLabel("Cakupan berita").selectOption(region);
    await page.getByLabel("Nama sumber").fill("Redaksi pengujian");
    await page
      .getByRole("button", { name: "Simpan draft", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  await page.reload();
  await page
    .getByPlaceholder("Cari judul, kategori, sumber…")
    .fill(String(suffix));
  const filter = page.getByLabel("Filter wilayah");
  for (const [region, title] of [
    ["Kota Surabaya", cityTitle],
    ["Indonesia", nationalTitle],
  ]) {
    await filter.selectOption(region);
    assert.equal(await page.locator(".news-table tbody tr").count(), 1);
    assert.ok((await page.locator(".news-table").innerText()).includes(title));
  }
  await filter.selectOption("Semua wilayah");
  assert.equal(await page.locator(".news-table tbody tr").count(), 2);
  await page.getByRole("button", { name: cityTitle, exact: true }).click();
  await page.getByRole("button", { name: "Detail & sumber" }).click();
  assert.equal(
    await page.getByLabel("Cakupan berita").inputValue(),
    "Kota Surabaya",
  );
  await page.getByRole("button", { name: "Tutup dialog" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByLabel("Filter wilayah").waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Coverage browser workflow passed: 514 regions, source editing, story persistence, national/city filters, mobile.",
  );
} finally {
  await browser.close();
}
