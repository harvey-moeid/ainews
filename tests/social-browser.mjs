import { chromium } from "playwright";
import assert from "node:assert/strict";

// Use local Worker/D1/R2; AI and speech are mocked so no credentials are needed.
const origin = "http://127.0.0.1:8787";
const suffix = Date.now();
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [],
        addEventListener() {},
        removeEventListener() {},
        cancel() {},
        speak(utterance) {
          window.__spoken = utterance.text;
          setTimeout(() => utterance.onend?.(), 50);
        },
      },
    });
  });
  const page = await context.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const type of ["Instagram", "TikTok"]) {
    const sourceName = `Profil ${type} ${suffix}`;
    const title = `Caption ${type} pengujian ${suffix}`;
    const caption = `${title}\nMateri caption asli yang digunakan untuk pengujian alur import manual, rangkuman, suara, persetujuan, dan antrean siaran. #berita`;
    const profileUrl =
      type === "Instagram"
        ? "https://instagram.com/redaksi/"
        : "https://tiktok.com/@redaksi";
    const postUrl =
      type === "Instagram"
        ? `https://www.instagram.com/p/Test_${suffix}/`
        : `https://www.tiktok.com/@redaksi/video/${suffix}`;
    await page.goto(origin + "/admin/sources");
    await page
      .getByRole("button", { name: "Tambah sumber", exact: true })
      .click();
    await page.getByLabel("Nama sumber").fill(sourceName);
    await page.getByLabel("Jenis sumber", { exact: true }).selectOption(type);
    assert.equal(
      await page
        .getByLabel("Pengambilan caption", { exact: true })
        .inputValue(),
      "manual",
    );
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    await page.getByLabel("URL profil", { exact: true }).fill(profileUrl);
    await page
      .getByLabel("Catatan izin & atribusi")
      .fill("Izin pengujian lokal, bukan berita aktual.");
    await page.getByLabel("Aktifkan sumber ini").uncheck();
    await page
      .getByRole("button", { name: "Simpan sumber", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const card = page.locator(".source-card").filter({ hasText: sourceName });
    await card
      .getByRole("button", { name: "Import caption", exact: true })
      .click();
    await page.getByLabel("Tautan postingan", { exact: true }).fill(postUrl);
    await page
      .getByLabel("Tanggal postingan", { exact: true })
      .fill("2026-10-20T08:00");
    await page.getByLabel("Caption asli", { exact: true }).fill(caption);
    await page.getByRole("button", { name: "Import sebagai draft" }).click();
    await page.locator(".caption-original textarea").waitFor();
    assert.equal(
      await page.locator(".caption-original textarea").inputValue(),
      caption,
    );
    assert.equal(await page.locator(".script-textarea").inputValue(), caption);
    if (type === "Instagram") {
      let aiInput;
      await page.route("**/api/ai", async (route) => {
        aiInput = route.request().postDataJSON().text;
        await route.fulfill({
          json: {
            script: "Rangkuman pengujian dari caption.",
            provider: "Mock",
          },
        });
      });
      await page
        .getByLabel("Bahan berita / teks sumber")
        .fill("Teks edit berbeda dari caption asli. ".repeat(5));
      await page
        .getByRole("button", { name: "Ringkas caption dengan AI" })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector(".script-textarea").value ===
          "Rangkuman pengujian dari caption.",
      );
      assert.equal(aiInput, caption);
      assert.equal(
        await page.locator(".caption-original textarea").inputValue(),
        caption,
      );
      await page.getByRole("button", { name: "Gunakan caption asli" }).click();
      assert.equal(
        await page.locator(".script-textarea").inputValue(),
        caption,
      );
    }
    await page
      .getByRole("button", { name: "Preview suara", exact: true })
      .click();
    await page.waitForFunction(
      (expected) => window.__spoken === expected,
      caption,
    );
    await page
      .getByRole("button", { name: "Simpan draft", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Ruang redaksi", exact: true })
      .click();
    await page.getByPlaceholder("Cari judul, kategori, sumber…").fill(title);
    await page.getByRole("button", { name: title, exact: true }).click();
    assert.equal(
      await page.locator(".caption-original textarea").inputValue(),
      caption,
    );
    await page.getByRole("button", { name: "Setujui berita" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Tambah ke antrean", exact: true })
      .click();
    await page.waitForFunction(async (expected) => {
      const state = await fetch("/api/live").then((response) =>
        response.json(),
      );
      return state.queue.items.some((story) => story.source_url === expected);
    }, postUrl);
    const state = await page.evaluate(async () =>
      fetch("/api/live").then((response) => response.json()),
    );
    assert.equal(
      state.queue.items.find((story) => story.source_url === postUrl).script,
      caption,
    );
  }
  // An automatic source without a token must show a useful error, not fake posts.
  await page.goto(origin + "/admin/sources");
  const instagram = page
    .locator(".source-card")
    .filter({ hasText: `Profil Instagram ${suffix}` });
  await instagram.getByRole("button", { name: "Sunting sumber" }).click();
  await page
    .getByLabel("Pengambilan caption", { exact: true })
    .selectOption("official");
  await page.getByLabel("Instagram User ID", { exact: true }).fill("1234");
  await page.getByLabel("Aktifkan sumber ini").check();
  await page
    .getByRole("button", { name: "Simpan sumber", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await instagram
    .getByRole("button", { name: "Ambil caption terbaru" })
    .click();
  await instagram.getByText(/Token sumber belum diisi/).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await instagram.getByRole("button", { name: "Sunting sumber" }).click();
  await page
    .getByLabel("Pengambilan caption", { exact: true })
    .selectOption("connector");
  await page
    .getByLabel("URL konektor profil", { exact: true })
    .fill("https://social.example.com");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Social browser workflow passed: manual Instagram/TikTok captions, original/summary, speech API, approval, queue, missing token, mobile.",
  );
} finally {
  await browser.close();
}
