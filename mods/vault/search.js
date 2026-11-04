// Full-text search in a vault, with ripgrep: notes whose name has the words
// first, then notes whose text has them (one line each, the first match).
// Every word must appear (in the name, or in one line), any case.
// Drawings (.excalidraw.md) match by name only: their text is packed JSON.

import { exec } from "herdr";

const MAX = 200;
let rg = null;
async function rgPath() {
  if (rg) return rg;
  // The app's PATH may lack Homebrew's folder: try it by name, then where Homebrew puts it.
  for (const p of ["rg", "/opt/homebrew/bin/rg", "/usr/local/bin/rg"]) {
    const r = await exec(p, ["--version"]).catch(() => null);
    if (r?.code === 0) return (rg = p);
  }
  throw new Error("ripgrep (rg) isn't installed: brew install ripgrep");
}

const GLOBS = ["-g", "!.obsidian", "-g", "!.trash", "-g", "!.git"];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The line around the first word, trimmed to about `room` characters.
export function snippet(line, words, room = 140) {
  const text = line.replace(/\s+/g, " ").trim();
  const low = text.toLowerCase();
  const at = Math.max(0, Math.min(...words.map((w) => low.indexOf(w)).filter((i) => i >= 0)));
  const start = at > 40 ? at - 30 : 0;
  const cut = text.slice(start, start + room);
  return (start > 0 ? "…" : "") + cut + (start + room < text.length ? "…" : "");
}

// → [{ rel, line?, text? }] (rel: path in the vault), or throws.
export async function searchVault(root, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const bin = await rgPath();
  // Names: every file in the vault, filtered here.
  const files = await exec(bin, ["--files", ...GLOBS], { cwd: root });
  if (files.code > 1) throw new Error(files.stderr || "ripgrep failed");
  const byName = files.stdout.split("\n").filter(Boolean)
    .filter((rel) => { const n = (rel.split("/").pop() ?? "").toLowerCase(); return words.every((w) => n.includes(w)); })
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, MAX)
    .map((rel) => ({ rel }));
  // Text: lines with the first word, then kept only when they have them all.
  const hits = await exec(bin, ["-i", "-F", "--no-heading", "--line-number", "--color", "never", "--max-columns", "2000", "--max-columns-preview",
    "--max-count", "20", "-g", "*.md", "-g", "*.canvas", "-g", "!*.excalidraw.md", ...GLOBS, "-e", words[0], "."], { cwd: root });
  if (hits.code > 1) throw new Error(hits.stderr || "ripgrep failed");
  const seen = new Set(byName.map((r) => r.rel));
  const byText = [];
  for (const raw of hits.stdout.split("\n")) {
    const m = raw.match(/^(?:\.\/)?(.+?):(\d+):(.*)$/);
    if (!m || seen.has(m[1])) continue;
    const low = m[3].toLowerCase();
    if (!words.every((w) => low.includes(w))) continue;
    seen.add(m[1]);
    byText.push({ rel: m[1], line: Number(m[2]), text: snippet(m[3], words) });
    if (byName.length + byText.length >= MAX) break;
  }
  // Name matches also show their first text match, when they have one.
  const firstLine = new Map();
  for (const raw of hits.stdout.split("\n")) {
    const m = raw.match(/^(?:\.\/)?(.+?):(\d+):(.*)$/);
    if (m && !firstLine.has(m[1])) firstLine.set(m[1], snippet(m[3], words));
  }
  for (const r of byName) if (firstLine.has(r.rel)) r.text = firstLine.get(r.rel);
  return [...byName, ...byText];
}

export const pattern = (words) => new RegExp(words.map(esc).join("|"), "i");
