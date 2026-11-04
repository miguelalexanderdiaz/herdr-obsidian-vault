// A tiny fake obsidian.asar for tests/render-e2e.test.mjs: the two files render.mjs takes out of it
// (lib/mermaid.min.js and lib/mathjax/tex-chtml-full.js), as stubs that implement exactly what
// render/page.js uses. Built here, not stored, so no Obsidian file is ever in the repository.
//
// asar layout (what render.mjs extract() reads): bytes 0-3 = 4, 4-7 = size of the header pickle,
// 8-11 = pickle payload size, 12-15 = JSON length, then the JSON, padding to 4 bytes, then the file data.
// Stub behaviour:
//   mermaid.render(id, src): src "IMG:<url>" draws an <img src=url> inside the SVG (a note's label could do
//   the same); "HANG" never answers; "THROW" rejects; anything else is a plain 100x50 box.
import fs from "node:fs";
import path from "node:path";

export const MERMAID_STUB = `
window.mermaid = {
  initialize() {},
  async render(id, src) {
    if (src === "HANG") return new Promise(() => {});
    if (src === "THROW") throw new Error("Parse error in the stub");
    const img = (src.match(/^IMG:(\\S+)/) || [])[1];
    const label = img ? '<foreignObject x="0" y="0" width="100" height="50"><div xmlns="http://www.w3.org/1999/xhtml"><img src="' + img + '" width="10" height="10"></div></foreignObject>' : "";
    return { svg: '<svg id="' + id + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100" height="50"><rect x="1" y="1" width="98" height="48" fill="#345"/>' + label + '</svg>' };
  },
};`;

// page.html sets window.MathJax = { startup: { ready() {...} } } before this script runs.
export const MATHJAX_STUB = `
(function () {
  const config = window.MathJax;
  window.MathJax = {
    startup: { defaultReady() {}, promise: Promise.resolve(), document: { clear() {}, updateDocument() {} } },
    tex2chtml(src) {
      const n = document.createElement("mjx-container");
      n.textContent = src;
      n.style.cssText = "display:inline-block;width:" + (10 + src.length * 6) + "px;height:20px";
      return n;
    },
    chtmlStylesheet() { return document.createElement("style"); },
  };
  config.startup.ready.call(window.MathJax);
})();`;

export function buildAsar(files) {
  // files: { "lib/mermaid.min.js": "text", ... } → Buffer
  const tree = { files: {} };
  const bodies = [];
  let offset = 0;
  for (const [p, text] of Object.entries(files)) {
    const body = Buffer.from(text);
    let node = tree;
    const parts = p.split("/");
    for (const dir of parts.slice(0, -1)) node = (node.files[dir] ??= { files: {} });
    node.files[parts.at(-1)] = { size: body.length, offset: String(offset) };
    bodies.push(body);
    offset += body.length;
  }
  const json = Buffer.from(JSON.stringify(tree));
  const padded = Math.ceil(json.length / 4) * 4;
  const head = Buffer.alloc(16 + padded);
  head.writeUInt32LE(4, 0);
  head.writeUInt32LE(8 + padded, 4);
  head.writeUInt32LE(4 + padded, 8);
  head.writeUInt32LE(json.length, 12);
  json.copy(head, 16);
  return Buffer.concat([head, ...bodies]);
}

// Writes <dir>/obsidian.asar and returns its path.
export function writeStubAsar(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "obsidian.asar");
  fs.writeFileSync(file, buildAsar({ "lib/mermaid.min.js": MERMAID_STUB, "lib/mathjax/tex-chtml-full.js": MATHJAX_STUB, "lib/other.js": "// not taken" }));
  return file;
}
