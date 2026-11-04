import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

// excalidraw.js is a browser script that sets window.excalidrawSvg.
globalThis.window = {};
await import(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "mods", "vault-reader", "render", "excalidraw.js"));
const draw = (elements, files) => window.excalidrawSvg({ json: JSON.stringify({ elements, files }) }, false);

// Anything that is not tag markup the generator itself wrote: attribute values must not close their quote.
const BAD = [`red"/><img src=x onerror=alert(1)>`, `</text><script>alert(1)</script>`, `'><svg onload=alert(1)>`, `url(javascript:alert(1))`];

test("hostile colors, numbers and styles never reach the SVG (CR-1-7)", () => {
  for (const bad of BAD) {
    const svg = draw([
      { type: "rectangle", x: 0, y: 0, width: 100, height: 50, strokeColor: bad, backgroundColor: bad, fillStyle: bad, strokeStyle: bad, roundness: { type: 3, value: bad }, opacity: bad, angle: bad },
      { type: "ellipse", x: bad, y: bad, width: bad, height: bad, strokeWidth: bad },
      { type: "arrow", x: 0, y: 0, width: 10, height: 10, points: [[0, 0], [bad, bad], [10, 10]], endArrowhead: bad, startArrowhead: bad },
      { type: "text", x: 0, y: 0, width: 10, height: 10, text: bad, fontSize: bad, fontFamily: bad, textAlign: bad },
      { type: "frame", x: 0, y: 0, width: 10, height: 10, name: bad },
      { type: "embeddable", x: 0, y: 0, width: 10, height: 10, link: bad },
    ]);
    const tags = [...svg.matchAll(/<\/?([a-zA-Z]+)/g)].map((m) => m[1]);
    const allowed = new Set(["svg", "defs", "pattern", "path", "g", "rect", "polygon", "ellipse", "line", "polyline", "circle", "text", "tspan", "image"]);
    assert.deepEqual(tags.filter((t) => !allowed.has(t)), [], `unexpected element from: ${bad}`);
    for (const m of svg.matchAll(/\s[\w:-]+=(?:"([^"]*)"|'([^']*)')/g)) {
      const v = m[1] ?? m[2];
      assert.equal(/[<>]|javascript:|onerror|onload/i.test(v), false, `attribute value from ${bad}: ${v}`);
    }
  }
});

test("text is escaped, including single quotes", () => {
  const svg = draw([{ type: "text", x: 0, y: 0, width: 10, height: 10, text: `<b>"hi" & 'x'</b>` }]);
  assert.match(svg, /&lt;b&gt;&quot;hi&quot; &amp; &#39;x&#39;&lt;\/b&gt;/);
  assert.equal(svg.includes("<b>"), false);
});

test("valid colors and numbers pass through", () => {
  const svg = draw([{ type: "rectangle", x: 10, y: 10, width: 100, height: 40, strokeColor: "#ff0000", backgroundColor: "rgba(1, 2, 3, 0.5)", fillStyle: "solid", strokeWidth: 4, opacity: 50 }]);
  assert.match(svg, /stroke="#ff0000"/);
  assert.match(svg, /fill="rgba\(1, 2, 3, 0\.5\)"/);
  assert.match(svg, /opacity="0\.5"/);
});

test("images: only base64 data URLs of image types", () => {
  const img = (dataURL) => draw([{ type: "image", x: 0, y: 0, width: 10, height: 10, fileId: "f" }], { f: { id: "f", dataURL } });
  assert.match(img("data:image/png;base64,iVBORw0KGgo="), /<image href="data:image\/png;base64,iVBORw0KGgo="/);
  for (const bad of [`data:image/png;base64,AAA" onload="x`, "javascript:alert(1)", "https://evil/x.png", "data:text/html;base64,AAAA"]) {
    assert.equal(img(bad).includes("<image"), false, bad);
  }
});

test("garbage input is an error or an empty drawing, not a crash with markup", () => {
  assert.throws(() => draw([]), /empty/);
  assert.throws(() => draw([null, 5, "x"]), /empty/);
  assert.doesNotThrow(() => draw([{ type: "line", points: "nope", x: 0, y: 0, width: 1, height: 1 }]));
});

test("fonts are generic stacks that exist on every OS", () => {
  const svg = draw([{ type: "text", x: 0, y: 0, width: 10, height: 10, text: "a", fontFamily: 3 }]);
  assert.match(svg, /monospace/);
  assert.match(draw([{ type: "text", x: 0, y: 0, width: 10, height: 10, text: "a", fontFamily: 1 }]), /cursive/);
});
