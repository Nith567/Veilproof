import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
const out = new URL("dist-single/", root);

const html = await readFile(new URL("index.html", dist), "utf8");
const assets = await readdir(new URL("assets/", dist));
const jsFile = assets.find((file) => file.endsWith(".js"));
const cssFile = assets.find((file) => file.endsWith(".css"));

if (!jsFile || !cssFile) {
  throw new Error("Run npm run build before creating the single-file build.");
}

const js = await readFile(new URL(`assets/${jsFile}`, dist), "utf8");
const css = await readFile(new URL(`assets/${cssFile}`, dist), "utf8");
const favicon = await readFile(new URL("favicon.svg", dist));
const safeJs = js.replace(/<\/script/gi, "<\\/script");
const jsHash = createHash("sha256").update(safeJs).digest("base64");
const faviconData = `data:image/svg+xml;base64,${favicon.toString("base64")}`;

const single = html
  .replace(
    /<link rel="icon"[^>]*>/,
    () => `<link rel="icon" type="image/svg+xml" href="${faviconData}" />`,
  )
  .replace(
    /<script type="module"[^>]*><\/script>/,
    () => `<script type="module">${safeJs}</script>`,
  )
  .replace(
    /<link rel="stylesheet"[^>]*>/,
    () => `<style>${css}</style>`,
  )
  .replace(
    /script-src ([^;]+)/,
    (_match, directives) => `script-src ${directives} 'sha256-${jsHash}'`,
  );

await mkdir(out, { recursive: true });
await writeFile(new URL("index.html", out), single);
console.log(
  `single-file build: ${out.pathname}index.html (${single.length} bytes)`,
);
