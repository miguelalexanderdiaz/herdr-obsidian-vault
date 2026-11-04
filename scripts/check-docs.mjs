#!/usr/bin/env node
// Checks the documentation: README.md, AGENTS.md, CONTRIBUTING.md, CHANGELOG.md,
// llms.txt and the GitHub Pages site in docs/. No dependencies; Node 22+.
//
//   node scripts/check-docs.mjs              check this repository
//   node scripts/check-docs.mjs --root DIR   check another copy (for example a temp copy
//                                            with a broken link, to see it fail)
//   node scripts/check-docs.mjs --release    also fail while anything that must change when the
//                                            repository is published is still open ("not published
//                                            yet", "still has to install", and every publish:
//                                            mark). Used by
//                                            check-repo.mjs --release.
//
// What it checks, and why:
//   - every page in docs/ has lang, title, meta description and exactly one h1;
//   - relative links, images and #anchors resolve (HTML pages and Markdown files);
//   - the site loads nothing from other websites; pages run no inline script and no event-handler attribute,
//     the only scripts are the site's own files in docs/assets/ (<script src="assets/x.js"></script>), and those
//     may not reach the network, load code, store anything or name an address (the site stays static and offline);
//   - no personal paths or e-mail addresses in any doc;
//   - the colour tokens in docs/assets/style.css pass WCAG AA contrast in light and dark;
//   - llms.txt equals docs/llms.txt, and its links point at files that exist;
//   - the requirements table is the same in README.md and docs/requirements.html;
//   - the keys table in docs/configuration.html equals keys.json;
//   - messages quoted in docs/troubleshooting.html (class="msg") exist in the code as string
//     literals (comments do not count; short quotes must be a whole literal or a whole segment of one);
//   - the claims table scripts/doc-claims.json: a number, name or phrase in a doc against the
//     constant, string or key that backs it in the code;
//   - the one support-level sentence is identical in the README, both llms.txt copies and the pages;
//   - the Platform report checklist (.github/ISSUE_TEMPLATE/platform-report.yml) names only files that exist in
//     the sample vault;
//   - the CI template runs only commands that exist (npm scripts, files in scripts/);
//   - docs/llms-full.txt equals a fresh build (scripts/build-llms-full.mjs);
//   - commands in AGENTS.md and CONTRIBUTING.md name scripts and test folders that exist.
// Exit code 0 when everything passes, 1 otherwise.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildLlmsFull } from "./build-llms-full.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const argRoot = process.argv.indexOf("--root");
const ROOT = path.resolve(argRoot > 0 ? process.argv[argRoot + 1] : path.join(here, ".."));
const DOCS = path.join(ROOT, "docs");
const REPO = "herdr-obsidian-vault";
const RELEASE = process.argv.includes("--release");
// The one sentence about what has been run where. Quoted verbatim in the places listed in checkSupportSentence().
const SUPPORT = "macOS is the only OS the author uses; Linux and Windows code paths are implemented and covered by fake-platform unit tests but not run in the live app.";

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
const mustHave = ["README.md", "AGENTS.md", "CONTRIBUTING.md", "CHANGELOG.md", "llms.txt", "docs/llms.txt", "docs/llms-full.txt", "docs/.nojekyll", "docs/index.html", "docs/assets/style.css", "docs/assets/layout.svg", "docs/assets/favicon.svg", "scripts/doc-claims.json"];
for (const f of mustHave) if (!exists(path.join(ROOT, f))) fail(f, "missing");

const pages = exists(DOCS) ? fs.readdirSync(DOCS).filter((f) => f.endsWith(".html")).sort() : [];
const required = ["index", "install", "usage", "requirements", "configuration", "privacy", "troubleshooting", "for-agents"];
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
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = /\ssrc="([^"]+)"/i.exec(m[1])?.[1];
    if (!src || m[2].trim()) fail(where, `an inline <script>; a page may only load the site's own scripts with <script src="assets/...">`);
    else if (!/^assets\/[\w.-]+\.js$/.test(src) || !exists(path.join(DOCS, src))) fail(where, `<script src="${src}"> must be an existing file in docs/assets/`);
  }
  if ((html.match(/<script\b/gi) || []).length !== (html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || []).length) fail(where, "a <script> is not closed");
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(html)) fail(where, "an event-handler attribute (on...=); behaviour belongs in docs/assets/*.js");
  if (/url\(\s*['"]?(https?:|\/\/)|@import/i.test(html)) fail(where, "inline style loads something from another site");
  if (name !== "404.html" && !/<link[^>]*rel="icon"/i.test(html)) fail(where, 'no <link rel="icon"> (every page would ask for /favicon.ico)');
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
    if (target.startsWith("/") && !target.startsWith("//")) {
      // 404.html is served for a missing page at any depth, so relative links would break there: it uses
      // links that start at the site root of a project site (/<repo>/...), which must lead to a page.
      if (name === "404.html" && target.startsWith(`/${REPO}/`)) {
        const t = target.slice(REPO.length + 2).split("#")[0] || "index.html";
        if (!exists(path.join(DOCS, t))) fail(where, `root link to a page that does not exist: ${target}`);
      } else fail(where, `absolute path breaks under /${REPO}/: ${target}`);
      continue;
    }
    const err = checkLink(file, target);
    if (err) fail(where, err);
  }
}

// ---------------------------------------------------------------- Markdown files and llms.txt

// The repository is public under this owner; links to its Pages site and its files on main must lead somewhere.
const owner = "miguelalexanderdiaz";
function ownerTarget(url) {
  const pages = new RegExp(`^https://${owner}\\.github\\.io/${REPO}/?(.*)$`);
  const repo = new RegExp(`^https://github\\.com/${owner}/${REPO}/(?:blob|raw|tree)/main/(.*)$`);
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
  ...pages.map((p) => path.join(DOCS, p)), path.join(DOCS, "llms.txt"), path.join(DOCS, "llms-full.txt"), path.join(DOCS, "assets/style.css")].filter(exists);
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
  const t = (reqPage.match(/<table id="requirements-table"[^>]*>[\s\S]*?<\/table>/) || [])[0];
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

// ---------------------------------------------------------------- code as data: literals and comment-free source

// Splits JavaScript into its code with comments removed and the list of string-literal segments (a template
// literal gives one segment per piece between ${...}). Good enough for this repository's style: it knows
// strings, templates with nested code, regular expressions and both comment forms. It is not a parser.
export function scanJs(src) {
  const lits = [];
  let i = 0;
  const KEYWORDS = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do", "yield", "await"]);
  const cook = (q, from) => {
    let j = from, buf = "";
    while (j < src.length) {
      const c = src[j];
      if (c === "\\") {
        const n = src[j + 1];
        if (n === "u" && /^[0-9a-fA-F]{4}/.test(src.slice(j + 2, j + 6))) { buf += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16)); j += 6; continue; }
        if (n === "u" && src[j + 2] === "{") { const e = src.indexOf("}", j); buf += String.fromCodePoint(parseInt(src.slice(j + 3, e), 16)); j = e + 1; continue; }
        if (n === "x" && /^[0-9a-fA-F]{2}/.test(src.slice(j + 2, j + 4))) { buf += String.fromCharCode(parseInt(src.slice(j + 2, j + 4), 16)); j += 4; continue; }
        buf += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "\r" : n === "\n" ? "" : n;
        j += 2;
        continue;
      }
      if (c === q) return { text: buf, end: j + 1 };
      if (q === "`" && c === "$" && src[j + 1] === "{") return { text: buf, end: j, hole: true };
      if (c === "\n" && q !== "`") return { text: buf, end: j };
      buf += c;
      j++;
    }
    return { text: buf, end: j };
  };
  // Scans code from i until the closing brace of a ${...} (stopAtBrace) or the end. Returns the code text.
  function code(stopAtBrace) {
    let out = "", depth = 0, prev = "", word = "";
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { out += c; i++; continue; }
      if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; out += " "; continue; }
      if (c === '"' || c === "'") {
        const r = cook(c, i + 1);
        lits.push(r.text);
        out += src.slice(i, r.end);
        i = r.end; prev = c; word = "";
        continue;
      }
      if (c === "`") {
        out += "`";
        i++;
        for (;;) {
          const r = cook("`", i);
          lits.push(r.text);
          out += src.slice(i, r.end);
          i = r.end;
          if (r.hole) { out += "${"; i += 2; out += code(true); out += "}"; continue; }
          break;
        }
        prev = "`"; word = "";
        continue;
      }
      if (c === "/" && (prev === "" || "(,=:[!&|?{};+-*%<>~^".includes(prev) || KEYWORDS.has(word))) {
        let j = i + 1, inClass = false;
        while (j < src.length && src[j] !== "\n") {
          if (src[j] === "\\") { j += 2; continue; }
          if (src[j] === "[") inClass = true;
          else if (src[j] === "]") inClass = false;
          else if (src[j] === "/" && !inClass) break;
          j++;
        }
        j++;
        while (/[a-z]/i.test(src[j] ?? "")) j++;
        out += src.slice(i, j);
        i = j; prev = "/"; word = "";
        continue;
      }
      if (c === "{") depth++;
      if (c === "}") { if (stopAtBrace && depth === 0) { i++; return out; } depth--; }
      if (/[A-Za-z0-9_$]/.test(c)) word = /[A-Za-z0-9_$]/.test(prev) ? word + c : c; else word = "";
      out += c; prev = c; i++;
    }
    return out;
  }
  const stripped = code(false);
  return { code: stripped, literals: lits };
}

// What the code of one file says, for the claims and the quoted messages.
function scanFile(file) {
  const src = read(file);
  if (/\.m?js$/.test(file)) return scanJs(src);
  if (/\.html?$/.test(file)) {
    const noComments = src.replace(/<!--[\s\S]*?-->/g, "");
    const scripts = [...noComments.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => scanJs(m[1]));
    return { code: noComments, literals: [noComments, ...scripts.flatMap((x) => x.literals)] };
  }
  return { code: src, literals: [src] };
}

const modSources = [];
{
  const walk = (d) => {
    if (!exists(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(m?js|html)$/.test(e.name)) modSources.push(p);
    }
  };
  walk(path.join(ROOT, "mods"));
}
const scanCache = new Map();
const scanned = (file) => { if (!scanCache.has(file)) scanCache.set(file, scanFile(file)); return scanCache.get(file); };

// ---------------------------------------------------------------- quoted messages exist in the code

{
  const literals = modSources.flatMap((f) => scanned(f).literals);
  const segments = new Set(literals.map((l) => l.trim()));
  // Some messages are built from parts ("<name> isn't installed: <hint>"): ask the pure module.
  const built = [];
  try {
    const mod = await import(pathToFileURL(path.join(ROOT, "mods", "vault-reader", "platform.js")).href);
    for (const what of ["rg", "poppler", "node", "curl", "browser", "obsidian"]) {
      for (const os of ["macos", "linux", "windows"]) built.push(mod.missingMessage(os, what));
    }
  } catch { /* no platform.js yet: only literal messages can match */ }
  const trouble = exists(path.join(DOCS, "troubleshooting.html")) ? read(path.join(DOCS, "troubleshooting.html")) : "";
  let count = 0;
  for (const m of trouble.matchAll(/<code class="msg">([\s\S]*?)<\/code>/g)) {
    const msg = text(m[1]).replace(/’/g, "'");
    count++;
    // Short quotes ("No file", "Mermaid:") would match anywhere as a substring, so they must be a whole
    // literal, or the whole text between two ${...} holes of a template. Longer ones may be part of one.
    const ok = msg.length >= 12
      ? literals.some((l) => l.includes(msg)) || built.some((b) => b.includes(msg))
      : segments.has(msg) || built.includes(msg);
    if (!ok) fail("docs/troubleshooting.html", `message is not a string literal in mods/: "${msg}"`);
  }
  if (!count) fail("docs/troubleshooting.html", 'no <code class="msg"> quotes found');
}

// ---------------------------------------------------------------- claims table: docs against code

const claimsFile = path.join(ROOT, "scripts", "doc-claims.json");
const flatDoc = (file) => {
  const src = read(file);
  const body = /\.html?$/.test(file) ? decode(src.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ")) : src.replace(/<!--[\s\S]*?-->/g, "").replace(/[`*]/g, "");
  return body.replace(/’/g, "'").replace(/\s+/g, " ");
};
let claimCount = 0;
if (exists(claimsFile)) {
  let claims = [];
  try { claims = JSON.parse(read(claimsFile)); } catch (e) { fail("scripts/doc-claims.json", `invalid JSON: ${e.message}`); }
  const seen = new Set();
  for (const c of claims) {
    claimCount++;
    const where = `claim ${c.id ?? "(no id)"}`;
    if (!c.id || seen.has(c.id)) { fail(where, "missing or duplicate id"); continue; }
    seen.add(c.id);
    if (!c.docText || !c.code || !c.pattern) { fail(where, "needs docText, code and pattern"); continue; }
    for (const doc of [].concat(c.doc ?? [])) {
      const dp = path.join(ROOT, doc);
      if (!exists(dp)) { fail(where, `doc not found: ${doc}`); continue; }
      if (!flatDoc(dp).includes(c.docText)) fail(where, `${doc} no longer says: "${c.docText}"`);
    }
    for (const cf of [].concat(c.code)) {
      const cp = path.join(ROOT, cf);
      if (!exists(cp)) { fail(where, `code file not found: ${cf}`); continue; }
      let re;
      try { re = new RegExp(c.pattern, c.flags ?? ""); } catch (e) { fail(where, `bad pattern: ${e.message}`); continue; }
      if (!re.test(scanned(cp).code)) fail(where, `${cf} no longer has /${c.pattern}/ (outside comments)`);
    }
  }
} else {
  fail("scripts/doc-claims.json", "missing");
}

// ---------------------------------------------------------------- the support-level sentence

{
  const where = [
    ["README.md", () => flatDoc(path.join(ROOT, "README.md"))],
    ["llms.txt", () => read(path.join(ROOT, "llms.txt")).replace(/\s+/g, " ")],
    ["docs/llms.txt", () => read(path.join(DOCS, "llms.txt")).replace(/\s+/g, " ")],
    ["docs/index.html", () => flatDoc(path.join(DOCS, "index.html"))],
    ["docs/requirements.html", () => flatDoc(path.join(DOCS, "requirements.html"))],
  ];
  for (const [name, get] of where) {
    if (!exists(path.join(ROOT, name))) continue;
    if (!get().includes(SUPPORT)) fail(name, "the support-level sentence is missing or reworded (see SUPPORT in scripts/check-docs.mjs)");
  }
  for (const page of ["index", "requirements"]) {
    const file = path.join(DOCS, `${page}.html`);
    if (!exists(file)) continue;
    const desc = decode((read(file).match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i) || [])[1] ?? "");
    if (!desc.includes(SUPPORT)) fail(`docs/${page}.html`, "the meta description does not carry the support-level sentence");
  }
  const bad = /\b(?:runs|works) on macOS, Linux (?:and|,) Windows\b|\bthree[- ]OS\b/i;
  for (const file of docFiles) {
    if (file.endsWith("check-docs.mjs")) continue;
    const m = read(file).match(bad);
    if (m) fail(rel(file), `an unconditional support claim: "${m[0]}" (say only what has run, see SUPPORT)`);
  }
}

// ---------------------------------------------------------------- the site's scripts

// No network, no loading code, no storage, no addresses: a script may only change the page it is on.
{
  const walk = (d) => (exists(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
  for (const file of walk(DOCS).filter((f) => /\.m?js$/.test(f))) {
    const bad = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|eval|Function|localStorage|sessionStorage|indexedDB|document\.cookie|Worker)\b\s*[.(]|\bimport\s*[(\s{*"']|\bnew\s+(Function|Worker|WebSocket|EventSource|XMLHttpRequest|Image)\b|\.src\s*=|https?:\/\//.exec(read(file));
    if (bad) fail(rel(file), `uses ${bad[0]}; the site's scripts may not reach the network, load code or store anything`);
  }
}

// ---------------------------------------------------------------- SVG pictures

{
  const dir = path.join(DOCS, "assets");
  const svgs = exists(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".svg")) : [];
  for (const name of svgs) {
    const file = path.join(dir, name);
    const where = `docs/assets/${name}`;
    const svg = read(file);
    if (/<script[\s>]|\son\w+="/i.test(svg)) fail(where, "script or event handler in an SVG");
    if (/(?:href|src)="(?:https?:)?\/\//i.test(svg) || /url\(\s*['"]?https?:/i.test(svg) || /@import/.test(svg)) fail(where, "loads something from another site");
    if (name === "layout.svg") {
      if (!/role="img"/.test(svg) || !/<title\b/.test(svg) || !/<desc\b/.test(svg)) fail(where, "needs role=img, a <title> and a <desc>");
      if (!/not a screenshot/i.test(svg)) fail(where, 'must say "not a screenshot" in its text');
      const sizes = [...svg.matchAll(/font-size="(\d+)"/g)].map((m) => Number(m[1]));
      if (sizes.some((n) => n < 12)) fail(where, "text smaller than 12");
      const rootBlock = (svg.match(/:root\s*\{([^}]*)\}/) || [])[1] ?? "";
      const darkBlock = (svg.match(/prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/) || [])[1] ?? "";
      const light = tokens(rootBlock);
      const dark = { ...light, ...tokens(darkBlock) };
      // The text colours used (fg, muted, accent-fg) and the backgrounds they can sit on.
      const textOn = [["fg", "bg"], ["fg", "surface"], ["fg", "code-bg"], ["muted", "bg"], ["muted", "surface"], ["muted", "code-bg"], ["accent-fg", "accent"]];
      for (const [mode, set] of [["light", light], ["dark", dark]]) {
        for (const [a, b] of textOn) {
          if (!set[a] || !set[b]) { fail(where, `token --${set[a] ? b : a} missing (${mode})`); continue; }
          const r = ratio(set[a], set[b]);
          if (r < 4.5) fail(where, `${mode}: --${a} on --${b} has contrast ${r.toFixed(2)}, needs 4.5`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- the Platform report checklist names files of the sample vault

// The checklist testers follow on Linux and Windows lives in the issue form. Every file or folder of the sample vault it
// names in backticks (a name with a note, canvas, PDF or image extension, or under attachments/ or projects/) must exist.
{
  const rel0 = ".github/ISSUE_TEMPLATE/platform-report.yml";
  const file = path.join(ROOT, ...rel0.split("/"));
  if (!exists(file)) fail(rel0, "missing (the platform checklist lives there)");
  else {
    const vault = path.join(ROOT, "examples", "sample-vault");
    const src = read(file);
    const names = [...src.matchAll(/`([^`\n]+)`/g)].map((m) => m[1])
      .filter((n) => /\.(md|canvas|pdf|png)$/.test(n) || /^(attachments|projects)(\/|$)/.test(n));
    if (names.length < 8) fail(rel0, `only ${names.length} sample-vault names in the checklist; every step must name its file`);
    for (const n of names) {
      if (![path.join(vault, n), path.join(ROOT, n)].some(exists)) fail(rel0, `names "${n}", which is not in examples/sample-vault`);
    }
    const steps = [...src.matchAll(/^\s+(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
    if (!steps.length || steps.some((n, k) => n !== k + 1)) fail(rel0, "the checklist steps must be numbered 1, 2, 3 ... with a bold title");
    const said = src.match(/\(1 to (\d+)\)/)?.[1];
    if (said && Number(said) !== steps.length) fail(rel0, `the steps field says 1 to ${said} but the checklist has ${steps.length}`);
  }
}

// ---------------------------------------------------------------- the CI template runs only commands that exist

{
  const ci = path.join(ROOT, "scripts", "ci.workflow.yml");
  if (exists(ci)) {
    const src = read(ci);
    const pkg = exists(path.join(ROOT, "package.json")) ? JSON.parse(read(path.join(ROOT, "package.json"))) : { scripts: {} };
    if (/node --test tests\/?(\s|$)/.test(src)) fail("scripts/ci.workflow.yml", "runs `node --test tests/`, which fails (a bare folder is read as a module): use `npm test`");
    if (!/\brun:\s*npm test\b/.test(src)) fail("scripts/ci.workflow.yml", "does not run `npm test`");
    const cmds = [];
    const lines = src.split("\n");
    for (let k = 0; k < lines.length; k++) {
      const m = lines[k].match(/^(\s*)(?:- )?run:\s*(.*)$/);
      if (!m) continue;
      if (/^[|>][+-]?$/.test(m[2].trim())) {
        const indent = lines[k + 1]?.match(/^(\s*)/)[1].length ?? 0;
        for (let q = k + 1; q < lines.length && indent > m[1].length && (lines[q].trim() === "" || lines[q].match(/^(\s*)/)[1].length >= indent); q++) if (lines[q].trim()) cmds.push(lines[q].trim());
      } else cmds.push(m[2].trim());
    }
    for (const c of cmds) {
      const n = c.match(/^node\s+(scripts\/[\w./-]+)/);
      if (n && !exists(path.join(ROOT, n[1]))) fail("scripts/ci.workflow.yml", `runs ${n[1]}, which does not exist`);
      const p = c.match(/^npm\s+(?:run\s+)?([\w:-]+)/);
      if (p && !["install", "ci"].includes(p[1]) && !pkg.scripts?.[p[1]]) fail("scripts/ci.workflow.yml", `runs npm ${p[1]}, which package.json does not define`);
    }
  }
}

// ---------------------------------------------------------------- docs/llms-full.txt is current

{
  const out = path.join(DOCS, "llms-full.txt");
  if (exists(out)) {
    try {
      if (read(out) !== buildLlmsFull(ROOT)) fail("docs/llms-full.txt", "is stale (run: node scripts/build-llms-full.mjs)");
    } catch (e) { fail("docs/llms-full.txt", `cannot be rebuilt: ${e.message}`); }
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

// ---------------------------------------------------------------- publish-time text (--release)

// Everything that must change when the repository is published is marked with an HTML comment that starts
// with "publish:" (list: rg "publish:"). Plain runs only count them; --release fails while any is open.
const marks = [];
const releaseFiles = [...docFiles, path.join(ROOT, "README.md"), path.join(DOCS, "404.html")].filter((f, i, a) => a.indexOf(f) === i && exists(f) && !f.endsWith("check-docs.mjs") && !/style\.css$/.test(f) && !rel(f).startsWith("scripts/") && rel(f) !== "RECIPE.md");
for (const file of releaseFiles) {
  const src = read(file);
  const lineOf = (idx) => src.slice(0, idx).split("\n").length;
  for (const m of src.matchAll(/<!--\s*publish:([\s\S]*?)-->/g)) marks.push([rel(file), lineOf(m.index), "open mark: " + m[1].trim().split(/\.\s|\n/)[0].slice(0, 60)]);
  if (!file.endsWith("llms-full.txt")) {
    for (const [re, what] of [[/not published yet/gi, '"not published yet"'], [/still has to install/gi, '"still has to install"']]) {
      const hits = [...src.matchAll(re)];
      if (hits.length) marks.push([rel(file), lineOf(hits[0].index), `${what}${hits.length > 1 ? ` (${hits.length} times)` : ""}`]);
    }
  }
}
if (RELEASE) {
  for (const [file, line, what] of marks) errors.push(`release: ${file}:${line}: ${what}`);
}

// ---------------------------------------------------------------- result

if (errors.length) {
  console.error(`check-docs: ${errors.length} problem${errors.length === 1 ? "" : "s"}${RELEASE ? " (release mode)" : ""}`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`check-docs: ok (${pages.length} pages, ${mdFiles.length + 2} text files, ${claimCount} claims, ${marks.length} publish-time items open; --release lists them)`);
