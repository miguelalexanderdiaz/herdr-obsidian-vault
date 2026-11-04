// Pictures for the reader, cached under data/vault/cache (never inside a mod
// folder: Herdr reloads a mod whose folder changes). image() only loads files
// under the app's folder, so vault images are copied there too.
//
// Each cached picture: <key>.png (or its own extension) + <key>.json
//   { w, h } in logical px, or { error }.

import { exec, appHome } from "herdr";
import * as fs from "fs/promises";

const REL = "data/vault/cache";
const abs = (rel) => `${appHome()}/${rel}`;
const BATCH = 12;

// FNV-1a, twice with different seeds: a 64-bit key as hex.
export function hash(s) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

// The login shell runs it, so Homebrew's node is on PATH (the app's own PATH lacks it).
const viaShell = (script, ...rest) => exec("sh", ["-c", `exec "\${SHELL:-sh}" -lc '${script}' "$@"`, "sh", ...rest]);

async function meta(key) {
  try { return JSON.parse(await fs.readFile(abs(`${REL}/${key}.json`), "utf8")); } catch { return null; }
}

let dirReady = false;
async function ensureDir() {
  if (dirReady) return;
  await fs.mkdir(abs(REL), { recursive: true }).catch(() => {});
  dirReady = true;
}

// The theme part of a picture's key: a new theme draws new pictures.
export function themeKey(t) {
  return [t.foreground, t.background, t.muted, t.accent, t.surface, t.raised, t.border].join(",");
}

// Mermaid / math / Excalidraw through render/render.mjs (headless Chrome).
// jobs: [{ key, kind, src?, display?, file? }]; returns Map key → { path, w, h } | { error }.
export async function renderJobs(jobs, theme, onBatch) {
  await ensureDir();
  const out = new Map();
  const todo = [];
  for (const j of jobs) {
    const m = await meta(j.key);
    if (m) out.set(j.key, m.error ? { error: m.error } : { path: `${REL}/${j.key}.png`, w: m.w, h: m.h });
    else todo.push(j);
  }
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const spec = { theme, jobs: batch.map((j) => ({ id: j.key, kind: j.kind, src: j.src, display: j.display, file: j.file, out: abs(`${REL}/${j.key}`) })) };
    const file = abs(`${REL}/jobs-${batch[0].key}.json`);
    await fs.writeFile(file, JSON.stringify(spec));
    let failed = null;
    try {
      const r = await viaShell('exec node "$0" "$1" "$2"', abs("mods/vault-reader/render/render.mjs"), appHome(), file);
      if (r.code !== 0) failed = (r.stdout || r.stderr || "renderer failed").slice(0, 400);
    } catch (e) { failed = String(e?.message ?? e); }
    await fs.unlink(file).catch(() => {});
    for (const j of batch) {
      const m = await meta(j.key);
      out.set(j.key, m && !m.error ? { path: `${REL}/${j.key}.png`, w: m.w, h: m.h } : { error: m?.error ?? failed ?? "Not rendered" });
    }
    onBatch?.(out);
  }
  return out;
}

// stat for many files at once: Map path → "mtime:size" (missing files left out).
export async function stamps(paths) {
  const res = new Map();
  if (!paths.length) return res;
  const r = await exec("stat", ["-f", "%m:%z %N", ...paths]).catch(() => null);
  for (const line of (r?.stdout ?? "").split("\n")) {
    const m = line.match(/^(\d+:\d+) (.*)$/);
    if (m) res.set(m[2], m[1]);
  }
  return res;
}

async function size(file) {
  if (/\.svg$/i.test(file)) {
    const text = await fs.readFile(file, "utf8").catch(() => "");
    const head = text.slice(0, 2000);
    const num = (re) => Number((head.match(re) || [])[1]) || null;
    let w = num(/<svg[^>]*\swidth="([\d.]+)(?:px)?"/), h = num(/<svg[^>]*\sheight="([\d.]+)(?:px)?"/);
    const vb = head.match(/viewBox="[\d.\-]+[ ,]+[\d.\-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/);
    if ((!w || !h) && vb) { w = Number(vb[1]); h = Number(vb[2]); }
    return { w: w ?? 400, h: h ?? 300 };
  }
  const r = await exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]).catch(() => null);
  const w = Number((r?.stdout.match(/pixelWidth:\s*(\d+)/) || [])[1]);
  const h = Number((r?.stdout.match(/pixelHeight:\s*(\d+)/) || [])[1]);
  if (!w || !h) throw new Error("Not an image this reader can show");
  return { w, h };
}

// A vault image (absolute path) → { path, w, h } | { error }, at its pixel size
// (as Obsidian shows it), fitted to the column when drawn.
export async function vaultImage(file, stamp) {
  await ensureDir();
  const ext = (file.match(/\.(\w+)$/) || [, "png"])[1].toLowerCase();
  const key = hash(`img:${file}:${stamp}`);
  const m = await meta(key);
  if (m) return m.error ? { error: m.error } : { path: `${REL}/${key}.${ext}`, w: m.w, h: m.h };
  try {
    const dest = abs(`${REL}/${key}.${ext}`);
    const cp = await exec("cp", [file, dest]);
    if (cp.code !== 0) throw new Error(cp.stderr || "Couldn't copy the image");
    const { w, h } = await size(dest);
    await fs.writeFile(abs(`${REL}/${key}.json`), JSON.stringify({ w, h }));
    return { path: `${REL}/${key}.${ext}`, w, h };
  } catch (e) {
    const error = String(e?.message ?? e);
    await fs.writeFile(abs(`${REL}/${key}.json`), JSON.stringify({ error })).catch(() => {});
    return { error };
  }
}

// A PDF's first page, through Quick Look → { path, w, h } | { error }.
export async function pdfPage(file, stamp) {
  await ensureDir();
  const key = hash(`pdf2:${file}:${stamp}`);
  const m = await meta(key);
  if (m) return m.error ? { error: m.error } : { path: `${REL}/${key}.png`, w: m.w, h: m.h };
  try {
    const tmp = abs(`${REL}/ql-${key}`);
    await fs.mkdir(tmp, { recursive: true });
    const r = await exec("qlmanage", ["-t", "-s", "2400", "-o", tmp, file]);
    const made = (await fs.readdir(tmp)).find((f) => f.endsWith(".png"));
    if (!made) throw new Error(r.stderr?.trim() || "Quick Look made no preview");
    await exec("mv", [`${tmp}/${made}`, abs(`${REL}/${key}.png`)]);
    await fs.rmdir(tmp).catch(() => {});
    const { w, h } = await size(abs(`${REL}/${key}.png`));
    const shown = { w: Math.round(w / 2), h: Math.round(h / 2) };
    await fs.writeFile(abs(`${REL}/${key}.json`), JSON.stringify(shown));
    return { path: `${REL}/${key}.png`, ...shown };
  } catch (e) {
    const error = String(e?.message ?? e);
    await fs.writeFile(abs(`${REL}/${key}.json`), JSON.stringify({ error })).catch(() => {});
    return { error };
  }
}

// Poppler's tools (Homebrew), when installed: every PDF page, not just the first.
const tools = new Map();
async function tool(name) {
  if (tools.has(name)) return tools.get(name);
  let found = null;
  for (const p of [name, `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`]) {
    const r = await exec(p, ["-v"]).catch(() => null);
    if (r?.code === 0) { found = p; break; }
  }
  tools.set(name, found);
  return found;
}

// How many pages a PDF has → { pages } | { error } (no poppler: { error }).
export async function pdfInfo(file, stamp) {
  await ensureDir();
  const key = hash(`pdfinfo:${file}:${stamp}`);
  const m = await meta(key);
  if (m) return m;
  const bin = await tool("pdfinfo");
  if (!bin) return { error: "no pdfinfo" }; // not cached: installing poppler fixes it
  const r = await exec(bin, [file]).catch((e) => ({ code: 1, stderr: String(e) }));
  const pages = Number((r.stdout?.match(/^Pages:\s+(\d+)/m) || [])[1]);
  const res = r.code === 0 && pages ? { pages } : { error: (r.stderr || "Couldn't read the PDF").trim().slice(0, 200) };
  await fs.writeFile(abs(`${REL}/${key}.json`), JSON.stringify(res)).catch(() => {});
  return res;
}

// Page n (from 1) of a PDF, drawn at 2x → { path, w, h } | { error }.
export async function pdfPageAt(file, stamp, n) {
  await ensureDir();
  const key = hash(`pdfpage:${file}:${stamp}:${n}`);
  const m = await meta(key);
  if (m) return m.error ? { error: m.error } : { path: `${REL}/${key}.png`, w: m.w, h: m.h };
  const bin = await tool("pdftoppm");
  if (!bin) return { error: "no pdftoppm" };
  try {
    const r = await exec(bin, ["-png", "-r", "144", "-f", String(n), "-l", String(n), "-singlefile", file, abs(`${REL}/${key}`)]);
    if (r.code !== 0) throw new Error(r.stderr?.trim() || `Couldn't draw page ${n}`);
    const { w, h } = await size(abs(`${REL}/${key}.png`));
    const shown = { w: Math.round(w / 2), h: Math.round(h / 2) };
    await fs.writeFile(abs(`${REL}/${key}.json`), JSON.stringify(shown));
    return { path: `${REL}/${key}.png`, ...shown };
  } catch (e) {
    const error = String(e?.message ?? e);
    await fs.writeFile(abs(`${REL}/${key}.json`), JSON.stringify({ error })).catch(() => {});
    return { error };
  }
}

// An image on the web → { path, w, h } | { error }.
export async function remoteImage(url) {
  await ensureDir();
  const ext = ((url.split("?")[0].match(/\.(png|jpe?g|gif|webp|svg)$/i) || [, "png"])[1]).toLowerCase();
  const key = hash(`url:${url}`);
  const m = await meta(key);
  if (m) return m.error ? { error: m.error } : { path: `${REL}/${key}.${ext}`, w: m.w, h: m.h };
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    await fs.writeFile(abs(`${REL}/${key}.${ext}`), buf);
    const { w, h } = await size(abs(`${REL}/${key}.${ext}`));
    await fs.writeFile(abs(`${REL}/${key}.json`), JSON.stringify({ w, h }));
    return { path: `${REL}/${key}.${ext}`, w, h };
  } catch (e) {
    const error = String(e?.message ?? e);
    await fs.writeFile(abs(`${REL}/${key}.json`), JSON.stringify({ error })).catch(() => {});
    return { error };
  }
}

// A generated SVG (canvas edges) → its path.
export async function svgFile(text) {
  await ensureDir();
  const key = hash(`svg:${text}`);
  const rel = `${REL}/${key}.svg`;
  if (!(await fs.exists(abs(rel)).catch(() => false))) await fs.writeFile(abs(rel), text);
  return rel;
}
