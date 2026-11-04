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

// The entries of a folder listing as the tree shows them: no dot files, folders first, natural
// order by the name Obsidian shows; at most `limit`, with how many were left out.
export function folderEntries(list, label, limit) {
  const sorted = list.filter((e) => !e.name.startsWith("."))
    .map((e) => ({ name: e.name, dir: Boolean(e.isDirectory()) }))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || label(a.name).localeCompare(label(b.name), undefined, { numeric: true, sensitivity: "base" }));
  return { items: sorted.slice(0, limit), more: Math.max(0, sorted.length - limit) };
}
