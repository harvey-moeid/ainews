import React, { useEffect, useState } from "react";
import { AI_PROVIDERS, mergeProviders } from "../shared/ai-catalog.js";
import { api, send } from "./api.js";

export default function ProviderSettings({
  settings,
  saveSettings,
  mode,
  notify,
}) {
  const [providers, setProviders] = useState(() =>
    mergeProviders(settings.aiProviders),
  );
  const [catalog, setCatalog] = useState(null),
    [keys, setKeys] = useState({}),
    [models, setModels] = useState({}),
    [busy, setBusy] = useState(""),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    setProviders(mergeProviders(settings.aiProviders));
    setDirty(false);
  }, [settings.aiProviders]);
  async function refresh() {
    try {
      setCatalog(await api("/ai/catalog"));
    } catch (e) {
      notify(e.message, "error");
    }
  }
  useEffect(() => {
    if (mode === "connected") void refresh();
  }, [mode]);
  function update(id, key, value) {
    setDirty(true);
    setProviders((old) =>
      old.map((p) => (p.id === id ? { ...p, [key]: value } : p)),
    );
  }
  function move(index, direction) {
    const result = [...providers];
    [result[index], result[index + direction]] = [
      result[index + direction],
      result[index],
    ];
    setProviders(result);
    setDirty(true);
  }
  async function run(id, action) {
    setBusy(id);
    try {
      if (mode !== "connected")
        throw Error("Hubungkan server untuk mengelola API AI.");
      if (action === "key") {
        const provider = AI_PROVIDERS.find((p) => p.id === id);
        await send(
          "/ai/keys",
          { name: provider.secret, value: keys[id] },
          "PUT",
        );
        setKeys((old) => ({ ...old, [id]: "" }));
        await refresh();
        notify("Key " + provider.name + " tersimpan terenkripsi.");
      } else if (action === "models") {
        const result = await api("/ai/models?provider=" + id);
        setModels((old) => ({ ...old, [id]: result.models }));
        notify(
          result.models.length +
            " model dimuat dari provider." +
            (result.hasMore
              ? " Daftar masih memiliki halaman berikutnya."
              : ""),
        );
      } else {
        if (dirty)
          throw Error("Simpan pilihan provider/model sebelum menguji respons.");
        const result = await send("/ai/test", { provider: id });
        notify(result.provider + " / " + result.model + ": " + result.text);
      }
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="ai-settings-v2">
      <section className="panel ai-intro">
        <div>
          <h2>Satu pengaturan AI untuk redaksi dan Overlay 2.</h2>
          <p>
            Pilih model tiap provider, aktifkan yang digunakan, lalu atur urutan
            fallback. Pilihan ini dipakai untuk naskah berita dan jawaban
            komentar.
          </p>
        </div>
      </section>
      <div className="provider-list">
        {providers.map((provider, index) => {
          const definition = AI_PROVIDERS.find((p) => p.id === provider.id);
          const status = catalog?.credentials?.[definition.secret] || "missing";
          const choices =
            models[provider.id] ||
            definition.models.map((id) => ({ id, name: id }));
          const allChoices = choices.some((m) => m.id === provider.model)
            ? choices
            : [
                { id: provider.model, name: provider.model + " (tersimpan)" },
                ...choices,
              ];
          return (
            <section className="panel provider-card" key={provider.id}>
              <div className="provider-rank">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="provider-info">
                <h2>
                  {provider.name}
                  <span className="o2-badge">
                    {index === 0 ? "Utama" : "Fallback " + index}
                  </span>
                </h2>
                <p>
                  {status === "environment"
                    ? "Key dari runtime"
                    : status === "encrypted"
                      ? "Key tersimpan terenkripsi"
                      : "Key belum diisi"}
                </p>
                <label>
                  Model {provider.name}
                  <select
                    value={provider.model}
                    onChange={(e) =>
                      update(provider.id, "model", e.target.value)
                    }
                  >
                    {allChoices.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="o2-inline">
                  <button
                    className="btn"
                    disabled={!!busy}
                    onClick={() => run(provider.id, "models")}
                  >
                    Muat model dari provider
                  </button>
                  <button
                    className="btn"
                    disabled={!!busy}
                    onClick={() => run(provider.id, "test")}
                  >
                    Tes respons
                  </button>
                </div>
                <p className="o2-help">
                  {models[provider.id]
                    ? "Daftar dimuat dari API provider; akses model mengikuti akun Anda."
                    : "Daftar bawaan. Muat dari provider untuk pilihan terbaru."}
                </p>
                <label>
                  API key {provider.name}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={keys[provider.id] || ""}
                    disabled={status === "environment"}
                    onChange={(e) =>
                      setKeys((old) => ({
                        ...old,
                        [provider.id]: e.target.value,
                      }))
                    }
                    placeholder={
                      status === "environment"
                        ? "Dikelola melalui runtime"
                        : "Kosongkan untuk mempertahankan key tersimpan"
                    }
                  />
                </label>
                <button
                  className="btn"
                  disabled={
                    !!busy ||
                    !keys[provider.id] ||
                    !catalog?.keyStorageReady ||
                    status === "environment"
                  }
                  onClick={() => run(provider.id, "key")}
                >
                  Simpan key {provider.name}
                </button>
              </div>
              <div className="provider-actions">
                <button
                  className={"toggle " + (provider.enabled ? "on" : "")}
                  aria-label={"Aktifkan " + provider.name}
                  aria-pressed={provider.enabled}
                  onClick={() =>
                    update(provider.id, "enabled", !provider.enabled)
                  }
                >
                  <span />
                </button>
                <div>
                  <button
                    className="btn"
                    aria-label={"Naikkan " + provider.name}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="btn"
                    aria-label={"Turunkan " + provider.name}
                    disabled={index === providers.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      {!catalog?.keyStorageReady && (
        <div className="info-callout">
          <p>
            Untuk mengisi key dari halaman ini, pasang{" "}
            <code>AI_KEY_ENCRYPTION_SECRET</code> minimal 32 karakter sekali di
            runtime. Key provider yang sudah dipasang sebagai environment tetap
            dapat digunakan.
          </p>
        </div>
      )}
      <div className="ai-buttons">
        <button className="btn" disabled={!!busy} onClick={refresh}>
          Periksa konfigurasi
        </button>
        <button
          className="btn primary"
          disabled={!!busy}
          onClick={async () => {
            if (await saveSettings({ ...settings, aiProviders: providers }))
              setDirty(false);
          }}
        >
          Simpan konfigurasi
        </button>
      </div>
    </div>
  );
}
