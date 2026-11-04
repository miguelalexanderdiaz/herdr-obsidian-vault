#!/usr/bin/env node
// Checks the documentation: README.md, AGENTS.md, CONTRIBUTING.md, CHANGELOG.md,
// llms.txt and the GitHub Pages site in docs/. No dependencies; Node 22+.
//
//   node scripts/check-docs.mjs              check this repository
//   node scripts/check-docs.mjs --root DIR   check another copy (for example a temp copy
//                                            with a broken link, to see it fail)
//
// What it checks, and why:
//   - every page in docs/ has lang, title, meta description and exactly one h1;
//   - relative links, images and #anchors resolve (HTML pages and Markdown files);
//   - the site loads nothing from other websites and has no scripts;
//   - no personal paths or e-mail addresses in any doc;
//   - the colour tokens in docs/assets/style.css pass WCAG AA contrast in light and dark;
//   - llms.txt equals docs/llms.txt, and its links point at files that exist;
//   - the requirements table is the same in README.md and docs/requirements.html;
//   - the keys table in docs/configuration.html equals keys.json;
//   - messages quoted in docs/troubleshooting.html (class="msg") exist in the code;
//   - commands in AGENTS.md and CONTRIBUTING.md name scripts and test folders that exist.
// Exit code 0 when everything passes, 1 otherwise.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const argRoot = process.argv.indexOf("--root");
const ROOT = path.resolve(argRoot > 0 ? process.argv[argRoot + 1] : path.join(here, ".."));
const DOCS = path.join(ROOT, "docs");
const REPO = "herdr-obsidian-vault";

const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const read = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);

// ---------------------------------------------------------------- helpers

const decode = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&rsquo;/g, "\u2019").replace(/&lsquo;/g, "\u2018").replace(/&ldquo;/g, "\u201c").replace(/&rdquo;/g, "\u201d")
  .replace(/&hellip;/g, "\u2026").replace(/&mdash;/g, "\u2014").replace(/&ndash;/g, "\u2013").replace(/&larr;/g, "\u2190").replace(/&rarr;/g, "\u2192")
  .replace(/&amp;/g, "&");
const text = (html) => decode(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

// GitHub's heading id for Markdown anchors.
const slug = (h) => h.toLowerCase().replace(/<[^>]+>/g, "").replace(/[`*_~]/g, "").replace(/[^\p{L}\p{N} \-_]/gu, "").trim().replace(/ /g, "-");

function mdWithoutCode(src) {
  return src.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "").replace(/`[^`\n]*`/g, "");
}

function mdIds(src) {
  const ids = new Set();
  const seen = new Map();
  for (const m of mdWithoutCode(src).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    let s = slug(m[1]);
    const n = seen.get(s) ?? 0;
    seen.set(s, n + 1);
    ids.add(n ? `${s}-${n}` : s);
  }
  for (const m of src.matchAll(/\bid="([^"]+)"/g)) ids.add(m[1]);
  return ids;
}

const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) {
    const src = read(file);
    idCache.set(file, /\.html?$/i.test(file) ? new Set([...src.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])) : mdIds(src));
  }
  return idCache.get(file);
}

// Where a link in `from` leads, or an error string. External links are not fetched.
function checkLink(from, target) {
  if (!target || /^(mailto:|tel:|data:)/i.test(target)) return null;
  if (/^https?:\/\//i.test(target)) return null;
  const [pathPart, ...frag] = target.split("#");
  const fragment = frag.join("#");
  let file = from;
  if (pathPart) {
    const clean = decodeURIComponent(pathPart.split("?")[0]);
    file = clean.startsWith("/") ? path.join(ROOT, clean) : path.resolve(path.dirname(from), clean);
    // preview.png is the one file the author adds at publish time (scripts/PREVIEW.md).
    if (!exists(file) && path.basename(file) === "preview.png") return null;
    if (!exists(file)) return `link target not found: ${target}`;
    if (fs.statSync(file).isDirectory()) {
      const index = ["index.html", "README.md"].map((n) => path.join(file, n)).find(exists);
      if (!fragment) return null;
      if (!index) return `link to a folder with an anchor: ${target}`;
      file = index;
    }
  }
  if (fragment && /\.(html?|md)$/i.test(file) && !idsOf(file).has(decodeURIComponent(fragment))) return `anchor not found: ${target}`;
  return null;
}

// ---------------------------------------------------------------- files

const mdFiles = ["README.md", "AGENTS.md", "CONTRIBUTING.md", "CHANGELOG.md", "RECIPE.md", "scripts/PUBLISH.md", "scripts/PREVIEW.md"]
  .map((f) => path.join(ROOT, f)).filter(exists);
const mustHave = ["README.md", "AGENTS.md", "CONTRIBUTING.md", "CHANGELOG.md", "llms.txt", "docs/llms.txt", "docs/.nojekyll", "docs/index.html", "docs/assets/style.css"];
for (const f of mustHave) if (!exists(path.join(ROOT, f))) fail(f, "missing");

const pages = exists(DOCS) ? fs.readdirSync(DOCS).filter((f) => f.endsWith(".html")).sort() : [];
const required = ["index", "install", "usage", "requirements", "configuration", "privacy", "troubleshooting"];
for (const r of required) if (!pages.includes(`${r}.html`)) fail(`docs/${r}.html`, "missing");

// ---------------------------------------------------------------- HTML pages

for (const name of pages) {
  const file = path.join(DOCS, name);
  const where = `docs/${name}`;
  const html = read(file);
  if (!/^<!doctype html>/i.test(html)) fail(where, "no <!doctype html> (quirks mode)");
  if (!/<html[^>]*\slang="[a-z-]+"/i.test(html)) fail(where, "no lang on <html>");
  if (!/<meta[^>]*name="viewport"/i.test(html)) fail(where, "no viewport meta");
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
  if (!title || !title.trim()) fail(where, "no <title>");
  const desc = (html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i) || [])[1];
  if (!desc || desc.length < 20) fail(where, "no meta description (20+ characters)");
  const h1s = html.match(/<h1[\s>]/g) || [];
  if (h1s.length !== 1) fail(where, `expected one h1, found ${h1s.length}`);
  if (!/<main[\s>]/.test(html)) fail(where, "no <main> landmark");
  if (!/class="skip"/.test(html)) fail(where, "no skip link");
  if (/<script[\s>]/i.test(html)) fail(where, "<script> found: the site needs none");
  if (/\sstyle="/i.test(html) && /url\(\s*['"]?https?:/i.test(html)) fail(where, "inline style loads an external URL");
  // Headings must not skip a level.
  let last = 1;
  for (const m of html.matchAll(/<h([1-6])[\s>]/g)) {
    const lvl = Number(m[1]);
    if (lvl > last + 1) fail(where, `heading level jumps from h${last} to h${lvl}`);
    last = lvl;
  }
  // Duplicate ids.
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dup.length) fail(where, `duplicate id: ${[...new Set(dup)].join(", ")}`);
  // Images need alt; tables need headers.
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) if (!/\balt="/i.test(m[0])) fail(where, "img without alt");
  for (const m of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) if (!/<th[\s>]/i.test(m[0])) fail(where, "table without header cells");
  // Links and resources.
  for (const m of html.matchAll(/\b(href|src)="([^"]*)"/gi)) {
    const [, attr, target] = m;
    const tag = html.slice(Math.max(0, m.index - 80), m.index).match(/<(\w+)[^<]*$/)?.[1]?.toLowerCase();
    if (/^https?:\/\//i.test(target)) {
      if (attr.toLowerCase() === "src" || tag === "link") fail(where, `loads an external resource: ${target}`);
      continue;
    }
    if (/^\/\//.test(target)) { fail(where, `protocol-relative URL: ${target}`); continue; }
    if (target.startsWith("/") && !target.startsWith("//")) { fail(where, `absolute path breaks under /${REPO}/: ${target}`); continue; }
    const err = checkLink(file, target);
    if (err) fail(where, err);
  }
}

// ---------------------------------------------------------------- Markdown files and llms.txt

const owner = "<owner>";
function ownerTarget(url) {
  const pages = new RegExp(`^https://${owner.replace(/[<>]/g, (c) => `\\${c}`)}\\.github\\.io/${REPO}/?(.*)$`);
  const repo = new RegExp(`^https://github\\.com/${owner.replace(/[<>]/g, (c) => `\\${c}`)}/${REPO}/(?:blob|raw|tree)/main/(.*)$`);
  let m = url.match(pages);
  if (m) return path.join(DOCS, m[1] || "index.html");
  m = url.match(repo);
  if (m) return path.join(ROOT, m[1]);
  return null;
}

for (const file of [...mdFiles, path.join(ROOT, "llms.txt"), path.join(DOCS, "llms.txt")].filter(exists)) {
  const where = rel(file);
  const src = read(file);
  const body = mdWithoutCode(src);
  for (const m of body.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    const target = m[1];
    if (/^https?:\/\//i.test(target)) {
      const t = ownerTarget(target);
      if (t && !exists(t.split("#")[0])) fail(where, `link to a file that is not in the repo: ${target}`);
      continue;
    }
    if (path.basename(file) === "llms.txt") { fail(where, `use absolute project URLs in llms.txt: ${target}`); continue; }
    const err = checkLink(file, target);
    if (err) fail(where, err);
  }
  // Reference-style links: [x]: target
  for (const m of body.matchAll(/^\[[^\]]+\]:\s*(\S+)/gm)) {
    const err = /^https?:/i.test(m[1]) ? null : checkLink(file, m[1]);
    if (err) fail(where, err);
  }
}

// ---------------------------------------------------------------- personal data

const docFiles = [...mdFiles, path.join(ROOT, "llms.txt"), path.join(ROOT, "scripts/check-docs.mjs"),
  ...pages.map((p) => path.join(DOCS, p)), path.join(DOCS, "llms.txt"), path.join(DOCS, "assets/style.css")].filter(exists);
const leaks = [
  [/\/Users\/[^\s/<>"'`)]+/, "a macOS home path"],
  [/\/home\/(?!<|\$|\.\.\.|user\b|name\b|me\b)[A-Za-z0-9._-]+/, "a Linux home path"],
  [/[A-Za-z]:\\Users\\(?!<)[^\s\\<>"']+/, "a Windows home path"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/, "an e-mail address"],
];
for (const file of docFiles) {
  const src = read(file);
  for (const [re, what] of leaks) {
    // The patterns above are written in this file on purpose.
    if (file.endsWith("check-docs.mjs")) continue;
    const m = src.match(re);
    if (m) fail(rel(file), `looks like ${what}: ${m[0]}`);
  }
  if (!file.endsWith("check-docs.mjs") && /github\.com\/(?!<owner>|anthropics\/|orgs\/)[A-Za-z0-9-]+\/herdr-/i.test(src)) {
    fail(rel(file), "a real GitHub owner in a repository URL: write <owner>");
  }
}

// ---------------------------------------------------------------- colour contrast

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[m[1]] = m[2];
  return out;
}
function lum(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const cssFile = path.join(DOCS, "assets/style.css");
if (exists(cssFile)) {
  const css = read(cssFile);
  if (/@import|url\(\s*['"]?https?:/i.test(css)) fail("docs/assets/style.css", "loads something from another site");
  if (!/prefers-color-scheme:\s*dark/.test(css)) fail("docs/assets/style.css", "no dark colour scheme");
  if (!/max-width|min-width/.test(css) || !/overflow-x:\s*auto/.test(css)) fail("docs/assets/style.css", "no responsive rules (tables must scroll sideways)");
  const rootBlock = (css.match(/:root\s*\{([^}]*)\}/) || [])[1] ?? "";
  const darkBlock = (css.match(/prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/) || [])[1] ?? "";
  const light = tokens(rootBlock);
  const dark = { ...light, ...tokens(darkBlock) };
  const pairs = [
    ["fg", "bg", 4.5], ["fg", "surface", 4.5], ["fg", "code-bg", 4.5], ["muted", "bg", 4.5], ["muted", "surface", 4.5],
    ["link", "bg", 4.5], ["link", "surface", 4.5], ["link", "code-bg", 4.5], ["accent-fg", "accent", 4.5], ["warn-fg", "warn-bg", 4.5],
    ["accent", "bg", 3],
  ];
  for (const [mode, set] of [["light", light], ["dark", dark]]) {
    for (const [a, b, min] of pairs) {
      if (!set[a] || !set[b]) { fail("docs/assets/style.css", `token --${set[a] ? b : a} missing (${mode})`); continue; }
      const r = ratio(set[a], set[b]);
      if (r < min) fail("docs/assets/style.css", `${mode}: --${a} on --${b} has contrast ${r.toFixed(2)}, needs ${min}`);
    }
  }
}

// ---------------------------------------------------------------- llms.txt copies

if (exists(path.join(ROOT, "llms.txt")) && exists(path.join(DOCS, "llms.txt"))) {
  if (read(path.join(ROOT, "llms.txt")) !== read(path.join(DOCS, "llms.txt"))) fail("llms.txt", "differs from docs/llms.txt (copy it: cp llms.txt docs/llms.txt)");
}

// ---------------------------------------------------------------- tables that must match other files

function rows(tableHtml) {
  return [...tableHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((r) => [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => text(c[1])))
    .filter((r) => r.length);
}

const readme = exists(path.join(ROOT, "README.md")) ? read(path.join(ROOT, "README.md")) : "";
const reqPage = exists(path.join(DOCS, "requirements.html")) ? read(path.join(DOCS, "requirements.html")) : "";
{
  const t = (reqPage.match(/<table id="requirements-table">[\s\S]*?<\/table>/) || [])[0];
  if (!t) fail("docs/requirements.html", 'no <table id="requirements-table">');
  const md = readme.match(/<!-- requirements:start -->([\s\S]*?)<!-- requirements:end -->/);
  if (!md) fail("README.md", "no <!-- requirements:start --> ... <!-- requirements:end --> table");
  if (t && md) {
    const a = rows(t).slice(1);
    const b = md[1].split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|")).slice(2)
      .map((l) => l.replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").replace(/`/g, "").trim()));
    if (a.length !== b.length) fail("README.md", `requirements table has ${b.length} rows, docs/requirements.html has ${a.length}`);
    a.forEach((row, i) => {
      if (!b[i]) return;
      if (row.join("\u0001") !== b[i].join("\u0001")) fail("README.md", `requirements row "${row[0]}" differs from docs/requirements.html`);
    });
  }
}

{
  const keysFile = path.join(ROOT, "keys.json");
  const conf = exists(path.join(DOCS, "configuration.html")) ? read(path.join(DOCS, "configuration.html")) : "";
  const t = (conf.match(/<table id="keys-table">[\s\S]*?<\/table>/) || [])[0];
  if (!t) fail("docs/configuration.html", 'no <table id="keys-table">');
  if (exists(keysFile) && t) {
    let j;
    try { j = JSON.parse(read(keysFile)); } catch (e) { fail("keys.json", `invalid JSON: ${e.message}`); }
    if (j) {
      const want = [];
      for (const [s, map] of Object.entries(j)) for (const [k, a] of Object.entries(map)) want.push([s, k, a].join("\u0001"));
      const got = rows(t).slice(1).filter((r) => r.length === 3).map((r) => r.join("\u0001"));
      for (const w of want) if (!got.includes(w)) fail("docs/configuration.html", `keys.json row missing from the keys table: ${w.split("\u0001").join(" | ")}`);
      for (const g of got) if (!want.includes(g)) fail("docs/configuration.html", `keys table row not in keys.json: ${g.split("\u0001").join(" | ")}`);
    }
  } else if (!exists(keysFile)) {
    console.log("note: keys.json not found, keys table not compared");
  }
}

// ---------------------------------------------------------------- quoted messages exist in the code

{
  const modsDir = path.join(ROOT, "mods");
  const sources = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(m?js|html)$/.test(e.name)) sources.push(read(p));
    }
  };
  if (exists(modsDir)) walk(modsDir);
  const code = sources.join("\n");
  const flat = (s) => s.replace(/\\(['"`])/g, "$1");
  // Some messages are built from parts ("<name> isn't installed: <hint>"): ask the pure module.
  const built = [];
  try {
    const mod = await import(pathToFileURL(path.join(modsDir, "vault-reader", "platform.js")).href);
    for (const what of ["rg", "poppler", "node", "curl", "browser", "obsidian"]) {
      for (const os of ["macos", "linux", "windows"]) built.push(mod.missingMessage(os, what));
    }
  } catch { /* no platform.js yet: only literal messages can match */ }
  const trouble = exists(path.join(DOCS, "troubleshooting.html")) ? read(path.join(DOCS, "troubleshooting.html")) : "";
  for (const m of trouble.matchAll(/<code class="msg">([\s\S]*?)<\/code>/g)) {
    const msg = text(m[1]);
    if (!flat(code).includes(msg) && !code.includes(msg) && !built.some((b) => b.includes(msg))) {
      fail("docs/troubleshooting.html", `message not found in mods/: "${msg}"`);
    }
  }
}

// ---------------------------------------------------------------- commands in the agent docs

{
  const pkgFile = path.join(ROOT, "package.json");
  const pkg = exists(pkgFile) ? JSON.parse(read(pkgFile)) : null;
  for (const name of ["AGENTS.md", "CONTRIBUTING.md"]) {
    const file = path.join(ROOT, name);
    if (!exists(file)) continue;
    const src = read(file);
    for (const block of src.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)) {
      for (const line of block[1].split("\n")) {
        const cmd = line.replace(/#.*$/, "").trim();
        for (const m of cmd.matchAll(/\bnode\s+(?:--[\w-]+(?:=\S+)?\s+)*(scripts\/[\w./-]+|tests\/[\w./-]+)/g)) {
          if (!exists(path.join(ROOT, m[1]))) fail(name, `command names a file that does not exist: ${m[1]}`);
        }
        const t = cmd.match(/\bnode\s+--test\s+(\S+)/);
        if (t && !exists(path.join(ROOT, t[1]))) fail(name, `test folder does not exist: ${t[1]}`);
        const n = cmd.match(/\bnpm (?:run )?([\w:-]+)/);
        if (n && n[1] !== "install" && pkg && !pkg.scripts?.[n[1] === "test" ? "test" : n[1]]) fail(name, `package.json has no script "${n[1]}"`);
        if (n && n[1] !== "install" && !pkg) fail(name, `uses npm ${n[1]} but there is no package.json`);
      }
    }
  }
}

// ---------------------------------------------------------------- result

if (errors.length) {
  console.error(`check-docs: ${errors.length} problem${errors.length === 1 ? "" : "s"}`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`check-docs: ok (${pages.length} pages, ${mdFiles.length + 2} text files)`);
