# Pasuruan AI News TV

Ruang redaksi berbahasa Indonesia dan studio presenter virtual 3D, berdasarkan PRD v0.2. React + Vite + Three.js, Cloudflare Worker, D1 untuk metadata, R2 untuk naskah per revisi dan media. Produksi dilindungi Cloudflare Access.

## Menjalankan lokal

```sh
npm ci
npm run build
XDG_CONFIG_HOME=$PWD/.wrangler/config WRANGLER_LOG_PATH=.wrangler/logs WRANGLER_REGISTRY_PATH=.wrangler/registry WRANGLER_SEND_METRICS=false npx wrangler d1 migrations apply DB --local
XDG_CONFIG_HOME=$PWD/.wrangler/config WRANGLER_LOG_PATH=.wrangler/logs WRANGLER_REGISTRY_PATH=.wrangler/registry CLOUDFLARE_CF_FETCH_ENABLED=false WRANGLER_SEND_METRICS=false npx wrangler dev --local --port 8787
npm run dev
```

Buka http://localhost:5173. `DEV_AUTH=1` hanya ada dalam konfigurasi lokal. Artefak produksi tidak menyalin variabel ini. Konfigurasi produksi langsung memakai Cloudflare Access dan hanya mengizinkan email admin. Manifest Sites lama tetap disertakan untuk kompatibilitas packaging.

Jika API tidak tersedia, UI menyediakan demo sementara dengan label simulasi. Data demo browser tidak dianggap tersimpan di server. Pada server yang baru dan kosong, tombol **Muat contoh demo** mengisi contoh bertanda DEMO. Materi tersebut bukan laporan aktual.

## Alur operator

Pilihan **Cakupan** pada sumber dan berita mendukung **Indonesia** serta 514
kota/kabupaten di 38 provinsi, dikelompokkan menurut provinsi. Sumber dan berita
baru memakai Indonesia sebagai nilai awal; berita baru dari filter wilayah
mengikuti wilayah yang dipilih. Filter **Semua wilayah** menampilkan semua berita,
sedangkan **Indonesia** hanya menampilkan berita yang dicatat dengan cakupan
nasional. Nilai wilayah berita dan sumber lama tetap dipertahankan.

RSS dengan cakupan Indonesia menerima semua item dari feed (hingga batas per
refresh). RSS kota/kabupaten mencocokkan nama daerah pada judul atau isi feed;
ini pencocokan teks, bukan deteksi lokasi otomatis. Periksa atribusi dan lokasi
sebelum menyetujui berita. Daftar wilayah disertakan dalam aplikasi dan tidak
memerlukan API eksternal. Asal data dan lisensinya ada di
[`shared/regions.NOTICE`](shared/regions.NOTICE).

1. Tambah sumber RSS dengan URL HTTPS dan catatan izin; refresh manual atau buka dashboard. Feed dicache selama lima menit dan dikunci per sumber. Instagram/TikTok memerlukan akses resmi atau input manual.
2. Tambah berita, tulis bahan sumber dan atribusi, buat atau tulis naskah, pratinjau suara, tinjau, lalu setujui. Berita sensitif meminta persetujuan manusia secara eksplisit.
3. Tambahkan berita siap tayang ke antrean. Prioritas breaking > utama > reguler; item aktif tidak dipindahkan.
4. Pilih mode selesai: standby, ulang otomatis, N putaran total, atau ulang dengan jeda. Penayangan ulang diberi label dan tanggal asli.
5. Buka `/live`, aktifkan audio dengan klik operator, dan tangkap jendela browser beserta audionya di OBS/TikTok LIVE Studio. Pertahankan browser aktif. Hanya satu browser memegang lease narasi selama 90 detik; diperpanjang setiap 45 detik. Dashboard dapat mengirim putar, jeda, lanjut, dan STOP ke browser LIVE yang sudah mengaktifkan audio. Berhenti darurat membatalkan audio dan mengirim STOP ke tab lain.
6. Unggah presenter GLB maksimal 25 MB melalui Presenter & studio. Animasi GLB pertama diputar jika tersedia; morph `jawOpen` atau `viseme_aa` dipakai jika ada. Presenter bawaan berupa model prosedural dengan idle dan animasi mulut perkiraan, bukan sinkronisasi fonem.

## AI dan secrets

Provider: Gemini, Anthropic, OpenRouter, OpenAI, Groq, NVIDIA NIM, Cohere, Hugging Face, Mistral, dan Cloudflare Workers AI. Halaman `/admin/ai` menyediakan dropdown model tiap provider, pemuatan daftar terbaru melalui API provider, urutan fallback, toggle aktif, serta tes respons. Konfigurasi dipakai bersama oleh editor berita dan Overlay 2. Daftar model bawaan adalah titik awal; ketersediaan mengikuti akun provider. Jika seluruh provider gagal, aplikasi menampilkan kesalahan tanpa membuat naskah palsu.

| Provider baru                                                                            | Model bawaan                                                                                                                    | Secret runtime        |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| [NVIDIA NIM](https://docs.api.nvidia.com/nim/reference/llm-apis)                         | `meta/llama-3.3-70b-instruct`, `meta/llama-3.1-8b-instruct`, `meta/llama-3.1-70b-instruct`, `microsoft/phi-4-mini-instruct`     | `NVIDIA_API_KEY`      |
| [Cohere](https://docs.cohere.com/docs/models)                                            | `command-a-03-2025`, `command-a-plus-05-2026`, `command-r7b-12-2024`, `command-r-08-2024`, `command-r-plus-08-2024`             | `COHERE_API_KEY`      |
| [Hugging Face](https://huggingface.co/docs/inference-providers/en/tasks/chat-completion) | `Qwen/Qwen3-4B-Instruct-2507`, `meta-llama/Llama-3.3-70B-Instruct`, `Qwen/Qwen3-235B-A22B-Instruct-2507`, `openai/gpt-oss-120b` | `HUGGINGFACE_API_KEY` |
| [Mistral](https://docs.mistral.ai/models)                                                | `mistral-small-latest`, `mistral-medium-latest`, `mistral-large-latest`, `ministral-8b-2512`, `mistral-large-4`                 | `MISTRAL_API_KEY`     |

Provider baru awalnya nonaktif. Isi key, pilih model, aktifkan provider, atur urutannya, lalu klik **Simpan konfigurasi** sebelum **Tes respons**. **Muat model dari provider** memuat maksimal 1.000 model pada halaman pertama; jika masih ada halaman lain, UI memberitahukannya. Model yang sedang tersimpan tetap tersedia di dropdown meskipun tidak ada dalam daftar yang baru dimuat. Cohere memakai Chat V2 dan daftar model chat V1; Mistral difilter berdasarkan kemampuan chat, Hugging Face memakai router Inference Providers dan token berizin Inference Providers, sedangkan NVIDIA memakai API Catalog cloud. Daftar bawaan mengikuti dokumentasi resmi yang diperiksa 24 Oktober 2026. Akses model, persetujuan model gated, biaya, dan kuota mengikuti akun masing-masing. Integrasi ini untuk teks; OpenAI tetap digunakan untuk pilihan suara AI.

Key dapat diisi lewat halaman pengaturan setelah secret Worker `AI_KEY_ENCRYPTION_SECRET` dipasang (minimal 32 karakter acak). Nilai dienkripsi AES-GCM sebelum disimpan di tabel `app_credentials`; API hanya mengembalikan status keberadaannya. Simpan master key dengan aman: menggantinya tanpa migrasi membuat key tersimpan tidak bisa dibuka. Key tidak dimasukkan ke backup JSON berita. Alternatifnya, pasang secret runtime provider sesuai `.env.example` dan tabel di atas. Nilai runtime didahulukan dan tidak dapat ditimpa melalui UI. Untuk pengembangan lokal, gunakan `.dev.vars` yang diabaikan Git.

### Cloudflare Workers AI

Provider **Cloudflare Workers AI** menggunakan binding `AI`, tanpa API key terpisah
atau master key enkripsi. Binding sudah disertakan dalam `wrangler.production.json`
dan konfigurasi Worker hasil build; hosting harus memasangnya pada backend.
Indikator **Binding AI tersedia** menunjukkan binding terpasang, bukan bukti kuota
atau akses model berhasil. Jika binding hilang atau inferensi gagal, urutan
fallback tetap berlaku dan aplikasi tidak mengarang jawaban.

Di **Konfigurasi AI**, pilih model, aktifkan Workers AI, atur urutannya, lalu
**Simpan konfigurasi** sebelum **Tes respons**. Provider ini awalnya nonaktif.
Model bawaan: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
`@cf/meta/llama-3.1-8b-instruct-fast`, dan `@cf/meta/llama-4-scout-17b-16e-instruct`.
**Muat model dari provider** mengambil halaman pertama katalog (100 model), lalu
memfilter model text generation untuk format chat `messages`. Model deprecated,
moderasi, embedding, serta model khusus Responses API seperti GPT-OSS dikecualikan.
Pilihan model tersimpan tetap tersedia meskipun tidak masuk halaman katalog itu.

Naskah berita dan jawaban Overlay 2 memakai `env.AI.run()` dengan batas token,
timeout 18 detik, dan respons tanpa streaming. OpenAI tetap digunakan untuk suara AI.
Konfigurasi lokal standar tidak memasang binding AI. Untuk uji sungguhan, tambahkan
`"ai": { "binding": "AI", "remote": true }` pada salinan konfigurasi lokal dan
autentikasikan Wrangler. Inferensi remote tetap memakai kuota/biaya akun Cloudflare.
Test otomatis memakai mock; tidak membuktikan akses atau keluaran model sungguhan.
Lihat [Workers AI binding](https://developers.cloudflare.com/workers-ai/configuration/bindings/)
dan [katalog model](https://developers.cloudflare.com/ai/models/).

## Caption profil Instagram dan TikTok

Terapkan migrasi `0002_social_sources.sql` sebelum menjalankan versi ini.
Sumber sosial lama memakai mode manual sampai dikonfigurasi ulang.

**Tanpa API:** buka **Sumber berita → Tambah sumber**, pilih Instagram atau TikTok,
isi URL profil, cakupan, dan catatan izin. Pilih **Tanpa API · input caption manual**.
Setelah menyimpan, klik **Import caption**, isi tautan postingan, tanggal aslinya,
dan caption. Editor terbuka dengan caption sebagai naskah draft. **Preview suara**
membacakan naskah tersebut; **Ringkas caption dengan AI** membuat naskah ringkas
tanpa menimpa caption asli (minimal 100 karakter dan provider AI aktif).
**Gunakan caption asli** mengembalikan naskah ke caption. Tinjau, setujui, lalu
tambahkan ke antrean untuk dibacakan di LIVE atau Overlay 2. Import manual tidak
mengambil data dari URL profil atau postingan secara otomatis.

**API resmi:** pilih mode API pada sumber dan isi token di form. Penyimpanan token
memerlukan `AI_KEY_ENCRYPTION_SECRET`, sama seperti key AI. Token tersimpan per
sumber dengan AES-GCM, tidak dikembalikan ke browser, dan tidak masuk backup berita.
Kolom token kosong mempertahankan token untuk koneksi yang sama. Mengubah platform,
mode, atau origin konektor menghapus token lama kecuali token baru diisi.

- Instagram menggunakan Graph API dengan Facebook Login, ID akun profesional,
  dan token yang memiliki izin membaca media. Akun sendiri dibaca melalui
  `/{ig-user-id}/media`; profil Business/Creator lain melalui Business Discovery
  sesuai akses aplikasi Meta. Profil pribadi tidak didukung jalur API ini.
  Versi default `v25.0` dapat diubah dengan `INSTAGRAM_GRAPH_VERSION` di runtime.
  Lihat [Instagram Platform](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/)
  dan [Business Discovery](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery).
- TikTok menggunakan token Display API **milik profil sumber** dengan scope
  `user.info.profile` dan `video.list`. Username diverifikasi sebelum video diambil.
  Token akun lain tidak dapat membaca profil publik sembarang. Lihat
  [Get User Info](https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info)
  dan [List Videos](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list).

Penerbitan token dan OAuth dilakukan di aplikasi provider Anda; aplikasi ini belum
menyediakan login OAuth atau refresh token otomatis. Perbarui access token di sumber
jika kedaluwarsa. URL profil saja tidak memberikan izin API. Tidak ada scraping
atau mekanisme melewati login/challenge platform.

**Konektor profil:** untuk layanan lain yang Anda operasikan, isi origin HTTPS
publik dan API key. Kontrak konektor adalah `POST /api/v1/social/posts`, header
`Authorization: Bearer <key>`, dengan JSON:

```json
{
  "platform": "instagram",
  "profileUrl": "https://www.instagram.com/redaksi/",
  "username": "redaksi",
  "limit": 10
}
```

Kembalikan profil yang sama beserta postingan terbaru dalam format berikut:

```json
{
  "profile": { "username": "redaksi" },
  "posts": [
    {
      "id": "posting-123",
      "caption": "Caption asli postingan.",
      "url": "https://www.instagram.com/p/Abc123/",
      "publishedAt": "2026-10-20T08:00:00Z"
    }
  ]
}
```

Untuk TikTok, gunakan `platform: "tiktok"`, URL profil `https://www.tiktok.com/@redaksi/`,
dan tautan postingan `https://www.tiktok.com/@redaksi/video/1234567890`. Konektor
TikTok LIVE untuk komentar/gift tidak otomatis mendukung kontrak postingan ini.
Implementasi dan akses data konektor tetap perlu disediakan oleh operator.

Klik **Ambil caption terbaru** untuk API/konektor. Maksimal 10 postingan terbaru per
refresh, dengan cache 5 menit; tidak ada polling terjadwal ketika dashboard ditutup.
Caption kosong, tanggal tidak valid, tautan di luar platform/profil, materi di luar
cakupan daerah, dan duplikat dilewati. Kegagalan akses muncul pada status sumber.
Caption maksimal 12.000 karakter, disimpan tanpa pemotongan diam-diam.
Semua hasil otomatis adalah draft dengan naskah caption asli, tanpa panggilan AI
otomatis dan tanpa mengunduh video/foto. Pembacaan caption tidak membuktikan
kebenaran klaim dalam postingan.

## Overlay 2 — berita dan komentar TikTok

Modul tersendiri di repo ini: `/admin/overlay2` untuk pengaturan, `/overlay2` untuk pemutar wajah wireframe biru dengan mata oranye. Tidak bergantung pada modul tarot.

1. Terapkan migrasi `0001_overlay2.sql`, lalu konfigurasikan provider dan model di **Konfigurasi AI**. Isi key konektor pada **Overlay 2**, atau pasang secret `TLK_API_KEY` yang nilainya sama dengan `API_KEY` server konektor. URL default mengikuti `https://tiktok-live-konektor.onrender.com` dan dapat diubah ke origin HTTPS lain.
2. Mulai LIVE melalui dashboard konektor yang sudah ada. Klik **Uji koneksi tersimpan** untuk memeriksa status. Ainews menggunakan endpoint read-only `/api/v1/status` dan `/api/v1/events?type=chat,gift&limit=100`, dengan Bearer key server-side. Tidak mengubah pengaturan atau memulai LIVE konektor secara otomatis.
3. Siapkan berita disetujui dalam antrean redaksi. Klik **Sinkronkan indeks RAG** untuk berita lama; berita baru otomatis diindeks dan pencarian juga mengisi indeks yang belum lengkap secara bertahap. RAG memakai pencarian kata FTS5/BM25 di D1, dengan potongan materi R2, sumber, tanggal, dan revisi. Ini bukan pencarian embedding/semantik. Draft dan data demo tidak menjadi sumber jawaban. Antrean tetap memakai snapshot berita, sementara RAG hanya mengambil revisi yang saat ini disetujui.
4. Buka `/overlay2`, klik **Aktifkan suara & mulai**, lalu gunakan **Layar penuh untuk siaran** atau crop area 9:16 dalam OBS/TikTok LIVE Studio. Pemutar membaca berita per kalimat, menyisipkan maksimal dua jawaban sebelum melanjutkan kalimat berita berikutnya. Opsi pengulangan Overlay 2 terpisah dari mode putaran pemutar `/live`. Tombol putar/jeda dashboard untuk `/live` tidak mengendalikan Overlay 2; STOP darurat tetap menghentikan keduanya.
5. Komentar biasa dijawab dengan konteks berita. Jika konteks tidak ditemukan, host menyampaikan bahwa informasi belum tersedia tanpa memanggil AI umum. Akun yang mengirim gift dalam sesi yang sama boleh mendapatkan jawaban AI umum ketika konteks berita tidak ditemukan. Hak tersebut terikat username + room + sesi, bukan nickname; gift streak dihitung setelah `repeatEnd`. Sesi baru menghapus hak sesi sebelumnya. Jawaban RAG dan jawaban AI umum diberi label berbeda di layar.
6. Pilih suara browser atau **OpenAI TTS**. Suara browser memakai pilihan suara/rate/pitch presenter. Gerak mulut mengikuti event batas kata `speechSynthesis.onboundary` bila tersedia; bentuk A/I/U/E/O diperkirakan dari huruf kata, dengan mulut menutup di antara kata, tanda baca, pause, akhir suara, error, dan STOP. Browser/suara yang tidak mengirim event kata memakai perkiraan durasi teks sesuai rate. Durasi setiap huruf tetap perkiraan, bukan timing fonem aktual. OpenAI TTS memakai `tts-1`, memerlukan key OpenAI, dan menggerakkan mulut berdasarkan amplitudo audio. Tidak ada klaim sinkronisasi fonem.

Judul di bawah nama host dapat diubah melalui **Overlay 2 → Tampilan & suara → Judul Overlay 2**, lalu **Simpan Overlay 2**. Pratinjau admin langsung mengikuti isian. Pemutar memperbarui pengaturan saat aktif dan setiap 10 detik saat standby. Pengaturan lama memakai judul bawaan sampai diubah.

Letak kotak teks dapat diatur melalui **Overlay 2 → Posisi pertanyaan & jawaban**. Atur posisi vertikal (atas–bawah), horizontal (kiri–kanan), dan lebar kotak menggunakan slider atau angka persen. Tombol **Atas**, **Tengah**, **Bawah**, dan **Reset posisi** membantu penempatan cepat. Pertanyaan dan jawaban bergerak bersama dalam satu kotak; teks berita menggunakan letak yang sama. Pratinjau menampilkan contoh yang langsung mengikuti perubahan. Klik **Simpan Overlay 2** agar posisi tersimpan dan dipakai pemutar, termasuk pada ponsel dan layar penuh. Pengaturan lama memakai posisi bawaan.

Penampilan host dapat diubah melalui **Overlay 2 → Karakter presenter**: pilih tanpa rambut, pendek, bob, atau mohawk; tambahkan kacamata atau headset dengan mikrofon; lalu atur warna rambut, wajah wireframe, dan mata. Pratinjau mengikuti perubahan tanpa memuat ulang wajah. Klik **Simpan Overlay 2** untuk menyimpan, atau **Reset karakter** untuk mengembalikan isian ke tampilan awal sebelum disimpan. Rambut dan aksesori berupa model 3D bawaan yang mengikuti gerak kepala; animasi bicara tetap berjalan. Pengaturan lama tetap memakai wajah tanpa rambut dan aksesori. Editor ini belum menyediakan unggah model rambut/aksesori sendiri.

Tombol **Layar penuh untuk siaran** tersedia sejak standby. Tampilan memenuhi layar desktop maupun ponsel; jika Fullscreen API tidak tersedia, area siaran memenuhi jendela browser. Arahkan pointer ke sudut kanan atas untuk kontrol mulai/hentikan sesi dan **Keluar layar penuh**, atau tekan Escape untuk keluar. Pada layar sentuh, kontrol tersedia di bawah.

Pemutar berbagi lease audio 90 detik dengan `/live`, memperpanjangnya sekitar 20 detik, dan berhenti jika lease/sesi berubah atau pembacaan state gagal. REST polling hanya berjalan saat pemutar aktif, sekitar setiap 3,5 detik ditambah latensi konektor. Feed diambil maksimal 100 event terbaru; event yang lebih tua dari dua menit, spam, komentar berulang, atau melebihi antrean dibuang. Pada LIVE sangat ramai atau browser yang ditangguhkan, beberapa event bisa terlewat. Tidak ada jaminan pengiriman setiap komentar; tangkap jendela browser aktif agar audio tidak ditangguhkan. Riwayat komentar/event dibersihkan setelah enam jam, hak gift sesi aktif dipertahankan sampai sesi diganti.

## Konsistensi dan batas

- Naskah ditulis ke objek R2 baru sebelum metadata D1 menunjuk revisi tersebut. Pembaruan D1 memakai kondisi revisi. Objek tak terhubung dapat tersisa bila D1 gagal; revisi lama tetap aman.
- Antrean mengikat key R2 revisi tertentu, dengan optimistic concurrency. Mengedit berita tidak mengubah snapshot yang sedang tayang.
- Bootstrap mengambil paling banyak 100 metadata berita terbaru; feed paling banyak 12 item per refresh, 15 sumber aktif. Pagination penuh dan pengelompokan peristiwa semantik belum tersedia.
- Media/GLB hingga 25 MB. Berkas disimpan lewat Worker, dengan referensi media dalam JSON berita. Pemeriksaan keamanan GLB masih sebatas format/magic dan batas ukuran; gunakan aset tepercaya.
- API quota/penyimpanan gagal menolak penulisan tanpa silent retry. Tab yang sudah memegang snapshot dapat tetap menampilkannya. Metrik kuota akun D1/R2 tidak diklaim tanpa koneksi API metrik.
- Backup JSON mengikutsertakan konten berita, sumber, antrean, dan pengaturan, serta disimpan di R2. Media direferensikan, bukan disalin ke JSON. Pemulihan otomatis dan verifikasi disaster recovery belum diimplementasikan.
- Arsip publik `/news` ditunda, sesuai keputusan PRD yang masih terbuka.
- Pengambilan suara dan aktivasi audio bergantung pada browser/perangkat. Uji audio pada OBS/TikTok secara nyata; pengujian headless tidak membuktikan suara terdengar.

## Validasi

```sh
node tests/core.test.mjs
npm run build
node tests/browser.mjs
node tests/coverage-browser.mjs
node tests/social-browser.mjs
node tests/workers-ai-browser.mjs
node tests/overlay2-browser.mjs
node tests/overlay2-character-browser.mjs
node tests/ai-providers-browser.mjs
node tests/speech-mouth-browser.mjs
node tests/api.mjs
node tests/failure.test.mjs
node tests/overlay2.test.mjs
node tests/speech-mouth.test.mjs
node tests/remote.mjs
```

Tes browser memerlukan Chromium pada `/usr/bin/chromium`, serta API lokal dan Vite aktif. Tes membuat materi uji dalam database lokal. Jangan arahkan tes ke produksi. Migrasi produksi dikemas di `dist/.openai/drizzle/`. Build menghasilkan Worker mandiri dengan aset frontend dan font lokal tertanam, tanpa dependensi CDN runtime.

Tes `coverage-browser.mjs`, `social-browser.mjs`, dan `workers-ai-browser.mjs` memakai frontend hasil build langsung dari Worker
lokal pada port 8787; Vite tidak diperlukan untuk tes ini.

## Deployment Cloudflare Workers langsung

Produksi: https://ainews.harveymoeid.workers.dev (seluruh halaman, LIVE, dan API dilindungi Cloudflare Access). Login menggunakan `harveymoeid@gmail.com` melalui identity provider Access akun ini.

Worker `ainews` memakai D1 `ainews-db` dan R2 `ainews-content`. Migrasi awal telah diterapkan dan dicatat dalam `d1_migrations`. Konfigurasi produksi ada di `wrangler.production.json`, terpisah dari konfigurasi lokal yang memakai `DEV_AUTH=1`.

```sh
npm ci
npm test
npm run build
npx wrangler d1 migrations apply DB --remote --config wrangler.production.json
npx wrangler deploy --config wrangler.production.json
```

Deployment awal dilakukan melalui plugin Cloudflare, tanpa GitHub deploy secrets. CI tetap hanya melakukan test dan build; push ke GitHub tidak otomatis memperbarui Worker.

Mode produksi `AUTH_MODE=cloudflare-access` memverifikasi tanda tangan JWT Access, issuer, audience, expiry, dan email admin sebelum melayani halaman maupun API. Header identitas Sites dari pemanggil diganti dengan identitas JWT yang sudah diverifikasi. Preview URLs dimatikan. Jangan menyalin konfigurasi lokal atau mengaktifkan `DEV_AUTH` untuk produksi.

AI memerlukan key sesuai provider yang dipilih, melalui secret runtime atau penyimpanan terenkripsi di UI sebagaimana dijelaskan di atas. Tambahkan master key sekali melalui Cloudflare Dashboard pada Worker `ainews`. Integrasi TikTok memerlukan key konektor dan LIVE aktif. Build, migrasi lokal, tes SQL/FTS, dan browser tidak membuktikan koneksi LIVE atau suara provider sungguhan; uji dengan kredensial produksi setelah deploy. Data Sites lama tidak otomatis dipindahkan ke D1/R2 produksi ini.
