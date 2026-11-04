#!/usr/bin/env node
// Draws the documentation pictures from the real parts: docs/assets/layout.svg (the overview) and
// docs/assets/feature-*.svg (one per feature in the docs' and the README's feature lists).
//
//   node scripts/make-pictures.mjs            write the pictures
//   node scripts/make-pictures.mjs --check    exit 1 if a picture on disk differs from a fresh drawing
//
// They are drawings, not screenshots (scripts/PREVIEW.md still describes the one screenshot the author takes by hand).
// What they are drawn from:
//   - Content: examples/sample-vault only. The tree is built with the panel's own rules (mods/vault/tree.js:
//     folders first, natural order, no dot files; labels and kinds as in mods/vault/main.js). The search
//     results come from the panel's own search (mods/vault/search-core.js) run with ripgrep. The note is
//     built by the reader's own parser (mods/vault-reader/doc.js, parse.js), so the properties, callouts,
//     wikilinks, task marks and table are what the reader gets.
//   - Geometry: the numbers in the render code of mods/vault/main.js (header 42, rows 28, indent 16, icons
//     12/14/15, radii 6/7/10, text 13/12.5/12/11) and mods/vault-reader/main.js (bar 40, column padding 30/18,
//     block gap 12, text 15, properties key column 130, chips, callouts px 14 py 10 radius 6, the callout
//     colors and icons, the Keep and Close buttons). The reader opens at 0.78 x 0.86 of the window.
//   - Icons: the mods' own Lucide files in mods/vault/icons, mods/vault-reader/icons and mods/vault/vault.svg,
//     inlined (ISC; see NOTICE).
//   - Colors: Herdr's built-in graphite theme (the default: the layouts set no theme), read from Herdr's
//     themes() API. EXACT: background #17191d, canvas #131518, chrome #101114, raised #2c2e31, popover #25272b,
//     foreground #eeeeef, muted #98999b, dim #696a6d, accent #96b2d7, accent_foreground #17191d, and hover
//     #ffffff0e, selected #ffffff17, border #ffffff18 (alpha colors, flattened here onto what is under them).
// APPROXIMATED (not readable from Herdr): the text that TextView.markdown draws (heading sizes follow the
// reader's own flow headings 26/22/19, paragraph and list spacing, the task boxes and the table rules), line
// heights (1.6), the overlay window's frame and shadow, the popup's frame, and text widths (estimated per
// character in the Helvetica metrics; the pictures use Helvetica, Arial or Liberation Sans in place of Geist, Herdr's
// UI font, because a README <img> cannot load web fonts and those three break lines in the same places).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VAULT = path.join(ROOT, "examples", "sample-vault");
const OUT = path.join(ROOT, "docs", "assets");
const CHECK = process.argv.includes("--check");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { folderEntries } = await imp("mods/vault/tree.js");
const { searchWith } = await imp("mods/vault/search-core.js");
const { buildDoc } = await imp("mods/vault-reader/doc.js");
const { makeResolver } = await imp("mods/vault-reader/parse.js");

// ---------------------------------------------------------------- graphite (exact, see the header)

const T = {
  background: "#17191d", canvas: "#131518", chrome: "#101114", raised: "#2c2e31", popover: "#25272b",
  foreground: "#eeeeef", muted: "#98999b", dim: "#696a6d", accent: "#96b2d7", accent_foreground: "#17191d",
  hover: "#ffffff0e", selected: "#ffffff17", border: "#ffffff18",
};
function over(base, color) {
  // An #rrggbbaa color flattened onto an #rrggbb base.
  if (color.length !== 9) return color;
  const a = parseInt(color.slice(7), 16) / 255;
  const p = (h, i) => parseInt(h.slice(i, i + 2), 16);
  return "#" + [1, 3, 5].map((i) => Math.round(p(color, i) * a + p(base, i) * (1 - a)).toString(16).padStart(2, "0")).join("");
}
const on = (base) => ({ hover: over(base, T.hover), selected: over(base, T.selected), border: over(base, T.border) });
// The reader's callout table (mods/vault-reader/main.js CALLOUT): [icon, color].
const CALLOUT = { note: ["pencil", "#027aff"], tip: ["flame", "#53dfdd"], success: ["check-circle", "#44cf6e"],
  warning: ["alert-triangle", "#e9973f"], example: ["list", "#a882ff"] };

const UI = "Helvetica, Arial, 'Liberation Sans', sans-serif"; // stands in for Geist, Herdr's UI font (see the header)
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const LH = 1.6;

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v) => Math.round(v * 10) / 10;
const rect = (x, y, w, h, fill, { r = 0, stroke, sw = 1 } = {}) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${r ? ` rx="${r}"` : ""} fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}/>`;
const line = (x1, y1, x2, y2, stroke) => `<path d="M${n(x1)} ${n(y1)}H${n(x2)}${y2 !== y1 ? `V${n(y2)}` : ""}" stroke="${stroke}" stroke-width="1" fill="none"/>`;
function text(x, y, s, { size = 13, fill = T.foreground, weight = 400, font = UI, italic = false, strike = false, anchor } = {}) {
  return `<text x="${n(x)}" y="${n(y)}" font-family="${font}" font-size="${size}"${weight !== 400 ? ` font-weight="${weight}"` : ""}${italic ? ' font-style="italic"' : ""}${strike ? ' text-decoration="line-through"' : ""}${anchor ? ` text-anchor="${anchor}"` : ""} fill="${fill}">${esc(s)}</text>`;
}
// Advance widths (1/1000 em) of U+0020..U+007E in the Helvetica metrics, which Arial, Helvetica and Liberation Sans
// share; the pictures name those fonts so that the lines break where they are drawn on every system.
const ADV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const ADV_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const OTHER = { "…": 1000, "›": 333, "•": 350, "↑": 500, "↓": 500, "‘": 222, "’": 222, "“": 333, "”": 333, "–": 556, "—": 1000, "·": 333, "◐": 800, "⊘": 800, "↪": 900 };
function width(s, size, { weight = 400, mono = false } = {}) {
  if (mono) return [...s].length * size * 0.6; // JetBrains Mono: 600/1000 per character
  const table = weight >= 600 ? ADV_BOLD : ADV;
  let w = 0;
  for (const c of s) {
    const code = c.codePointAt(0);
    w += code >= 32 && code < 127 ? table[code - 32] : OTHER[c] ?? 1000;
  }
  return (w / 1000) * size;
}

// The mods' icon files, inlined once each as <symbol>s and placed with <use> (color via currentColor).
const ICON_FILES = {};
for (const dir of ["mods/vault/icons", "mods/vault-reader/icons"]) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) if (f.endsWith(".svg")) ICON_FILES[`${dir === "mods/vault/icons" ? "vault" : "reader"}:${f.slice(0, -4)}`] = path.join(ROOT, dir, f);
}
ICON_FILES["vault:vault"] = path.join(ROOT, "mods/vault/vault.svg");
function iconSet() {
  const used = new Set();
  const use = (name, x, y, size, color) => {
    if (!ICON_FILES[name]) throw new Error(`no icon ${name}`);
    used.add(name);
    return `<use href="#${name.replace(":", "-")}" x="${n(x)}" y="${n(y)}" width="${size}" height="${size}" color="${color}"/>`;
  };
  const defs = () => [...used].sort().map((name) => {
    const src = fs.readFileSync(ICON_FILES[name], "utf8");
    const inner = src.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
    return `<symbol id="${name.replace(":", "-")}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</symbol>`;
  }).join("\n");
  return { use, defs };
}

// ---------------------------------------------------------------- content from the sample vault

const label = (name) => name.replace(/\.excalidraw\.md$/i, "").replace(/\.(md|canvas)$/i, ""); // mods/vault/main.js
function kind(name) { // mods/vault/main.js
  if (/\.excalidraw(\.md)?$/i.test(name)) return "drawing";
  if (/\.md$/i.test(name)) return "note";
  if (/\.canvas$/i.test(name)) return "canvas";
  if (/\.(png|jpe?g|gif|webp|svg|bmp|avif|tiff?)$/i.test(name)) return "image";
  if (/\.pdf$/i.test(name)) return "pdf";
  return "other";
}
const ICONS = { note: "file-text", drawing: "pen-tool", canvas: "canvas", image: "image", pdf: "pdf", other: "file" };
const list = (rel) => folderEntries(fs.readdirSync(path.join(VAULT, rel), { withFileTypes: true }), label, 1000).items;
function treeRows(open, prefix = "", depth = 0, out = []) {
  for (const e of list(prefix)) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    out.push({ ...e, rel, depth, expanded: e.dir && open.has(rel) });
    if (e.dir && open.has(rel)) treeRows(open, rel, depth + 1, out);
  }
  return out;
}
function walk(dir, p = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith("."))
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), `${p}${e.name}/`) : [`${p}${e.name}`]));
}
async function searchResults(query) {
  const deps = {
    platform: process.platform,
    tool: async (name) => { try { execFileSync(name, ["--version"], { stdio: "ignore" }); return name; } catch { return null; } },
    exec: async (cmd, args, { cwd }) => {
      try { return { code: 0, stdout: execFileSync(cmd, args, { cwd, encoding: "utf8" }), stderr: "" }; }
      catch (e) { return { code: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" }; }
    },
  };
  return searchWith(deps, VAULT, query);
}
async function note(file) {
  const env = { read: async (f) => { try { return fs.readFileSync(path.join(VAULT, f), "utf8"); } catch { return null; } },
    exists: async () => true, resolve: makeResolver(walk(VAULT)), deps: new Set(), abs: (f) => path.join(VAULT, f) };
  return buildDoc(file, null, 0, env);
}

// ---------------------------------------------------------------- the Vault panel (mods/vault/main.js)

const OPEN_FILE = "Feature tour.md";
const VAULT_NAME = "sample-vault";
const VAULT_PATH = "~/code/herdr-obsidian-vault/examples/sample-vault"; // a made-up location of a clone

function panel(I, x, y, w, h, { open, query = "", results = null, menu = false } = {}) {
  const bg = T.background, c = on(bg);
  let o = `<g>`;
  o += rect(x + 0.5, y + 0.5, w - 1, h - 1, bg, { r: 10, stroke: c.border });
  // Header: 42 tall, px 8, gap 6; the picker (flex 1, h 28, px 8, gap 7) and Add vault (h 28, px 8, gap 5, text 12).
  const hy = y + 21;
  const addW = 8 + 13 + 5 + width("Add vault", 12) + 8;
  const pickW = w - 16 - 6 - addW;
  if (menu) o += rect(x + 8, y + 7, pickW, 28, c.hover, { r: 6 });
  o += I.use("vault:vault", x + 16, hy - 7.5, 15, T.muted);
  o += text(x + 16 + 15 + 7, hy + 4.5, VAULT_NAME, { size: 13, weight: 600 });
  o += I.use("vault:chevron-down", x + 16 + 15 + 7 + width(VAULT_NAME, 13, { weight: 600 }) + 7, hy - 6, 12, T.dim);
  const ax = x + w - 8 - addW;
  o += I.use("vault:plus", ax + 8, hy - 6.5, 13, T.muted) + text(ax + 8 + 13 + 5, hy + 4, "Add vault", { size: 12, fill: T.muted });
  o += line(x + 1, y + 42.5, x + w - 1, y + 42.5, c.border);
  // Search box: px 8, pt 8, pb 4; the box h 30, px 9, gap 7, radius 7, border (accent while there is a query).
  const sy = y + 43 + 8;
  o += rect(x + 8.5, sy + 0.5, w - 17, 29, bg, { r: 7, stroke: query ? T.accent : c.border });
  o += I.use("vault:search", x + 8 + 9, sy + 8.5, 13, T.dim);
  o += text(x + 8 + 9 + 13 + 7, sy + 19.5, query || "Search notes…", { size: 12.5, fill: query ? T.foreground : T.dim });
  if (query) o += I.use("vault:x", x + w - 8 - 9 - 16 + 2, sy + 9, 12, T.dim);
  let ry = sy + 30 + 4;
  if (results) {
    // Results: px 6; a status line (11, dim, px 8 pt 2 pb 4), then per result px 8 py 5 gap 2, radius 7.
    ry += 2;
    const status = `${results.length} note${results.length === 1 ? "" : "s"} · ↑↓ Enter · Esc clears`;
    o += text(x + 6 + 8, ry + 11, status, { size: 11, fill: T.dim });
    ry += 18 + 4;
    results.forEach((r, i) => {
      const name = r.rel.split("/").pop(), folder = r.rel.includes("/") ? r.rel.slice(0, r.rel.lastIndexOf("/")) : "";
      const k = kind(name), here = r.rel === OPEN_FILE;
      const rh = 5 + 21 + (r.text ? 2 + 18 : 0) + 5;
      if (here) o += rect(x + 6, ry, w - 12, rh, c.selected, { r: 7 });
      else if (i === 0) o += rect(x + 6, ry, w - 12, rh, c.hover, { r: 7 });
      const ty = ry + 5 + 10.5;
      o += I.use(`vault:${ICONS[k]}`, x + 14, ty - 7, 14, here ? T.accent : T.muted);
      o += text(x + 14 + 14 + 7, ty + 4.5, label(name), { size: 13, fill: k === "note" || here ? T.foreground : T.muted });
      if (folder) o += text(x + 14 + 21 + width(label(name), 13) + 7, ty + 4, folder, { size: 11, fill: T.dim });
      if (r.text) o += text(x + 14 + 21, ty + 2 + 18 + 1, r.text.length > 44 ? r.text.slice(0, 43) + "…" : r.text, { size: 11.5, fill: T.muted });
      ry += rh;
    });
  } else {
    // Tree: p 6; rows h 28, pl 8 + depth * 16, pr 8, gap 7, radius 7; chevron 12, icon 14.
    ry += 6 - 4 + 4;
    for (const r of treeRows(open)) {
      const k = r.dir ? null : kind(r.name), sel = r.rel === OPEN_FILE;
      if (sel) o += rect(x + 6, ry, w - 12, 28, c.selected, { r: 7 });
      let cx = x + 6 + 8 + r.depth * 16;
      const cy = ry + 14;
      if (r.dir) o += I.use(`vault:chevron-${r.expanded ? "down" : "right"}`, cx, cy - 6, 12, T.dim);
      cx += 12 + 7;
      o += I.use(`vault:${r.dir ? "folder" : ICONS[k]}`, cx, cy - 7, 14, sel ? T.accent : T.muted);
      o += text(cx + 14 + 7, cy + 4.5, r.dir ? r.name : label(r.name), { size: 13, fill: r.dir || k === "note" || sel ? T.foreground : T.muted });
      ry += 28;
    }
  }
  o += `</g>`;
  if (menu) o += pickerMenu(I, x + 8, y + 7 + 28 + 4);
  return o;
}

// The picker's popup (mods/vault/main.js menu()): w 300, p 4, gap 1, on raised; the popup frame is Herdr's (approximated).
function pickerMenu(I, x, y) {
  const w = 300, bg = T.raised, c = on(bg);
  const rows = [];
  let h = 4;
  const vaultRow = 6 + 20 + 17 + 6;
  rows.push({ y: h, h: vaultRow, kind: "vault" }); h += vaultRow + 1;
  rows.push({ y: h, h: 32, kind: "add" }); h += 32 + 1;
  rows.push({ y: h, h: 32, kind: "import" }); h += 32 + 4;
  let o = `<g>`;
  o += rect(x, y + 6, w, h, "#00000055", { r: 8 }).replace("<rect", '<rect opacity=".6"');
  o += rect(x + 0.5, y + 0.5, w - 1, h - 1, bg, { r: 8, stroke: c.border });
  for (const r of rows) {
    const ry = y + r.y, ix = x + 4 + 8;
    if (r.kind === "vault") {
      o += I.use("vault:check", ix, ry + r.h / 2 - 6.5, 13, T.accent);
      o += text(ix + 13 + 8, ry + 6 + 14, VAULT_NAME, { size: 12.5 });
      o += text(ix + 13 + 8, ry + 6 + 20 + 12, VAULT_PATH, { size: 11, fill: T.dim });
      o += I.use("vault:x", x + w - 4 - 8 - 22 + 5, ry + r.h / 2 - 6, 12, T.dim);
    } else {
      const [icon, label] = r.kind === "add" ? ["vault:plus", "Add vault…"] : ["vault:book-open", "Import from Obsidian"];
      o += I.use(icon, ix, ry + 16 - 6.5, 13, T.muted) + text(ix + 13 + 8, ry + 16 + 4.5, label, { size: 12.5, fill: T.muted });
    }
  }
  return o + `</g>`;
}

// ---------------------------------------------------------------- the reader (mods/vault-reader/main.js)

// Inline Markdown as TextView shows it (approximated): **bold**, *italic*, ~~struck~~, `code`, [links](...).
function runs(src) {
  const out = [];
  const re = /\*\*(.+?)\*\*|~~(.+?)~~|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*([^*]+)\*/g;
  let last = 0, m;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ t: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: m[1], bold: true });
    else if (m[2] !== undefined) out.push({ t: m[2], strike: true });
    else if (m[3] !== undefined) out.push({ t: m[3], code: true });
    else if (m[4] !== undefined) out.push({ t: m[4], link: true });
    else out.push({ t: m[6], italic: true });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ t: src.slice(last) });
  return out;
}
// Lays runs out in lines of at most `w`; returns { svg, h }.
function para(src, x, y, w, { size = 15, color = T.foreground, weight = 400, base = T.background } = {}) {
  const words = [];
  for (const r of runs(src)) {
    const parts = r.code ? [r.t] : r.t.split(/(\s+)/).filter((s) => s.length);
    for (const p of parts) words.push({ ...r, t: p, space: /^\s+$/.test(p) });
  }
  const lh = size * LH;
  let o = "", cx = 0, cy = 0;
  const wOf = (wd) => (wd.code ? width(wd.t, size - 2, { mono: true }) + (wd.space ? 0 : 8) : width(wd.t, size, { weight: wd.bold ? 700 : weight }));
  for (const wd of words) {
    if (wd.space) { if (cx > 0) cx += width(" ", size); continue; }
    const ww = wOf(wd);
    if (cx > 0 && cx + ww > w) { cx = 0; cy += lh; }
    const tx = x + cx, ty = y + cy + lh / 2 + size * 0.35;
    if (wd.code) {
      o += rect(tx, y + cy + (lh - size * 1.35) / 2, ww, size * 1.35, T.raised, { r: 4 });
      o += text(tx + 4, ty, wd.t, { size: size - 2, font: MONO, fill: color });
    } else {
      o += text(tx, ty, wd.t, { size, weight: wd.bold ? 700 : weight, italic: wd.italic, strike: wd.strike, fill: wd.link ? T.accent : color });
    }
    cx += ww;
  }
  return { svg: o, h: cy + lh };
}
function taskBox(I, x, y, done, size) {
  const s = size * 0.95;
  let o = rect(x + 0.5, y + 0.5, s - 1, s - 1, done ? T.accent : "none", { r: 3, stroke: done ? T.accent : T.muted });
  if (done) o += `<path d="M${n(x + s * 0.25)} ${n(y + s * 0.52)}l${n(s * 0.18)} ${n(s * 0.18)} ${n(s * 0.33)}-${n(s * 0.38)}" stroke="${T.accent_foreground}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  return o;
}
// A TextView Markdown block (approximated): headings, paragraphs, lists with tasks, tables.
function markdown(I, src, x, y, w, { size = 15, base = T.background } = {}) {
  const lines = src.replace(/^\n+/, "").replace(/\n+$/, "").split("\n");
  let o = "", cy = 0, first = true;
  const gap = () => { if (!first) cy += size * 0.8; first = false; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const hs = [0, 26, 22, 19, 17, 16, 15][h[1].length];
      if (!first) cy += size * 0.6;
      gap();
      const r = para(h[2], x, y + cy, w, { size: hs, weight: 700 });
      o += r.svg; cy += r.h;
      continue;
    }
    if (/^\s*\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      i--;
      const cells = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      gap();
      const cols = cells[0].length, rh = size * LH + 12;
      const colW = cells[0].map((_, j) => Math.max(...cells.map((r) => width(r[j] ?? "", size, { weight: j >= 0 && r === cells[0] ? 700 : 400 }))) + 24);
      const tw = colW.reduce((a, b) => a + b, 0);
      const border = on(base).border;
      o += rect(x + 0.5, y + cy + 0.5, tw - 1, rh * cells.length - 1, "none", { stroke: border });
      cells.forEach((r, ri) => {
        let cx = x;
        if (ri > 0) o += line(x, y + cy + rh * ri + 0.5, x + tw, y + cy + rh * ri + 0.5, border);
        r.forEach((c, j) => {
          if (j > 0 && ri === 0) o += `<path d="M${n(cx + 0.5)} ${n(y + cy)}V${n(y + cy + rh * cells.length)}" stroke="${border}" fill="none"/>`;
          o += para(c, cx + 12, y + cy + rh * ri + 6, colW[j], { size, weight: ri === 0 ? 700 : 400 }).svg;
          cx += colW[j];
        });
      });
      cy += rh * cells.length;
      continue;
    }
    const li = l.match(/^(\s*)[-*+]\s+(.*)$/);
    if (li) {
      if (first || !/^\s*[-*+]\s/.test(lines[i - 1] ?? "")) gap();
      else cy += 4;
      const indent = 24;
      let body = li[2], mark = null;
      const task = body.match(/^\[([ xX])\]\s+(.*)$/);
      if (task) { mark = task[1] !== " "; body = task[2]; }
      const lh = size * LH;
      if (mark === null) o += text(x + 6, y + cy + lh / 2 + size * 0.35, "•", { size, fill: T.foreground });
      else o += taskBox(I, x + 2, y + cy + (lh - size * 0.95) / 2, mark, size);
      const r = para(body, x + indent, y + cy, w - indent, { size, color: mark ? T.muted : T.foreground });
      o += r.svg; cy += r.h;
      continue;
    }
    // A paragraph: consecutive plain lines.
    const buf = [l];
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#{1,6}\s|\s*[-*+]\s|\s*\|)/.test(lines[i + 1])) buf.push(lines[++i]);
    gap();
    const r = para(buf.join(" "), x, y + cy, w, { size });
    o += r.svg; cy += r.h;
  }
  return { svg: o, h: cy };
}
function callout(I, b, x, y, w) {
  const [icon, color] = CALLOUT[b.kind] ?? CALLOUT.note;
  const open = b.fold !== "-", foldable = b.fold === "+" || b.fold === "-";
  const tint = over(T.background, color + "1c");
  let inner = "", cy = 10;
  const th = 15 * LH;
  inner += I.use(`reader:${icon}`, x + 14, y + cy + th / 2 - 8, 16, color);
  inner += text(x + 14 + 16 + 8, y + cy + th / 2 + 5, b.title, { size: 15, weight: 600, fill: color });
  if (foldable) inner += I.use(`reader:chevron-${open ? "down" : "right"}`, x + w - 14 - 14, y + cy + th / 2 - 7, 14, color);
  cy += th;
  if (open) {
    for (const c of b.body) {
      cy += 6;
      if (c.type === "callout") {
        const r = callout(I, c, x + 14, y + cy, w - 28);
        inner += r.svg; cy += r.h;
      } else {
        const r = markdown(I, c.text, x + 14, y + cy, w - 28, { base: tint });
        inner += r.svg; cy += r.h;
      }
    }
  }
  cy += 10;
  return { svg: rect(x, y, w, cy, tint, { r: 6 }) + inner, h: cy };
}
function properties(I, props, x, y, w) {
  let o = "", cy = 0;
  const lh = 13 * LH;
  props.forEach(([k, v], i) => {
    if (i) cy += 3;
    o += text(x, y + cy + lh / 2 + 4.5, k, { size: 13, fill: T.dim });
    if (Array.isArray(v)) {
      let cx = x + 130 + 12;
      for (const item of v) {
        const s = k === "tags" ? `#${String(item).replace(/^#/, "")}` : String(item);
        const cw = width(s, 12.5) + 14;
        o += rect(cx, y + cy + (lh - 21) / 2, cw, 21, T.raised, { r: 4 });
        o += text(cx + 7, y + cy + lh / 2 + 4.3, s, { size: 12.5 });
        cx += cw + 4;
      }
    } else o += text(x + 130 + 12, y + cy + lh / 2 + 4.5, String(v), { size: 13 });
    cy += lh;
  });
  cy += 10;
  o += line(x, y + cy + 0.5, x + w, y + cy + 0.5, on(T.background).border);
  return { svg: o, h: cy + 1 };
}
// The reader window: the bar (h 40, px 12, gap 8, on chrome) and the column (px 30, pt 18, gap 12) of a note,
// clipped to the window's height. `until` stops after the block that ends with that text (a crop of the note).
async function reader(I, id, x, y, w, h, file, until) {
  const d = await note(file);
  const c = on(T.chrome);
  let o = `<g>`;
  o += rect(x - 2, y + 10, w + 4, h, "#000000", { r: 12 }).replace("<rect", '<rect opacity=".35"');
  o += `<clipPath id="${id}-clip"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/></clipPath>`;
  o += `<g clip-path="url(#${id}-clip)">`;
  o += rect(x, y, w, h, T.background);
  o += rect(x, y, w, 40, T.chrome) + line(x, y + 40.5, x + w, y + 40.5, c.border);
  const by = y + 20;
  o += I.use("vault:vault", x + 12, by - 7.5, 15, T.muted);
  o += text(x + 12 + 15 + 8, by + 5, label(file), { size: 13.5, weight: 600 });
  // Keep ▾ and Close (buttons h 24, px 7, gap 5, text 12.5, muted).
  const closeX = x + w - 12 - 28;
  o += I.use("reader:x", closeX + 7, by - 7, 14, T.muted);
  const keepW = 7 + width("Keep", 12.5) + 4 + 11 + 7, keepX = closeX - 8 - keepW;
  o += text(keepX + 7, by + 4.5, "Keep", { size: 12.5, fill: T.muted });
  o += I.use("reader:chevron-down", keepX + 7 + width("Keep", 12.5) + 4, by - 5.5, 11, T.muted);
  // The column.
  const cw = Math.min(1040, w - 60), cx = x + (w - cw) / 2;
  let cy = y + 41 + 18;
  const blocks = [];
  if (d.props?.length) blocks.push(properties(I, d.props, cx, 0, cw));
  for (const b of d.blocks) {
    if (b.type === "md") {
      let src = b.text;
      if (until && src.includes(until)) src = src.slice(0, src.indexOf(until) + until.length);
      blocks.push({ ...markdown(I, src, cx, 0, cw) });
      if (until && b.text.includes(until)) break;
    } else if (b.type === "callout") blocks.push(callout(I, b, cx, 0, cw));
    else break; // the crop ends before the first picture block
  }
  // Each block was laid out at y = 0; move it down.
  for (const blk of blocks) {
    o += `<g transform="translate(0 ${n(cy)})">${blk.svg}</g>`;
    cy += blk.h + 12;
  }
  o += `</g>`;
  o += rect(x + 0.5, y + 0.5, w - 1, h - 1, "none", { r: 10, stroke: over(T.canvas, T.border) });
  return { svg: o + `</g>`, used: cy - y };
}

// ---------------------------------------------------------------- the pictures

function doc(w, h, title, desc, body, I, { style = "" } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-labelledby="t d">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
${style}<defs>
${I.defs()}
</defs>
${rect(0, 0, w, h, T.canvas)}
${body}
</svg>
`;
}
// docs/assets/layout.svg also carries its colors as tokens, which scripts/check-docs.mjs checks for contrast.
const TOKENS = `--bg:${T.background}; --surface:${T.chrome}; --fg:${T.foreground}; --muted:${T.muted}; --code-bg:${T.raised}; --accent:${T.accent}; --accent-fg:${T.accent_foreground};`;
const STYLE = `<style>
:root { ${TOKENS} }
@media (prefers-color-scheme: dark) {
  :root { ${TOKENS} }
}
</style>
`;
const MADE_UP = "Drawn from the mods' own layout code, icons and the Herdr graphite theme, with the sample vault's content; a drawing, not a screenshot.";

async function overview() {
  const I = iconSet();
  const W = 1400, H = 820;
  // The panel docked on the left; the reader at its opening size (0.78 x 0.86 of the window), dragged to the right.
  const pw = 300, rw = Math.round(W * 0.78), rh = Math.round(H * 0.86);
  let body = rect(8, 8, W - 16, H - 16, T.canvas);
  body += panel(I, 8, 8, pw, H - 16, { open: new Set(["projects"]) });
  const r = await reader(I, "ov", W - 8 - rw, Math.round((H - rh) / 2), rw, rh, OPEN_FILE);
  body += r.svg;
  body += text(W - 16, H - 14, "Drawn from the mods, not a screenshot", { size: 12, fill: T.muted, anchor: "end" });
  return doc(W, H, "The Vault panel next to the floating Vault reader, drawn from the mods. Not a screenshot.",
    "A drawing, not a screenshot. On the left the Vault panel: the vault picker showing sample-vault with Add vault, the Search notes box, and the file tree of the sample vault with the folders attachments and projects (open, with a and b), then Board, Feature tour (selected), Flow sketch and Other note. On the right the floating Vault reader showing the note Feature tour: its bar with Keep and Close, the properties status, project, tags, aliases and created, the heading, a paragraph with bold, italic, highlighted, struck and inline code text and tags, a line of wikilinks, and the first callouts. " + MADE_UP,
    body, I, { style: STYLE });
}

async function featurePanel() {
  const I = iconSet();
  const pw = 300, ph = 470, gap = 40, W = 16 + pw + 8 + gap + pw + 16, H = ph + 32;
  let body = panel(I, 16, 16, pw, ph, { open: new Set(["projects"]), menu: true });
  const results = await searchResults("tour");
  body += panel(I, 16 + pw + 8 + gap, 16, pw, ph, { open: new Set(), query: "tour", results });
  return doc(W, H, "The Vault panel: the vault picker open, and a search",
    `Two views of the Vault panel on the sample vault. Left: the vault picker is open under the header, listing sample-vault (checked) with its folder, then Add vault… and Import from Obsidian; the file tree shows below it. Right: the search box holds "tour" and the results replace the tree: ${results.map((r) => label(r.rel.split("/").pop())).join(", ")}. ` + MADE_UP,
    body, I);
}

async function featureReader() {
  const I = iconSet();
  const rw = 842, W = rw + 32;
  // 842 is 0.78 of a 1080 wide window (the portrait layout's); the crop ends after the note's table.
  const probe = await reader(iconSet(), "p", 16, 16, rw, 4000, OPEN_FILE, "| Math | MathJax |");
  const rh = Math.round(probe.used + 28);
  const r = await reader(I, "rd", 16, 16, rw, rh, OPEN_FILE, "| Math | MathJax |");
  return doc(W, rh + 40, "The Vault reader showing the note Feature tour",
    "The floating Vault reader showing the sample note Feature tour, from its top to its table: the bar with the note's name, Keep and Close; the properties status draft, project herdr, tags #herdr and #plan/reader, aliases Tour and Everything, created 2026-11-02; the heading Feature tour; a paragraph with bold, italic, highlighted, struck and inline code text and two tags; a line of wikilinks drawn as links (one unresolved, in italics); the callouts Note, Folded warning (closed), Open tip with a nested example, and Done with a checked task; the task list with its six marks; and the Feature / Shown as table. " + MADE_UP,
    r.svg, I);
}

async function featureSampleVault() {
  const I = iconSet();
  const pw = 300, open = new Set(["attachments", "projects", "projects/a", "projects/b"]);
  const rows = treeRows(open).length;
  const ph = 43 + 8 + 30 + 4 + 6 + rows * 28 + 10;
  const W = pw + 32, H = ph + 32;
  return doc(W, H, "The sample vault in the Vault panel, every folder open",
    `The Vault panel on examples/sample-vault with every folder open: ${treeRows(open).map((r) => (r.dir ? `${r.name}/` : label(r.name))).join(", ")}. Each kind has its icon: notes, a canvas, an Excalidraw drawing, images and PDFs. ` + MADE_UP,
    panel(I, 16, 16, pw, ph, { open }), I);
}

const pictures = {
  "layout.svg": await overview(),
  "feature-panel.svg": await featurePanel(),
  "feature-reader.svg": await featureReader(),
  "feature-sample-vault.svg": await featureSampleVault(),
};
let stale = 0;
for (const [name, svg] of Object.entries(pictures)) {
  const file = path.join(OUT, name);
  if (CHECK) {
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== svg) { console.error(`docs/assets/${name} differs from a fresh drawing (run node scripts/make-pictures.mjs)`); stale++; }
  } else {
    fs.writeFileSync(file, svg);
    console.log(`docs/assets/${name}  ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB`);
  }
}
if (stale) process.exitCode = 1;
