import { readFile, writeFile, mkdir, readdir, cp } from "node:fs/promises";
import { build } from "esbuild";
const root = new URL("../", import.meta.url);
const path = (p) => new URL(p, root);
await mkdir(path("dist/server"), { recursive: true });
await mkdir(path("dist/.openai"), { recursive: true });
const files = {};
async function walk(dir, prefix = "") {
  for (const f of await readdir(path(dir), { withFileTypes: true })) {
    if (f.isDirectory()) await walk(dir + "/" + f.name, prefix + "/" + f.name);
    else {
      const data = await readFile(path(dir + "/" + f.name));
      const mime = f.name.endsWith(".js")
        ? "text/javascript"
        : f.name.endsWith(".css")
          ? "text/css"
          : f.name.endsWith(".html")
            ? "text/html"
            : f.name.endsWith(".woff2")
              ? "font/woff2"
              : f.name.endsWith(".woff")
                ? "font/woff"
                : f.name.endsWith(".svg")
                  ? "image/svg+xml"
                  : "application/octet-stream";
      files[prefix + "/" + f.name] = { data: data.toString("base64"), mime };
    }
  }
}
await cp(path("shared/regions.NOTICE"), path("dist/client/regions.NOTICE"));
await walk("dist/client");
const client = `const assets=${JSON.stringify(files)};const assetHandler={fetch(req){const url=new URL(req.url);const asset=assets[url.pathname]||(!url.pathname.includes('.')?assets['/index.html']:null);if(!asset)return new Response('Not found',{status:404});const bytes=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':asset.mime,'Cache-Control':url.pathname.startsWith('/assets/')?'public,max-age=31536000,immutable':'private,no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}})}};`;
await build({
  stdin: {
    contents:
      "import apiHandler from './worker/index.js';\n" +
      client +
      "\nexport default {fetch(request,env,ctx){return apiHandler.fetch(request,{...env,ASSETS:assetHandler},ctx)}};",
    resolveDir: root.pathname,
    sourcefile: "sites-entry.js",
  },
  bundle: true,
  outfile: path("dist/server/index.js").pathname,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
});
await cp(path(".openai/hosting.json"), path("dist/.openai/hosting.json"));
await cp(path("drizzle"), path("dist/.openai/drizzle"), { recursive: true });
await writeFile(
  path("dist/server/wrangler.json"),
  JSON.stringify(
    {
      name: "pasuruan-ai-news-tv",
      main: "index.js",
      compatibility_date: "2026-10-15",
      compatibility_flags: ["nodejs_compat"],
      ai: { binding: "AI" },
      d1_databases: [
        {
          binding: "DB",
          database_name: "site-creator-d1",
          database_id: "00000000-0000-4000-8000-000000000000",
          migrations_dir: "../.openai/drizzle",
        },
      ],
      r2_buckets: [{ binding: "BUCKET", bucket_name: "site-creator-r2" }],
      observability: { enabled: true },
    },
    null,
    2,
  ),
);
console.log("Built frontend, Worker, D1 migrations, and hosting manifest.");
