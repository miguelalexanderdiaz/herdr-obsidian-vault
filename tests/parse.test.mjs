import test from "node:test";
import assert from "node:assert/strict";
import {
  splitFrontmatter, parseYaml, section, headings, splitLink, makeResolver, inline, hasInlineMath, flowTokens,
  parseBlocks, parseSize, isExcalidraw, safeUrl, linkUrl, parseLinkUrl,
} from "../mods/vault-reader/parse.js";

const ctx = (files = []) => ({ from: "a.md", resolve: makeResolver(files) });

test("frontmatter: scalars, flow lists, dash lists", () => {
  const { props, body } = splitFrontmatter("---\ntitle: Hello\ntags: [a, b]\naliases:\n  - x\n  - y\n---\nBody\n");
  assert.deepEqual(props, [["title", "Hello"], ["tags", ["a", "b"]], ["aliases", ["x", "y"]]]);
  assert.equal(body, "Body\n");
  assert.deepEqual(splitFrontmatter("no front matter").props, []);
});

test("yaml: quoted commas stay in one item (CR-1-8.4)", () => {
  assert.deepEqual(parseYaml('list: ["a, b", c]'), [["list", ["a, b", "c"]]]);
  assert.deepEqual(parseYaml("list: ['x, y', 'z']"), [["list", ["x, y", "z"]]]);
});

test("yaml: a trailing comment is kept (documented behaviour)", () => {
  assert.deepEqual(parseYaml("key: val # note"), [["key", "val # note"]]);
});

test("section: a heading runs to the next one as high or higher", () => {
  const body = "# A\na\n## B\nb\n### C\nc\n## D\nd\n";
  assert.equal(section(body, "B"), "## B\nb\n### C\nc");
  assert.equal(section(body, "nope"), null);
  assert.equal(section(body, null), body);
});

test("section: a block id with regex characters does not throw (CR-1-8.1)", () => {
  const body = "# A\nline one ^a(b\n\nother\n";
  assert.doesNotThrow(() => section(body, "^a(b"));
  assert.equal(section(body, "^a(b"), "# A\nline one ^a(b");
  assert.equal(section("x ^a.b\n", "^axb"), null, "the id is text, not a pattern");
  assert.equal(section("- item ^k1\n- two\n", "^k1"), "- item ^k1");
});

test("section: an own-line block id names the block above", () => {
  assert.equal(section("para one\nstill one\n\n^id\n", "^id"), "para one\nstill one");
});

test("fenced: a ```js line inside an open fence is not its closer (CR-1-8.2)", () => {
  const body = "# A\n```md\n```js\n# fake\n```\n# B\nb";
  assert.equal(section(body, "B"), "# B\nb");
  assert.deepEqual(headings(body).map((h) => h.text), ["A", "B"]);
});

test("headings skip fenced code", () => {
  assert.deepEqual(headings("# One\n```\n# not\n```\n## Two").map((h) => h.text), ["One", "Two"]);
});

test("splitLink: path, anchor, alias", () => {
  assert.deepEqual(splitLink("folder/note#Head|alias"), { path: "folder/note", anchor: "Head", alias: "alias" });
  assert.deepEqual(splitLink("note"), { path: "note", anchor: null, alias: null });
});

test("resolver: path wins, then own folder, then shortest path, case-insensitive", () => {
  const r = makeResolver(["projects/a/plan.md", "projects/b/plan.md", "deep/er/plan.md", "Notes/Other Note.md", "img/photo.PNG"]);
  assert.equal(r("projects/b/plan", "x.md"), "projects/b/plan.md");
  assert.equal(r("plan", "projects/b/x.md"), "projects/b/plan.md", "the linking note's own folder first");
  assert.equal(r("plan", "elsewhere/x.md"), "deep/er/plan.md", "same depth: the shorter path");
  assert.equal(makeResolver(["plan.md", "a/plan.md"])("plan", "z/x.md"), "plan.md", "a path from the vault root wins");
  assert.equal(r("other note", "x.md"), "Notes/Other Note.md");
  assert.equal(r("photo.png", "x.md"), "img/photo.PNG");
  assert.equal(r("missing", "x.md"), null);
});

test("resolver: relative links and percent-encoding", () => {
  const r = makeResolver(["a/b/c.md", "a/d.md", "my note.md"]);
  assert.equal(r("../d.md", "a/b/c.md"), "a/d.md");
  assert.equal(r("my%20note", "a/d.md"), "my note.md");
});

test("inline: wikilinks, unresolved links, tags, highlights, comments", () => {
  const c = ctx(["Other.md"]);
  assert.equal(inline("see [[Other]]", c), `see [Other](${linkUrl("Other.md")})`);
  assert.equal(inline("see [[Nope]]", c), "see *Nope*");
  assert.equal(inline("a ==hi== b", c), "a **hi** b");
  assert.equal(inline("x %%hidden%% y", c), "x  y");
  assert.match(inline("a #tag b", c), /`#tag`/);
  assert.equal(inline("- [/] half", c).includes("◐"), true);
});

test("link urls round-trip", () => {
  assert.equal(parseLinkUrl(linkUrl("a b/c#d.md")), "a b/c#d.md");
  assert.equal(parseLinkUrl("https://x"), null);
});

test("math: inline detection and tokens", () => {
  assert.equal(hasInlineMath("a $x^2$ b"), true);
  assert.equal(hasInlineMath("costs $5 and $6"), false);
  assert.equal(hasInlineMath("code `$x$` only"), false);
  const t = flowTokens("a $x$ and **b**", ctx());
  assert.deepEqual(t.filter((x) => x.kind === "math").map((x) => x.src), ["x"]);
  assert.equal(t.some((x) => x.bold), true);
});

test("math: repeated calls do not leak regex state (CR-1-8.5)", () => {
  for (let i = 0; i < 5; i++) { assert.equal(hasInlineMath("a $x$ b"), true); assert.equal(hasInlineMath("plain"), false); }
  assert.equal(flowTokens("$a$ $b$", ctx()).filter((x) => x.kind === "math").length, 2);
});

test("blocks: list items with inline math keep their own lines (CR-1-8.3)", () => {
  const blocks = parseBlocks("- item $x^2$\n- other\n- third $y$", ctx());
  assert.deepEqual(blocks.map((b) => b.type), ["flow", "md", "flow"]);
  assert.equal(blocks[1].text.includes("other"), true);
});

test("blocks: wrapped prose with math stays one paragraph", () => {
  const blocks = parseBlocks("this wraps $x$\nonto a second line", ctx());
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "flow");
});

test("blocks: callouts nest, fold marks and titles", () => {
  const [c] = parseBlocks("> [!warning]- Careful\n> body\n> > [!note] inner\n> > deep", ctx());
  assert.equal(c.type, "callout");
  assert.equal(c.kind, "warning");
  assert.equal(c.fold, "-");
  assert.equal(c.title, "Careful");
  assert.equal(c.body.some((b) => b.type === "callout" && b.kind === "note"), true);
});

test("blocks: fences, mermaid, math, queries", () => {
  const b = parseBlocks("```mermaid\ngraph TD\nA-->B\n```\n\n$$\nx=1\n$$\n\n```dataview\nTABLE x\n```\n\n```js\nlet a\n```", ctx());
  assert.deepEqual(b.map((x) => x.type), ["mermaid", "math", "query", "code"]);
  assert.equal(b[0].src, "graph TD\nA-->B");
});

test("blocks: embeds and images", () => {
  const b = parseBlocks("![[Note#Head|300]]\n\n![alt|200](pic.png)\n\n![](https://example.com/a.png)", ctx());
  assert.equal(b[0].type, "embed");
  assert.deepEqual([b[0].target, b[0].anchor, b[0].size], ["Note", "Head", "300"]);
  assert.equal(b[1].type, "image");
  assert.equal(b[1].size, "200");
  assert.equal(b[2].src, "https://example.com/a.png");
});

test("blocks: %% comments are dropped", () => {
  const b = parseBlocks("a\n%% secret\nmore secret %%\nb", ctx());
  assert.equal(JSON.stringify(b).includes("secret"), false);
});

test("sizes", () => {
  assert.deepEqual(parseSize("300"), { w: 300, h: null });
  assert.deepEqual(parseSize("300x200"), { w: 300, h: 200 });
  assert.equal(parseSize("abc"), null);
});

test("excalidraw detection", () => {
  assert.equal(isExcalidraw("a.excalidraw.md", ""), true);
  assert.equal(isExcalidraw("a.md", "---\nexcalidraw-plugin: parsed\n---"), true);
  assert.equal(isExcalidraw("a.md", "# plain"), false);
});

test("safeUrl: only web links and mail (CR-1-7)", () => {
  assert.equal(safeUrl("https://a"), "https://a/");
  assert.equal(safeUrl("HTTP://x"), "http://x/");
  assert.equal(safeUrl("mailto:a@b.c"), "mailto:a@b.c");
  for (const bad of ["file:///x", "javascript:alert(1)", "obsidian://open?vault=x", "-a", "/etc/passwd", "C:\\Windows\\x.exe", "", null, undefined, "https://a\n.b", "data:text/html,x", "vbscript:x"]) {
    assert.equal(safeUrl(bad), null, String(bad));
  }
});
