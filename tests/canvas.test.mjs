import test from "node:test";
import assert from "node:assert/strict";
import { parseCanvas, edgesSvg, canvasColor } from "../mods/vault-reader/canvas.js";

const theme = { line: "#888888", text: "#ffffff", bg: "#101010", font: "sans-serif" };

test("an empty canvas parses and draws nothing instead of throwing (CR-1-2)", () => {
  const c = parseCanvas('{"nodes":[]}');
  assert.equal(c.empty, true);
  assert.deepEqual(c.box, { x: 0, y: 0, w: 0, h: 0 });
  assert.equal(edgesSvg(c, theme), null);
  for (const text of ["", "{}", '{"nodes":null,"edges":null}', '{"nodes":[{"id":"x"}]}']) {
    const e = parseCanvas(text);
    assert.equal(e.empty, true, text);
    assert.equal(edgesSvg(e, theme), null);
  }
});

test("cards without a size get Obsidian-like defaults", () => {
  const c = parseCanvas(JSON.stringify({ nodes: [{ id: "a", type: "text", x: 0, y: 0 }, { id: "b", type: "file", file: "x.md", x: 500, y: 0, width: "wide" }] }));
  assert.equal(c.empty, undefined);
  assert.deepEqual(c.nodes.map((n) => [n.width, n.height]), [[250, 60], [400, 300]]);
  assert.equal(Number.isFinite(c.box.w), true);
  assert.equal(c.box.w > 0 && c.box.h > 0, true);
});

test("groups go under cards, bigger groups under smaller ones", () => {
  const c = parseCanvas(JSON.stringify({ nodes: [
    { id: "t", type: "text", x: 10, y: 10, width: 50, height: 50 },
    { id: "small", type: "group", x: 0, y: 0, width: 100, height: 100 },
    { id: "big", type: "group", x: 0, y: 0, width: 500, height: 500 }] }));
  assert.deepEqual(c.nodes.map((n) => n.id), ["big", "small", "t"]);
});

test("edges: arrows, labels with markup are escaped, edges to missing cards are skipped", () => {
  const c = parseCanvas(JSON.stringify({
    nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 100, height: 50 }, { id: "b", type: "text", x: 300, y: 0, width: 100, height: 50 }],
    edges: [{ fromNode: "a", toNode: "b", label: 'x <b>&"y</b>' }, { fromNode: "a", toNode: "zzz" }, null, "junk"] }));
  const svg = edgesSvg(c, theme);
  assert.match(svg, /^<svg /);
  assert.equal(svg.includes("<b>"), false);
  assert.match(svg, /x &lt;b&gt;&amp;&quot;y&lt;\/b&gt;/);
  assert.equal((svg.match(/<path /g) || []).length, 1);
  assert.equal(svg.includes("<polygon"), true);
});

test("a hostile theme font cannot break out of the attribute", () => {
  const c = parseCanvas(JSON.stringify({ nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 10, height: 10 }, { id: "b", type: "text", x: 90, y: 0, width: 10, height: 10 }], edges: [{ fromNode: "a", toNode: "b", label: "L" }] }));
  const svg = edgesSvg(c, { ...theme, font: '"><script>x</script>' });
  assert.equal(svg.includes("<script>"), false);
});

test("colors: preset numbers, hex normalized to #rrggbb, junk falls back", () => {
  assert.equal(canvasColor("1", "x"), "#fb464c");
  assert.equal(canvasColor(4, "x"), "#44cf6e");
  assert.equal(canvasColor("#abc", "x"), "#aabbcc");
  assert.equal(canvasColor("#AABBCCDD", "x"), "#aabbcc");
  assert.equal(canvasColor("red", "x"), "x");
  assert.equal(canvasColor("constructor", "x"), "x");
  assert.equal(canvasColor(undefined, "fb"), "fb");
});

test("invalid JSON throws (the caller shows 'Not a canvas file')", () => {
  assert.throws(() => parseCanvas("{nope"));
});
