import { splitNarration } from "../shared/narration.js";
import { ApiError } from "./core.js";
import { OVERLAY2_DEFAULTS } from "../shared/ai-catalog.js";
import { getCredential } from "./credentials.js";
import { readBounded, synthesize } from "./ai.js";
import { answerWithNews, syncIndex } from "./rag.js";

export function validateOverlay2(value = {}) {
  const x = { ...OVERLAY2_DEFAULTS, ...value };
  for (const [key, max] of [
    ["name", 40],
    ["banner", 120],
    ["prompt", 2000],
  ]) {
    if (typeof x[key] !== "string" || !x[key].trim() || x[key].length > max)
      throw new ApiError("Pengaturan Overlay 2 " + key + " tidak valid.");
  }
  let url;
  try {
    url = new URL(x.connectorUrl);
  } catch {
    throw new ApiError("URL konektor tidak valid.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !/^[a-z][a-z0-9.-]*\.[a-z]{2,}$/i.test(url.hostname) ||
    /localhost|\.local$|\.internal$/.test(url.hostname)
  )
    throw new ApiError("Alamat konektor harus origin HTTPS publik.");
  if (
    !["browser", "openai"].includes(x.voiceMode) ||
    !["onyx", "alloy", "echo", "fable", "nova", "shimmer"].includes(x.voice)
  )
    throw new ApiError("Pilihan suara tidak valid.");
  for (const [key, min, max] of [
    ["cooldown", 5, 120],
    ["maxQueue", 1, 30],
  ])
    if (!Number.isInteger(x[key]) || x[key] < min || x[key] > max)
      throw new ApiError("Batas antrean/cooldown tidak valid.");
  for (const key of ["comments", "readComment", "loopNews"])
    if (typeof x[key] !== "boolean")
      throw new ApiError("Pilihan Overlay 2 tidak valid.");
  return Object.fromEntries(
    Object.keys(OVERLAY2_DEFAULTS).map((key) => [
      key,
      key === "connectorUrl" ? url.origin : x[key],
    ]),
  );
}
export function normalizeEvent(event, start, now = Date.now()) {
  if (
    !event ||
    !["chat", "gift"].includes(event.event) ||
    typeof event.id !== "string" ||
    event.id.length > 300
  )
    return null;
  const time = Date.parse(event.timestamp),
    data = event.data || {};
  if (
    !Number.isFinite(time) ||
    time < start ||
    now - time > 120000 ||
    time - now > 30000
  )
    return null;
  // Never match gifts by display nickname: two accounts can share that name.
  const username = String(data.username || data.uniqueId || data.userId || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase()
    .slice(0, 100);
  const room = String(event.roomId || "").slice(0, 100);
  if (!username || !room) return null;
  const question = String(data.message || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    event.event === "chat" &&
    (!question ||
      question.length > 350 ||
      /https?:\/\/|www\./i.test(question) ||
      /(.)\1{9,}/u.test(question))
  )
    return null;
  if (
    event.event === "gift" &&
    (data.streakable === true || Number(data.giftType) === 1) &&
    data.repeatEnd !== true
  )
    return null;
  return {
    externalId: event.id,
    kind: event.event,
    username,
    room,
    question,
    displayName: String(data.nickname || username).slice(0, 80),
    createdAt: time,
  };
}
const getRuntime = (env) =>
  env.DB.prepare("SELECT * FROM overlay2_runtime WHERE id='main'").first();
async function requireLease(env, controller) {
  if (typeof controller !== "string" || controller.length > 80)
    throw new ApiError("Pemutar tidak valid.");
  const row = await env.DB.prepare(
    "SELECT value FROM playlists WHERE id='main'",
  ).first();
  const lease = row && JSON.parse(row.value).lease;
  if (!lease || lease.id !== controller || lease.expires <= Date.now())
    throw new ApiError(
      "Aktifkan pemutar Overlay 2; browser siaran lain mungkin sedang aktif.",
      409,
    );
}
async function connectorRequest(env, settings, route) {
  const key = await getCredential(env, "TLK_API_KEY");
  if (!key)
    throw new ApiError(
      "Isi API key TikTok LIVE Konektor di Pengaturan Overlay 2.",
      503,
    );
  const response = await fetch(settings.connectorUrl + route, {
    headers: { Authorization: "Bearer " + key },
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new ApiError("Konektor HTTP " + response.status, 502);
  }
  return JSON.parse(new TextDecoder().decode(await readBounded(response)));
}
export async function ingestEvents(env, runtime, events, settings) {
  const normalized = events
    .slice(-100)
    .map((input) => normalizeEvent(input, runtime.started_at))
    .filter(Boolean)
    .map((event) => ({
      ...event,
      id:
        runtime.session_id +
        ":" +
        event.room +
        ":" +
        event.kind +
        ":" +
        event.externalId,
    }));
  const seen = await env.DB.prepare(
    "SELECT id FROM overlay2_events WHERE id IN (SELECT value FROM json_each(?))",
  )
    .bind(JSON.stringify(normalized.map((e) => e.id)))
    .all();
  const ids = new Set(seen.results.map((e) => e.id));
  const fresh = normalized.filter((e) => {
    if (ids.has(e.id)) return false;
    ids.add(e.id);
    return true;
  });
  const statements = [];
  const gifts = fresh.filter((e) => e.kind === "gift");
  if (gifts.length)
    statements.push(
      env.DB.prepare(
        "INSERT INTO overlay2_gifts(session_id,room,username,created_at) SELECT ?,json_extract(value,'$.room'),json_extract(value,'$.username'),json_extract(value,'$.createdAt') FROM json_each(?) WHERE 1 ON CONFLICT(session_id,room,username) DO UPDATE SET created_at=MAX(created_at,excluded.created_at)",
      ).bind(runtime.session_id, JSON.stringify(gifts)),
    );
  // Keep the whole poll below D1's free-plan query limit, even in a busy room.
  for (const event of fresh
    .filter((e) => e.kind === "chat" && settings.comments)
    .slice(0, settings.maxQueue)) {
    statements.push(
      env.DB.prepare(
        "INSERT OR IGNORE INTO overlay2_comments(id,session_id,room,username,display_name,question,created_at) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM overlay2_comments WHERE session_id=? AND room=? AND username=? AND (created_at>? OR (question=? AND created_at>?))) AND (SELECT COUNT(*) FROM overlay2_comments WHERE session_id=? AND status IN ('pending','processing','ready'))<? AND EXISTS(SELECT 1 FROM overlay2_runtime WHERE id='main' AND active=1 AND session_id=?)",
      ).bind(
        event.id,
        runtime.session_id,
        event.room,
        event.username,
        event.displayName,
        event.question,
        event.createdAt,
        runtime.session_id,
        event.room,
        event.username,
        event.createdAt - settings.cooldown * 1000,
        event.question,
        event.createdAt - 60000,
        runtime.session_id,
        settings.maxQueue,
        runtime.session_id,
      ),
    );
  }
  if (fresh.length)
    statements.push(
      env.DB.prepare(
        "INSERT OR IGNORE INTO overlay2_events(id,session_id,room,username,kind,created_at) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.room'),json_extract(value,'$.username'),json_extract(value,'$.kind'),json_extract(value,'$.createdAt') FROM json_each(?)",
      ).bind(runtime.session_id, JSON.stringify(fresh)),
    );
  if (statements.length) await env.DB.batch(statements);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM overlay2_events WHERE created_at<?").bind(
      Date.now() - 21600000,
    ),
    env.DB.prepare(
      "DELETE FROM overlay2_comments WHERE created_at<? OR (session_id=? AND status='pending' AND created_at<?)",
    ).bind(Date.now() - 21600000, runtime.session_id, Date.now() - 120000),
    env.DB.prepare(
      "DELETE FROM overlay2_gifts WHERE created_at<? AND session_id<>?",
    ).bind(Date.now() - 21600000, runtime.session_id),
  ]);
  return fresh.length;
}

export async function handleOverlay2(
  request,
  env,
  { settings, body, playlist },
) {
  const url = new URL(request.url),
    route = url.pathname.slice("/api/overlay2".length);
  const config = validateOverlay2(settings.overlay2);
  const respond = (value, status = 200) =>
    Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  if (route === "/state" && request.method === "GET") {
    const runtime = await getRuntime(env);
    const comments = await env.DB.prepare(
      "SELECT id,username,display_name,question,status,created_at,error,answer FROM overlay2_comments WHERE session_id=? ORDER BY created_at DESC LIMIT 30",
    )
      .bind(runtime.session_id)
      .all();
    return respond({
      config,
      runtime: {
        active: !!runtime.active,
        sessionId: runtime.session_id,
        startedAt: runtime.started_at,
      },
      connector: JSON.parse(runtime.connector_status),
      comments: comments.results,
      queue: await playlist(env),
      audio: {
        voice: settings.voice,
        rate: settings.rate,
        pitch: settings.pitch,
      },
    });
  }
  if (route === "/index" && request.method === "POST")
    return respond(await syncIndex(env));
  if (route === "/check" && request.method === "POST") {
    const status = await connectorRequest(env, config, "/api/v1/status");
    return respond({
      status: String(status.status || "Unknown"),
      username: status.username,
      roomId: status.roomId,
      checkedAt: Date.now(),
    });
  }
  if (request.method !== "POST")
    throw new ApiError("Endpoint Overlay 2 tidak ditemukan.", 404);
  const input = await body(request);
  await requireLease(env, input.controller);
  let runtime = await getRuntime(env);
  if (route === "/session") {
    if (input.action === "start") {
      await env.DB.prepare(
        "UPDATE overlay2_runtime SET active=1,session_id=?,started_at=?,poll_until=0,connector_status='{}' WHERE id='main'",
      )
        .bind(crypto.randomUUID(), Date.now())
        .run();
    } else if (input.action === "stop")
      await env.DB.prepare(
        "UPDATE overlay2_runtime SET active=0 WHERE id='main'",
      ).run();
    else throw new ApiError("Aksi sesi tidak valid.");
    return respond({ ok: true });
  }
  if (!runtime.active)
    throw new ApiError("Sesi Overlay 2 sedang berhenti.", 409);
  if (route === "/poll") {
    const lock = await env.DB.prepare(
      "UPDATE overlay2_runtime SET poll_until=? WHERE id='main' AND active=1 AND poll_until<?",
    )
      .bind(Date.now() + 20000, Date.now())
      .run();
    if (!lock.meta.changes) return respond({ cached: true });
    try {
      const [status, events] = await Promise.all([
        connectorRequest(env, config, "/api/v1/status"),
        connectorRequest(
          env,
          config,
          "/api/v1/events?type=chat,gift&limit=100",
        ),
      ]);
      const current = await getRuntime(env);
      if (current.active && current.session_id === runtime.session_id)
        await ingestEvents(
          env,
          runtime,
          (events.events || []).sort(
            (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
          ),
          config,
        );
      const safe = {
        status: String(status.status || "Unknown"),
        username: status.username || "",
        roomId: status.roomId || "",
        checkedAt: Date.now(),
        error: null,
      };
      await env.DB.prepare(
        "UPDATE overlay2_runtime SET connector_status=?,poll_until=? WHERE id='main' AND session_id=?",
      )
        .bind(JSON.stringify(safe), Date.now() + 3000, runtime.session_id)
        .run();
      return respond(safe);
    } catch (error) {
      const safe = {
        status: "Error",
        error:
          error instanceof ApiError
            ? error.message
            : "Konektor tidak merespons.",
        checkedAt: Date.now(),
      };
      await env.DB.prepare(
        "UPDATE overlay2_runtime SET connector_status=?,poll_until=? WHERE id='main' AND session_id=?",
      )
        .bind(JSON.stringify(safe), Date.now() + 5000, runtime.session_id)
        .run();
      return respond(safe);
    }
  }
  if (route === "/answer") {
    const comment = await env.DB.prepare(
      "SELECT * FROM overlay2_comments WHERE id=? AND session_id=?",
    )
      .bind(String(input.id), runtime.session_id)
      .first();
    if (!comment || ["completed", "failed"].includes(comment.status))
      throw new ApiError("Komentar tidak tersedia.", 404);
    if (comment.status === "ready")
      return respond({ id: comment.id, ...JSON.parse(comment.answer) });
    const claim = crypto.randomUUID();
    const updated = await env.DB.prepare(
      "UPDATE overlay2_comments SET status='processing',claim=?,claim_until=? WHERE id=? AND (status='pending' OR (status='processing' AND claim_until<?))",
    )
      .bind(claim, Date.now() + 120000, comment.id, Date.now())
      .run();
    if (!updated.meta.changes)
      throw new ApiError("Komentar sedang diproses.", 409);
    try {
      const gift = await env.DB.prepare(
        "SELECT 1 gifted FROM overlay2_gifts WHERE session_id=? AND room=? AND username=?",
      )
        .bind(runtime.session_id, comment.room, comment.username)
        .first();
      const answer = await answerWithNews(
        env,
        { ...settings, overlay2: config },
        comment.question,
        {
          gifted: !!gift,
          focusId: String(input.focusId || ""),
          username: comment.display_name,
        },
      );
      const saved = await env.DB.prepare(
        "UPDATE overlay2_comments SET status='ready',answer=?,claim_until=0 WHERE id=? AND claim=? AND EXISTS(SELECT 1 FROM overlay2_runtime WHERE id='main' AND active=1 AND session_id=?)",
      )
        .bind(JSON.stringify(answer), comment.id, claim, runtime.session_id)
        .run();
      if (!saved.meta.changes)
        throw new ApiError("Sesi telah berubah; jawaban dibatalkan.", 409);
      return respond({ id: comment.id, ...answer });
    } catch (error) {
      await env.DB.prepare(
        "UPDATE overlay2_comments SET status='failed',error=? WHERE id=? AND claim=?",
      )
        .bind(
          error instanceof ApiError ? error.message : "AI tidak merespons.",
          comment.id,
          claim,
        )
        .run();
      throw error;
    }
  }
  if (route === "/ack") {
    await env.DB.prepare(
      "UPDATE overlay2_comments SET status=? WHERE id=? AND session_id=? AND status='ready'",
    )
      .bind(
        input.failed ? "failed" : "completed",
        String(input.id),
        runtime.session_id,
      )
      .run();
    return respond({ ok: true });
  }
  if (route === "/speech") {
    let text;
    if (input.commentId) {
      const row = await env.DB.prepare(
        "SELECT answer,question,display_name FROM overlay2_comments WHERE id=? AND session_id=? AND status='ready'",
      )
        .bind(String(input.commentId), runtime.session_id)
        .first();
      if (!row) throw new ApiError("Jawaban tidak tersedia.", 404);
      text =
        (config.readComment
          ? row.display_name + " bertanya, " + row.question + ". "
          : "") + JSON.parse(row.answer).text;
    } else {
      const queue = await playlist(env);
      const story = queue.items.find(
        (s) => s.id === input.storyId && s.revision === input.revision,
      );
      if (!story) throw new ApiError("Berita tidak ada dalam antrean.", 404);
      const segments = splitNarration(story.script);
      text = segments[input.segment];
      if (!text) throw new ApiError("Segmen berita tidak valid.");
    }
    return new Response(await synthesize(env, text, config.voice), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  }
  throw new ApiError("Endpoint Overlay 2 tidak ditemukan.", 404);
}
