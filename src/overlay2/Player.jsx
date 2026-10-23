import React, { useEffect, useRef, useState } from "react";
import { api, send } from "../api.js";
import { OVERLAY2_DEFAULTS } from "../../shared/ai-catalog.js";
import { splitNarration } from "../../shared/narration.js";
import Face from "./Face.jsx";
import { speakAI, speakBrowser } from "./audio.js";

const wait = (signal, ms) =>
  new Promise((resolve) => {
    const end = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", end);
      resolve();
    };
    const timer = setTimeout(end, ms);
    signal.addEventListener("abort", end, { once: true });
  });
const safeLink = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
};

export default function Overlay2Player() {
  const [state, setState] = useState(null),
    [active, setActive] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [starting, setStarting] = useState(false);
  const [phase, setPhase] = useState("STANDBY"),
    [level, setLevel] = useState(0),
    [mouth, setMouth] = useState(null),
    [caption, setCaption] = useState(""),
    [topic, setTopic] = useState(null),
    [error, setError] = useState("");
  const stage = useRef(null);
  const latest = useRef(null),
    controller = useRef(crypto.randomUUID()),
    run = useRef(null),
    audioContext = useRef(null),
    position = useRef({ key: "", segment: 0, finished: new Set() });
  const config = { ...OVERLAY2_DEFAULTS, ...state?.config };
  const speaking = phase === "SPEAKING";
  async function enterFullscreen() {
    setFullscreen(true);
    try {
      await stage.current.requestFullscreen?.();
    } catch {
      // Keep the stage filling the browser if native fullscreen is unavailable.
    }
  }
  async function exitFullscreen() {
    try {
      if (document.fullscreenElement === stage.current)
        await document.exitFullscreen();
      setFullscreen(false);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    const changed = () =>
      setFullscreen(document.fullscreenElement === stage.current);
    const escape = (event) => {
      if (event.key === "Escape" && !document.fullscreenElement)
        setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", changed);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);
  async function refresh() {
    const next = await api("/overlay2/state", {
      signal: AbortSignal.timeout(10000),
    });
    latest.current = next;
    setState(next);
    return next;
  }
  async function stop(message = "") {
    const current = run.current;
    run.current = null;
    current?.abort();
    if (current) setStarting(true);
    setActive(false);
    setPhase("STANDBY");
    setLevel(0);
    setMouth(null);
    if (message) setError(message);
    if (current) {
      try {
        await send("/overlay2/session", {
          controller: controller.current,
          action: "stop",
        });
      } catch {
        /* A different player may own the lease now. */
      }
      try {
        await send("/lease", { id: controller.current, release: true });
      } catch {
        /* Lease may already be released by global stop. */
      }
      setStarting(false);
    }
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    const standbyRefresh = setInterval(() => {
      if (!run.current) void refresh().catch((e) => setError(e.message));
    }, 10000);
    const channel = new BroadcastChannel("pasuruan-studio");
    channel.onmessage = (event) => {
      if (event.data?.type === "STOP" || event.data === "STOP")
        void stop("Siaran dihentikan dari ruang kendali.");
    };
    const leave = () => {
      run.current?.abort();
      window.speechSynthesis?.cancel();
    };
    window.addEventListener("pagehide", leave);
    return () => {
      run.current?.abort();
      clearInterval(standbyRefresh);
      channel.close();
      window.removeEventListener("pagehide", leave);
      void audioContext.current?.close();
    };
  }, []);

  async function speak(text, source, signal) {
    setCaption(text);
    setPhase("SPEAKING");
    if (latest.current.config.voiceMode === "openai")
      await speakAI(
        { controller: controller.current, ...source },
        audioContext.current,
        signal,
        setLevel,
      );
    else
      await speakBrowser(text, latest.current.audio, signal, (level, pose) => {
        setLevel(level);
        setMouth(pose);
      });
    if (!signal.aborted) {
      setPhase("LISTENING");
      setLevel(0);
      setMouth(null);
    }
  }
  async function play(signal) {
    const handled = new Set();
    let replies = 0;
    while (!signal.aborted) {
      const current = latest.current,
        pos = position.current;
      const items = current.queue.items.filter((item) => item.script?.trim());
      if (
        items.length &&
        items.every((item) =>
          pos.finished.has(item.id + ":" + item.revision),
        ) &&
        current.config.loopNews
      )
        pos.finished.clear();
      const story =
        items.find(
          (item) =>
            item.id + ":" + item.revision === pos.key &&
            !pos.finished.has(pos.key),
        ) ||
        items.find((item) => !pos.finished.has(item.id + ":" + item.revision));
      const comment =
        current.config.comments &&
        [...current.comments]
          .reverse()
          .find(
            (c) =>
              !handled.has(c.id) &&
              (["pending", "ready"].includes(c.status) ||
                (c.status === "processing" &&
                  Date.now() - c.created_at > 125000)),
          );
      if (comment && (replies < 2 || !story)) {
        setPhase("THINKING");
        setCaption("");
        setTopic({
          kind: "comment",
          title: "@" + comment.username,
          question: comment.question,
        });
        let answer;
        try {
          answer = await api("/overlay2/answer", {
            method: "POST",
            body: JSON.stringify({
              controller: controller.current,
              id: comment.id,
              focusId: story?.id,
            }),
            signal,
          });
        } catch (e) {
          if (signal.aborted) return;
          handled.add(comment.id);
          setError(e.message);
          await wait(signal, 1000);
          continue;
        }
        if (signal.aborted) return;
        setTopic({
          kind: answer.mode,
          title: "@" + comment.username,
          question: comment.question,
          citations: answer.citations,
          gifted: answer.gifted,
        });
        const text =
          (current.config.readComment
            ? comment.display_name + " bertanya, " + comment.question + ". "
            : "") + answer.text;
        try {
          await speak(text, { commentId: comment.id }, signal);
        } catch (e) {
          if (!signal.aborted)
            await send("/overlay2/ack", {
              controller: controller.current,
              id: comment.id,
              failed: true,
            });
          throw e;
        }
        if (signal.aborted) return;
        await send("/overlay2/ack", {
          controller: controller.current,
          id: comment.id,
        });
        handled.add(comment.id);
        replies++;
        continue;
      }
      if (story) {
        const key = story.id + ":" + story.revision;
        if (pos.key !== key) {
          pos.key = key;
          pos.segment = 0;
        }
        const segments = splitNarration(story.script);
        setTopic({
          kind: "news",
          title: story.title,
          source: story.source_name,
          date: story.published_at,
          demo: story.demo,
        });
        await speak(
          segments[pos.segment],
          { storyId: story.id, revision: story.revision, segment: pos.segment },
          signal,
        );
        if (signal.aborted) return;
        pos.segment++;
        replies = 0;
        if (pos.segment >= segments.length) {
          pos.finished.add(key);
          pos.key = "";
          pos.segment = 0;
          await send("/history", {
            id: story.id,
            title: story.title,
            revision: story.revision,
            replay: current.config.loopNews,
            status: "completed",
            created_at: new Date().toISOString(),
          });
          await wait(signal, 1200);
        }
      } else {
        setPhase("LISTENING");
        await wait(signal, 500);
      }
    }
  }
  async function start() {
    if (run.current || starting) return;
    setStarting(true);
    setError("");
    // Unlock Web Audio within the click gesture before any network request.
    const Context = window.AudioContext || window.webkitAudioContext;
    if (Context) {
      audioContext.current ||= new Context();
      void audioContext.current.resume();
    } else if (config.voiceMode === "openai") {
      setError("Browser ini tidak mendukung Web Audio.");
      setStarting(false);
      return;
    }
    let acquired = false;
    try {
      await send("/lease", { id: controller.current });
      acquired = true;
      await send("/overlay2/session", {
        controller: controller.current,
        action: "start",
      });
      await refresh();
      const job = new AbortController();
      run.current = job;
      setActive(true);
      setPhase("LISTENING");
      position.current = { key: "", segment: 0, finished: new Set() };
      const monitor = async () => {
        let heartbeat = Date.now();
        while (!job.signal.aborted) {
          try {
            if (Date.now() - heartbeat > 20000) {
              await send("/lease", { id: controller.current });
              heartbeat = Date.now();
            }
            const next = await refresh();
            if (job.signal.aborted) return;
            if (
              !next.runtime.active ||
              next.queue.lease?.id !== controller.current ||
              next.queue.lease.expires <= Date.now()
            )
              throw Error(
                "Sesi pemutar berubah atau dihentikan dari ruang kendali.",
              );
            if (next.config.comments)
              await send("/overlay2/poll", { controller: controller.current });
          } catch (e) {
            if (!job.signal.aborted) await stop(e.message);
            return;
          }
          await wait(job.signal, 3500);
        }
      };
      void monitor();
      void play(job.signal).catch((e) => {
        if (!job.signal.aborted) void stop(e.message);
      });
    } catch (e) {
      setError(e.message);
      if (acquired) {
        try {
          await send("/lease", { id: controller.current, release: true });
        } catch {
          /* Already released. */
        }
      }
    } finally {
      setStarting(false);
    }
  }
  const pending =
    state?.comments.filter((c) =>
      ["pending", "ready", "processing"].includes(c.status),
    ).length || 0;
  const connected = /^(connected|live)$/i.test(state?.connector?.status || "");
  return (
    <main className="o2-player">
      <div
        className={`o2-stage${fullscreen ? " o2-expanded" : ""}`}
        ref={stage}
      >
        <header>
          <h1>{config.name}</h1>
          <p>{config.title}</p>
        </header>
        {fullscreen && (
          <div className="o2-stage-controls" aria-label="Kontrol layar penuh">
            <button
              disabled={starting || !state}
              onClick={() => (active ? stop() : start())}
            >
              {starting
                ? "Memproses…"
                : active
                  ? "Hentikan sesi"
                  : "Aktifkan suara & mulai"}
            </button>
            <button onClick={exitFullscreen}>Keluar layar penuh</button>
          </div>
        )}
        <div className="o2-banner">{config.banner}</div>
        <div className="o2-face">
          <Face speaking={speaking} level={level} mouth={mouth} />
        </div>
        <div className="o2-transcript" aria-live="polite">
          {topic && (
            <>
              <small>
                {
                  {
                    news: topic.demo ? "BERITA DEMO" : "BERITA",
                    rag: "JAWABAN DARI ARSIP BERITA",
                    general: "JAWABAN AI UMUM · GIFT",
                    no_context: "KONTEKS BELUM TERSEDIA",
                    comment: "KOMENTAR MASUK",
                  }[topic.kind]
                }
              </small>
              <h2>{topic.title}</h2>
              {topic.question && (
                <p className="o2-question">“{topic.question}”</p>
              )}
              <p>{caption}</p>
              {topic.source && (
                <span>
                  {topic.source} ·{" "}
                  {new Date(topic.date).toLocaleDateString("id-ID")}
                </span>
              )}
              {topic.citations?.map((c) => (
                <a
                  href={safeLink(c.url)}
                  key={c.id}
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.source} · {c.title}
                </a>
              ))}
            </>
          )}
        </div>
        <footer>
          <b className={speaking ? "speaking" : ""}>● {phase}</b>
          <div className="o2-wave" aria-hidden="true">
            {Array.from({ length: 40 }, (_, i) => (
              <i
                key={i}
                style={{
                  height:
                    3 + level * 34 * (0.3 + Math.abs(Math.sin(i * 1.8))) + "px",
                }}
              />
            ))}
          </div>
        </footer>
      </div>
      <aside className="o2-controls">
        <a href="/admin/overlay2">← Pengaturan Overlay 2</a>
        <div className="o2-connection">
          <i className={connected ? "online" : ""} />
          {connected
            ? "TikTok terhubung"
            : "TikTok " + (state?.connector?.status || "belum diperiksa")}{" "}
          {state?.connector?.username && "· @" + state.connector.username}
          <span>{pending} komentar menunggu</span>
        </div>
        <p>
          {active
            ? "Berita dijeda pada akhir kalimat untuk menjawab komentar."
            : "Aktifkan suara untuk memulai sesi berita dan komentar."}
        </p>
        {state?.connector?.error && (
          <p role="status" className="o2-error">
            {state.connector.error}
          </p>
        )}
        {error && (
          <p role="alert" className="o2-error">
            {error}
          </p>
        )}
        <button
          className="o2-start"
          disabled={starting || !state}
          onClick={() => (active ? stop() : start())}
        >
          {starting
            ? "Memproses…"
            : active
              ? "■ Hentikan sesi"
              : "▶ Aktifkan suara & mulai"}
        </button>
        <button className="o2-fullscreen" onClick={enterFullscreen}>
          Layar penuh untuk siaran
        </button>
        <small>
          Suara{" "}
          {config.voiceMode === "openai"
            ? "AI OpenAI · animasi mengikuti audio"
            : "browser · animasi kata & vokal (perkiraan)"}
        </small>
      </aside>
    </main>
  );
}
