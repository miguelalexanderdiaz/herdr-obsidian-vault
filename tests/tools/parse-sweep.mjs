// node test-parse.mjs <vault> : parses every note, reports exceptions and block counts.
import fs from "fs"; import path from "path";
import { splitFrontmatter, parseBlocks, makeResolver, section, headings } from "../../mods/vault-reader/parse.js";
const V = process.argv[2];
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith(".")) continue; const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(path.relative(V, p)); } })(V);
const resolve = makeResolver(files);
const count = {}; let errors = 0, unresolved = 0, links = 0;
for (const f of files.filter((f) => f.endsWith(".md"))) {
  try {
    const text = fs.readFileSync(path.join(V, f), "utf8");
    const { props, body } = splitFrontmatter(text);
    const ctx = { from: f, resolve: (t, from) => { links++; const r = resolve(t, from); if (!r) unresolved++; return r; } };
    const blocks = parseBlocks(body, ctx);
    const walk = (bs) => bs.forEach((b) => { count[b.type] = (count[b.type] ?? 0) + 1; if (b.body) walk(b.body); });
    walk(blocks);
    for (const h of headings(body)) if (section(body, h.text) == null) { console.log("section miss", f, h.text); }
  } catch (e) { errors++; console.log("ERR", f, e.stack.split("\n").slice(0, 3).join(" | ")); }
}
console.log({ notes: files.filter((f) => f.endsWith(".md")).length, errors, links, unresolved, count });
