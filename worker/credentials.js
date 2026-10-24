import { ApiError } from "./core.js";
import { AI_PROVIDERS } from "../shared/ai-catalog.js";

const allowed = new Set([
  ...AI_PROVIDERS.map((p) => p.secret).filter(Boolean),
  "TLK_API_KEY",
  "KONEKLIVE_WEBHOOK_SECRET",
]);
const allowedName = (name) =>
  allowed.has(name) || /^SOCIAL_SOURCE:[a-zA-Z0-9_-]{1,80}$/.test(name);
async function encryptionKey(env) {
  if (
    typeof env.AI_KEY_ENCRYPTION_SECRET !== "string" ||
    env.AI_KEY_ENCRYPTION_SECRET.length < 32
  )
    throw new ApiError(
      "Pasang AI_KEY_ENCRYPTION_SECRET minimal 32 karakter di runtime untuk menyimpan key melalui Pengaturan.",
      503,
    );
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(env.AI_KEY_ENCRYPTION_SECRET),
  );
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
function encode(bytes) {
  return btoa(String.fromCharCode(...bytes));
}
function decode(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
export async function encryptCredential(env, name, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(name) },
    await encryptionKey(env),
    new TextEncoder().encode(value),
  );
  return JSON.stringify({
    v: 1,
    iv: encode(iv),
    data: encode(new Uint8Array(encrypted)),
  });
}
export async function decryptCredential(env, name, ciphertext) {
  const value = JSON.parse(ciphertext);
  if (value.v !== 1) throw new Error("Unsupported encrypted credential");
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(value.iv),
      additionalData: new TextEncoder().encode(name),
    },
    await encryptionKey(env),
    decode(value.data),
  );
  return new TextDecoder().decode(decrypted);
}
export async function getCredential(env, name, context = name) {
  if (!allowedName(name)) throw new ApiError("Nama key tidak dikenal.");
  // Environment is authoritative; a blank settings field never erases a working key.
  if (env[name]) return String(env[name]);
  const row = await env.DB.prepare(
    "SELECT ciphertext FROM app_credentials WHERE id=?",
  )
    .bind(name)
    .first();
  if (!row) return "";
  try {
    return await decryptCredential(env, context, row.ciphertext);
  } catch {
    throw new ApiError(
      "Key tersimpan tidak dapat dibuka. Periksa master key enkripsi di runtime.",
      503,
    );
  }
}
export async function saveCredential(env, name, value) {
  if (
    !allowed.has(name) ||
    typeof value !== "string" ||
    value.trim().length < 16 ||
    value.length > 4096
  )
    throw new ApiError("API key tidak valid.");
  if (env[name])
    throw new ApiError(
      "Key ini berasal dari environment. Ubah melalui pengaturan runtime agar tidak bertabrakan.",
      409,
    );
  const ciphertext = await encryptCredential(env, name, value.trim());
  await env.DB.prepare(
    "INSERT INTO app_credentials(id,ciphertext,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET ciphertext=excluded.ciphertext,updated_at=excluded.updated_at",
  )
    .bind(name, ciphertext, new Date().toISOString())
    .run();
}
export async function credentialHealth(env) {
  const rows = await env.DB.prepare("SELECT id FROM app_credentials").all();
  return Object.fromEntries(
    [...allowed].map((name) => [
      name,
      env[name]
        ? "environment"
        : rows.results.some((r) => r.id === name)
          ? "encrypted"
          : "missing",
    ]),
  );
}
