import { ApiError } from "./core.js";
import { readBounded } from "./ai.js";
import { getCredential } from "./credentials.js";
import {
  isSocial,
  SOCIAL_IMPORT_LIMIT,
  socialDefaults,
  socialProfile,
  socialPostUrl,
} from "../shared/social.js";
import { matchesCoverage } from "../shared/regions.js";

export const socialCredentialName = (id) => "SOCIAL_SOURCE:" + id;
export const socialCredentialContext = (id, type, config) =>
  JSON.stringify([
    socialCredentialName(id),
    type,
    config.mode,
    config.connectorUrl || "",
  ]);
export function socialConfig(source) {
  return { ...socialDefaults, ...JSON.parse(source.social_config || "{}") };
}
export function publicSource(source) {
  const { social_config, hasCredential, ...safe } = source;
  return {
    ...safe,
    ...(isSocial(source.type)
      ? { social: socialConfig(source), hasCredential: !!hasCredential }
      : {}),
  };
}
export function validateSocialSource(input) {
  try {
    const profile = socialProfile(input.type, input.url);
    const social = { ...socialDefaults, ...input.social };
    if (!["manual", "official", "connector"].includes(social.mode))
      throw new Error("Pilih cara pengambilan caption.");
    const clean = { mode: social.mode, instagramUserId: "", connectorUrl: "" };
    if (social.mode === "official" && input.type === "Instagram") {
      if (
        typeof social.instagramUserId !== "string" ||
        !/^\d{1,30}$/.test(social.instagramUserId)
      )
        throw new Error(
          "Isi Instagram User ID akun profesional yang mengizinkan akses API.",
        );
      clean.instagramUserId = social.instagramUserId;
    }
    if (social.mode === "connector") {
      const url = new URL(social.connectorUrl);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        !/^[a-z][a-z0-9.-]*\.[a-z]{2,}$/i.test(url.hostname) ||
        /localhost|\.local$|\.internal$/.test(url.hostname)
      )
        throw new Error(
          "Konektor harus memakai origin HTTPS publik tanpa path.",
        );
      clean.connectorUrl = url.origin;
    }
    return { url: profile.url, social: clean };
  } catch (error) {
    throw new ApiError(error.message);
  }
}
async function serviceJson(url, key, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new ApiError(
      `Pengambilan caption HTTP ${response.status}. Periksa token, izin, dan akun sumber.`,
      502,
    );
  }
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(await readBounded(response)));
  } catch {
    throw new ApiError(
      "Respons layanan caption tidak valid atau terlalu besar.",
      502,
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new ApiError("Respons layanan caption tidak valid.", 502);
  if (data.error && data.error.code !== "ok")
    throw new ApiError(
      "Layanan caption menolak akses. Periksa izin atau perbarui token akun.",
      502,
    );
  return data;
}
export async function fetchSocialPosts(env, source) {
  const config = socialConfig(source);
  if (config.mode === "manual") return null;
  const profile = socialProfile(source.type, source.url);
  const key = await getCredential(
    env,
    socialCredentialName(source.id),
    socialCredentialContext(source.id, source.type, config),
  );
  if (!key)
    throw new ApiError(
      "Token sumber belum diisi. Sunting sumber atau gunakan Import caption manual.",
      503,
    );
  let posts;
  if (config.mode === "connector") {
    const data = await serviceJson(
      config.connectorUrl + "/api/v1/social/posts",
      key,
      {
        method: "POST",
        body: JSON.stringify({
          platform: source.type.toLowerCase(),
          profileUrl: profile.url,
          username: profile.username,
          limit: SOCIAL_IMPORT_LIMIT,
        }),
      },
    );
    if (
      data.profile?.username?.toLowerCase() !== profile.username ||
      !Array.isArray(data.posts)
    )
      throw new ApiError(
        "Respons konektor tidak cocok dengan profil sumber.",
        502,
      );
    posts = data.posts;
  } else if (source.type === "TikTok") {
    const account = await serviceJson(
      "https://open.tiktokapis.com/v2/user/info/?fields=username",
      key,
    );
    if (account.data?.user?.username?.toLowerCase() !== profile.username)
      throw new ApiError(
        "Token TikTok bukan milik profil ini atau izin user.info.profile belum diberikan.",
        502,
      );
    const data = await serviceJson(
      "https://open.tiktokapis.com/v2/video/list/?fields=id,video_description,share_url,create_time",
      key,
      {
        method: "POST",
        body: JSON.stringify({ max_count: SOCIAL_IMPORT_LIMIT }),
      },
    );
    if (!Array.isArray(data.data?.videos))
      throw new ApiError("Daftar video TikTok tidak valid.", 502);
    posts = data.data.videos.slice(0, SOCIAL_IMPORT_LIMIT).map((post) => ({
      id: post.id,
      caption: post.video_description,
      url: post.share_url,
      publishedAt:
        typeof post.create_time === "number"
          ? new Date(post.create_time * 1000).toISOString()
          : "",
    }));
  } else {
    const version = env.INSTAGRAM_GRAPH_VERSION || "v25.0";
    if (
      !/^v\d{1,3}\.0$/.test(version) ||
      !/^\d{1,30}$/.test(config.instagramUserId)
    )
      throw new ApiError("Konfigurasi Instagram Graph API tidak valid.", 503);
    const base = `https://graph.facebook.com/${version}/${config.instagramUserId}`;
    const account = await serviceJson(base + "?fields=id,username", key);
    let data;
    if (account.username?.toLowerCase() === profile.username) {
      data = await serviceJson(
        base +
          `/media?fields=id,caption,permalink,timestamp&limit=${SOCIAL_IMPORT_LIMIT}`,
        key,
      );
    } else {
      const fields = `business_discovery.username(${profile.username}){username,media.limit(${SOCIAL_IMPORT_LIMIT}){id,caption,permalink,timestamp}}`;
      const discovery = await serviceJson(
        base + "?fields=" + encodeURIComponent(fields),
        key,
      );
      if (
        discovery.business_discovery?.username?.toLowerCase() !==
        profile.username
      )
        throw new ApiError(
          "Profil Instagram tidak tersedia melalui Business Discovery. Gunakan akun profesional atau import manual.",
          502,
        );
      data = discovery.business_discovery.media;
    }
    if (!Array.isArray(data?.data))
      throw new ApiError("Daftar postingan Instagram tidak valid.", 502);
    posts = data.data.slice(0, SOCIAL_IMPORT_LIMIT).map((post) => ({
      id: post.id,
      caption: post.caption,
      url: post.permalink,
      publishedAt: post.timestamp,
    }));
  }
  return posts.slice(0, SOCIAL_IMPORT_LIMIT);
}
export function captionStory(source, post) {
  try {
    const profile = socialProfile(source.type, source.url);
    if (
      typeof post.caption !== "string" ||
      !post.caption.trim() ||
      post.caption.length > 12000
    )
      throw new Error("Caption wajib diisi, maksimal 12.000 karakter.");
    const published = new Date(post.publishedAt);
    if (
      !post.publishedAt ||
      !Number.isFinite(published.valueOf()) ||
      published.valueOf() > Date.now() + 300000
    )
      throw new Error("Tanggal postingan wajib valid dan tidak di masa depan.");
    const url = socialPostUrl(source.type, post.url, profile.username);
    const caption = post.caption.trim();
    const firstLine =
      caption.split(/\r?\n/).find((line) => line.trim()) || caption;
    return {
      title: (firstLine.length < 5
        ? `${source.type} @${profile.username}: ${firstLine}`
        : firstLine
      ).slice(0, 240),
      text: caption,
      script: caption,
      source_name: `${source.name} · ${source.type} @${profile.username}`,
      source_url: url,
      category: "Peristiwa",
      region: source.region,
      priority: "reguler",
      status: "draft",
      published_at: published.toISOString(),
      permission: source.permission,
      social: {
        platform: source.type,
        profile_url: profile.url,
        username: profile.username,
        caption,
        imported_at: new Date().toISOString(),
      },
    };
  } catch (error) {
    throw new ApiError(error.message);
  }
}
export async function importSocialPosts(env, source, posts, saveStory) {
  let added = 0,
    skipped = 0;
  for (const post of posts) {
    let story;
    try {
      story = captionStory(source, post);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      skipped++;
      continue;
    }
    if (!matchesCoverage(story.text, source.region)) {
      skipped++;
      continue;
    }
    try {
      await saveStory(env, story, "source");
      added++;
    } catch (error) {
      if (error.status !== 409) throw error;
      skipped++;
    }
  }
  return {
    added,
    skipped,
    status: `Terhubung · ${added} draft caption baru · ${skipped} dilewati`,
  };
}
