export const isSocial = (type) => ["Instagram", "TikTok"].includes(type);
export const SOCIAL_IMPORT_LIMIT = 10;
export const socialDefaults = {
  mode: "manual",
  instagramUserId: "",
  connectorUrl: "",
};

export function socialProfile(type, value) {
  if (!isSocial(type)) throw new Error("Platform tidak valid.");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Masukkan URL profil yang valid.");
  }
  const instagram = type === "Instagram";
  const host = instagram ? "instagram.com" : "tiktok.com";
  if (
    url.protocol !== "https:" ||
    ![host, "www." + host].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error(`Gunakan URL profil HTTPS ${type}.`);
  const match = url.pathname.match(
    instagram
      ? /^\/([a-zA-Z0-9._]{1,30})\/?$/
      : /^\/@([a-zA-Z0-9._]{1,24})\/?$/,
  );
  if (
    !match ||
    (instagram &&
      [
        "p",
        "reel",
        "reels",
        "stories",
        "explore",
        "accounts",
        "direct",
      ].includes(match[1].toLowerCase()))
  )
    throw new Error("Gunakan URL profil akun, bukan tautan postingan.");
  const username = match[1].toLowerCase();
  return {
    username,
    url: `https://www.${host}/${instagram ? "" : "@"}${username}/`,
  };
}

export function socialPostUrl(type, value, username) {
  const url = new URL(value);
  const host = type === "Instagram" ? "instagram.com" : "tiktok.com";
  if (
    url.protocol !== "https:" ||
    ![host, "www." + host].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("Tautan postingan harus berasal dari platform sumber.");
  if (type === "Instagram") {
    if (!/^\/(p|reel|tv)\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname))
      throw new Error("Gunakan tautan postingan atau reel Instagram.");
  } else {
    const match = url.pathname.match(/^\/@([a-zA-Z0-9._]+)\/video\/\d+\/?$/);
    if (!match || match[1].toLowerCase() !== username)
      throw new Error("Tautan video TikTok harus milik profil sumber.");
  }
  return `https://www.${host}${url.pathname.replace(/\/$/, "")}${type === "Instagram" ? "/" : ""}`;
}
