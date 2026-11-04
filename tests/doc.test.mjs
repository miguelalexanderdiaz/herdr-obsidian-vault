import test from "node:test";
import assert from "node:assert/strict";
import { buildDoc, kindOf } from "../mods/vault-reader/doc.js";
import { makeResolver } from "../mods/vault-reader/parse.js";

// A vault in memory: { "path": "text" }.
function env(files) {
  const names = Object.keys(files);
  return { read: async (f) => (f in files ? files[f] : null), resolve: makeResolver(names), deps: new Set(), abs: (f) => `/v/${f}` };
}

test("kinds by extension", () => {
  assert.deepEqual(["a.md", "a.canvas", "a.excalidraw.md", "a.PNG", "a.pdf", "a.zip"].map(kindOf), ["note", "canvas", "excalidraw", "image", "pdf", "other"]);
});

test("a missing file is a plain message, not a throw", async () => {
  const d = await buildDoc("gone.md", null, 0, env({}));
  assert.match(d.error, /no longer in the vault/);
});

test("front matter becomes properties on the opened note only", async () => {
  const e = env({ "a.md": "---\ntitle: A\n---\nBody\n\n![[b]]", "b.md": "---\nx: 1\n---\nInner" });
  const d = await buildDoc("a.md", null, 0, e);
  assert.deepEqual(d.props, [["title", "A"]]);
  const embed = d.blocks.find((b) => b.type === "embed");
  assert.deepEqual(embed.doc.props, []);
  assert.equal(embed.resolved, "b.md");
});

test("embeds stop two levels deep and a self-embed does not recurse", async () => {
  const e = env({ "a.md": "![[b]]", "b.md": "![[c]]", "c.md": "![[d]]", "d.md": "end", "s.md": "![[s]]" });
  const d = await buildDoc("a.md", null, 0, e);
  const b = d.blocks[0].doc, c = b.blocks[0].doc;
  assert.equal(c.blocks[0].doc, undefined, "depth cap");
  const self = await buildDoc("s.md", null, 0, e);
  assert.equal(self.blocks[0].doc, undefined);
});

test("a missing anchor shows the whole note with a marker", async () => {
  const d = await buildDoc("a.md", "Nope", 0, env({ "a.md": "# One\ntext" }));
  assert.equal(d.missing, "Nope");
  assert.equal(d.blocks.length > 0, true);
});

test("an anchor shows just that section", async () => {
  const d = await buildDoc("a.md", "Two", 0, env({ "a.md": "# One\nfirst\n# Two\nsecond" }));
  assert.equal(JSON.stringify(d.blocks).includes("first"), false);
  assert.equal(JSON.stringify(d.blocks).includes("second"), true);
});

test("canvas file cards resolve and build their notes", async () => {
  const canvas = JSON.stringify({ nodes: [{ id: "1", type: "file", file: "n.md", x: 0, y: 0, width: 200, height: 100 }, { id: "2", type: "file", file: "pic.png", x: 300, y: 0, width: 100, height: 100 }] });
  const d = await buildDoc("c.canvas", null, 0, env({ "c.canvas": canvas, "n.md": "hello", "pic.png": "x" }));
  assert.equal(d.kind, "canvas");
  assert.equal(d.canvas.nodes[0].doc.kind, "note");
  assert.equal(d.canvas.nodes[1].fileKind, "image");
});

test("an empty canvas builds (no throw) and a broken one is a message", async () => {
  const empty = await buildDoc("c.canvas", null, 0, env({ "c.canvas": '{"nodes":[]}' }));
  assert.equal(empty.canvas.empty, true);
  const bad = await buildDoc("c.canvas", null, 0, env({ "c.canvas": "{oops" }));
  assert.match(bad.error, /Not a canvas file/);
});

test("excalidraw notes are detected by name or by front matter", async () => {
  const a = await buildDoc("d.excalidraw.md", null, 0, env({ "d.excalidraw.md": "x" }));
  const b = await buildDoc("e.md", null, 0, env({ "e.md": "---\nexcalidraw-plugin: parsed\n---\n" }));
  assert.equal(a.kind, "excalidraw");
  assert.equal(b.kind, "excalidraw");
});

test("dependencies are recorded for live reload", async () => {
  const e = env({ "a.md": "![[b]]", "b.md": "x" });
  await buildDoc("a.md", null, 0, e);
  assert.deepEqual([...e.deps].sort(), ["/v/a.md", "/v/b.md"]);
});
