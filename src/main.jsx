import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Newspaper,
  Radio,
  Globe2,
  UserRound,
  AudioLines,
  Settings2,
  FlaskConical,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  RefreshCw,
  ArrowUpRight,
  ArrowRight,
  Play,
  Pause,
  Square,
  SkipForward,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  ExternalLink,
  MoreHorizontal,
  Check,
  CheckCheck,
  Clock3,
  TriangleAlert,
  CheckCircle2,
  X,
  Menu,
  FileText,
  GripVertical,
  Trash2,
  Upload,
  Link2,
  Image as ImageIcon,
  Sparkles,
  Save,
  ShieldCheck,
  Download,
  Activity,
  Monitor,
  Mic,
  Headphones,
  Sun,
  MapPin,
  CalendarDays,
  Filter,
  Inbox,
  Power,
  ChevronUp,
  Bell,
  LogOut,
  ArrowDown,
  ArrowUp,
  Wifi,
  Database,
  HardDrive,
  PanelLeftClose,
} from "lucide-react";
import Studio from "./Studio";
import ProviderSettings from "./ProviderSettings.jsx";
import RegionSelect from "./RegionSelect.jsx";
import { SocialSourceFields, CaptionImporter } from "./SocialSources.jsx";
import { isSocial, socialDefaults } from "../shared/social.js";
import { NATIONAL_REGION } from "../shared/regions.js";
import Overlay2Settings from "./overlay2/Settings.jsx";
import Overlay2Player from "./overlay2/Player.jsx";
import "./overlay2/overlay2.css";
import { api, send, download, refreshSources } from "./api";
import {
  demoNews,
  initialQueue,
  initialSettings,
  categories,
  statusLabels,
  duration,
  clockDuration,
} from "./data";
import { nextPosition, validateStory } from "../worker/core";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "./styles.css";
const nav = [
  { path: "/admin", label: "Ringkasan", icon: LayoutDashboard },
  { path: "/admin/news", label: "Ruang redaksi", icon: Newspaper },
  { path: "/admin/sources", label: "Sumber berita", icon: Globe2 },
  { path: "/admin/broadcast", label: "Kontrol siaran", icon: Radio },
  { path: "/admin/presenter", label: "Presenter & studio", icon: UserRound },
  { path: "/admin/ai", label: "Konfigurasi AI", icon: Sparkles },
  { path: "/admin/overlay2", label: "Overlay 2", icon: AudioLines },
  { path: "/simulator", label: "Simulator", icon: FlaskConical },
];
const demoSources = [
  {
    id: "s1",
    name: "Pemerintah Kota Pasuruan",
    type: "Resmi",
    url: "https://pasuruankota.go.id",
    region: "Kota Pasuruan",
    status: "Belum terhubung",
    active: 1,
    permission: "Contoh sumber resmi; akses feed perlu dikonfigurasi.",
  },
  {
    id: "s2",
    name: "Portal berita lokal",
    type: "RSS",
    url: "https://example.com/feed",
    region: "Kota Pasuruan",
    status: "Belum terhubung",
    active: 1,
    permission: "Contoh feed; ganti URL dengan feed berizin.",
  },
  {
    id: "s3",
    name: "Info Pasuruan",
    type: "Instagram",
    url: "https://www.instagram.com/",
    region: "Kota Pasuruan",
    status: "Memerlukan akses resmi",
    active: 0,
    permission: "Input manual hingga API resmi tersedia.",
  },
];
const prettyDate = (d) =>
  new Date(d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const prettyTime = (d) =>
  new Date(d)
    .toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    })
    .replace(".", ":");
function Badge({ children, tone = "muted", dot = false }) {
  return (
    <span className={"badge " + tone}>
      {dot && <i />}
      {children}
    </span>
  );
}
function Button({
  children,
  icon: Icon,
  className = "",
  variant = "secondary",
  ...p
}) {
  return (
    <button className={`btn ${variant} ${className}`} {...p}>
      {Icon && <Icon size={15} />} {children}
    </button>
  );
}
function IconButton({ icon: Icon, label, ...p }) {
  return (
    <button className="icon-btn" aria-label={label} title={label} {...p}>
      <Icon size={17} />
    </button>
  );
}
function Empty({ title, children, icon: Icon = Inbox }) {
  return (
    <div className="empty">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function App() {
  const [path, setPath] = useState(
      location.pathname === "/" ? "/admin" : location.pathname,
    ),
    [sidebar, setSidebar] = useState(false),
    [loading, setLoading] = useState(true),
    [mode, setMode] = useState("demo"),
    [news, setNews] = useState(demoNews),
    [sources, setSources] = useState(demoSources),
    [history, setHistory] = useState([]),
    [audit, setAudit] = useState([]),
    [settings, setSettings] = useState({ ...initialSettings, version: 0 }),
    [queue, setQueue] = useState({
      ...initialQueue,
      items: demoNews.slice(0, 3),
      version: 0,
    }),
    [toast, setToast] = useState(null),
    [modal, setModal] = useState(null),
    [search, setSearch] = useState(""),
    [region, setRegion] = useState("Semua wilayah"),
    [refreshing, setRefreshing] = useState(false),
    [time, setTime] = useState(new Date()),
    [user, setUser] = useState("Operator"),
    [playing, setPlaying] = useState(false),
    [paused, setPaused] = useState(false),
    [progress, setProgress] = useState(0),
    [muted, setMuted] = useState(false),
    [audioReady, setAudioReady] = useState(false),
    [voices, setVoices] = useState([]),
    [connectionError, setConnectionError] = useState(""),
    [lease, setLease] = useState(false),
    [unread, setUnread] = useState(false);
  const queueRef = useRef(queue),
    sourcesRef = useRef(sources),
    settingsRef = useRef(settings),
    utteranceRef = useRef(null),
    started = useRef(0),
    elapsedRef = useRef(0),
    speakRef = useRef(null),
    generation = useRef(0),
    toastTimer = useRef(null),
    delayTimer = useRef(null),
    broadcast = useRef(null),
    controller = useRef(crypto.randomUUID()),
    lastCommand = useRef(""),
    isLive = path === "/live",
    isSimulator = path === "/simulator";
  queueRef.current = queue;
  sourcesRef.current = sources;
  settingsRef.current = settings;
  const notify = useCallback((message, type = "success") => {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 6500);
  }, []);
  const go = useCallback((p) => {
    window.history.pushState({}, "", p);
    setPath(p);
    setSidebar(false);
    setSearch("");
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const pop = () => setPath(location.pathname);
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  const load = useCallback(async () => {
    try {
      if (location.pathname === "/live") {
        const d = await api("/live");
        setMode("connected");
        setQueue(d.queue);
        setSettings(d.settings);
        return;
      }
      const d = await api("/bootstrap");
      setMode("connected");
      setNews(d.news);
      setSources(d.sources);
      setHistory(d.history);
      setAudit(d.audit);
      setSettings(d.settings);
      setQueue(d.queue);
      setUser(d.user);
      setConnectionError("");
    } catch (e) {
      setConnectionError(e.message);
      if (location.pathname === "/live") {
        setMode("unavailable");
        setQueue({ ...initialQueue, items: [], version: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => setTime(new Date()), 1000);
    const v = () => setVoices(window.speechSynthesis?.getVoices() || []);
    v();
    window.speechSynthesis?.addEventListener("voiceschanged", v);
    try {
      broadcast.current = new BroadcastChannel("pasuruan-studio");
      broadcast.current.onmessage = (e) => {
        if (e.data.type === "STOP") {
          generation.current++;
          window.speechSynthesis?.cancel();
          setPlaying(false);
          setPaused(false);
          setProgress(0);
        }
      };
    } catch {}
    return () => {
      clearInterval(t);
      window.speechSynthesis?.cancel();
      window.speechSynthesis?.removeEventListener("voiceschanged", v);
      broadcast.current?.close();
      clearTimeout(delayTimer.current);
    };
  }, [load]);
  useEffect(() => {
    if (mode === "connected" && !isLive) {
      setRefreshing(true);
      refreshSources(sourcesRef.current)
        .then(() => load())
        .catch(() => {})
        .finally(() => setRefreshing(false));
    }
  }, [mode]);
  useEffect(() => {
    if (mode !== "connected") return;
    let polling = false;
    const t = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const d = await api("/live");
        const remote =
          d.queue.lease &&
          d.queue.lease.expires > Date.now() &&
          d.queue.lease.id !== controller.current;
        if (remote && !isLive) {
          setQueue(d.queue);
          queueRef.current = d.queue;
          setPlaying(["playing", "paused"].includes(d.queue.status));
          setPaused(d.queue.status === "paused");
          started.current = d.queue.startedAt || Date.now();
          return;
        }
        if (d.queue.commandId !== lastCommand.current) {
          lastCommand.current = d.queue.commandId;
          setQueue(d.queue);
          queueRef.current = d.queue;
          if (d.queue.command === "stop" && playing) stop(false);
          else if (audioReady && lease) {
            if (d.queue.command === "play") speakRef.current(d.queue);
            else if (d.queue.command === "pause") {
              speechSynthesis.pause();
              elapsedRef.current = Date.now() - started.current;
              setPaused(true);
            } else if (d.queue.command === "resume") {
              speechSynthesis.resume();
              started.current = Date.now() - elapsedRef.current;
              setPaused(false);
            }
          }
        } else if (!playing) {
          setQueue(d.queue);
          queueRef.current = d.queue;
        } else {
          setQueue((old) => ({
            ...old,
            version: d.queue.version,
            lease: d.queue.lease,
          }));
        }
      } catch {
      } finally {
        polling = false;
      }
    }, 2500);
    return () => clearInterval(t);
  }, [mode, isLive, audioReady, playing, lease]);
  useEffect(() => {
    if (!playing || paused) return;
    const t = setInterval(() => {
      const elapsed = (Date.now() - started.current) / 1000;
      const total = duration(
        queueRef.current.items[queueRef.current.index]?.script,
      );
      setProgress(Math.min(96, (elapsed / total) * 100));
    }, 300);
    return () => clearInterval(t);
  }, [playing, paused]);
  useEffect(() => {
    if (!lease || mode !== "connected") return;
    const t = setInterval(async () => {
      try {
        const q = await send("/lease", { id: controller.current });
        setQueue((old) => ({ ...old, version: q.version, lease: q.lease }));
      } catch (e) {
        stop(false);
        notify(e.message, "error");
      }
    }, 45000);
    return () => clearInterval(t);
  }, [lease, mode]);
  async function persistQueue(q) {
    if (mode === "connected") {
      const clean = { ...q, controller: controller.current };
      const saved = await send("/queue", clean, "PUT");
      setQueue(saved);
      return saved;
    }
    setQueue(q);
    return q;
  }
  async function saveSettings(x) {
    try {
      const result =
        mode === "connected" ? await send("/settings", x, "PUT") : x;
      setSettings(result);
      notify(
        mode === "connected"
          ? "Parameter studio tersimpan."
          : "Pengaturan diterapkan untuk sesi demo.",
      );
      return true;
    } catch (e) {
      notify(e.message, "error");
      return false;
    }
  }
  async function refresh(id) {
    setRefreshing(true);
    try {
      if (mode !== "connected") {
        notify(
          "Mode demo: hubungkan penyimpanan untuk mengambil sumber aktual.",
          "info",
        );
        return;
      }
      const r = await refreshSources(sources, { id, force: true });
      await load();
      const failed = r.results.filter((result) => result.error);
      notify(
        failed.length === 1 && r.results.length === 1
          ? `${failed[0].name}: ${failed[0].status}`
          : failed.length
            ? `${r.results.length - failed.length}/${r.results.length} sumber selesai · ${failed.length} gagal. Lihat alasan pada status sumber.`
            : r.results.length
              ? "Pemeriksaan sumber selesai. Lihat jumlah draft dan status masing-masing sumber."
              : "Tidak ada sumber aktif untuk diperiksa.",
        failed.length ? "error" : "info",
      );
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setRefreshing(false);
    }
  }
  async function editNews(item) {
    if (!item) {
      setModal({
        type: "editor",
        item: {
          title: "",
          text: "",
          script: "",
          category: "Pemerintahan",
          region: region === "Semua wilayah" ? NATIONAL_REGION : region,
          priority: "reguler",
          status: "draft",
          source_name: "",
          source_url: "",
          published_at: new Date().toISOString(),
          sensitive: false,
          demo: mode === "demo",
          revision: 0,
        },
      });
      return;
    }
    try {
      const full = mode === "connected" ? await api("/news/" + item.id) : item;
      setModal({ type: "editor", item: full });
    } catch (e) {
      notify(e.message, "error");
    }
  }
  async function saveNews(x) {
    try {
      const saved =
        mode === "connected"
          ? await send("/news", x)
          : {
              ...x,
              id: x.id || crypto.randomUUID(),
              revision: (x.revision || 0) + 1,
            };
      setNews((old) =>
        old.some((n) => n.id === saved.id)
          ? old.map((n) => (n.id === saved.id ? saved : n))
          : [saved, ...old],
      );
      setModal(null);
      notify(
        saved.status === "approved"
          ? "Berita disetujui dan siap masuk antrean."
          : "Naskah berhasil disimpan.",
      );
      return saved;
    } catch (e) {
      notify(e.message, "error");
      return null;
    }
  }
  async function addQueue(item) {
    if (item.status !== "approved") {
      notify(
        "Tinjau dan setujui berita sebelum menambahkannya ke antrean.",
        "error",
      );
      return;
    }
    if (queue.items.some((n) => n.id === item.id)) {
      notify("Berita sudah ada di antrean.", "info");
      return;
    }
    try {
      const full = mode === "connected" ? await api("/news/" + item.id) : item;
      const items = [...queue.items];
      const ranks = { breaking: 0, utama: 1, reguler: 2 };
      const begin = playing ? queue.index + 1 : 0;
      let pos = items.findIndex(
        (n, i) => i >= begin && ranks[n.priority] > ranks[full.priority],
      );
      if (pos < 0) pos = items.length;
      items.splice(pos, 0, full);
      const q = { ...queue, items, index: playing ? queue.index : 0 };
      await persistQueue(q);
      notify("Berita ditambahkan ke antrean siaran.");
    } catch (e) {
      notify(e.message, "error");
    }
  }
  function stop(sync = true) {
    generation.current++;
    clearTimeout(delayTimer.current);
    window.speechSynthesis?.cancel();
    setPlaying(false);
    setPaused(false);
    setProgress(0);
    setLease(false);
    setAudioReady(false);
    if (sync) {
      broadcast.current?.postMessage({ type: "STOP" });
      persistQueue({
        ...queueRef.current,
        status: "standby",
        command: "stop",
        commandId: crypto.randomUUID(),
      }).catch((e) => notify(e.message, "error"));
    }
  }
  async function claim() {
    if (mode !== "connected") return true;
    try {
      const q = await send("/lease", { id: controller.current });
      setQueue((old) => ({ ...old, version: q.version, lease: q.lease }));
      queueRef.current = {
        ...queueRef.current,
        version: q.version,
        lease: q.lease,
      };
      setLease(true);
      return true;
    } catch (e) {
      notify(e.message, "error");
      return false;
    }
  }
  async function start(index = queue.index, restart = false) {
    const remote =
      mode === "connected" &&
      !isLive &&
      queueRef.current.lease?.expires > Date.now() &&
      queueRef.current.lease.id !== controller.current;
    if (remote) {
      try {
        await persistQueue({
          ...queueRef.current,
          index,
          round: restart ? 1 : queueRef.current.round,
          replay: history.some(
            (h) => (h.story_id || h.id) === queueRef.current.items[index]?.id,
          ),
          status: "playing",
          command: "play",
          commandId: crypto.randomUUID(),
          startedAt: Date.now(),
        });
        setPlaying(true);
        setPaused(false);
        notify("Perintah dikirim ke browser LIVE.");
      } catch (e) {
        notify(e.message, "error");
      }
      return;
    }
    if (!window.speechSynthesis) {
      notify(
        "Browser ini tidak mendukung TTS. Gunakan Chrome atau Edge.",
        "error",
      );
      return;
    }
    if (!queueRef.current.items.length) {
      notify(
        "Tambahkan berita siap tayang ke antrean terlebih dahulu.",
        "info",
      );
      return;
    }
    if (!(await claim())) return;
    setAudioReady(true);
    const q = {
      ...queueRef.current,
      index,
      round: restart ? 1 : queueRef.current.round,
      replay: history.some(
        (h) =>
          h.id === queueRef.current.items[index]?.id ||
          h.story_id === queueRef.current.items[index]?.id,
      ),
      status: "playing",
      command: "play",
      commandId: crypto.randomUUID(),
      startedAt: Date.now(),
    };
    try {
      const saved = await persistQueue(q);
      queueRef.current = saved;
      lastCommand.current = saved.commandId;
      speakRef.current(saved);
    } catch (e) {
      notify(e.message, "error");
    }
  }
  speakRef.current = (q) => {
    const item = q.items[q.index];
    if (!item?.script) {
      stop();
      notify("Naskah berita tidak tersedia.", "error");
      return;
    }
    generation.current++;
    const token = generation.current;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(item.script);
    const selected =
      voices.find((v) => v.voiceURI === settingsRef.current.voice) ||
      voices.find((v) => v.lang.startsWith("id"));
    if (selected) utterance.voice = selected;
    utterance.lang = "id-ID";
    utterance.rate = settingsRef.current.rate;
    utterance.pitch = settingsRef.current.pitch;
    utterance.volume = muted ? 0 : 1;
    utteranceRef.current = utterance;
    started.current = Date.now();
    setProgress(0);
    setPlaying(true);
    setPaused(false);
    utterance.onboundary = (e) => {
      if (token === generation.current && e.charIndex)
        setProgress(Math.min(98, (e.charIndex / item.script.length) * 100));
    };
    utterance.onerror = (e) => {
      if (
        token !== generation.current ||
        e.error === "interrupted" ||
        e.error === "canceled"
      )
        return;
      stop();
      notify(
        "TTS gagal: " + e.error + ". Coba pilih suara lain atau ulangi.",
        "error",
      );
    };
    utterance.onend = async () => {
      if (token !== generation.current) return;
      setProgress(100);
      const record = {
        id: item.id,
        title: item.title,
        revision: item.revision,
        replay: q.round > 1 || q.replay,
        status: "completed",
        created_at: new Date().toISOString(),
      };
      setHistory((old) => [record, ...old]);
      if (mode === "connected")
        send("/history", record).catch(() =>
          notify("Riwayat belum tersimpan.", "error"),
        );
      const next = nextPosition(q);
      if (next.status === "standby") {
        stop();
        return;
      }
      const advance = async () => {
        try {
          const saved = await persistQueue({
            ...queueRef.current,
            index: next.index,
            round: next.round,
            startedAt: Date.now(),
          });
          queueRef.current = saved;
          speakRef.current(saved);
        } catch (e) {
          stop(false);
          notify(e.message, "error");
        }
      };
      if (next.index === 0 && q.mode === "delay") {
        setPlaying(false);
        notify(
          `Putaran selesai. Siaran berlanjut dalam ${q.delay} detik.`,
          "info",
        );
        delayTimer.current = setTimeout(advance, q.delay * 1000);
      } else await advance();
    };
    speechSynthesis.speak(utterance);
  };
  function pause() {
    if (!playing) return;
    const remote =
      mode === "connected" &&
      !isLive &&
      queueRef.current.lease?.expires > Date.now() &&
      queueRef.current.lease.id !== controller.current;
    if (remote) {
      persistQueue({
        ...queueRef.current,
        status: paused ? "playing" : "paused",
        command: paused ? "resume" : "pause",
        commandId: crypto.randomUUID(),
      })
        .then(() => setPaused(!paused))
        .catch((e) => notify(e.message, "error"));
      return;
    }
    if (paused) {
      speechSynthesis.resume();
      started.current = Date.now() - elapsedRef.current;
      setPaused(false);
    } else {
      elapsedRef.current = Date.now() - started.current;
      speechSynthesis.pause();
      setPaused(true);
    }
  }
  async function next() {
    if (!queue.items.length) return;
    const nextIndex = queue.index + 1;
    if (nextIndex >= queue.items.length) {
      stop();
      notify("Antrean telah selesai.", "info");
      return;
    }
    if (playing) await start(nextIndex);
    else
      try {
        await persistQueue({ ...queue, index: nextIndex });
      } catch (e) {
        notify(e.message, "error");
      }
  }
  const active = queue.items[queue.index] || null;
  const filtered = news.filter(
    (n) =>
      (region === "Semua wilayah" || n.region === region) &&
      `${n.title} ${n.category} ${n.source_name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const ready = news.filter((n) => n.status === "approved").length,
    review = news.filter((n) => n.status === "review").length;
  const totalDuration = queue.items.reduce((a, x) => a + duration(x.script), 0);
  const controls = {
    playing,
    paused,
    progress,
    start,
    pause,
    stop,
    next,
    muted,
    setMuted,
    active,
    queue,
    persistQueue,
    notify,
    audioReady,
  };
  if (isLive)
    return (
      <div className="live-page">
        <div className="live-output">
          <BroadcastPreview
            active={active}
            playing={playing && !paused}
            settings={settings}
            queue={queue}
            full
          />
          {!audioReady && (
            <div className="audio-gate">
              <div className="gate-card">
                <Mic size={26} />
                <h2>
                  {mode === "unavailable"
                    ? "Studio belum tersedia"
                    : "Studio siap mengudara"}
                </h2>
                <p>
                  {queue.items.length
                    ? "Aktifkan audio melalui browser ini untuk memulai narasi."
                    : "Antrean kosong. Tambahkan berita melalui ruang kendali."}
                </p>
                <Button
                  icon={Volume2}
                  variant="primary"
                  onClick={() => start()}
                  disabled={!queue.items.length}
                >
                  Aktifkan audio & mulai
                </Button>
                <button
                  className="text-link"
                  onClick={() => go("/admin/broadcast")}
                >
                  Kembali ke ruang kendali <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="live-control">
          <Badge tone={playing ? "red" : "muted"} dot>
            {playing ? "ON AIR" : "STANDBY"}
          </Badge>
          <span>{active?.demo ? "SIARAN DEMO" : "OUTPUT 9:16"}</span>
          <IconButton
            icon={paused ? Play : Pause}
            label={paused ? "Lanjut" : "Jeda"}
            onClick={pause}
          />
          <IconButton icon={Square} label="Hentikan" onClick={() => stop()} />
          <IconButton
            icon={ExternalLink}
            label="Ruang kendali"
            onClick={() => go("/admin")}
          />
        </div>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (sidebar ? "open" : "")}>
        <a
          className="brand"
          href="/admin"
          onClick={(e) => {
            e.preventDefault();
            go("/admin");
          }}
        >
          <span className="brand-mark">
            <AudioLines size={22} />
          </span>
          <span>
            PASURUAN
            <b>
              AI NEWS TV <span className="tiny-dot" />
            </b>
          </span>
        </a>
        <div className="workspace-label">
          WORKSPACE <span>STUDIO 01</span>
        </div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.path}
              onClick={() => go(n.path)}
              className={path === n.path ? "active" : ""}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.path === "/admin/news" && review > 0 && <em>{review}</em>}
              {path === n.path && <span className="active-line" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-small">
            <span className="system-icon">
              <Radio size={17} />
            </span>
            <div>
              <b>Studio Pasuruan</b>
              <small>
                <i
                  className={mode === "connected" ? "green-dot" : "amber-dot"}
                />
                {mode === "connected" ? "Sistem terhubung" : "Mode demonstrasi"}
              </small>
            </div>
          </div>
          <button
            onClick={() => go("/admin/settings")}
            className={path === "/admin/settings" ? "active" : ""}
          >
            <Settings2 size={18} />
            Pengaturan
          </button>
          <a href="/signout-with-chatgpt?return_to=/" className="profile">
            <span className="avatar">OP</span>
            <span>
              <b>Operator Studio</b>
              <small>Administrator</small>
            </span>
            <LogOut size={15} />
          </a>
        </div>
      </aside>
      {sidebar && (
        <div className="sidebar-shade" onClick={() => setSidebar(false)} />
      )}
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <IconButton
              icon={Menu}
              label="Buka navigasi"
              onClick={() => setSidebar(!sidebar)}
            />
            <span>Workspace</span>
            <ChevronRight size={13} />
            <b>{nav.find((n) => n.path === path)?.label || "Pengaturan"}</b>
          </div>
          <div className="topbar-right">
            <span className="local-time">
              <Clock3 size={13} />
              {time
                .toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  timeZone: "Asia/Jakarta",
                })
                .replaceAll(".", ":")}{" "}
              <small>WIB</small>
            </span>
            <span className="top-divider" />
            <button
              className="notification-btn"
              aria-label="Aktivitas studio"
              onClick={() => {
                setUnread(false);
                setModal({ type: "activity" });
              }}
            >
              <Bell size={17} />
              {(review > 0 || unread) && <i />}
            </button>
            <span className="avatar small">OP</span>
          </div>
        </header>
        <div className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="red-line" /> PASURUAN AI NEWS TV
              </div>
              <h1>
                {{
                  "/admin": "Ruang kendali, dalam satu layar.",
                  "/admin/news": "Ruang redaksi",
                  "/admin/sources": "Sumber berita",
                  "/admin/broadcast": "Kontrol siaran",
                  "/admin/presenter": "Presenter & studio",
                  "/admin/ai": "Konfigurasi AI",
                  "/admin/overlay2": "Overlay 2 · Host interaktif",
                  "/simulator": "Simulator studio",
                  "/admin/settings": "Pengaturan workspace",
                }[path] || "Ruang redaksi"}
              </h1>
              <p>
                {
                  {
                    "/admin": "Dari kabar lokal, menjadi siaran yang bermakna.",
                    "/admin/news":
                      "Kelola berita Indonesia dan kota/kabupaten pilihan Anda.",
                    "/admin/sources":
                      "Kabar lokal dimulai dari sumber yang bisa ditelusuri.",
                    "/admin/broadcast":
                      "Atur urutan berita dan kendalikan setiap momen siaran.",
                    "/admin/presenter":
                      "Bangun identitas visual dan suara studio Anda.",
                    "/admin/ai":
                      "Rangkuman yang terarah. Kendali editorial tetap di tangan Anda.",
                    "/admin/overlay2":
                      "Wajah wireframe, berita redaksi, dan percakapan TikTok LIVE.",
                    "/simulator":
                      "Uji presenter, audio, dan antrean sebelum mengudara.",
                    "/admin/settings":
                      "Kelola preferensi, data, dan keamanan ruang redaksi.",
                  }[path]
                }
              </p>
            </div>
            <div className="heading-actions">
              {path === "/admin" ? (
                <>
                  <Button
                    icon={RefreshCw}
                    disabled={refreshing}
                    onClick={() => refresh()}
                    className={refreshing ? "refreshing" : ""}
                  >
                    Refresh sumber
                  </Button>
                  <Button
                    variant="primary"
                    icon={Plus}
                    onClick={() => editNews()}
                  >
                    Tambah berita
                  </Button>
                </>
              ) : path === "/admin/news" ? (
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => editNews()}
                >
                  Tambah berita
                </Button>
              ) : path === "/admin/sources" ? (
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => setModal({ type: "source" })}
                >
                  Tambah sumber
                </Button>
              ) : path === "/admin/broadcast" || isSimulator ? (
                <Button
                  icon={ExternalLink}
                  onClick={() => window.open("/live", "_blank")}
                >
                  Buka layar LIVE
                </Button>
              ) : (
                <Badge tone="muted">
                  <ShieldCheck size={13} /> Hanya administrator
                </Badge>
              )}
            </div>
          </div>
          {mode !== "connected" && (
            <div className="demo-banner">
              <FlaskConical size={15} />
              <span>
                <b>Workspace demo</b>
                <span className="banner-detail">
                  {" "}
                  · Konten simulasi untuk menjelajahi studio. Berita ini bukan
                  laporan aktual.
                </span>
              </span>
              <button onClick={() => setModal({ type: "connection" })}>
                Detail koneksi <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {loading && <div className="loading-line" />}
          {mode === "connected" && news.length === 0 && path === "/admin" && (
            <div className="welcome-banner">
              <span className="welcome-icon">
                <Sparkles size={21} />
              </span>
              <div>
                <b>Selamat datang di studio Anda.</b>
                <p>
                  Mulai dengan berita pertama, atau jelajahi studio menggunakan
                  materi simulasi.
                </p>
              </div>
              <Button
                icon={FlaskConical}
                onClick={async () => {
                  try {
                    await send("/demo", {});
                    await load();
                    notify(
                      "Materi simulasi siap dijelajahi. Semua contoh diberi label DEMO.",
                    );
                  } catch (e) {
                    notify(e.message, "error");
                  }
                }}
              >
                Muat contoh demo
              </Button>
            </div>
          )}
          {path === "/admin" && (
            <>
              <div className="stats-grid">
                <Stat
                  icon={Newspaper}
                  label="Berita di ruang redaksi"
                  value={news.length.toString().padStart(2, "0")}
                  foot={
                    <>
                      <span className="mini-bars">▂ ▄ ▃ ▆ ▅ ▇</span>
                      <span>Seluruh materi berita</span>
                    </>
                  }
                />
                <Stat
                  icon={CheckCheck}
                  label="Siap tayang"
                  value={ready.toString().padStart(2, "0")}
                  foot={
                    <>
                      <span className="green-dot" />
                      <span>Sudah ditinjau editor</span>
                    </>
                  }
                  color="green"
                />
                <Stat
                  icon={FileText}
                  label="Menunggu review"
                  value={review.toString().padStart(2, "0")}
                  foot={
                    <>
                      <span className="amber-dot" />
                      <span>Perlu perhatian Anda</span>
                    </>
                  }
                  color="amber"
                />
                <Stat
                  icon={Radio}
                  label="Dalam antrean"
                  value={queue.items.length.toString().padStart(2, "0")}
                  foot={
                    <>
                      <Clock3 size={12} />
                      <span>Durasi {clockDuration(totalDuration)}</span>
                    </>
                  }
                  color="purple"
                />
              </div>
              <div className="dashboard-grid">
                <section className="panel preview-panel">
                  <div className="panel-head">
                    <h2>
                      <Monitor size={16} />
                      Pratinjau studio
                    </h2>
                    <Badge tone={playing ? "red" : "muted"} dot>
                      {playing ? "ON AIR" : "STANDBY"}
                    </Badge>
                  </div>
                  <div className="studio-surround">
                    <div className="studio-meta">
                      <span>
                        <span className="green-dot" /> OUTPUT PROGRAM
                      </span>
                      <span>9:16 · HD</span>
                    </div>
                    <BroadcastPreview
                      active={active}
                      playing={playing && !paused}
                      settings={settings}
                      queue={queue}
                    />
                    <div className="preview-under">
                      <span>
                        <UserRound size={12} /> {settings.presenter} · Presenter
                        virtual
                      </span>
                      <button onClick={() => go("/admin/presenter")}>
                        Atur <Settings2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="preview-actions">
                    <Button
                      icon={ExternalLink}
                      onClick={() => window.open("/live", "_blank")}
                    >
                      Buka layar LIVE
                    </Button>
                    <IconButton
                      icon={Maximize2}
                      label="Perbesar pratinjau"
                      onClick={() => setModal({ type: "preview" })}
                    />
                  </div>
                </section>
                <div className="dashboard-right">
                  <section className="panel queue-panel">
                    <div className="panel-head">
                      <h2>
                        <ListIcon />
                        Antrean siaran{" "}
                        <span className="counter">{queue.items.length}</span>
                      </h2>
                      <button
                        className="text-link"
                        onClick={() => go("/admin/broadcast")}
                      >
                        Kelola antrean <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <div className="queue-list">
                      {queue.items.length ? (
                        queue.items
                          .slice(0, 3)
                          .map((n, i) => (
                            <QueueRow
                              key={n.id}
                              item={n}
                              index={i}
                              active={i === queue.index}
                              playing={playing}
                              onPlay={() => start(i)}
                              onEdit={() => editNews(n)}
                            />
                          ))
                      ) : (
                        <Empty title="Antrean masih kosong">
                          Pilih berita yang sudah disetujui untuk mulai siaran.
                        </Empty>
                      )}
                    </div>
                    <div className="queue-transport">
                      <div className="transport-main">
                        <button
                          className="play-button"
                          aria-label={playing ? "Jeda siaran" : "Mulai siaran"}
                          onClick={() => (playing ? pause() : start())}
                        >
                          {playing && !paused ? (
                            <Pause size={17} fill="currentColor" />
                          ) : (
                            <Play size={17} fill="currentColor" />
                          )}
                        </button>
                        <IconButton
                          icon={SkipForward}
                          label="Berita berikutnya"
                          onClick={next}
                        />
                        <IconButton
                          icon={RotateCcw}
                          label="Putar semua dari awal"
                          onClick={() => start(0, true)}
                        />
                        <span className="transport-rule" />
                        <span className="transport-caption">
                          {playing
                            ? paused
                              ? "Siaran dijeda"
                              : "Siaran berjalan"
                            : "Siap untuk mengudara"}
                        </span>
                      </div>
                      <Button
                        icon={Radio}
                        variant="primary"
                        onClick={() => (playing ? stop() : start())}
                      >
                        {playing ? "Akhiri siaran" : "Mulai siaran"}
                      </Button>
                    </div>
                  </section>
                  <section className="panel sources-overview">
                    <div className="panel-head">
                      <h2>
                        <Globe2 size={16} />
                        Kesehatan sumber
                      </h2>
                      <button
                        className="text-link"
                        onClick={() => go("/admin/sources")}
                      >
                        Lihat semua <ArrowUpRight size={14} />
                      </button>
                    </div>
                    {sources.length ? (
                      <div className="source-mini-list">
                        {sources.slice(0, 3).map((s, i) => (
                          <div className="source-mini" key={s.id}>
                            <span className={"source-logo source-" + i}>
                              {s.type === "Instagram" ? (
                                <ImageIcon size={17} />
                              ) : s.type === "RSS" ? (
                                <Radio size={17} />
                              ) : (
                                <Globe2 size={17} />
                              )}
                            </span>
                            <div>
                              <b>{s.name}</b>
                              <small>
                                {s.type} <span>·</span> {s.region}
                              </small>
                            </div>
                            <Badge
                              tone={
                                s.status.startsWith("Terhubung")
                                  ? "green"
                                  : s.active
                                    ? "muted"
                                    : "amber"
                              }
                              dot
                            >
                              {s.status.startsWith("Terhubung")
                                ? "Terhubung"
                                : s.active
                                  ? "Belum terhubung"
                                  : "Akses terbatas"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty title="Belum ada sumber">
                        Tambahkan RSS atau sumber resmi untuk memulai.
                      </Empty>
                    )}
                  </section>
                </div>
              </div>
              <section className="panel latest-panel">
                <div className="panel-head">
                  <div>
                    <h2>Meja redaksi</h2>
                    <p>Berita terbaru yang menunggu langkah berikutnya.</p>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => go("/admin/news")}
                  >
                    Semua berita <ArrowRight size={14} />
                  </button>
                </div>
                <NewsTable
                  news={filtered.slice(0, 4)}
                  editNews={editNews}
                  addQueue={addQueue}
                />
              </section>
              <div className="bottom-status">
                <span>
                  <span
                    className={mode === "connected" ? "green-dot" : "amber-dot"}
                  />
                  {mode === "connected"
                    ? "Workspace tersinkronisasi"
                    : "Demo interaktif · perubahan berlaku selama sesi ini"}
                </span>
                <span>
                  Dirancang untuk Pasuruan <span className="heart">♥</span>
                </span>
              </div>
            </>
          )}
          {path === "/admin/news" && (
            <NewsPage
              {...{
                news: filtered,
                all: news,
                editNews,
                addQueue,
                search,
                setSearch,
                region,
                setRegion,
                queue,
              }}
            />
          )}
          {path === "/admin/sources" && (
            <SourcesPage
              {...{ sources, setModal, refresh, refreshing, mode }}
            />
          )}
          {(path === "/admin/broadcast" || isSimulator) && (
            <BroadcastPage
              {...{
                controls,
                settings,
                saveSettings,
                setModal,
                news,
                addQueue,
                isSimulator,
                history,
              }}
            />
          )}
          {path === "/admin/presenter" && (
            <PresenterPage
              {...{
                settings,
                saveSettings,
                voices,
                notify,
                mode,
                speaking: playing && !paused,
              }}
            />
          )}
          {path === "/admin/ai" && (
            <ProviderSettings {...{ settings, saveSettings, mode, notify }} />
          )}
          {path === "/admin/overlay2" && (
            <Overlay2Settings
              {...{ settings, saveSettings, mode, notify, go, queue }}
            />
          )}
          {path === "/admin/settings" && (
            <SettingsPage
              {...{ mode, user, news, queue, settings, notify, load, setModal }}
            />
          )}
        </div>
      </main>
      {modal && (
        <ModalShell
          onClose={() => setModal(null)}
          wide={["editor", "preview"].includes(modal.type)}
          title={
            {
              editor: modal.item?.id ? "Sunting berita" : "Berita baru",
              source: modal.item ? "Sunting sumber" : "Tambah sumber berita",
              caption: "Import caption profil",
              preview: "Pratinjau program",
              activity: "Aktivitas workspace",
              connection: "Status koneksi",
              addQueue: "Tambah ke antrean",
            }[modal.type]
          }
        >
          {modal.type === "editor" ? (
            <Editor
              item={modal.item}
              onSave={saveNews}
              onClose={() => setModal(null)}
              settings={settings}
              voices={voices}
              mode={mode}
              notify={notify}
            />
          ) : modal.type === "source" ? (
            <SourceEditor
              item={modal.item}
              mode={mode}
              onSave={async (x) => {
                try {
                  if (mode === "connected") {
                    await send("/sources", x);
                    await load();
                  } else
                    setSources((old) =>
                      old.some((s) => s.id === x.id)
                        ? old.map((s) => (s.id === x.id ? x : s))
                        : [
                            ...old,
                            {
                              ...x,
                              id: crypto.randomUUID(),
                              status: "Belum terhubung",
                            },
                          ],
                    );
                  setModal(null);
                  notify("Sumber berita tersimpan.");
                } catch (e) {
                  notify(e.message, "error");
                }
              }}
            />
          ) : modal.type === "caption" ? (
            <CaptionImporter
              source={modal.item}
              onSave={async (post) => {
                try {
                  const saved = await send(
                    "/sources/" +
                      encodeURIComponent(modal.item.id) +
                      "/caption",
                    post,
                  );
                  await load();
                  setModal({ type: "editor", item: saved });
                  notify(
                    "Caption diimpor sebagai draft. Tinjau dan pratinjau suara sebelum menyetujui.",
                  );
                } catch (error) {
                  notify(error.message, "error");
                }
              }}
            />
          ) : modal.type === "preview" ? (
            <div className="large-preview">
              <BroadcastPreview
                active={active}
                playing={playing && !paused}
                settings={settings}
                queue={queue}
                full
              />
            </div>
          ) : modal.type === "activity" ? (
            <div className="activity-list">
              {audit.length ? (
                audit.map((a, i) => (
                  <div key={i}>
                    <Activity size={16} />
                    <div>
                      <b>{a.action}</b>
                      <small>
                        {prettyDate(a.created_at)} · {prettyTime(a.created_at)}{" "}
                        WIB
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <Empty title="Belum ada aktivitas tercatat">
                  Aktivitas penyuntingan dan antrean akan muncul di sini.
                </Empty>
              )}
            </div>
          ) : modal.type === "connection" ? (
            <div className="connection-detail">
              <Database size={32} />
              <h3>
                {mode === "connected"
                  ? "Penyimpanan terhubung"
                  : "Penyimpanan belum tersedia"}
              </h3>
              <p>
                {connectionError ||
                  "D1 dan R2 terhubung. Konten tersimpan di server."}
              </p>
              <p>
                Demo dapat digunakan untuk menguji tampilan. Perubahan dalam
                mode demo tidak disimpan lintas sesi.
              </p>
              <Button
                icon={RefreshCw}
                onClick={async () => {
                  await load();
                  setModal(null);
                }}
              >
                Periksa lagi
              </Button>
            </div>
          ) : modal.type === "addQueue" ? (
            <div className="pick-list">
              {news.filter(
                (n) =>
                  n.status === "approved" &&
                  !queue.items.some((q) => q.id === n.id),
              ).length ? (
                news
                  .filter(
                    (n) =>
                      n.status === "approved" &&
                      !queue.items.some((q) => q.id === n.id),
                  )
                  .map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        addQueue(n);
                        setModal(null);
                      }}
                    >
                      <div>
                        <b>{n.title}</b>
                        <small>
                          {n.category} · {n.region}
                        </small>
                      </div>
                      <Plus size={17} />
                    </button>
                  ))
              ) : (
                <Empty title="Semua berita siap tayang sudah masuk">
                  Setujui berita lain melalui ruang redaksi.
                </Empty>
              )}
            </div>
          ) : null}
        </ModalShell>
      )}
      {toast && (
        <div role="status" className={"toast " + toast.type}>
          {toast.type === "error" ? (
            <TriangleAlert size={18} />
          ) : toast.type === "info" ? (
            <Activity size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>{toast.message}</span>
          <button aria-label="Tutup notifikasi" onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
function ListIcon() {
  return (
    <span className="list-icon">
      <span />
      <span />
      <span />
    </span>
  );
}
function Stat({ icon: Icon, label, value, foot, color = "" }) {
  return (
    <div className={"stat-card " + color}>
      <div className="stat-top">
        <span>{label}</span>
        <Icon size={17} />
      </div>
      <div className="stat-value">
        {value}
        <span>
          {color === "green"
            ? "berita"
            : color === "purple"
              ? "berita"
              : "berita"}
        </span>
      </div>
      <div className="stat-foot">{foot}</div>
    </div>
  );
}
function BroadcastPreview({ active, playing, settings, queue, full = false }) {
  return (
    <div className={"broadcast-preview " + (full ? "full" : "")}>
      <Studio
        speaking={playing}
        glb={settings.glb}
        quality={settings.quality}
        camera={settings.camera}
      />
      <div className="broadcast-top">
        <div className="channel-mark">
          <b>PASURUAN</b>
          <span>AI NEWS TV</span>
        </div>
        <div className={"live-mark " + (playing ? "on" : "")}>
          {playing ? "LIVE" : "PREVIEW"}
          <i />
        </div>
      </div>
      <div className="broadcast-location">
        <MapPin size={9} /> PASURUAN, JAWA TIMUR
      </div>
      {active?.media && (
        <div className="onair-media">
          {active.media.type?.startsWith("video") ? (
            <video src={active.media.url} autoPlay muted loop playsInline />
          ) : (
            <img
              src={active.media.url}
              alt={active.credit || "Visual berita"}
            />
          )}
          <small>{active.credit || "Media redaksi"}</small>
        </div>
      )}
      <div className="broadcast-lower">
        {active?.demo && (
          <span className="demo-onair">SIMULASI · BUKAN BERITA AKTUAL</span>
        )}
        {(queue.round > 1 || queue.replay) && (
          <span className="replay-onair">
            TAYANGAN ULANG · {active && prettyDate(active.published_at)}
          </span>
        )}
        <div className="segment-label">
          {active?.category?.toUpperCase() || "KABAR PASURUAN"}
          <span />
        </div>
        <h3>{active?.title || "Kabar lokal. Perspektif baru."}</h3>
        <div className="lower-details">
          <span>{active?.source_name || "Pasuruan AI News TV"}</span>
          <span>
            {active ? prettyDate(active.published_at) : "STUDIO STANDBY"}
          </span>
        </div>
        <div className="broadcast-subtitle">
          {active?.subtitle ||
            (playing
              ? active?.script?.slice(0, 95) + "…"
              : "Informasi lokal, dari Pasuruan untuk Anda.")}
        </div>
        <div className="ticker">
          <b>NEWS UPDATE</b>
          <span>
            PASURUAN AI NEWS TV <i>•</i> Presenter virtual berbasis AI <i>•</i>{" "}
            Informasi untuk warga Pasuruan
          </span>
        </div>
      </div>
      <div className="ai-watermark">PRESENTER VIRTUAL · AI</div>
    </div>
  );
}
function QueueRow({ item, index, active, playing, onPlay, onEdit, children }) {
  return (
    <div className={"queue-row " + (active ? "selected" : "")}>
      <span className="queue-number">
        {active && playing ? (
          <AudioLines size={15} />
        ) : (
          String(index + 1).padStart(2, "0")
        )}
      </span>
      <div className={"news-thumb " + (item.image || "city")}>
        <span>{item.category?.[0]}</span>
        <Landscape kind={item.image} />
      </div>
      <div className="queue-copy">
        <div className="queue-tags">
          {active && (
            <span className="now-tag">
              {playing ? "SEDANG TAYANG" : "BERITA PERTAMA"}
            </span>
          )}
          {item.priority === "utama" && (
            <span className="priority-tag">UTAMA</span>
          )}
          {item.priority === "breaking" && (
            <span className="now-tag">BREAKING</span>
          )}
          {item.demo && <span className="demo-tag">DEMO</span>}
          {!item.demo &&
            Date.now() - new Date(item.published_at) > 172800000 && (
              <span className="priority-tag">&gt; 48 JAM</span>
            )}
        </div>
        <button onClick={onEdit} className="queue-title">
          {item.title}
        </button>
        <small>
          {item.category} <span>·</span> {clockDuration(duration(item.script))}
        </small>
      </div>
      {children || (
        <button
          className="queue-play"
          onClick={onPlay}
          aria-label={"Putar " + item.title}
        >
          <Play size={14} />
        </button>
      )}
    </div>
  );
}
function Landscape({ kind = "city" }) {
  return (
    <svg viewBox="0 0 100 70" className="landscape" aria-hidden="true">
      <defs>
        <linearGradient id={"sky" + kind} x2="0" y2="1">
          <stop
            stopColor={
              kind === "mountain"
                ? "#8cb6b4"
                : kind === "market"
                  ? "#dbb17d"
                  : "#9fb4c5"
            }
          />
          <stop offset="1" stopColor="#d3cec1" />
        </linearGradient>
      </defs>
      <rect width="100" height="70" fill={"url(#sky" + kind + ")"} />
      <circle cx="75" cy="17" r="8" fill="#efddba" opacity=".6" />
      {kind === "mountain" || kind === "field" ? (
        <>
          <path d="M0 58L35 10 68 52 82 27 110 70H0" fill="#395d5a" />
          <path d="M24 27l11-17 14 20-15-7z" fill="#a9b6ab" />
          <path d="M0 62l44-18 62 12v14H0" fill="#688767" />
        </>
      ) : kind === "market" ? (
        <>
          <path d="M0 25h100v35H0z" fill="#976a43" />
          <path d="M0 15h100v16H0z" fill="#947759" />
          {[10, 30, 50, 70, 90].map((x) => (
            <path key={x} d={`M${x} 15h10v16H${x}z`} fill="#d1af76" />
          ))}
          <path d="M8 40h84v20H8" fill="#4c4937" />
          <path d="M0 61h100v9H0" fill="#888273" />
        </>
      ) : (
        <>
          <path d="M0 56h100v14H0z" fill="#65745c" />
          <path d="M12 35h74v22H12z" fill="#d0c9af" />
          <path d="M9 34l40-14 40 14z" fill="#6c7063" />
          <path d="M43 15h12v42H43z" fill="#e0d6b9" />
          <path d="M40 15l9-9 10 9z" fill="#5c6a61" />
          {[20, 32, 62, 74].map((x) => (
            <rect key={x} x={x} y="40" width="7" height="13" fill="#5f7174" />
          ))}
          <path d="M39 70l8-13h6l11 13" fill="#a5a18e" />
          <circle cx="9" cy="44" r="10" fill="#435f49" />
          <circle cx="92" cy="46" r="11" fill="#486447" />
        </>
      )}
    </svg>
  );
}
function NewsTable({ news, editNews, addQueue }) {
  return (
    <div className="table-scroll">
      <table className="news-table">
        <thead>
          <tr>
            <th>BERITA</th>
            <th>WILAYAH</th>
            <th>STATUS EDITORIAL</th>
            <th>DIPERBARUI</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {news.map((n) => (
            <tr key={n.id}>
              <td>
                <div className="table-news">
                  <div className={"news-thumb " + (n.image || "city")}>
                    <Landscape
                      kind={
                        n.image ||
                        {
                          Ekonomi: "market",
                          "Wisata & Budaya": "mountain",
                          Pendidikan: "public",
                        }[n.category]
                      }
                    />
                  </div>
                  <div>
                    <button onClick={() => editNews(n)}>{n.title}</button>
                    <small>
                      {n.category}
                      <span> · </span>
                      {n.source_name}
                      {!!n.demo && <span className="demo-inline">DEMO</span>}
                    </small>
                  </div>
                </div>
              </td>
              <td>
                <span className="region-cell">{n.region}</span>
              </td>
              <td>
                <Badge
                  tone={
                    n.status === "approved"
                      ? "green"
                      : n.status === "review"
                        ? "amber"
                        : "muted"
                  }
                  dot
                >
                  {statusLabels[n.status]}
                </Badge>
              </td>
              <td>
                <span className="date-cell">
                  {prettyDate(n.published_at)}
                  <small>{prettyTime(n.published_at)} WIB</small>
                </span>
              </td>
              <td>
                <div className="row-actions">
                  <IconButton
                    icon={n.status === "approved" ? Plus : FileText}
                    label={
                      n.status === "approved"
                        ? "Tambah ke antrean"
                        : "Tinjau naskah"
                    }
                    onClick={() =>
                      n.status === "approved" ? addQueue(n) : editNews(n)
                    }
                  />
                  <IconButton
                    icon={MoreHorizontal}
                    label="Sunting berita"
                    onClick={() => editNews(n)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!news.length && (
        <Empty title="Belum ada berita">
          Tambahkan berita atau ubah filter pencarian.
        </Empty>
      )}
    </div>
  );
}
function NewsPage({
  news,
  all,
  editNews,
  addQueue,
  search,
  setSearch,
  region,
  setRegion,
}) {
  const [tab, setTab] = useState("all");
  const filtered = news.filter((n) => tab === "all" || n.status === tab);
  return (
    <>
      <div className="editorial-note">
        <ShieldCheck size={18} />
        <div>
          <b>Setiap kabar melewati meja editor.</b>
          <span>Hanya berita yang disetujui dapat masuk antrean siaran.</span>
        </div>
        <Badge tone="green">Review manual aktif</Badge>
      </div>
      <section className="panel">
        <div className="news-toolbar">
          <div className="tabs">
            {[
              ["all", "Semua berita"],
              ["review", "Perlu review"],
              ["draft", "Draft"],
              ["approved", "Siap tayang"],
              ["archived", "Arsip"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key)}
              >
                {label}
                <span>
                  {all.filter((n) => key === "all" || n.status === key).length}
                </span>
              </button>
            ))}
          </div>
          <div className="filters">
            <label className="search-input">
              <Search size={15} />
              <input
                placeholder="Cari judul, kategori, sumber…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  aria-label="Hapus pencarian"
                  onClick={() => setSearch("")}
                >
                  <X size={13} />
                </button>
              )}
            </label>
            <RegionSelect
              all
              aria-label="Filter wilayah"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </div>
        </div>
        <NewsTable news={filtered} editNews={editNews} addQueue={addQueue} />
        <div className="table-footer">
          <span>
            Menampilkan {filtered.length} berita · maksimum 100 terbaru
          </span>
          <span>
            Urutan terbaru <ArrowDown size={12} />
          </span>
        </div>
      </section>
    </>
  );
}
function SourcesPage({ sources, setModal, refresh, refreshing, mode }) {
  return (
    <>
      <div className="source-summary">
        <div>
          <span className="green-dot" />
          Pengambilan sesuai permintaan
        </div>
        <p>
          Sumber diperiksa satu per satu saat dashboard dibuka, dengan cache 5
          menit.
        </p>
        <Button
          icon={RefreshCw}
          disabled={refreshing}
          onClick={() => refresh()}
        >
          Refresh semua sumber
        </Button>
      </div>
      <div className="source-cards">
        {sources.map((s, i) => (
          <section className="panel source-card" key={s.id}>
            <div className="source-card-top">
              <span className={"source-logo source-" + i}>
                <Globe2 size={21} />
              </span>
              <Badge tone={s.active ? "green" : "muted"} dot>
                {s.active ? "Aktif" : "Nonaktif"}
              </Badge>
            </div>
            <h2>{s.name}</h2>
            <p className="source-url">{s.url}</p>
            <div className="source-properties">
              <span>
                Platform <b>{s.type}</b>
              </span>
              <span>
                Cakupan <b>{s.region}</b>
              </span>
              <span>
                Status akses{" "}
                <b
                  className={
                    s.status.startsWith("Terhubung") ? "green-text" : ""
                  }
                >
                  {s.status}
                </b>
              </span>
              <span>
                Terakhir diperiksa{" "}
                <b>
                  {s.last_checked
                    ? prettyTime(s.last_checked) + " WIB"
                    : "Belum pernah"}
                </b>
              </span>
            </div>
            <p className="permission-note">
              <ShieldCheck size={13} />
              {s.permission || "Izin akses belum dicatat."}
            </p>
            <div className="source-card-actions">
              <Button
                icon={RefreshCw}
                onClick={() => refresh(s.id)}
                disabled={!s.active || refreshing}
              >
                {isSocial(s.type) ? "Ambil caption terbaru" : "Periksa sumber"}
              </Button>
              {isSocial(s.type) && (
                <Button
                  icon={FileText}
                  disabled={mode !== "connected"}
                  onClick={() => setModal({ type: "caption", item: s })}
                >
                  Import caption
                </Button>
              )}
              <IconButton
                icon={Settings2}
                label="Sunting sumber"
                onClick={() => setModal({ type: "source", item: s })}
              />
            </div>
          </section>
        ))}
        <button
          className="add-source-card"
          onClick={() => setModal({ type: "source" })}
        >
          <span>
            <Plus size={24} />
          </span>
          <b>Hubungkan sumber baru</b>
          <p>RSS, portal resmi, atau input manual</p>
        </button>
      </div>
      <div className="info-callout">
        <TriangleAlert size={18} />
        <div>
          <b>Akses yang sah, atribusi yang jelas.</b>
          <p>
            Caption Instagram/TikTok dapat diimpor manual tanpa API, atau
            diambil melalui API resmi/konektor profil yang dikonfigurasi. Semua
            hasil menjadi draft; tinjau konteks dan tanggal sebelum siaran.
          </p>
        </div>
      </div>
    </>
  );
}
function BroadcastPage({
  controls: c,
  settings,
  saveSettings,
  setModal,
  isSimulator,
  history,
}) {
  const [busy, setBusy] = useState(false);
  const update = async (changes) => {
    setBusy(true);
    try {
      await c.persistQueue({ ...c.queue, ...changes });
    } catch (e) {
      c.notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const move = (i, d) => {
    const items = [...c.queue.items];
    if (i + d < 0 || i + d >= items.length) return;
    const activeId = c.active?.id;
    [items[i], items[i + d]] = [items[i + d], items[i]];
    update({
      items,
      index: Math.max(
        0,
        items.findIndex((n) => n.id === activeId),
      ),
    });
  };
  return (
    <>
      <div className="broadcast-layout">
        <section className="panel broadcast-monitor">
          <div className="panel-head">
            <h2>
              <Monitor size={16} />
              {isSimulator ? "Monitor simulator" : "Output program"}
            </h2>
            <Badge tone={c.playing ? "red" : "muted"} dot>
              {c.playing ? "ON AIR" : "STANDBY"}
            </Badge>
          </div>
          <div className="broadcast-main-preview">
            <BroadcastPreview
              active={c.active}
              playing={c.playing && !c.paused}
              settings={settings}
              queue={c.queue}
              full
            />
          </div>
          <div className="monitor-footer">
            <span>
              <Volume2 size={14} /> Audio browser native
            </span>
            <span>1080 × 1920</span>
          </div>
        </section>
        <div className="broadcast-config">
          <section className="panel">
            <div className="panel-head">
              <h2>
                Antrean program{" "}
                <span className="counter">{c.queue.items.length}</span>
              </h2>
              <Button
                icon={Plus}
                onClick={() => setModal({ type: "addQueue" })}
              >
                Tambah berita
              </Button>
            </div>
            <div className="full-queue">
              {c.queue.items.length ? (
                c.queue.items.map((n, i) => (
                  <QueueRow
                    key={n.id}
                    item={n}
                    index={i}
                    active={i === c.queue.index}
                    playing={c.playing}
                    onPlay={() => c.start(i)}
                    onEdit={() => {}}
                  >
                    <div className="queue-reorder">
                      <IconButton
                        icon={ArrowUp}
                        label="Naikkan urutan"
                        onClick={() => move(i, -1)}
                        disabled={c.playing || busy || i === 0}
                      />
                      <IconButton
                        icon={ArrowDown}
                        label="Turunkan urutan"
                        onClick={() => move(i, 1)}
                        disabled={
                          c.playing || busy || i === c.queue.items.length - 1
                        }
                      />
                      <IconButton
                        icon={Trash2}
                        label="Hapus dari antrean"
                        disabled={c.playing || busy}
                        onClick={() =>
                          update({
                            items: c.queue.items.filter((_, j) => j !== i),
                            index: 0,
                          })
                        }
                      />
                    </div>
                  </QueueRow>
                ))
              ) : (
                <Empty title="Siapkan siaran pertama Anda">
                  Tambahkan berita siap tayang ke antrean program.
                </Empty>
              )}
            </div>
            <div className="now-playing">
              <div>
                <span>{c.playing ? "SEKARANG TAYANG" : "BERITA TERPILIH"}</span>
                <b>{c.active?.title || "Belum ada berita"}</b>
              </div>
              <div className="progress-bar">
                <span style={{ width: c.progress + "%" }} />
              </div>
              <div className="timecodes">
                <span>
                  {clockDuration(
                    (duration(c.active?.script) * c.progress) / 100,
                  )}
                </span>
                <span>{clockDuration(duration(c.active?.script))}</span>
              </div>
            </div>
            <div className="full-transport">
              <IconButton
                icon={RotateCcw}
                label="Ulangi berita aktif"
                onClick={() => c.start(c.queue.index)}
              />
              <button
                className="play-button"
                aria-label={c.playing ? "Jeda / lanjutkan" : "Mulai siaran"}
                onClick={() => (c.playing ? c.pause() : c.start())}
              >
                {c.playing && !c.paused ? (
                  <Pause size={21} />
                ) : (
                  <Play size={21} fill="currentColor" />
                )}
              </button>
              <IconButton
                icon={SkipForward}
                label="Berita berikutnya"
                onClick={c.next}
              />
              <Button icon={RotateCcw} onClick={() => c.start(0, true)}>
                Putar semua dari awal
              </Button>
            </div>
          </section>
          <section className="panel settings-panel">
            <h2>
              <RotateCcw size={16} />
              Saat antrean selesai
            </h2>
            <label>
              Mode selesai antrean
              <select
                disabled={c.playing || busy}
                value={c.queue.mode}
                onChange={(e) => update({ mode: e.target.value })}
              >
                <option value="standby">Standby — tunggu operator</option>
                <option value="loop">Ulang otomatis</option>
                <option value="count">Ulang N kali</option>
                <option value="delay">Ulang dengan jeda</option>
              </select>
            </label>
            <div className="two-cols">
              {c.queue.mode === "count" && (
                <label>
                  Jumlah putaran
                  <input
                    type="number"
                    min="1"
                    max="100"
                    defaultValue={c.queue.loops}
                    onBlur={(e) =>
                      update({
                        loops: Math.max(1, Math.min(100, +e.target.value)),
                      })
                    }
                  />
                </label>
              )}
              {c.queue.mode === "delay" && (
                <label>
                  Jeda antarputaran (detik)
                  <input
                    type="number"
                    min="1"
                    max="3600"
                    defaultValue={c.queue.delay}
                    onBlur={(e) =>
                      update({
                        delay: Math.max(1, Math.min(3600, +e.target.value)),
                      })
                    }
                  />
                </label>
              )}
            </div>
            <p className="hint">
              <ShieldCheck size={13} />
              Penanda “TAYANGAN ULANG” selalu aktif pada pemutaran ulang.
            </p>
          </section>
          <div className="emergency-bar">
            <div>
              <Square size={17} />
              <span>
                <b>Berhenti darurat</b>
                <small>Hentikan narasi dan kembalikan studio ke standby.</small>
              </span>
            </div>
            <Button
              variant="danger"
              onClick={() => {
                c.stop();
                c.notify(
                  "Siaran dihentikan. Studio dalam mode standby.",
                  "info",
                );
              }}
            >
              Hentikan sekarang
            </Button>
          </div>
        </div>
      </div>
      {isSimulator && (
        <div className="info-callout">
          <Headphones size={18} />
          <div>
            <b>Checklist sebelum LIVE</b>
            <p>
              Pastikan suara Indonesia tersedia, mikrofon sistem menangkap audio
              browser, dan jendela /live tetap terbuka. Pilih hanya satu browser
              untuk mengendalikan siaran.
            </p>
          </div>
        </div>
      )}
      <section className="panel history-panel">
        <div className="panel-head">
          <h2>
            <Clock3 size={16} />
            Riwayat siaran
          </h2>
          <Badge>{history.length} penayangan</Badge>
        </div>
        {history.length ? (
          <div className="history-list">
            {history.slice(0, 10).map((h, i) => (
              <div key={i}>
                <CheckCircle2 size={16} />
                <span>{h.title}</span>
                {!!h.replay && <Badge tone="amber">Tayangan ulang</Badge>}
                <small>
                  {prettyDate(h.created_at)} · {prettyTime(h.created_at)} WIB
                </small>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Belum ada siaran selesai">
            Riwayat akan tercatat setelah berita selesai dibacakan.
          </Empty>
        )}
      </section>
    </>
  );
}
function ModalShell({ children, onClose, title, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = ref.current.querySelectorAll(
          'button:not(:disabled),a,input,textarea,select,[tabindex="0"]',
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    ref.current?.querySelector("input,button")?.focus();
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">MEJA REDAKSI</span>
            <h2>{title}</h2>
          </div>
          <IconButton icon={X} label="Tutup dialog" onClick={onClose} />
        </div>
        {children}
      </section>
    </div>
  );
}
function Editor({ item, onSave, onClose, settings, voices, mode, notify }) {
  const [x, setX] = useState({ ...item, humanReviewed: false }),
    [tab, setTab] = useState("content"),
    [busy, setBusy] = useState(false),
    [speaking, setSpeaking] = useState(false),
    [uploading, setUploading] = useState(false);
  const set = (k, v) => setX((p) => ({ ...p, [k]: v }));
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  async function summarize() {
    setBusy(true);
    try {
      if (mode !== "connected")
        throw new Error(
          "AI memerlukan koneksi server dan API key. Anda dapat menulis naskah secara manual.",
        );
      const d = await send("/ai", { text: x.social?.caption || x.text });
      set("script", d.script);
      notify(
        "Draft naskah dibuat oleh " + d.provider + ". Tinjau sebelum tayang.",
      );
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function save(status) {
    setBusy(true);
    try {
      const v = validateStory({ ...x, status });
      await onSave(v);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  function tts() {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!x.script) {
      notify("Tuliskan naskah terlebih dahulu.", "info");
      return;
    }
    if (!window.speechSynthesis) {
      notify("TTS tidak tersedia di browser ini.", "error");
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(x.script);
    u.lang = "id-ID";
    u.rate = settings.rate;
    u.voice =
      voices.find((v) => v.voiceURI === settings.voice) ||
      voices.find((v) => v.lang.startsWith("id")) ||
      null;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    speechSynthesis.speak(u);
    setSpeaking(true);
  }
  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      if (file.size > 25 * 1024 * 1024)
        throw new Error("Ukuran maksimum 25 MB.");
      if (
        ![
          "image/jpeg",
          "image/png",
          "image/webp",
          "video/mp4",
          "video/webm",
        ].includes(file.type)
      )
        throw new Error("Pilih JPG, PNG, WEBP, MP4, atau WEBM.");
      if (mode === "connected") {
        const f = new FormData();
        f.set("file", file);
        const d = await api("/upload", { method: "POST", body: f });
        set("media", d);
      } else
        set("media", {
          url: URL.createObjectURL(file),
          type: file.type,
          name: file.name,
        });
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <div className="editor-tabs tabs">
        <button
          className={tab === "content" ? "active" : ""}
          onClick={() => setTab("content")}
        >
          <FileText size={15} />
          Konten & naskah
        </button>
        <button
          className={tab === "details" ? "active" : ""}
          onClick={() => setTab("details")}
        >
          <Settings2 size={15} />
          Detail & sumber
        </button>
        <button
          className={tab === "media" ? "active" : ""}
          onClick={() => setTab("media")}
        >
          <ImageIcon size={15} />
          Media
        </button>
      </div>
      <div className="editor-body">
        {x.demo && (
          <div className="inline-demo">
            <FlaskConical size={14} />
            Materi ini diberi label DEMO pada layar siaran.
          </div>
        )}
        {tab === "content" ? (
          <>
            {x.social?.caption && (
              <section className="caption-original">
                <label>
                  Caption asli · {x.social.platform}
                  <textarea readOnly rows={4} value={x.social.caption} />
                </label>
                <p className="hint">
                  Caption sumber disimpan terpisah dari naskah. Periksa konteks,
                  tanggal, dan atribusi sebelum tayang.
                </p>
                <Button
                  icon={FileText}
                  onClick={() => set("script", x.social.caption)}
                >
                  Gunakan caption asli
                </Button>
              </section>
            )}
            <label>
              Judul berita <span className="required">*</span>
              <input
                value={x.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Apa kabar terbaru dari Indonesia atau kota Anda?"
                maxLength="240"
              />
              <small>{x.title.length}/240 karakter</small>
            </label>
            <label>
              Bahan berita / teks sumber <span className="required">*</span>
              <textarea
                rows="5"
                value={x.text}
                onChange={(e) => set("text", e.target.value)}
                placeholder="Tempel materi dari sumber yang dapat digunakan secara sah. Sertakan fakta, waktu, lokasi, dan atribusi."
                maxLength="30000"
              />
            </label>
            <div className="script-heading">
              <span>
                Naskah presenter <span className="required">*</span>
              </span>
              <Button
                icon={Sparkles}
                onClick={summarize}
                disabled={busy || (x.social?.caption || x.text).length < 100}
              >
                {busy
                  ? "Memproses…"
                  : x.social
                    ? "Ringkas caption dengan AI"
                    : "Rangkum dengan AI"}
              </Button>
            </div>
            <textarea
              rows="7"
              className="script-textarea"
              value={x.script}
              onChange={(e) => set("script", e.target.value)}
              placeholder="Naskah singkat, netral, dan nyaman didengar. Periksa seluruh informasi sebelum menyetujui berita."
              maxLength="12000"
            />
            <div className="script-footer">
              <span>
                <Clock3 size={13} />~{clockDuration(duration(x.script))} ·{" "}
                {x.script.split(/\s+/).filter(Boolean).length} kata
              </span>
              <Button icon={speaking ? Square : Volume2} onClick={tts}>
                {speaking ? "Hentikan preview" : "Preview suara"}
              </Button>
            </div>
            <label>
              Subtitle (opsional)
              <input
                value={x.subtitle || ""}
                onChange={(e) => set("subtitle", e.target.value)}
                placeholder="Teks pendamping pada layar siaran"
              />
            </label>
          </>
        ) : tab === "details" ? (
          <>
            <div className="two-cols">
              <label>
                Kategori
                <select
                  value={x.category}
                  onChange={(e) => set("category", e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Cakupan berita
                <RegionSelect
                  aria-label="Cakupan berita"
                  value={x.region}
                  onChange={(e) => set("region", e.target.value)}
                />
              </label>
            </div>
            <div className="two-cols">
              <label>
                Prioritas
                <select
                  value={x.priority}
                  onChange={(e) => set("priority", e.target.value)}
                >
                  <option value="reguler">Reguler</option>
                  <option value="utama">Utama</option>
                  <option value="breaking">Breaking news</option>
                </select>
              </label>
              <label>
                Tanggal publikasi
                <input
                  type="datetime-local"
                  value={
                    x.published_at
                      ? new Date(
                          new Date(x.published_at).valueOf() -
                            new Date().getTimezoneOffset() * 60000,
                        )
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }
                  onChange={(e) =>
                    set(
                      "published_at",
                      e.target.value
                        ? new Date(e.target.value).toISOString()
                        : "",
                    )
                  }
                />
              </label>
            </div>
            <label>
              Nama sumber <span className="required">*</span>
              <input
                value={x.source_name}
                onChange={(e) => set("source_name", e.target.value)}
                placeholder="Nama penerbit / instansi / narasumber"
              />
            </label>
            <label>
              URL sumber
              <input
                type="url"
                value={x.source_url || ""}
                onChange={(e) => set("source_url", e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!x.sensitive}
                onChange={(e) => set("sensitive", e.target.checked)}
              />
              <span>
                <b>Berita sensitif</b>
                <small>
                  Kriminalitas, korban, kecelakaan serius, atau keadaan darurat.
                </small>
              </span>
            </label>
            {!!x.sensitive && (
              <label className="checkbox-label review-check">
                <input
                  type="checkbox"
                  checked={!!x.humanReviewed}
                  onChange={(e) => set("humanReviewed", e.target.checked)}
                />
                <span>
                  Saya telah memeriksa fakta, privasi, dan kelayakan editorial
                  berita ini.
                </span>
              </label>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!x.demo}
                onChange={(e) => set("demo", e.target.checked)}
              />
              <span>
                <b>Tandai sebagai materi demo</b>
                <small>
                  Label simulasi akan selalu ditampilkan saat berita ini tayang.
                </small>
              </span>
            </label>
          </>
        ) : (
          <>
            <label className="upload-zone">
              <Upload size={28} />
              <b>{uploading ? "Mengunggah…" : "Pilih foto atau video"}</b>
              <span>JPG, PNG, WEBP, MP4, WEBM · maksimal 25 MB</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                onChange={upload}
                disabled={uploading}
              />
            </label>
            {x.media && (
              <div className="media-preview">
                {x.media.type.startsWith("video") ? (
                  <video src={x.media.url} controls />
                ) : (
                  <img src={x.media.url} alt="Pratinjau media berita" />
                )}
                <div>
                  <span>{x.media.name}</span>
                  <IconButton
                    icon={Trash2}
                    label="Hapus media"
                    onClick={() => set("media", null)}
                  />
                </div>
              </div>
            )}
            <label>
              Status izin penggunaan
              <select
                value={x.permission || ""}
                onChange={(e) => set("permission", e.target.value)}
              >
                <option value="">Pilih status izin…</option>
                <option value="owned">Karya sendiri / milik redaksi</option>
                <option value="licensed">
                  Izin atau lisensi penggunaan tersedia
                </option>
                <option value="public-domain">Domain publik</option>
              </select>
            </label>
            <label>
              Kredit media
              <input
                value={x.credit || ""}
                onChange={(e) => set("credit", e.target.value)}
                placeholder="Fotografer / pemegang hak / lisensi"
              />
            </label>
            <p className="hint">
              Ringkasan artikel tidak otomatis memberi hak menayangkan ulang
              media sumber.
            </p>
          </>
        )}
      </div>
      <div className="editor-bottom">
        <Button
          icon={Save}
          disabled={busy || uploading}
          onClick={() => save("draft")}
        >
          Simpan draft
        </Button>
        <div>
          <Button disabled={busy || uploading} onClick={() => save("review")}>
            Kirim review
          </Button>
          <Button
            icon={CheckCheck}
            variant="primary"
            disabled={busy || uploading}
            onClick={() => save("approved")}
          >
            Setujui berita
          </Button>
        </div>
      </div>
    </>
  );
}
function SourceEditor({ item, onSave, mode }) {
  const [x, setX] = useState(
      item || {
        name: "",
        type: "RSS",
        url: "",
        region: NATIONAL_REGION,
        active: true,
        permission: "",
      },
    ),
    [busy, setBusy] = useState(false),
    [credential, setCredential] = useState("");
  const set = (k, v) => setX({ ...x, [k]: v });
  return (
    <form
      className="source-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave({ ...x, ...(credential ? { credential } : {}) });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Nama sumber
        <input
          required
          maxLength="120"
          value={x.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Contoh: Portal berita nasional atau Diskominfo kota"
        />
      </label>
      <div className="two-cols">
        <label>
          Jenis sumber
          <select
            aria-label="Jenis sumber"
            value={x.type}
            onChange={(e) => {
              setX({
                ...x,
                type: e.target.value,
                social: { ...socialDefaults },
              });
              setCredential("");
            }}
          >
            {["RSS", "Resmi", "Instagram", "TikTok", "Manual"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Cakupan
          <RegionSelect
            aria-label="Cakupan"
            value={x.region}
            onChange={(e) => set("region", e.target.value)}
          />
        </label>
      </div>
      <p className="hint">
        Indonesia menerima semua materi dari sumber. Pengambilan otomatis
        kota/kabupaten mencocokkan nama daerah pada judul, isi, atau caption.
        Import manual mengikuti cakupan sumber.
      </p>
      <label>
        {isSocial(x.type) ? "URL profil" : "URL / tautan feed"}
        <input
          required
          type="url"
          pattern="https://.*"
          value={x.url}
          onChange={(e) => set("url", e.target.value)}
          placeholder={
            x.type === "Instagram"
              ? "https://www.instagram.com/nama_akun/"
              : x.type === "TikTok"
                ? "https://www.tiktok.com/@nama_akun"
                : "https://sumber-resmi.id/feed"
          }
        />
      </label>
      {x.type === "RSS" && (
        <p className="hint">
          Gunakan URL RSS/Atom. URL beranda dapat dipakai jika situs menyediakan
          tautan feed; halaman artikel biasa tidak dapat diambil sebagai feed.
        </p>
      )}
      {isSocial(x.type) && (
        <SocialSourceFields
          source={x}
          onChange={(value) => set("social", value)}
          credential={credential}
          setCredential={setCredential}
          connected={mode === "connected"}
          hasCredential={
            !!item?.hasCredential &&
            item.type === x.type &&
            (item.social?.mode || "manual") === (x.social?.mode || "manual") &&
            (item.social?.connectorUrl || "") === (x.social?.connectorUrl || "")
          }
        />
      )}
      <label>
        Catatan izin & atribusi
        <textarea
          required
          rows="3"
          value={x.permission}
          onChange={(e) => set("permission", e.target.value)}
          placeholder="Dasar izin mengambil materi, ketentuan feed, atau atribusi yang diperlukan."
        />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={!!x.active}
          onChange={(e) => set("active", e.target.checked)}
        />
        <span>Aktifkan sumber ini</span>
      </label>
      {!isSocial(x.type) && x.type !== "RSS" && (
        <p className="hint">
          <TriangleAlert size={14} />
          Pengambilan otomatis tersedia untuk RSS. Sumber lain menggunakan input
          manual hingga akses resmi tersedia.
        </p>
      )}
      <Button type="submit" variant="primary" icon={Save} disabled={busy}>
        {busy ? "Menyimpan…" : "Simpan sumber"}
      </Button>
    </form>
  );
}
function PresenterPage({
  settings,
  saveSettings,
  voices,
  notify,
  mode,
  speaking,
}) {
  const [x, setX] = useState(settings),
    [status, setStatus] = useState("Presenter prosedural · animasi adaptif"),
    [busy, setBusy] = useState(false),
    [test, setTest] = useState(false);
  useEffect(() => {
    setX(settings);
  }, [settings]);
  const set = (k, v) => setX((p) => ({ ...p, [k]: v }));
  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 25 * 1024 * 1024)
        throw new Error("Ukuran GLB maksimum 25 MB.");
      const buffer = await file.arrayBuffer();
      if (new DataView(buffer).getUint32(0, true) !== 0x46546c67)
        throw new Error("Pilih berkas GLB yang valid.");
      if (mode === "connected") {
        const f = new FormData();
        f.set("file", file);
        const d = await api("/upload", { method: "POST", body: f });
        set("glb", d.url);
      } else set("glb", URL.createObjectURL(file));
      notify("GLB dimuat. Simpan untuk menggunakan presenter ini.");
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  function testVoice() {
    if (!window.speechSynthesis) {
      notify("TTS tidak didukung.", "error");
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(
      "Selamat datang di Pasuruan AI News TV. Kabar lokal, dari Pasuruan untuk Anda.",
    );
    u.lang = "id-ID";
    u.voice =
      voices.find((v) => v.voiceURI === x.voice) ||
      voices.find((v) => v.lang.startsWith("id")) ||
      null;
    u.rate = x.rate;
    u.pitch = x.pitch;
    setTest(true);
    u.onend = () => setTest(false);
    u.onerror = () => setTest(false);
    speechSynthesis.speak(u);
  }
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  return (
    <div className="presenter-layout">
      <section className="panel presenter-view">
        <div className="panel-head">
          <h2>
            <UserRound size={17} />
            Presenter aktif
          </h2>
          <Badge tone="green">3D · WebGL</Badge>
        </div>
        <div className="presenter-stage">
          <Studio
            speaking={test || speaking}
            glb={x.glb}
            camera={x.camera}
            quality={x.quality}
            onStatus={setStatus}
          />
          <div className="presenter-name">
            <b>{x.presenter}</b>
            <span>PRESENTER VIRTUAL AI</span>
          </div>
        </div>
        <div className="presenter-status">
          <Activity size={14} />
          {status}
        </div>
      </section>
      <div className="presenter-options">
        <section className="panel settings-panel">
          <h2>Identitas presenter</h2>
          <label>
            Nama presenter
            <input
              value={x.presenter}
              onChange={(e) => set("presenter", e.target.value)}
            />
          </label>
          <div className="avatar-choice">
            <span className="avatar presenter-avatar">
              <UserRound size={27} />
            </span>
            <div>
              <b>
                {x.glb ? "Presenter GLB kustom" : "Nara · Presenter bawaan"}
              </b>
              <small>
                {x.glb
                  ? "Model 3D unggahan Anda"
                  : "Studio siap pakai dengan gerak idle dan mulut adaptif"}
              </small>
            </div>
            {x.glb ? (
              <IconButton
                icon={Trash2}
                label="Gunakan presenter bawaan"
                onClick={() => set("glb", null)}
              />
            ) : (
              <CheckCircle2 size={18} className="green-text" />
            )}
          </div>
          <label className="upload-zone compact">
            <Upload size={19} />
            <b>{busy ? "Mengunggah…" : "Unggah presenter GLB"}</b>
            <span>GLB · maksimal 25 MB · animasi dan morph adaptif</span>
            <input
              type="file"
              accept=".glb"
              onChange={upload}
              disabled={busy}
            />
          </label>
        </section>
        <section className="panel settings-panel">
          <h2>
            <Volume2 size={16} />
            Suara & narasi
          </h2>
          <label>
            Suara browser
            <select
              value={x.voice}
              onChange={(e) => set("voice", e.target.value)}
            >
              <option value="">Otomatis — prioritaskan Bahasa Indonesia</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} · {v.lang}
                </option>
              ))}
            </select>
          </label>
          {!voices.some((v) => v.lang.startsWith("id")) && (
            <p className="hint amber-text">
              Suara Indonesia belum terdeteksi pada perangkat. Tambahkan paket
              suara Indonesia di sistem operasi.
            </p>
          )}
          <label className="slider-label">
            Kecepatan bicara <b>{Number(x.rate).toFixed(1)}×</b>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={x.rate}
              onChange={(e) => set("rate", +e.target.value)}
            />
          </label>
          <label className="slider-label">
            Nada suara <b>{Number(x.pitch).toFixed(1)}</b>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={x.pitch}
              onChange={(e) => set("pitch", +e.target.value)}
            />
          </label>
          <Button
            icon={test ? Square : Headphones}
            onClick={() =>
              test ? (speechSynthesis.cancel(), setTest(false)) : testVoice()
            }
          >
            {test ? "Hentikan uji" : "Uji suara presenter"}
          </Button>
        </section>
        <section className="panel settings-panel">
          <h2>
            <Monitor size={16} />
            Studio & kamera
          </h2>
          <div className="two-cols">
            <label>
              Gerak kamera
              <select
                value={x.camera}
                onChange={(e) => set("camera", e.target.value)}
              >
                <option value="auto">Otomatis · sinematik</option>
                <option value="wide">Wide · tetap</option>
              </select>
            </label>
            <label>
              Kualitas render
              <select
                value={x.quality}
                onChange={(e) => set("quality", e.target.value)}
              >
                <option value="low">Rendah · hemat GPU</option>
                <option value="medium">Sedang</option>
                <option value="high">Tinggi</option>
              </select>
            </label>
          </div>
        </section>
        <Button
          variant="primary"
          icon={Save}
          disabled={busy}
          onClick={() => saveSettings(x)}
        >
          Simpan pengaturan studio
        </Button>
      </div>
    </div>
  );
}
function SettingsPage({
  mode,
  user,
  news,
  queue,
  settings,
  notify,
  load,
  setModal,
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="settings-layout">
      <section className="panel settings-panel">
        <h2>Workspace</h2>
        <div className="setting-row">
          <span>
            Nama studio<small>Identitas ruang redaksi</small>
          </span>
          <b>Pasuruan AI News TV</b>
        </div>
        <div className="setting-row">
          <span>
            Akses administrator
            <small>Workspace privat dilindungi autentikasi ChatGPT</small>
          </span>
          <Badge tone="green">
            <ShieldCheck size={13} />
            Privat
          </Badge>
        </div>
        <div className="setting-row">
          <span>Akun operator</span>
          <b>{user}</b>
        </div>
        <div className="setting-row">
          <span>
            Kebijakan editorial
            <small>Semua berita memerlukan persetujuan manusia</small>
          </span>
          <Badge tone="green">Review manual</Badge>
        </div>
        <div className="setting-row">
          <span>
            Penyimpanan<small>Metadata di D1 · konten & media di R2</small>
          </span>
          <Badge tone={mode === "connected" ? "green" : "amber"} dot>
            {mode === "connected" ? "Terhubung" : "Demo"}
          </Badge>
        </div>
      </section>
      <section className="panel settings-panel">
        <h2>
          <Download size={17} />
          Ekspor & backup
        </h2>
        <p className="panel-description">
          Simpan snapshot berita, sumber, antrean, dan pengaturan. Media tetap
          direferensikan ke R2 dan perlu disalin terpisah untuk pemulihan lintas
          akun.
        </p>
        <Button
          icon={Download}
          onClick={() => {
            if (mode === "connected") {
              window.location.href = "/api/backup";
              notify("Backup JSON sedang disiapkan.");
            } else {
              download(
                { format: "pasuruan-demo", news, queue, settings },
                "pasuruan-demo-backup.json",
              );
              notify("Snapshot demo diunduh.");
            }
          }}
        >
          Unduh backup JSON
        </Button>
        <hr />
        <h2>Mulai menjelajahi</h2>
        <p className="panel-description">
          Tambahkan materi simulasi ke redaksi kosong untuk menguji studio tanpa
          menggunakan berita aktual. Semua materi contoh diberi label DEMO.
        </p>
        <Button
          icon={FlaskConical}
          disabled={busy || news.length > 0 || mode !== "connected"}
          onClick={async () => {
            setBusy(true);
            try {
              await send("/demo", {});
              await load();
              notify("Materi contoh berhasil ditambahkan.");
            } catch (e) {
              notify(e.message, "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          Tambahkan materi demo
        </Button>
      </section>
      <section className="panel settings-panel">
        <h2>
          <Activity size={17} />
          Kesiapan siaran
        </h2>
        <div className="checklist">
          <p>
            <CheckCircle2 size={16} />
            Halaman LIVE memiliki penanda presenter AI.
          </p>
          <p>
            <CheckCircle2 size={16} />
            Narasi memerlukan aktivasi audio oleh operator.
          </p>
          <p>
            <CheckCircle2 size={16} />
            Tayangan ulang diberi label secara otomatis.
          </p>
          <p>
            <CheckCircle2 size={16} />
            Berita sensitif memerlukan review manusia.
          </p>
          <p>
            <TriangleAlert size={16} />
            Uji pengambilan audio pada OBS / TikTok LIVE Studio sebelum siaran.
          </p>
        </div>
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  window.location.pathname.replace(/\/$/, "") === "/overlay2" ? (
    <Overlay2Player />
  ) : (
    <App />
  ),
);
