// Pure helpers of the file tree (no Herdr imports; tests/tree.test.mjs).
import { relOf } from "./platform.js";

// Obsidian rewrites .obsidian/workspace.json all the time; git and the trash change too: none of
// those are the person's notes. Any dot folder or file counts as such.
export const isHidden = (rel) => rel.split("/").some((part) => part.startsWith("."));

// Paths from watchFolder() → { all, rels }: all when the root itself changed (refresh everything),
// rels the changed visible paths inside the vault (separators normalized).
export function visibleChanges(root, paths) {
  const rels = [];
  let all = false;
  for (const p of paths) {
    const rel = relOf(root, p);
    if (rel === null) continue;
    if (rel === "") all = true;
    else if (!isHidden(rel)) rels.push(rel);
  }
  return { all, rels };
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // by UTF-16 code unit, the same in Node and in Herdr

// Natural, case-insensitive order without Intl: Herdr's runtime has no Intl and its localeCompare ignores
// the locale and options arguments (probed in round 2), so "Zebra" came before "apple" and "Note 10"
// before "Note 2". Letters are folded with toLowerCase, runs of digits compare as numbers (any length),
// the rest by code unit (so accented letters sort after z: no accent folding without Intl), and names
// that fold equal fall back to their raw code-unit order, so the result is total and stable.
export function naturalCompare(a, b) {
  const x = String(a).toLowerCase().match(/\d+|\D+/g) ?? [];
  const y = String(b).toLowerCase().match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < x.length && i < y.length; i++) {
    const p = x[i], q = y[i];
    if (p === q) continue;
    const pd = p.charCodeAt(0) <= 57 && p.charCodeAt(0) >= 48, qd = q.charCodeAt(0) <= 57 && q.charCodeAt(0) >= 48;
    if (pd && qd) {
      const m = p.replace(/^0+(?=\d)/, ""), n = q.replace(/^0+(?=\d)/, "");
      const c = m.length - n.length || cmp(m, n);
      if (c) return c;
    } else {
      const c = cmp(p, q);
      if (c) return c;
    }
  }
  return x.length - y.length || cmp(String(a), String(b));
}

// The entries of a folder listing as the tree shows them: no dot files, folders first, natural
// order by the name Obsidian shows; at most `limit`, with how many were left out.
export function folderEntries(list, label, limit) {
  const sorted = list.filter((e) => !e.name.startsWith("."))
    .map((e) => ({ name: e.name, dir: Boolean(e.isDirectory()) }))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || naturalCompare(label(a.name), label(b.name)));
  return { items: sorted.slice(0, limit), more: Math.max(0, sorted.length - limit) };
}
