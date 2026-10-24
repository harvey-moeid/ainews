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
export async function refreshSources(
  sources,
  { id, force = false, request = send } = {},
) {
  const results = [];
  // Each source gets its own Worker invocation and database query allowance.
  for (const source of sources.filter(
    (item) => item.active && (!id || item.id === id),
  )) {
    try {
      const result = await request("/refresh", { id: source.id, force });
      results.push(
        ...result.results.map((entry) => ({
          id: source.id,
          name: source.name,
          ...entry,
        })),
      );
    } catch (error) {
      results.push({
        id: source.id,
        name: source.name,
        error: true,
        status: error.message,
      });
    }
  }
  return { results };
}
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
