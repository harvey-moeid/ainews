import { chromium } from "playwright";
import assert from "node:assert/strict";
const storyTitle = "Pengujian berita manual " + Date.now();
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173");
await page.waitForTimeout(1300);
await page.screenshot({
  path: "/workspace/shared/pasuruan-desktop.png",
  fullPage: true,
});
console.log("Dashboard rendered:", await page.locator("h1").innerText());
await page.getByRole("button", { name: "Tambah berita", exact: true }).click();
await page.getByLabel("Judul berita").fill(storyTitle);
await page
  .getByLabel("Bahan berita / teks sumber")
  .fill(
    "Materi pengujian aplikasi untuk memastikan penyimpanan draft dan review berjalan dengan benar. Informasi ini hanya digunakan untuk pengujian redaksi.",
  );
await page
  .locator(".script-textarea")
  .fill("Ini adalah naskah pengujian studio. Bukan laporan aktual.");
await page.getByRole("button", { name: "Detail & sumber" }).click();
await page.getByLabel("Nama sumber").fill("Redaksi pengujian");
await page.getByRole("button", { name: "Simpan draft", exact: true }).click();
await page.waitForTimeout(700);
assert.equal(await page.getByRole("dialog").count(), 0);
await page
  .getByRole("button", { name: "Ruang redaksi", exact: false })
  .first()
  .click();
await page.getByPlaceholder("Cari judul, kategori, sumber…").fill(storyTitle);
assert.equal(await page.locator(".news-table tbody tr").count(), 1);
await page.getByRole("button", { name: storyTitle, exact: true }).click();
await page.getByRole("button", { name: "Setujui berita" }).click();
await page.waitForTimeout(400);
await page
  .getByRole("button", { name: "Tambah ke antrean", exact: true })
  .click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Kontrol siaran", exact: true }).click();
assert.ok(
  (await page.locator(".full-queue").innerText()).includes(
    "Pengujian berita manual",
  ),
);
await page.getByLabel("Mode selesai antrean").selectOption("count");
await page.waitForTimeout(300);
await page.getByLabel("Jumlah putaran").fill("3");
await page.getByLabel("Jumlah putaran").blur();
await page.waitForTimeout(300);
await page
  .getByRole("button", { name: "Presenter & studio", exact: true })
  .click();
await page.waitForTimeout(400);
assert.equal(await page.locator(".presenter-stage canvas").count(), 1);
await page.screenshot({
  path: "/workspace/shared/pasuruan-presenter.png",
  fullPage: true,
});
await page.getByRole("button", { name: "Konfigurasi AI", exact: true }).click();
assert.equal(await page.locator(".provider-card").count(), 10);
await page.getByRole("button", { name: "Sumber berita", exact: true }).click();
await page.getByRole("button", { name: "Tambah sumber", exact: true }).click();
await page.getByLabel("Nama sumber").fill("Feed pengujian");
await page.getByLabel("URL / tautan feed").fill("https://example.com/feed");
await page
  .getByLabel("Catatan izin & atribusi")
  .fill("Sumber uji; bukan data aktual.");
await page.getByRole("button", { name: "Simpan sumber", exact: true }).click();
await page.waitForTimeout(400);
assert.ok(
  (await page.locator(".source-cards").innerText()).includes("Feed pengujian"),
);
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://127.0.0.1:5173");
await page.waitForTimeout(1200);
await page.screenshot({
  path: "/workspace/shared/pasuruan-mobile.png",
  fullPage: true,
});
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth,
);
assert.equal(overflow, false, "Mobile viewport must not overflow");
await page.getByRole("button", { name: "Buka navigasi" }).click();
await page
  .getByRole("button", { name: "Ruang redaksi", exact: false })
  .first()
  .click();
assert.equal(await page.locator(".sidebar.open").count(), 0);
console.log(
  "Browser workflow passed: create, edit, approve, queue, loop, presenter, sources, mobile.",
);
console.log("Page errors:", errors);
assert.deepEqual(errors, []);
await browser.close();
