// Obsidian-flavoured markdown → blocks the reader draws. Pure functions, no
// Herdr imports (node can run them: render/test-parse.mjs).
//
// Blocks:
//   { type: "md", text }                     markdown for TextView (links rewritten to vault: URLs)
//   { type: "code", text }                   a fenced code block, untouched
//   { type: "mermaid", src }                 ```mermaid
//   { type: "query", lang, src }             ```dataview / dataviewjs / tasks / query: shown, not run
//   { type: "math", src }                    $$ … $$
//   { type: "flow", tokens }                 a paragraph with inline $math$ (see inline())
//   { type: "callout", kind, title, fold, body: blocks }
//   { type: "embed", target, size }          a line that is only ![[target|size]]
//   { type: "image", src, size, alt }        a line that is only ![alt](src)

export const NOTE_EXT = /\.(md|canvas)$/i;
export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|tiff?)$/i;

// ---- front matter -----------------------------------------------------------

export function splitFrontmatter(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // a byte-order mark (Windows editors) hides the opening ---
  const m = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { props: [], body: text };
  return { props: parseYaml(m[1]), body: text.slice(m[0].length) };
}

const unquote = (s) => s.trim().replace(/^(['"])(.*)\1$/, "$2");

// "a, 'b, c', d" → ["a", "'b, c'", "d"]: commas inside quotes stay.
function splitList(s) {
  const out = [];
  let cur = "", quote = null;
  for (const ch of s) {
    if (quote) { cur += ch; if (ch === quote) quote = null; }
    else if (ch === '"' || ch === "'") { quote = ch; cur += ch; }
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// The YAML Obsidian writes in properties: scalars, [a, b] and "- item" lists.
// Anything fancier is shown as written.
export function parseYaml(src) {
  const out = [];
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([^\s#][^:]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let value = m[2].trim();
    if (value === "" || value === "|" || value === ">") {
      const items = [];
      while (i + 1 < lines.length && /^\s+\S|^-\s/.test(lines[i + 1])) {
        i++;
        items.push(lines[i].trim().replace(/^-\s*/, ""));
      }
      if (value === "|" || value === ">") out.push([key, items.join(value === "|" ? "\n" : " ")]);
      else out.push([key, items.map(unquote)]);
    } else if (/^\[.*\]$/.test(value)) {
      out.push([key, splitList(value.slice(1, -1)).map(unquote).filter(Boolean)]);
    } else out.push([key, unquote(value)]);
  }
  return out;
}

// ---- sections: [[note#heading]], [[note#^block]] ------------------------------

const norm = (s) => s.toLowerCase().replace(/[\s\-_]+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();

// Lines outside code fences, with whether each one is inside a fence.
function fenced(lines) {
  let fence = null;
  return lines.map((l) => {
    const m = l.match(/^\s*(`{3,}|~{3,})(.*)$/);
    // A closing fence is the same character, at least as long, and has no info string.
    if (fence) { if (m && m[1][0] === fence[0] && m[1].length >= fence.length && m[2].trim() === "") fence = null; return true; }
    if (m) { fence = m[1]; return true; }
    return false;
  });
}

// "text ^id" at the end of a line (the id is compared as text, never as a pattern).
function endsWithBlockId(line, id) {
  const t = line.trimEnd(), tail = "^" + id;
  return t.length > tail.length && t.endsWith(tail) && /\s/.test(t[t.length - tail.length - 1]);
}

// The part of a note a link points into: a heading's section (to the next
// heading as high or higher), or the paragraph / list item carrying ^block.
// null when not found.
export function section(body, anchor) {
  if (!anchor) return body;
  const lines = body.split("\n");
  const inFence = fenced(lines);
  if (anchor.startsWith("^")) {
    const id = anchor.slice(1);
    const at = lines.findIndex((l, i) => !inFence[i] && endsWithBlockId(l, id));
    if (at < 0) {
      // "^id" on a line of its own names the block above it.
      const alone = lines.findIndex((l, i) => !inFence[i] && l.trim() === `^${id}`);
      if (alone < 0) return null;
      let s = alone - 1;
      while (s >= 0 && lines[s].trim() === "") s--;
      let b = s;
      while (b > 0 && lines[b - 1].trim() !== "") b--;
      return lines.slice(b, s + 1).join("\n");
    }
    if (/^\s*([-*+]|\d+\.)\s/.test(lines[at])) return lines[at].replace(/^\s+/, "");
    let s = at, e = at;
    while (s > 0 && lines[s - 1].trim() !== "") s--;
    while (e + 1 < lines.length && lines[e + 1].trim() !== "") e++;
    return lines.slice(s, e + 1).join("\n");
  }
  const wants = [norm(anchor), norm(anchor.split("#").filter(Boolean).pop() ?? "")];
  let start = -1, level = 0;
  for (const want of wants) {
    for (let i = 0; i < lines.length && start < 0; i++) {
      const m = !inFence[i] && lines[i].match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (m && norm(m[2]) === want) { start = i; level = m[1].length; }
    }
    if (start >= 0) break;
  }
  for (let i = start + 1; start >= 0 && i < lines.length; i++) {
    if (inFence[i]) continue;
    const m = lines[i].match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    if (m[1].length <= level) return lines.slice(start, i).join("\n");
  }
  return start < 0 ? null : lines.slice(start).join("\n");
}

// Every heading, for the outline and section links: [{ level, text }].
export function headings(body) {
  const lines = body.split("\n"), inFence = fenced(lines), out = [];
  lines.forEach((l, i) => {
    const m = !inFence[i] && l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (m) out.push({ level: m[1].length, text: m[2] });
  });
  return out;
}

// ---- link targets -------------------------------------------------------------

// "folder/note#Heading|alias" → { path: "folder/note", anchor: "Heading", alias }
export function splitLink(raw) {
  let s = raw.trim(), alias = null;
  const bar = s.search(/(?<!\\)\|/);
  if (bar >= 0) { alias = s.slice(bar + 1).trim(); s = s.slice(0, bar).replace(/\\$/, "").trim(); }
  const hash = s.indexOf("#");
  const path = hash >= 0 ? s.slice(0, hash).trim() : s;
  const anchor = hash >= 0 ? s.slice(hash + 1).trim() : null;
  return { path, anchor, alias };
}

const basename = (p) => p.split("/").pop();
const stem = (p) => basename(p).replace(/\.md$/i, "");
const dirname = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

function joinPath(dir, rel) {
  const parts = (dir ? dir.split("/") : []);
  for (const piece of rel.split("/")) {
    if (piece === "..") parts.pop();
    else if (piece && piece !== ".") parts.push(piece);
  }
  return parts.join("/");
}

// Link resolution, as Obsidian does it: a full or relative path wins; else by
// name (case-insensitive), the note in the linking note's own folder first,
// then the shortest path, then alphabetical. `files`: vault-relative paths.
export function makeResolver(files) {
  const byLower = new Map(files.map((f) => [f.toLowerCase(), f]));
  const byName = new Map();
  for (const f of files) {
    for (const key of new Set([basename(f).toLowerCase(), stem(f).toLowerCase()])) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(f);
    }
  }
  return (target, from) => {
    let t = target.trim();
    try { t = decodeURI(t); } catch {}
    t = t.replace(/^<|>$/g, "").replace(/^\/+/, "");
    if (!t) return from ?? null;
    const exact = (p) => byLower.get(p.toLowerCase()) ?? byLower.get((p + ".md").toLowerCase()) ?? null;
    const fromDir = from ? dirname(from) : "";
    if (t.startsWith("./") || t.startsWith("../")) return exact(joinPath(fromDir, t));
    const hit = exact(t) ?? (fromDir ? exact(joinPath(fromDir, t)) : null);
    if (hit) return hit;
    let cands = byName.get(basename(t).toLowerCase()) ?? [];
    if (t.includes("/")) {
      const tail = "/" + t.toLowerCase();
      cands = cands.filter((f) => ("/" + f.toLowerCase()).endsWith(tail) || ("/" + f.toLowerCase()).endsWith(tail + ".md"));
    }
    if (!cands.length) return null;
    return [...cands].sort((a, b) =>
      Number(dirname(b) === fromDir) - Number(dirname(a) === fromDir) ||
      a.split("/").length - b.split("/").length || a.length - b.length || a.localeCompare(b))[0];
  };
}

// ---- inline markdown --------------------------------------------------------

// encodeURIComponent leaves ( and ) alone, and an unbalanced ) would end the Markdown link early.
export const linkUrl = (target) => "vault:" + encodeURIComponent(target).replace(/\(/g, "%28").replace(/\)/g, "%29");
export function parseLinkUrl(url) {
  if (!url.startsWith("vault:")) return null;
  try { return decodeURIComponent(url.slice(6)); } catch { return url.slice(6); }
}

const TASK = { "/": "◐", "-": "⊘", ">": "↪", "<": "⇠", "!": "!", "?": "?", "*": "★", "\"": "❝", "i": "ℹ", "b": "◆", "I": "💡", "p": "▲", "c": "▼", "f": "🔥", "k": "🔑", "w": "✓", "u": "↗", "d": "↘" };

// Text outside code spans: fn(text) for each such piece.
function outsideCode(line, fn) {
  return line.split(/(`+[^`]*`+)/).map((p, i) => (i % 2 ? p : fn(p))).join("");
}

// One markdown line, rewritten for TextView: wikilinks and note links become
// vault: links (unresolved ones plain italic), ==highlight== bold, #tags code
// chips, %%comments%%, ^block ids and custom task marks handled.
export function inline(line, ctx) {
  const task = line.match(/^(\s*(?:[-*+]|\d+\.)\s+)\[([^\sxX])\]\s+(.*)$/);
  if (task) {
    const mark = TASK[task[2]] ?? `[${task[2]}]`;
    const rest = task[2] === "-" ? `~~${task[3]}~~` : task[3];
    line = `${task[1]}${mark} ${rest}`;
  }
  return outsideCode(line, (s) => {
    s = s.replace(/%%.*?%%/g, "");
    s = s.replace(/(^|\s)\^[A-Za-z0-9-]+\s*$/, "$1");
    // ![[embed]] inside a line: a link to it.
    s = s.replace(/!\[\[([^\]]+)\]\]/g, (_, raw) => wiki(raw, ctx));
    s = s.replace(/\[\[([^\]]+)\]\]/g, (_, raw) => wiki(raw, ctx));
    // [text](relative/note.md) and [text](<note with spaces.md>)
    s = s.replace(/(?<!!)\[([^\]]*)\]\((<[^>]+>|[^)\s]+)\)/g, (all, text, href) => {
      const h = href.replace(/^<|>$/g, "");
      if (/^[a-z][\w+.-]*:/i.test(h)) return all;
      const { path, anchor } = splitLink(h.replace(/%20/g, " "));
      const target = path ? ctx.resolve(path, ctx.from) : ctx.from;
      if (!target) return `*${text}*`;
      return `[${text}](${linkUrl(target + (anchor ? "#" + anchor : ""))})`;
    });
    s = s.replace(/==([^=\n]+?)==/g, "**$1**");
    s = s.replace(/(^|[\s(,;])#([\p{L}_][\p{L}\p{N}_/-]*)/gu, "$1`#$2`");
    return s;
  });
}

function wiki(raw, ctx) {
  const { path, anchor, alias } = splitLink(raw);
  const label = alias || (path ? stem(path) : "") + (anchor ? (path ? " › " : "") + anchor.replace(/^\^/, "") : "");
  const target = path ? ctx.resolve(path, ctx.from) : ctx.from;
  if (!target) return `*${label.replace(/\*/g, "")}*`;
  return `[${label.replace(/[[\]]/g, "")}](${linkUrl(target + (anchor ? "#" + anchor : ""))})`;
}

// $…$ as Obsidian reads it: no space just inside, not followed by a digit.
const INLINE_MATH_SRC = String.raw`(?<![\\$])\$(?=[^\s$])((?:\\\$|[^$\n])+?)(?<=[^\s\\])\$(?![\d$])`;
const INLINE_MATH_ONCE = new RegExp(INLINE_MATH_SRC); // no g flag: no lastIndex to leave behind

export function hasInlineMath(text) {
  return outsideCode(text, (s) => (INLINE_MATH_ONCE.test(s) ? "\u0001" : "")).includes("\u0001");
}

// A paragraph with inline math as tokens for a wrapping row:
// { kind: "text", text, bold?, italic?, code?, link? } | { kind: "math", src }.
export function flowTokens(text, ctx) {
  const out = [];
  const pieces = text.split(/(`[^`]+`)/);
  pieces.forEach((piece, i) => {
    if (i % 2) { out.push({ kind: "text", text: piece.slice(1, -1), code: true }); return; }
    let last = 0;
    for (const m of piece.matchAll(new RegExp(INLINE_MATH_SRC, "g"))) {
      styled(piece.slice(last, m.index), out, ctx);
      out.push({ kind: "math", src: m[1] });
      last = m.index + m[0].length;
    }
    styled(piece.slice(last), out, ctx);
  });
  return out;
}

// **bold**, *italic*, [[links]] and [text](url) in a plain stretch of text.
function styled(s, out, ctx) {
  if (!s) return;
  const re = /\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|==([^=]+)==|\[\[([^\]]+)\]\]|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index > last) out.push({ kind: "text", text: s.slice(last, m.index) });
    if (m[1] || m[2] || m[5]) out.push({ kind: "text", text: m[1] || m[2] || m[5], bold: true });
    else if (m[3] || m[4]) out.push({ kind: "text", text: m[3] || m[4], italic: true });
    else if (m[6]) {
      const { path, anchor, alias } = splitLink(m[6]);
      const target = path ? ctx.resolve(path, ctx.from) : ctx.from;
      out.push({ kind: "text", text: alias || stem(path || "") + (anchor ? " › " + anchor : ""), link: target ? linkUrl(target + (anchor ? "#" + anchor : "")) : null, italic: !target });
    } else out.push({ kind: "text", text: m[7], link: /^[a-z][\w+.-]*:/i.test(m[8]) ? m[8] : (() => { const t = ctx.resolve(m[8].replace(/%20/g, " "), ctx.from); return t ? linkUrl(t) : null; })() });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ kind: "text", text: s.slice(last) });
}

// ---- blocks -------------------------------------------------------------------

const QUERY = new Set(["dataview", "dataviewjs", "tasks", "query", "base"]);

// ctx: { resolve(target, from) → path | null, from: the note's vault path }
export function parseBlocks(body, ctx, depth = 0) {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let buf = [];
  let comment = false;

  const flush = () => {
    if (!buf.length) return;
    // Paragraphs (blank-line separated) with inline math become flow blocks.
    let para = [];
    const md = [];
    const pushMd = () => { if (md.length && md.join("").trim()) blocks.push({ type: "md", text: md.join("\n") }); md.length = 0; };
    const endPara = () => {
      if (!para.length) return;
      const text = para.join("\n");
      const flow = (lines) => {
        pushMd();
        blocks.push({ type: "flow", tokens: flowTokens(lines.map((l) => l.replace(/^(\s*)([-*+])\s+/, "$1• ").replace(/^#{1,6}\s+/, "")).join(" "), ctx), heading: (lines[0].match(/^(#{1,6})\s/) || [])[1]?.length ?? 0 });
      };
      if (hasInlineMath(text) && !/^\s*\|/.test(para[0])) {
        // Wrapped prose is one paragraph; list items, headings and quotes each keep their own line.
        if (para.length > 1 && para.some((l) => /^\s*(?:[-*+]|\d+\.)\s|^#{1,6}\s|^\s*>/.test(l))) {
          let prose = [];
          const endProse = () => { if (prose.length) { hasInlineMath(prose.join("\n")) ? flow(prose) : md.push(...prose.map((l) => inline(l, ctx))); prose = []; } };
          for (const l of para) {
            if (/^\s*(?:[-*+]|\d+\.)\s|^#{1,6}\s|^\s*>/.test(l)) { endProse(); prose = [l]; } else prose.push(l);
          }
          endProse();
        } else flow(para);
      } else md.push(...para.map((l) => inline(l, ctx)));
      para = [];
    };
    for (const l of buf) {
      if (l.trim() === "") { endPara(); md.push(""); }
      else para.push(l);
    }
    endPara();
    pushMd();
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // %% block comments %% (may span lines)
    if (comment) { if (line.includes("%%")) { comment = false; line = line.slice(line.indexOf("%%") + 2); if (!line.trim()) continue; } else continue; }
    const open = line.replace(/%%.*?%%/g, "");
    if (open.includes("%%") && !/`[^`]*%%/.test(open)) {
      const before = open.slice(0, open.indexOf("%%"));
      comment = true;
      if (before.trim()) buf.push(before);
      continue;
    }

    const fence = line.match(/^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/);
    if (fence) {
      const mark = fence[2], lang = fence[3].toLowerCase();
      const body = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const close = lines[j].match(/^\s*(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === mark[0] && close[1].length >= mark.length) break;
        body.push(lines[j].slice(Math.min(fence[1].length, lines[j].search(/\S|$/))));
      }
      flush();
      if (lang === "mermaid") blocks.push({ type: "mermaid", src: body.join("\n") });
      else if (QUERY.has(lang)) blocks.push({ type: "query", lang, src: body.join("\n") });
      else if (lang === "math") blocks.push({ type: "math", src: body.join("\n") });
      else blocks.push({ type: "code", text: [mark + (fence[3] || ""), ...body, mark].join("\n") });
      i = j;
      continue;
    }

    const t = line.trim();
    if (t.startsWith("$$")) {
      let src = t.slice(2);
      let j = i;
      if (src.includes("$$")) src = src.slice(0, src.indexOf("$$"));
      else {
        const parts = [src];
        for (j = i + 1; j < lines.length; j++) {
          const k = lines[j].indexOf("$$");
          if (k >= 0) { parts.push(lines[j].slice(0, k)); break; }
          parts.push(lines[j]);
        }
        src = parts.join("\n");
      }
      flush();
      if (src.trim()) blocks.push({ type: "math", src: src.trim() });
      i = j;
      continue;
    }

    const callout = line.match(/^\s*>\s*\[!([^\]]+)\]([+-]?)\s*(.*)$/);
    if (callout) {
      const inner = [];
      let j = i + 1;
      for (; j < lines.length && /^\s*>/.test(lines[j]); j++) inner.push(lines[j].replace(/^\s*>\s?/, ""));
      flush();
      const kind = callout[1].trim().toLowerCase();
      blocks.push({ type: "callout", kind, fold: callout[2], title: callout[3] ? inline(callout[3], ctx) : kind[0].toUpperCase() + kind.slice(1),
        body: depth < 6 ? parseBlocks(inner.join("\n"), ctx, depth + 1) : [{ type: "md", text: inner.join("\n") }] });
      i = j - 1;
      continue;
    }

    const embed = t.match(/^!\[\[([^\]]+)\]\]$/);
    if (embed) {
      flush();
      const { path, anchor, alias } = splitLink(embed[1]);
      blocks.push({ type: "embed", target: path, anchor, size: alias });
      continue;
    }

    const img = t.match(/^!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)$/);
    if (img) {
      flush();
      const [alt, size] = img[1].split("|");
      blocks.push({ type: "image", src: img[2].replace(/^<|>$/g, ""), alt, size: size ?? (/^\d+(x\d+)?$/.test(alt) ? alt : null) });
      continue;
    }

    buf.push(line);
  }
  flush();
  return blocks;
}

// "300" or "300x200" (embed sizes) → { w, h } or null.
export function parseSize(s) {
  const m = String(s ?? "").match(/^(\d+)(?:x(\d+))?$/);
  return m ? { w: Number(m[1]), h: m[2] ? Number(m[2]) : null } : null;
}

// The Excalidraw plugin's drawings are .md files with this front matter.
export const isExcalidraw = (path, text) => /\.excalidraw(\.md)?$/i.test(path) || /^---[\s\S]*?excalidraw-plugin:/m.test(text?.slice(0, 600) ?? "");

// A link the reader may hand to the system's opener: http, https or mailto only. Anything else
// (file:, obsidian:, javascript:, a bare path, an option-looking string) is dropped. → the URL | null
export function safeUrl(u) {
  const s = String(u ?? "").trim();
  if (!s || s.startsWith("-") || /[\u0000-\u001f\u007f]/.test(s)) return null;
  let url;
  try { url = new URL(s); } catch { return null; }
  return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
}
