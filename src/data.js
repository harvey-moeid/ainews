export const demoNews = [
  {
    id: "demo-1",
    title: "Wajah baru Alun-Alun Pasuruan, ruang publik semakin nyaman",
    category: "Pemerintahan",
    region: "Kota Pasuruan",
    priority: "utama",
    status: "approved",
    source_name: "Contoh editorial",
    source_url: "",
    published_at: "2026-10-15T07:30:00.000Z",
    script:
      "Ini adalah contoh naskah untuk pengujian studio Pasuruan AI News TV. Ruang publik yang nyaman menjadi bagian penting kehidupan warga. Contoh berita ini memperlihatkan bagaimana informasi lokal dapat disajikan melalui presenter virtual. Seluruh materi ini merupakan simulasi, bukan laporan kejadian aktual.",
    text: "Materi simulasi: penataan ruang publik dan Alun-Alun Pasuruan. Gunakan editor untuk mengganti contoh ini dengan berita dari sumber yang telah diperiksa.",
    demo: true,
    revision: 1,
    image: "city",
  },
  {
    id: "demo-2",
    title: "Pelaku UMKM lokal bersiap menjangkau pasar digital",
    category: "Ekonomi",
    region: "Kota Pasuruan",
    priority: "reguler",
    status: "approved",
    source_name: "Contoh editorial",
    published_at: "2026-10-15T06:45:00.000Z",
    script:
      "Anda sedang menyaksikan simulasi Pasuruan AI News TV. Dalam contoh segmen ekonomi ini, pelaku usaha lokal diperkenalkan pada pemasaran digital. Materi ini hanya digunakan untuk menguji antrean, suara, dan tampilan siaran. Silakan tambahkan berita aktual melalui ruang redaksi.",
    text: "Contoh materi pengujian tentang UMKM dan pemasaran digital.",
    demo: true,
    revision: 1,
    image: "market",
  },
  {
    id: "demo-3",
    title: "Menjelajahi pesona wisata dan warisan budaya Pasuruan",
    category: "Wisata & Budaya",
    region: "Kabupaten Pasuruan",
    priority: "reguler",
    status: "approved",
    source_name: "Contoh editorial",
    published_at: "2026-10-15T06:15:00.000Z",
    script:
      "Berikut adalah contoh segmen wisata dan budaya. Pasuruan memiliki berbagai destinasi dan tradisi yang dapat menjadi bahan liputan. Naskah simulasi ini disediakan untuk menguji presenter dan pemutaran berita. Materi ini bukan informasi agenda atau laporan terbaru.",
    text: "Materi simulasi untuk tampilan segmen wisata dan budaya.",
    demo: true,
    revision: 1,
    image: "mountain",
  },
  {
    id: "demo-4",
    title: "Informasi layanan publik: panduan untuk warga Pasuruan",
    category: "Layanan Publik",
    region: "Kota Pasuruan",
    priority: "reguler",
    status: "review",
    source_name: "Contoh editorial",
    published_at: "2026-10-15T05:30:00.000Z",
    script:
      "Contoh naskah informasi layanan publik. Periksa jadwal dan persyaratan layanan melalui kanal resmi instansi terkait. Materi ini merupakan simulasi dan perlu diganti dengan informasi aktual yang sudah ditinjau editor.",
    text: "Contoh informasi layanan publik. Tautan, jadwal, dan persyaratan harus diverifikasi sebelum tayang.",
    demo: true,
    revision: 1,
    image: "public",
  },
  {
    id: "demo-5",
    title: "Ruang kreativitas anak muda dan komunitas lokal",
    category: "Komunitas",
    region: "Kota Pasuruan",
    priority: "reguler",
    status: "draft",
    source_name: "Contoh editorial",
    published_at: "2026-10-15T04:30:00.000Z",
    script: "",
    text: "Materi simulasi ruang kreativitas komunitas. Tambahkan fakta, kutipan, dan sumber sebelum membuat naskah.",
    demo: true,
    revision: 1,
    image: "community",
  },
  {
    id: "demo-6",
    title: "Mengenal potensi pertanian di Kabupaten Pasuruan",
    category: "Ekonomi",
    region: "Kabupaten Pasuruan",
    priority: "reguler",
    status: "draft",
    source_name: "Contoh editorial",
    published_at: "2026-10-15T03:30:00.000Z",
    script: "",
    text: "Contoh draft potensi pertanian. Lengkapi dengan bahan sumber yang sah.",
    demo: true,
    revision: 1,
    image: "field",
  },
];
export const initialQueue = {
  items: [],
  mode: "standby",
  loops: 2,
  delay: 15,
  index: 0,
  round: 1,
  status: "standby",
  command: "stop",
  commandId: "",
  lease: null,
};
export const initialSettings = {
  voice: "",
  rate: 1,
  pitch: 1,
  quality: "high",
  camera: "auto",
  presenter: "Nara",
  glb: null,
  theme: "midnight",
  aiProviders: [
    {
      id: "gemini",
      name: "Google Gemini",
      model: "gemini-2.5-flash",
      enabled: true,
    },
    {
      id: "anthropic",
      name: "Anthropic",
      model: "claude-sonnet-4-20250514",
      enabled: true,
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      model: "openai/gpt-4.1-mini",
      enabled: true,
    },
  ],
};
export const categories = [
  "Pemerintahan",
  "Ekonomi",
  "Layanan Publik",
  "Wisata & Budaya",
  "Komunitas",
  "Pendidikan",
  "Peristiwa",
];
export const statusLabels = {
  draft: "Draft",
  review: "Perlu review",
  approved: "Siap tayang",
  archived: "Diarsipkan",
};
export function duration(text = "") {
  return Math.max(
    10,
    Math.round(text.split(/\s+/).filter(Boolean).length / 2.4),
  );
}
export function clockDuration(s) {
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
}
