import React, { useState } from "react";
import { socialDefaults } from "../shared/social.js";

export function SocialSourceFields({
  source,
  onChange,
  credential,
  setCredential,
  hasCredential,
  connected,
}) {
  const config = { ...socialDefaults, ...source.social };
  const set = (key, value) => onChange({ ...config, [key]: value });
  return (
    <>
      <label>
        Pengambilan caption
        <select
          aria-label="Pengambilan caption"
          value={config.mode}
          onChange={(e) => {
            set("mode", e.target.value);
            setCredential("");
          }}
        >
          <option value="manual">Tanpa API · input caption manual</option>
          <option value="official">API resmi {source.type}</option>
          <option value="connector">Konektor profil</option>
        </select>
      </label>
      {config.mode === "manual" ? (
        <p className="hint">
          Tidak perlu API atau token. Setelah sumber disimpan, klik Import
          caption untuk memasukkan tautan postingan, tanggal, dan caption.
        </p>
      ) : (
        <>
          {config.mode === "official" && source.type === "Instagram" && (
            <>
              <label>
                Instagram User ID
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]+"
                  maxLength={30}
                  value={config.instagramUserId}
                  onChange={(e) => set("instagramUserId", e.target.value)}
                />
              </label>
              <p className="hint">
                Gunakan ID dan token akun profesional dengan Facebook Login.
                Akun sendiri dibaca melalui media API; profil profesional lain
                melalui Business Discovery. Profil pribadi dapat memakai import
                manual.
              </p>
            </>
          )}
          {config.mode === "official" && source.type === "TikTok" && (
            <p className="hint">
              Gunakan access token TikTok Display API milik profil ini dengan
              izin video.list dan user.info.profile. Token dari akun lain tidak
              dapat membaca profil ini.
            </p>
          )}
          {config.mode === "connector" && (
            <>
              <label>
                URL konektor profil
                <input
                  required
                  type="url"
                  placeholder="https://konektor-anda.example"
                  value={config.connectorUrl}
                  onChange={(e) => set("connectorUrl", e.target.value)}
                />
              </label>
              <p className="hint">
                Konektor harus mendukung pengambilan postingan profil. Konektor
                TikTok LIVE untuk komentar/gift saja tidak cukup.
              </p>
            </>
          )}
          <label>
            {config.mode === "official"
              ? "Access token sumber"
              : "API key konektor"}
            <input
              type="password"
              autoComplete="new-password"
              disabled={!connected}
              maxLength={4096}
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              placeholder={
                hasCredential
                  ? "Token tersimpan · kosongkan untuk mempertahankan"
                  : "Isi token untuk pengambilan otomatis"
              }
            />
          </label>
          <p className="hint">
            {hasCredential ? "Token sudah tersimpan terenkripsi. " : ""}Token
            tidak ditampilkan kembali atau dimasukkan ke backup berita. Anda
            tetap dapat mengimpor caption manual jika koneksi belum tersedia.
          </p>
        </>
      )}
    </>
  );
}

export function CaptionImporter({ source, onSave }) {
  const [post, setPost] = useState({ url: "", caption: "", publishedAt: "" });
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setPost((old) => ({ ...old, [key]: value }));
  return (
    <form
      className="source-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          await onSave({
            ...post,
            publishedAt: new Date(post.publishedAt).toISOString(),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="hint">
        Sumber: {source.name} · {source.type}. Caption disimpan sebagai draft
        dengan atribusi sumber. Tinjau sebelum menyetujui siaran.
      </p>
      <label>
        Tautan postingan
        <input
          required
          type="url"
          value={post.url}
          onChange={(e) => set("url", e.target.value)}
          placeholder={
            source.type === "Instagram"
              ? "https://www.instagram.com/p/.../"
              : "https://www.tiktok.com/@akun/video/..."
          }
        />
      </label>
      <label>
        Tanggal postingan
        <input
          required
          type="datetime-local"
          value={post.publishedAt}
          onChange={(e) => set("publishedAt", e.target.value)}
        />
      </label>
      <label>
        Caption asli
        <textarea
          required
          rows={7}
          maxLength={12000}
          value={post.caption}
          onChange={(e) => set("caption", e.target.value)}
          placeholder="Tempel caption postingan di sini. Tidak memerlukan API."
        />
      </label>
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Mengimpor…" : "Import sebagai draft"}
      </button>
    </form>
  );
}
