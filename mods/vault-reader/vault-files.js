// Every file of a vault, vault-relative with "/" separators, dot folders (.obsidian, .git, .trash) left out.
// readdir(dir, { withFileTypes: true }) is injected so node can test it (fs/promises in Herdr).
import { normPath } from "./platform.js";

export async function listVault(root, readdir, limit = 30000) {
  const out = [];
  const base = normPath(root);
  const walk = async (rel) => {
    let entries;
    try { entries = await readdir(rel ? `${base}/${rel}` : base, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= limit || e.name.startsWith(".")) continue;
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(p);
      else out.push(p);
    }
  };
  await walk("");
  return out;
}

// Is this vault-relative path one Obsidian or git keeps for itself (any dot folder or file)?
export const isHidden = (rel) => rel.split("/").some((part) => part.startsWith("."));
