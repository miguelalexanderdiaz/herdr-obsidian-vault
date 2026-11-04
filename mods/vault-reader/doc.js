// A vault file → the document the reader draws (pure: node runs it for tests).
//   { file, kind: "note" | "canvas" | "excalidraw" | "image" | "pdf" | "other",
//     props?, blocks?, canvas?, missing?: anchor not found, error? }
// Embedded notes and canvas file cards are built too, two levels deep.

import { splitFrontmatter, parseBlocks, section, isExcalidraw, IMAGE_EXT } from "./parse.js";
import { parseCanvas } from "./canvas.js";

// readTextFile gives up to 1 MiB. A file that is there but bigger comes back as { tooLarge: true } from the
// reader's read(), and says so, instead of "no longer in the vault".
export const TOO_LARGE = {
  note: "This note is larger than 1 MiB, so the reader can't open it. Open it in Obsidian.",
  canvas: "This canvas is larger than 1 MiB, so the reader can't open it. Open it in Obsidian.",
  excalidraw: "This drawing is larger than 1 MiB, so the reader can't open it. Open it in Obsidian.",
};

// A vault file's text: a string, null when it is not there, { tooLarge: true } when it is there but
// readTextFile (1 MiB, "or null if absent") would not give it. What Herdr does beyond 1 MiB is not
// documented (null or a rejection), so both are read as "too large" when the file exists; any other
// failure keeps its own message.
export async function readNote(path, { read, exists }) {
  let text;
  try { text = await read(path); }
  catch (e) {
    if (/1 ?MiB|too (large|big)|larger|exceed|limit/i.test(String(e?.message ?? e)) && await exists(path).catch(() => false)) return { tooLarge: true };
    throw e;
  }
  if (text !== null && text !== undefined) return text;
  return (await exists(path).catch(() => false)) ? { tooLarge: true } : null;
}

export function kindOf(path) {
  if (/\.canvas$/i.test(path)) return "canvas";
  if (/\.excalidraw(\.md)?$/i.test(path)) return "excalidraw";
  if (/\.md$/i.test(path)) return "note";
  if (IMAGE_EXT.test(path)) return "image";
  if (/\.pdf$/i.test(path)) return "pdf";
  return "other";
}

// env: { read(file) → text | null | { tooLarge: true }, resolve(target, from) → file | null, deps: Set, abs(file) }
export async function buildDoc(file, anchor, depth, env) {
  const kind = kindOf(file);
  env.deps?.add(env.abs(file));
  const doc = { file, kind, anchor, depth };
  if (kind === "image" || kind === "pdf" || kind === "other") return doc;
  const text = await env.read(file);
  if (text === null) return { ...doc, error: "This file is no longer in the vault" };
  if (text.tooLarge) return { ...doc, error: TOO_LARGE[kind] ?? TOO_LARGE.note };
  if (kind === "canvas") {
    try { doc.canvas = parseCanvas(text); } catch (e) { return { ...doc, error: `Not a canvas file: ${e.message}` }; }
    for (const n of doc.canvas.nodes) {
      if (n.type !== "file" || !n.file) continue;
      n.target = env.resolve(n.file, file) ?? n.file;
      n.fileKind = kindOf(n.target);
      if (n.fileKind === "note" && depth < 2) {
        n.doc = await buildDoc(n.target, n.subpath?.replace(/^#/, "") || null, depth + 1, env).catch(() => null);
        if (n.doc?.kind === "excalidraw") n.fileKind = "excalidraw";
      }
    }
    return doc;
  }
  if (kind === "excalidraw" || isExcalidraw(file, text)) return { ...doc, kind: "excalidraw" };
  const { props, body } = splitFrontmatter(text);
  let part = body;
  if (anchor) {
    const sec = section(body, anchor);
    if (sec == null) doc.missing = anchor;
    else part = sec;
  }
  doc.props = depth === 0 && (!anchor || doc.missing) ? props : [];
  doc.blocks = parseBlocks(part, { from: file, resolve: env.resolve });
  const embeds = [];
  const walk = (bs) => bs.forEach((b) => { if (b.type === "embed") embeds.push(b); if (b.body) walk(b.body); });
  walk(doc.blocks);
  for (const b of embeds) {
    const target = b.target ? env.resolve(b.target, file) : file;
    b.resolved = target;
    b.kind = target ? kindOf(target) : "missing";
    if (target && (b.kind === "note" || b.kind === "canvas") && depth < 2 && !(target === file && !b.anchor)) {
      b.doc = await buildDoc(target, b.anchor, depth + 1, env).catch((e) => ({ error: String(e?.message ?? e) }));
      if (b.doc?.kind === "excalidraw") b.kind = "excalidraw";
    }
  }
  return doc;
}
