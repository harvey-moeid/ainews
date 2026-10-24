import { XMLParser, XMLValidator } from "fast-xml-parser";
import { ApiError } from "./core.js";
import { readBounded } from "./ai.js";

export const FEED_IMPORT_LIMIT = 10;
export class FeedError extends ApiError {
  constructor(code, message, status = 400) {
    super(message, status);
    this.code = code;
  }
}
export function publicFeedUrl(value, base) {
  let url;
  try {
    url = new URL(value, base);
  } catch {
    throw new FeedError("invalid_url", "URL sumber atau redirect tidak valid.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(url.hostname) ||
    /(^|\.)(localhost|local|internal)$/.test(url.hostname)
  )
    throw new FeedError(
      "invalid_url",
      "URL sumber dan redirect harus memakai HTTPS publik tanpa kredensial.",
    );
  url.hash = "";
  return url;
}
function entities(text) {
  const names = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (original, value) => {
      if (value[0] !== "#") return names[value.toLowerCase()] || original;
      const n = /^#x/i.test(value)
        ? parseInt(value.slice(2), 16)
        : Number(value.slice(1));
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
        ? String.fromCodePoint(n)
        : "";
    },
  );
}
function textOf(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(textOf).join(" ");
  if (typeof value === "object")
    return Object.entries(value)
      .filter(([key]) => !key.startsWith("@"))
      .map(([, child]) => textOf(child))
      .join(" ");
  return entities(String(value))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const array = (value) =>
  value == null ? [] : Array.isArray(value) ? value : [value];
export function parseFeed(xml, base) {
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml))
    throw new FeedError(
      "unsafe_xml",
      "Feed mengandung deklarasi XML yang tidak didukung.",
    );
  if (XMLValidator.validate(xml) !== true)
    throw new FeedError(
      "invalid_xml",
      "Format RSS/Atom tidak valid. Periksa URL feed sumber.",
    );
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: false,
  });
  const data = parser.parse(xml);
  const items = data.rss?.channel?.item ?? data.feed?.entry ?? data.RDF?.item;
  if (!["rss", "feed", "RDF"].some((root) => Object.hasOwn(data, root)))
    throw new FeedError(
      "not_feed",
      "URL ini bukan feed RSS/Atom. Masukkan tautan feed, bukan halaman artikel.",
    );
  return array(items)
    .slice(0, FEED_IMPORT_LIMIT)
    .map((item) => {
      const links = array(item.link);
      const alternate = links.find(
        (link) =>
          typeof link === "object" &&
          (!link["@_rel"] || link["@_rel"] === "alternate") &&
          link["@_href"],
      );
      const rawLink =
        alternate?.["@_href"] ||
        links.find((link) => typeof link === "string") ||
        (item.guid?.["@_isPermaLink"] !== "false" &&
        /^https:\/\//i.test(textOf(item.guid))
          ? textOf(item.guid)
          : "");
      let url = "";
      try {
        if (rawLink) url = publicFeedUrl(entities(rawLink), base).href;
      } catch {
        /* Skip this item without losing the rest of the feed. */
      }
      return {
        title: textOf(item.title),
        text:
          textOf(item.encoded) ||
          textOf(item.description) ||
          textOf(item.summary) ||
          textOf(item.content),
        publishedAt:
          textOf(item.pubDate) ||
          textOf(item.published) ||
          textOf(item.updated) ||
          textOf(item.date),
        url,
      };
    });
}
function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(
      (match) => [match[1].toLowerCase(), entities(match[2] ?? match[3])],
    ),
  );
}
function discoverFeed(html, base) {
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(tag);
    if (
      attrs.rel?.toLowerCase().split(/\s+/).includes("alternate") &&
      /^(application\/(rss|atom)\+xml|text\/xml)(?:;|$)/i.test(
        attrs.type || "",
      ) &&
      attrs.href
    )
      return publicFeedUrl(attrs.href, base);
  }
  throw new FeedError(
    "not_feed",
    "URL beranda ini tidak menyediakan tautan RSS/Atom. Sunting sumber dan isi URL feed yang benar.",
  );
}
export async function loadFeed(value) {
  const signal = AbortSignal.timeout(15000);
  let redirects = 0;
  const seen = new Set();
  async function get(value) {
    let url = publicFeedUrl(value);
    while (true) {
      if (seen.has(url.href))
        throw new FeedError(
          "redirect_loop",
          "Redirect sumber berulang. Periksa URL feed.",
        );
      seen.add(url.href);
      const response = await fetch(url.href, {
        redirect: "manual",
        signal,
        headers: {
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8",
          "User-Agent": "Ainews/1.0 RSS Reader",
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("Location");
        await response.body?.cancel();
        if (!location || ++redirects > 3)
          throw new FeedError(
            "redirect_limit",
            "Redirect sumber terlalu banyak atau tidak valid. Gunakan URL feed akhir.",
          );
        url = publicFeedUrl(location, url);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        const status = response.status;
        const message =
          status === 403 || status === 401
            ? `Sumber menolak akses otomatis (HTTP ${status}). Gunakan feed berizin atau input manual.`
            : status === 404
              ? "URL RSS tidak ditemukan (HTTP 404). Periksa tautan feed sumber."
              : status === 429
                ? "Sumber membatasi permintaan (HTTP 429). Coba lagi nanti."
                : `Sumber gagal merespons (HTTP ${status}). Coba lagi nanti atau periksa URL feed.`;
        throw new FeedError("http_" + status, message, 502);
      }
      let bytes;
      try {
        bytes = await readBounded(response, 1000000);
      } catch (error) {
        if (error instanceof ApiError)
          throw new FeedError(
            "feed_too_large",
            "Respons sumber melebihi batas 1 MB. Gunakan feed yang lebih kecil.",
          );
        throw error;
      }
      return { xml: new TextDecoder().decode(bytes), url };
    }
  }
  try {
    let page = await get(value);
    let discovered = false;
    if (/<!doctype\s+html|<html\b|<head\b/i.test(page.xml)) {
      page = await get(discoverFeed(page.xml, page.url));
      discovered = true;
    }
    return {
      entries: parseFeed(page.xml, page.url),
      url: page.url.href,
      discovered,
    };
  } catch (error) {
    if (error instanceof FeedError) throw error;
    if (["AbortError", "TimeoutError"].includes(error.name))
      throw new FeedError(
        "timeout",
        "Sumber tidak merespons dalam 15 detik. Coba lagi nanti.",
        504,
      );
    throw new FeedError(
      "network",
      "Tidak dapat menghubungi sumber RSS. Periksa jaringan, sertifikat HTTPS, dan URL feed.",
      502,
    );
  }
}
