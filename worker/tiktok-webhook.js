import { ApiError } from "./core.js";
import { getCredential } from "./credentials.js";
import { ingestEvents, normalizeEvent, validateOverlay2 } from "./overlay2.js";

export const TIKTOK_WEBHOOK_PATH = "/api/hooks/tiktok";
const MAX_BODY = 32768;

async function rawBody(request) {
  if (Number(request.headers.get("Content-Length")) > MAX_BODY)
    throw new ApiError("Payload webhook terlalu besar.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("Payload webhook kosong.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY)
        throw new ApiError("Payload webhook terlalu besar.", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function verifyKonekliveSignature(
  secret,
  timestamp,
  signature,
  bytes,
  now = Date.now(),
) {
  if (
    !/^\d{1,12}$/.test(timestamp || "") ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !/^sha256=[a-f0-9]{64}$/.test(signature || "")
  )
    return false;
  const prefix = new TextEncoder().encode(timestamp + ".");
  const signed = new Uint8Array(prefix.length + bytes.length);
  signed.set(prefix);
  signed.set(bytes, prefix.length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(signature.slice(7).match(/../g), (hex) =>
      parseInt(hex, 16),
    ),
    signed,
  );
}

// Adapt koneklive Standard JSON to Overlay 2's existing chat/gift pipeline.
export function overlayEvent(event, account = "") {
  const source = event?.source,
    user = event?.user,
    data = event?.data;
  if (
    event?.is_test !== false ||
    source?.platform !== "tiktok" ||
    !["comment", "gift"].includes(event.type) ||
    !data ||
    typeof source.account !== "string" ||
    !source.account ||
    source.account.length > 100 ||
    typeof source.room_id !== "string" ||
    !source.room_id ||
    source.room_id.length > 100
  )
    return null;
  const username = source.account.replace(/^@/, "").toLowerCase();
  if (account && username !== account) return null;
  if (
    event.type === "gift" &&
    data.is_final !== true &&
    !(data.delta_count > 0)
  )
    return null;
  return {
    id: event.id,
    event: event.type === "comment" ? "chat" : "gift",
    timestamp: event.timestamp,
    // Namespace room IDs by broadcaster; gift eligibility cannot cross accounts.
    roomId: username + ":" + source.room_id,
    data: {
      username: user?.username || (user?.id ? "id:" + user.id : ""),
      nickname: user?.nickname,
      message: event.type === "comment" ? data.comment : "",
    },
  };
}

export async function handleTikTokWebhook(request, env, loadSettings) {
  const respond = (value, status = 200) =>
    Response.json(value, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  if (request.method !== "POST")
    return new Response(null, {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "no-store" },
    });
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new ApiError("Webhook membutuhkan application/json.", 415);
  if (!env.DB) throw new ApiError("Database webhook belum terhubung.", 503);
  const secret = await getCredential(env, "KONEKLIVE_WEBHOOK_SECRET");
  if (!secret) throw new ApiError("Secret webhook koneklive belum diisi.", 503);
  const bytes = await rawBody(request);
  if (
    !(await verifyKonekliveSignature(
      secret,
      request.headers.get("X-Webhook-Timestamp"),
      request.headers.get("X-Webhook-Signature"),
      bytes,
    ))
  )
    throw new ApiError(
      "Tanda tangan webhook tidak valid atau kedaluwarsa.",
      401,
    );
  let event;
  try {
    event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError("JSON webhook tidak valid.");
  }
  if (
    !event ||
    typeof event.id !== "string" ||
    !event.id ||
    event.id.length > 300 ||
    request.headers.get("X-Event-ID") !== event.id ||
    typeof event.is_test !== "boolean"
  )
    throw new ApiError("Identitas event webhook tidak valid.");
  const config = validateOverlay2((await loadSettings()).overlay2);
  if (config.connectorMode !== "webhook")
    throw new ApiError("Aktifkan mode Webhook koneklive di Overlay 2.", 409);
  // The integration's Test button verifies delivery without creating chat or gift rights.
  if (event.is_test) return respond({ ok: true, is_test: true, accepted: 0 });
  const runtime = await env.DB.prepare(
    "SELECT * FROM overlay2_runtime WHERE id='main'",
  ).first();
  if (!runtime?.active)
    return respond({ ok: true, accepted: 0, ignored: "session_inactive" });
  const input = overlayEvent(event, config.connectorAccount);
  if (!normalizeEvent(input, runtime.started_at))
    return respond({ ok: true, accepted: 0, ignored: "filtered_event" });
  // Await durable ingestion before 2xx so transient D1 failures can be retried.
  const accepted = await ingestEvents(env, runtime, [input], config);
  await env.DB.prepare(
    "UPDATE overlay2_runtime SET connector_status=? WHERE id='main' AND active=1 AND session_id=?",
  )
    .bind(
      JSON.stringify({
        status: "Webhook diterima",
        username: event.source.account.replace(/^@/, ""),
        roomId: event.source.room_id,
        checkedAt: Date.now(),
        error: null,
      }),
      runtime.session_id,
    )
    .run();
  return respond({ ok: true, accepted });
}
