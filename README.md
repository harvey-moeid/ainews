# Pasuruan AI News TV

Ruang redaksi berbahasa Indonesia dan studio presenter virtual 3D, berdasarkan PRD v0.2. React + Vite + Three.js, Cloudflare Worker, D1 untuk metadata, R2 untuk naskah per revisi dan media. Deployment Sites bersifat privat.

## Menjalankan lokal

```sh
npm ci
npm run build
XDG_CONFIG_HOME=$PWD/.wrangler/config WRANGLER_LOG_PATH=.wrangler/logs WRANGLER_REGISTRY_PATH=.wrangler/registry WRANGLER_SEND_METRICS=false npx wrangler d1 migrations apply DB --local
XDG_CONFIG_HOME=$PWD/.wrangler/config WRANGLER_LOG_PATH=.wrangler/logs WRANGLER_REGISTRY_PATH=.wrangler/registry CLOUDFLARE_CF_FETCH_ENABLED=false WRANGLER_SEND_METRICS=false npx wrangler dev --local --port 8787
npm run dev
```

Buka http://localhost:5173. `DEV_AUTH=1` hanya ada dalam konfigurasi lokal. Artefak produksi tidak menyalin variabel ini. Autentikasi produksi memakai identitas yang diberikan Sites dan kebijakan owner-private. Jangan membuka audience menjadi publik tanpa menambahkan otorisasi administrator tersendiri.

Jika API tidak tersedia, UI menyediakan demo sementara dengan label simulasi. Data demo browser tidak dianggap tersimpan di server. Pada server yang baru dan kosong, tombol **Muat contoh demo** mengisi contoh bertanda DEMO. Materi tersebut bukan laporan aktual.

## Alur operator

1. Tambah sumber RSS dengan URL HTTPS dan catatan izin; refresh manual atau buka dashboard. Feed dicache selama lima menit dan dikunci per sumber. Instagram/TikTok memerlukan akses resmi atau input manual.
2. Tambah berita, tulis bahan sumber dan atribusi, buat atau tulis naskah, pratinjau suara, tinjau, lalu setujui. Berita sensitif meminta persetujuan manusia secara eksplisit.
3. Tambahkan berita siap tayang ke antrean. Prioritas breaking > utama > reguler; item aktif tidak dipindahkan.
4. Pilih mode selesai: standby, ulang otomatis, N putaran total, atau ulang dengan jeda. Penayangan ulang diberi label dan tanggal asli.
5. Buka `/live`, aktifkan audio dengan klik operator, dan tangkap jendela browser beserta audionya di OBS/TikTok LIVE Studio. Pertahankan browser aktif. Hanya satu browser memegang lease narasi selama 90 detik; diperpanjang setiap 45 detik. Dashboard dapat mengirim putar, jeda, lanjut, dan STOP ke browser LIVE yang sudah mengaktifkan audio. Berhenti darurat membatalkan audio dan mengirim STOP ke tab lain.
6. Unggah presenter GLB maksimal 25 MB melalui Presenter & studio. Animasi GLB pertama diputar jika tersedia; morph `jawOpen` atau `viseme_aa` dipakai jika ada. Presenter bawaan berupa model prosedural dengan idle dan animasi mulut perkiraan, bukan sinkronisasi fonem.

## AI dan secrets

Provider: Gemini, Anthropic, OpenRouter; model dan urutan fallback dapat disunting. Konfigurasikan secret server `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` melalui pengaturan runtime Sites. **Jangan** menaruh key di source, D1, R2, atau browser. Pemeriksaan konfigurasi hanya memeriksa keberadaan key; pengujian respons nyata dilakukan lewat editor. Saat seluruh provider gagal, naskah tidak direkayasa.

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
node tests/api.mjs
node tests/failure.test.mjs
node tests/remote.mjs
```

Tes browser memerlukan Chromium pada `/usr/bin/chromium`, serta API lokal dan Vite aktif. Tes membuat materi uji dalam database lokal. Jangan arahkan tes ke produksi. Migrasi produksi dikemas di `dist/.openai/drizzle/`. Build menghasilkan Worker mandiri dengan aset frontend dan font lokal tertanam, tanpa dependensi CDN runtime.
