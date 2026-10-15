export async function api(path, options = {}) {
  const r = await fetch("/api" + path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Permintaan gagal");
  return data;
}
export const send = (path, data, method = "POST") =>
  api(path, { method, body: JSON.stringify(data) });
export function download(data, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
