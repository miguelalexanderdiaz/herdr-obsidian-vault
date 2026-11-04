// Obsidian's own list of vaults (obsidian.json), read for the first-run import and "Import from
// Obsidian". Pure: the file's text is passed in.
//
//   { "vaults": { "<id>": { "path": "/home/me/Notes", "ts": 1700000000000, "open": true }, ... } }

import { normPath, nameOf } from "./platform.js";

const same = (a, b, ci) => (ci ? a.toLowerCase() === b.toLowerCase() : a === b);

// Is `path` the home folder or inside it? A mod can only read inside the home folder.
export function insideHome(path, home, ci = false) {
  const p = normPath(path), h = normPath(home);
  if (!h) return false;
  const head = p.slice(0, h.length);
  return same(head, h, ci) && (p.length === h.length || p[h.length] === "/");
}

// → { vaults: [{ path, name }], outside: [{ path, name }] }: the vault Obsidian has open first, then
// the most recently used. Paths use "/" and have no trailing slash (Windows backslashes are
// converted). `outside`: vaults beyond the home folder, which the panel lists but cannot read.
export function parseVaults(text, home, { windows = false } = {}) {
  let data;
  try { data = JSON.parse(text ?? ""); } catch { return { vaults: [], outside: [] }; }
  const entries = Object.values(data?.vaults && typeof data.vaults === "object" ? data.vaults : {});
  const sorted = entries
    .filter((v) => v && typeof v === "object" && typeof v.path === "string" && v.path.trim() !== "")
    .sort((a, b) => Number(Boolean(b.open)) - Number(Boolean(a.open)) || (Number(b.ts) || 0) - (Number(a.ts) || 0));
  const vaults = [], outside = [], seen = new Set();
  for (const v of sorted) {
    const path = normPath(v.path);
    const id = windows ? path.toLowerCase() : path;
    if (seen.has(id)) continue;
    seen.add(id);
    (insideHome(path, home, windows) ? vaults : outside).push({ path, name: nameOf(path) });
  }
  return { vaults, outside };
}

// Reads the first candidate file that holds at least one vault. read(path) → text | null.
// → { vaults, outside, found: path | null, looked: [paths] }
export async function readVaultList(candidates, home, read, opts) {
  const looked = [];
  let fallback = null;
  for (const file of candidates) {
    looked.push(file);
    const text = await read(file).catch(() => null);
    if (text == null) continue;
    const res = parseVaults(text, home, opts);
    if (res.vaults.length || res.outside.length) return { ...res, found: file, looked };
    fallback ??= file;
  }
  return { vaults: [], outside: [], found: fallback, looked };
}
