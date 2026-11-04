// Full-text search in a vault, with ripgrep, without Herdr imports (node tests it with a fake exec).
// Notes whose name has the words come first, then notes whose text has them (one line each, the
// first match). Every word must appear (in the name, or in one line), any case.
// Drawings (.excalidraw.md) match by name only: their text is packed JSON.

import { missingMessage, normPlatform } from "./platform.js";

export const MAX = 200;
export const GLOBS = ["-g", "!.obsidian", "-g", "!.trash", "-g", "!.git"];
// --no-config: a user's ripgreprc must not change the output format. --no-ignore: a vault that is
// also a git repo must not lose results to .gitignore (the tree shows those files too).
const COMMON = ["--no-config", "--no-messages", "--no-ignore", "--null"];

export const filesArgs = () => ["--files", ...COMMON, ...GLOBS];
export const textArgs = (needle) => ["-i", "-F", "--no-heading", "--line-number", "--color", "never", ...COMMON,
  "--max-columns", "2000", "--max-columns-preview", "--max-count", "20", "-g", "*.md", "-g", "*.canvas", "-g", "!*.excalidraw.md", ...GLOBS, "-e", needle, "."];

// The line around the first word, trimmed to about `room` characters.
export function snippet(line, words, room = 140) {
  const text = String(line).replace(/\s+/g, " ").trim();
  const low = text.toLowerCase();
  const idx = words.map((w) => low.indexOf(w)).filter((i) => i >= 0);
  const at = idx.length ? Math.min(...idx) : 0;
  const start = at > 40 ? at - 30 : 0;
  const cut = text.slice(start, start + room);
  return (start > 0 ? "…" : "") + cut + (start + room < text.length ? "…" : "");
}

// The longest word is the rarest: grepping it keeps the per-file match cap from hiding the line.
export const pickNeedle = (words) => [...words].sort((a, b) => b.length - a.length)[0];

// A path as rg prints it → the vault-relative path with "/" (what the tree, the reader and the panel use).
// rg was given "." so it prints "./a/b.md", or ".\a\b.md" on Windows. Backslashes are rewritten only
// there: a POSIX file name may contain one.
export function relPath(p, windows = false) {
  const s = windows ? p.replace(/\\/g, "/") : p;
  return s.replace(/^\.\//, "");
}

// `rg --files --null` → ["a/b.md", ...]
export const parseFiles = (stdout, windows = false) => String(stdout).split("\0").map((p) => relPath(p, windows)).filter(Boolean);

// `rg --line-number --null` → [{ rel, line, text }]. Each record is "<path>\0<line>:<text>\n". A note
// saved with CRLF line ends keeps its "\r" in rg's output, and "." does not match "\r" (nor U+2028), so
// the text is matched with [\s\S] and the trailing "\r" is dropped.
export function parseHits(stdout, windows = false) {
  const out = [];
  for (const raw of String(stdout).split("\n")) {
    const nul = raw.indexOf("\0");
    if (nul < 0) continue;
    const m = raw.slice(nul + 1).match(/^(\d+):([\s\S]*?)\r*$/);
    if (!m) continue;
    out.push({ rel: relPath(raw.slice(0, nul), windows), line: Number(m[1]), text: m[2] });
  }
  return out;
}

const baseName = (rel) => (rel.split("/").pop() ?? "").toLowerCase();

// Put names and hits together: name matches first (shortest path first), each with the first
// matching line of its text; then notes matched by text only.
export function rank(files, hits, words, max = MAX) {
  const byName = files.filter((rel) => { const n = baseName(rel); return words.every((w) => n.includes(w)); })
    .sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, max)
    .map((rel) => ({ rel }));
  const seen = new Set(byName.map((r) => r.rel));
  const firstLine = new Map();
  const byText = [];
  for (const h of hits) {
    if (!firstLine.has(h.rel)) firstLine.set(h.rel, snippet(h.text, words));
    if (seen.has(h.rel)) continue;
    if (!words.every((w) => h.text.toLowerCase().includes(w))) continue;
    seen.add(h.rel);
    byText.push({ rel: h.rel, line: h.line, text: snippet(h.text, words) });
    if (byName.length + byText.length >= max) break;
  }
  for (const r of byName) if (firstLine.has(r.rel)) r.text = firstLine.get(r.rel);
  return [...byName, ...byText];
}

// rg exits 0 (matches), 1 (none) or 2 (an error, which also happens when ONE file couldn't be
// read although the rest was searched: with output, that is still a result).
const failed = (r) => r.code > 1 && !String(r.stdout).length;

// deps: { exec, tool(name) → path | null, platform, cache?: Map }. → [{ rel, line?, text? }], or throws
// an Error (with .missing = "rg" when ripgrep isn't installed).
export async function searchWith(deps, root, query) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const windows = normPlatform(deps.platform) === "windows";
  const rg = await deps.tool("rg");
  if (!rg) { const e = new Error(missingMessage(deps.platform, "rg")); e.missing = "rg"; throw e; }
  // Names: every file in the vault, listed once until something changes.
  const cache = deps.cache ?? new Map();
  let files = cache.get(root);
  if (!files) {
    const r = await deps.exec(rg, filesArgs(), { cwd: root });
    if (failed(r)) throw new Error(String(r.stderr).trim().split("\n")[0] || "ripgrep failed");
    files = parseFiles(r.stdout, windows);
    cache.set(root, files);
  }
  const hits = await deps.exec(rg, textArgs(pickNeedle(words)), { cwd: root });
  if (failed(hits)) throw new Error(String(hits.stderr).trim().split("\n")[0] || "ripgrep failed");
  return rank(files, parseHits(hits.stdout, windows), words);
}
