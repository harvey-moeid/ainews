import { isRegion } from "../shared/regions.js";

export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function validateStory(input) {
  const x = { ...input };
  for (const key of [
    "title",
    "text",
    "script",
    "source_name",
    "source_url",
    "category",
    "region",
    "credit",
    "permission",
    "subtitle",
  ])
    x[key] = String(x[key] || "").trim();
  if (x.title.length < 5 || x.title.length > 240)
    throw new ApiError("Judul harus 5–240 karakter.");
  if (!isRegion(x.region))
    throw new ApiError("Pilih Indonesia atau kota/kabupaten yang tersedia.");
  if (!["draft", "review", "approved", "archived"].includes(x.status))
    throw new ApiError("Status tidak valid.");
  if (!["reguler", "utama", "breaking"].includes(x.priority))
    throw new ApiError("Prioritas tidak valid.");
  if (x.text.length > 30000 || x.script.length > 12000)
    throw new ApiError("Teks melebihi batas panjang.");
  if (x.source_url) {
    try {
      if (new URL(x.source_url).protocol !== "https:") throw new Error();
    } catch {
      throw new ApiError("URL sumber harus HTTPS yang valid.");
    }
  }
  if (x.status === "approved" && (!x.script || !x.source_name || !x.text))
    throw new ApiError(
      "Naskah, materi sumber, dan nama sumber wajib diisi sebelum tayang.",
    );
  if (x.status === "approved" && x.sensitive && !x.humanReviewed)
    throw new ApiError("Berita sensitif membutuhkan persetujuan manusia.");
  if (x.media && !x.permission)
    throw new ApiError("Lengkapi izin penggunaan media.");
  const d = new Date(x.published_at);
  if (Number.isNaN(d.valueOf()))
    throw new ApiError("Tanggal publikasi tidak valid.");
  x.published_at = d.toISOString();
  x.demo = Boolean(x.demo);
  x.sensitive = Boolean(x.sensitive);
  return x;
}
export function normalizeFingerprint(x) {
  // Instagram shortcodes are case-sensitive; TikTok video IDs are global.
  try {
    const url = new URL(x.source_url);
    if (["instagram.com", "www.instagram.com"].includes(url.hostname)) {
      const post = url.pathname.match(/^\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)\/?$/);
      if (post) return "instagram:" + post[1];
    }
    if (["tiktok.com", "www.tiktok.com"].includes(url.hostname)) {
      const post = url.pathname.match(/^\/@[^/]+\/video\/(\d+)\/?$/);
      if (post) return "tiktok:" + post[1];
    }
  } catch {
    /* Ordinary stories can have an empty source URL. */
  }
  return (x.source_url || x.title)
    .toLowerCase()
    .replace(/[?#].*$/, "")
    .replace(/[^a-z0-9]/g, "");
}
export function validateQueue(q) {
  if (!Array.isArray(q.items) || q.items.length > 100)
    throw new ApiError("Maksimal 100 berita per playlist.");
  if (!["standby", "loop", "count", "delay"].includes(q.mode))
    throw new ApiError("Mode antrean tidak valid.");
  q.loops = Math.min(100, Math.max(1, Number(q.loops) || 1));
  q.delay = Math.min(3600, Math.max(1, Number(q.delay) || 15));
  q.index = Math.max(
    0,
    Math.min(Number(q.index) || 0, Math.max(0, q.items.length - 1)),
  );
  return q;
}
export function nextPosition(q) {
  if (!q.items.length)
    return { ...q, index: 0, status: "standby", command: "stop" };
  if (q.index + 1 < q.items.length) return { ...q, index: q.index + 1 };
  if (q.mode === "standby" || (q.mode === "count" && q.round >= q.loops))
    return { ...q, status: "standby", command: "stop" };
  return { ...q, index: 0, round: (q.round || 1) + 1 };
}
