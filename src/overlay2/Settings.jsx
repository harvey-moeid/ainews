import React, { useEffect, useState } from "react";
import { OVERLAY2_DEFAULTS } from "../../shared/ai-catalog.js";
import { api, send } from "../api.js";
import Face from "./Face.jsx";
import Transcript from "./Transcript.jsx";
import {
  CHARACTER_DEFAULTS,
  HAIR_STYLES,
  CHARACTER_ACCESSORIES,
} from "../../shared/character.js";

export default function Overlay2Settings({
  settings,
  saveSettings,
  mode,
  notify,
  go,
  queue,
}) {
  const [draft, setDraft] = useState({
      ...OVERLAY2_DEFAULTS,
      ...settings.overlay2,
    }),
    [key, setKey] = useState(""),
    [catalog, setCatalog] = useState(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(null);
  useEffect(() => {
    setDraft({ ...OVERLAY2_DEFAULTS, ...settings.overlay2 });
  }, [settings.overlay2]);
  useEffect(() => {
    if (mode === "connected")
      api("/ai/catalog")
        .then(setCatalog)
        .catch((e) => notify(e.message, "error"));
  }, [mode]);
  const set = (name, value) => setDraft((old) => ({ ...old, [name]: value }));
  async function check() {
    setBusy(true);
    try {
      setStatus(await send("/overlay2/check", {}));
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function index() {
    setBusy(true);
    try {
      let result;
      do {
        result = await send("/overlay2/index", {});
      } while (result.remaining && result.processed);
      notify(`Indeks berita siap: ${result.indexed}/${result.total} berita.`);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="o2-settings-grid">
      <section className="panel o2-preview">
        <div className="o2-stage">
          <header>
            <h2>{draft.name}</h2>
            <p>{draft.title}</p>
          </header>
          <div className="o2-banner">{draft.banner}</div>
          <div className="o2-face">
            <Face preview appearance={draft} />
          </div>
          <Transcript
            config={draft}
            preview
            topic={{
              kind: "rag",
              title: "@penonton",
              question: "Berita terbaru Pasuruan hari ini?",
            }}
            caption="Ini contoh jawaban host. Atur posisi kotak ini melalui pengaturan di samping."
          />
          <footer>
            <b>● STANDBY</b>
            <span>▂▃▂▁▂▄▅▃▁▂▃▂▁▂▄▃▂▁</span>
          </footer>
        </div>
        <button
          className="btn primary"
          onClick={() => window.open("/overlay2", "_blank", "noopener")}
        >
          Buka Overlay 2 ↗
        </button>
      </section>
      <div className="o2-settings-column">
        <section className="panel">
          <h2>Berita berjalan, percakapan tetap hidup.</h2>
          <p>
            Overlay 2 membaca antrean berita redaksi, menjawab komentar pada
            jeda kalimat, lalu melanjutkan berita.
          </p>
          <div className="o2-rules">
            <span>{queue.items.length} berita dalam antrean</span>
            <span>RAG: berita disetujui, tanpa data demo</span>
            <span>Gift + pertanyaan: AI umum jika konteks tidak ditemukan</span>
          </div>
          <div className="o2-inline">
            <button className="btn" onClick={() => go("/admin/broadcast")}>
              Atur antrean berita
            </button>
            <button className="btn" onClick={() => go("/admin/ai")}>
              Provider & model AI
            </button>
            <button
              className="btn"
              disabled={busy || mode !== "connected"}
              onClick={index}
            >
              Sinkronkan indeks RAG
            </button>
          </div>
        </section>
        <form
          className="panel o2-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await saveSettings({ ...settings, overlay2: draft }))
              notify("Pengaturan Overlay 2 tersimpan.");
          }}
        >
          <h2>Tampilan & suara</h2>
          <label>
            Judul Overlay 2
            <input
              value={draft.title}
              required
              maxLength={100}
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          <div className="o2-two">
            <label>
              Nama host
              <input
                value={draft.name}
                maxLength={40}
                onChange={(e) => set("name", e.target.value)}
              />
            </label>
            <label>
              Sumber suara
              <select
                value={draft.voiceMode}
                onChange={(e) => set("voiceMode", e.target.value)}
              >
                <option value="browser">
                  Suara browser (pengaturan presenter)
                </option>
                <option value="openai">Suara AI · OpenAI TTS</option>
              </select>
            </label>
          </div>
          <label>
            Banner
            <input
              value={draft.banner}
              maxLength={120}
              onChange={(e) => set("banner", e.target.value)}
            />
          </label>
          <label>
            Karakter suara AI
            <select
              value={draft.voice}
              onChange={(e) => set("voice", e.target.value)}
            >
              {["onyx", "nova", "alloy", "echo", "fable", "shimmer"].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Kepribadian host
            <textarea
              value={draft.prompt}
              maxLength={2000}
              rows={3}
              onChange={(e) => set("prompt", e.target.value)}
            />
          </label>
          <div className="o2-checkboxes">
            {[
              ["loopNews", "Ulangi antrean berita"],
              ["comments", "Jawab komentar TikTok"],
              ["readComment", "Bacakan pertanyaan sebelum menjawab"],
            ].map(([name, label]) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={draft[name]}
                  onChange={(e) => set(name, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
          <fieldset className="o2-transcript-settings">
            <legend>Karakter presenter</legend>
            <p className="o2-help">
              Pilih rambut, aksesori, dan warna karakter. Pratinjau langsung
              mengikuti perubahan. Klik Simpan Overlay 2 untuk menerapkannya ke
              pemutar.
            </p>
            <div className="o2-two">
              <label>
                Gaya rambut
                <select
                  aria-label="Gaya rambut"
                  value={draft.hairStyle}
                  onChange={(e) => set("hairStyle", e.target.value)}
                >
                  {HAIR_STYLES.map(({ id, label }) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Aksesori karakter
                <select
                  aria-label="Aksesori karakter"
                  value={draft.accessory}
                  onChange={(e) => set("accessory", e.target.value)}
                >
                  {CHARACTER_ACCESSORIES.map(({ id, label }) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="o2-character-colors">
              {[
                ["hairColor", "Warna rambut"],
                ["faceColor", "Warna wajah"],
                ["eyeColor", "Warna mata"],
              ].map(([name, label]) => (
                <label key={name}>
                  {label}
                  <input
                    type="color"
                    aria-label={label}
                    value={draft[name]}
                    onChange={(e) => set(name, e.target.value)}
                  />
                  <span className="o2-help">{draft[name]}</span>
                </label>
              ))}
            </div>
            <button
              className="btn"
              type="button"
              onClick={() =>
                setDraft((old) => ({ ...old, ...CHARACTER_DEFAULTS }))
              }
            >
              Reset karakter
            </button>
          </fieldset>
          <fieldset className="o2-transcript-settings">
            <legend>Posisi pertanyaan & jawaban</legend>
            <p className="o2-help">
              Pertanyaan dan jawaban berada dalam satu kotak. Geser pengaturan
              untuk melihat posisinya di pratinjau; berlaku juga saat layar
              penuh.
            </p>
            {[
              ["transcriptY", "Posisi vertikal", 0, "Atas", "Bawah"],
              ["transcriptX", "Posisi horizontal", 0, "Kiri", "Kanan"],
              ["transcriptWidth", "Lebar kotak", 30, "Sempit", "Lebar"],
            ].map(([name, label, min, start, end]) => (
              <div className="o2-position-control" key={name}>
                <label htmlFor={`o2-${name}`}>{label}</label>
                <div className="o2-position-inputs">
                  <input
                    id={`o2-${name}`}
                    type="range"
                    min={min}
                    max={100}
                    step={1}
                    value={draft[name]}
                    onChange={(e) => set(name, Number(e.target.value))}
                  />
                  <label className="o2-position-number">
                    <input
                      aria-label={`${label} (%)`}
                      type="number"
                      min={min}
                      max={100}
                      step={1}
                      required
                      value={draft[name]}
                      onChange={(e) => set(name, Number(e.target.value))}
                    />
                    %
                  </label>
                </div>
                <div className="o2-position-scale" aria-hidden="true">
                  <span>{start}</span>
                  <span>{end}</span>
                </div>
              </div>
            ))}
            <div className="o2-inline">
              {[
                ["Atas", 15],
                ["Tengah", 50],
                ["Bawah", 90],
              ].map(([label, y]) => (
                <button
                  className="btn"
                  type="button"
                  key={label}
                  onClick={() => set("transcriptY", y)}
                >
                  {label}
                </button>
              ))}
              <button
                className="btn"
                type="button"
                onClick={() =>
                  setDraft((old) => ({
                    ...old,
                    transcriptX: OVERLAY2_DEFAULTS.transcriptX,
                    transcriptY: OVERLAY2_DEFAULTS.transcriptY,
                    transcriptWidth: OVERLAY2_DEFAULTS.transcriptWidth,
                  }))
                }
              >
                Reset posisi
              </button>
            </div>
          </fieldset>
          <h2>TikTok LIVE Konektor</h2>
          <label>
            Alamat konektor
            <input
              type="url"
              value={draft.connectorUrl}
              onChange={(e) => set("connectorUrl", e.target.value)}
            />
          </label>
          <div className="o2-two">
            <label>
              Jeda per akun (detik)
              <input
                type="number"
                min={5}
                max={120}
                value={draft.cooldown}
                onChange={(e) => set("cooldown", Number(e.target.value))}
              />
            </label>
            <label>
              Batas antrean komentar
              <input
                type="number"
                min={1}
                max={30}
                value={draft.maxQueue}
                onChange={(e) => set("maxQueue", Number(e.target.value))}
              />
            </label>
          </div>
          <p className="o2-help">
            Pengaturan AI ada di Konfigurasi AI. Suara OpenAI memerlukan key
            OpenAI; gerak mulut mengikuti level audio, belum bentuk fonem. Suara
            browser mengikuti batas kata bila didukung dan memperkirakan bentuk
            vokal A/I/U/E/O; tanpa event kata, waktunya diperkirakan dari teks.
            Gift dikenali sejak sesi dimulai, berdasarkan username dalam room
            yang sama.
          </p>
          <button className="btn primary" type="submit">
            Simpan Overlay 2
          </button>
        </form>
        <section className="panel o2-form">
          <h2>Kredensial konektor</h2>
          <label>
            API key TikTok LIVE Konektor
            <input
              type="password"
              autoComplete="new-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                catalog?.credentials?.TLK_API_KEY === "encrypted"
                  ? "Key sudah tersimpan; kosongkan untuk mempertahankan"
                  : "API_KEY dari server konektor"
              }
            />
          </label>
          <div className="o2-inline">
            <button
              className="btn"
              disabled={!key || !catalog?.keyStorageReady || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await send(
                    "/ai/keys",
                    { name: "TLK_API_KEY", value: key },
                    "PUT",
                  );
                  setKey("");
                  setCatalog(await api("/ai/catalog"));
                  notify("Key konektor tersimpan terenkripsi.");
                } catch (e) {
                  notify(e.message, "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Simpan key konektor
            </button>
            <button
              className="btn"
              disabled={busy || mode !== "connected"}
              onClick={check}
            >
              Uji koneksi tersimpan
            </button>
          </div>
          {status && (
            <p role="status">
              {status.status} · {status.username || "Akun belum tersedia"}
            </p>
          )}
          {!catalog?.keyStorageReady && (
            <p className="o2-help">
              Penyimpanan key di UI membutuhkan AI_KEY_ENCRYPTION_SECRET di
              runtime. Alternatif: pasang TLK_API_KEY langsung sebagai secret
              runtime.
            </p>
          )}
          <p className="o2-help">
            Event chat dan gift diambil melalui REST server-side setiap beberapa
            detik saat pemutar aktif. API key tidak dikirim ke browser.
          </p>
        </section>
      </div>
    </div>
  );
}
