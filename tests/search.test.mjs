import test from "node:test";
import assert from "node:assert/strict";
import { snippet, pickNeedle, parseHits, parseFiles, rank, searchWith, filesArgs, textArgs } from "../mods/vault/search-core.js";
import { fakeExec } from "./helpers.mjs";

test("snippet: window around the first word, ellipses only where cut", () => {
  const line = "x".repeat(100) + " the plan is here " + "y".repeat(200);
  const s = snippet(line, ["plan"]);
  assert.match(s, /^….*plan.*…$/);
  assert.ok(s.length <= 144);
  assert.equal(snippet("short plan", ["plan"]), "short plan");
});

test("snippet: no word found does not produce an empty snippet (CR-1-10)", () => {
  assert.equal(snippet("some line of text", ["zzz"]), "some line of text");
  assert.equal(snippet("   ", ["a"]), "");
  assert.equal(snippet("a  b\t c", []), "a b c");
});

test("needle: the longest word", () => {
  assert.equal(pickNeedle(["the", "plan", "of"]), "plan");
});

test("hits: a path containing :12: is split on the NUL, not on colons (CR-1-10)", () => {
  const out = "Notes 10:30:15.md\u00003:found it here\nother/a.md\u000012:second: with colons\n";
  assert.deepEqual(parseHits(out), [
    { rel: "Notes 10:30:15.md", line: 3, text: "found it here" },
    { rel: "other/a.md", line: 12, text: "second: with colons" },
  ]);
  assert.deepEqual(parseHits("./a.md\u00001:x\n").map((h) => h.rel), ["a.md"]);
  assert.deepEqual(parseHits("garbage without nul\n\n"), []);
});

test("files list is NUL-separated, so names with newlines survive", () => {
  assert.deepEqual(parseFiles("a.md\u0000b/c d.md\u0000"), ["a.md", "b/c d.md"]);
});

test("rank: names first (short paths first) with their first text line; then text-only hits", () => {
  const files = ["deep/er/Plan notes.md", "Plan.md", "other.md"];
  const hits = [
    { rel: "other.md", line: 4, text: "the PLAN is long" },
    { rel: "Plan.md", line: 1, text: "plan summary" },
    { rel: "other.md", line: 9, text: "no match line" },
  ];
  const r = rank(files, hits, ["plan"]);
  assert.deepEqual(r.map((x) => x.rel), ["Plan.md", "deep/er/Plan notes.md", "other.md"]);
  assert.equal(r[0].text, "plan summary");
  assert.equal(r[2].line, 4);
});

test("rank: every word must be in the one line", () => {
  const r = rank([], [{ rel: "a.md", line: 1, text: "only plan" }, { rel: "b.md", line: 1, text: "the plan of work" }], ["plan", "work"]);
  assert.deepEqual(r.map((x) => x.rel), ["b.md"]);
});

test("rg arguments: no user config, no ignore files, NUL output, vault internals excluded", () => {
  for (const args of [filesArgs(), textArgs("x")]) {
    for (const a of ["--no-config", "--no-ignore", "--null", "--no-messages", "!.obsidian", "!.git"]) assert.ok(args.includes(a), a);
  }
  assert.deepEqual(textArgs("needle").slice(-3), ["-e", "needle", "."]);
});

const deps = (script, over = {}) => ({ exec: fakeExec(script), tool: async () => "rg", platform: "linux", cache: new Map(), ...over });

test("search: lists files once per vault, greps the longest word", async () => {
  const d = deps((cmd, args) => (args.includes("--files") ? { stdout: "Plan.md\u0000x.md\u0000" } : { stdout: "x.md\u00002:the plan\n" }));
  const r1 = await searchWith(d, "/v", "the plan");
  assert.deepEqual(r1.map((x) => x.rel), ["x.md"], "Plan.md has only one of the two words in its name");
  await searchWith(d, "/v", "the plan");
  assert.equal(d.exec.calls.filter((c) => c.args.includes("--files")).length, 1, "file list cached");
  assert.ok(d.exec.calls.some((c) => c.args.at(-3) === "-e" && c.args.at(-2) === "plan"));
  assert.equal(d.exec.calls[0].opts.cwd, "/v");
  d.cache.delete("/v");
  await searchWith(d, "/v", "plan");
  assert.equal(d.exec.calls.filter((c) => c.args.includes("--files")).length, 2, "forgotten when the vault changes");
});

test("search: rg exit 1 means no matches; exit 2 with output is still a result (CR-1-10)", async () => {
  const none = deps((cmd, args) => (args.includes("--files") ? { stdout: "" } : { code: 1 }));
  assert.deepEqual(await searchWith(none, "/v", "zzz"), []);
  const partial = deps((cmd, args) => (args.includes("--files") ? { stdout: "" } : { code: 2, stdout: "a.md\u00001:zzz hit\n", stderr: "permission denied" }));
  assert.deepEqual((await searchWith(partial, "/v", "zzz")).map((x) => x.rel), ["a.md"]);
  const broken = deps((cmd, args) => (args.includes("--files") ? { stdout: "" } : { code: 2, stdout: "", stderr: "regex parse error" }));
  await assert.rejects(searchWith(broken, "/v", "zzz"), /regex parse error/);
});

test("search: no ripgrep gives the install hint for this OS (CR-1-4)", async () => {
  for (const [platform, hint] of [["macos", /brew install ripgrep/], ["linux", /apt install ripgrep/], ["windows", /winget install BurntSushi\.ripgrep\.MSVC/]]) {
    const d = deps(() => undefined, { tool: async () => null, platform });
    await assert.rejects(searchWith(d, "/v", "abc"), (e) => hint.test(e.message) && e.missing === "rg");
  }
});

test("search: blank query is empty without running anything", async () => {
  const d = deps(() => undefined);
  assert.deepEqual(await searchWith(d, "/v", "   "), []);
  assert.equal(d.exec.calls.length, 0);
});
