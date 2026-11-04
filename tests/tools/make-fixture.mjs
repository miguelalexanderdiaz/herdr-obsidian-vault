// node make-fixture.mjs <out.js> <vault> <file>... : documents for the check harness.
import fs from "fs"; import path from "path";
import { buildDoc } from "../../mods/vault-reader/doc.js"; import { makeResolver } from "../../mods/vault-reader/parse.js";
const [out, ...rest] = process.argv.slice(2);
const docs = [];
for (const spec of rest) {
  const [vault, file, anchor] = spec.split("::");
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith(".")) continue; const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(path.relative(vault, p)); } })(vault);
  const resolve = makeResolver(files);
  const env = { read: async (f) => { try { return fs.readFileSync(path.join(vault, f), "utf8"); } catch { return null; } }, resolve, deps: new Set(), abs: (f) => path.join(vault, f) };
  docs.push({ vault, doc: await buildDoc(file, anchor || null, 0, env) });
}
fs.writeFileSync(out, "export default " + JSON.stringify(docs) + ";\n");
console.log(docs.map((d) => `${d.doc.file}: ${d.doc.kind}${d.doc.error ? " ERROR " + d.doc.error : ""} blocks=${d.doc.blocks?.length ?? "-"}`).join("\n"));
