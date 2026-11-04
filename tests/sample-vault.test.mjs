// The hermetic end-to-end check: every note of examples/sample-vault and of tests/fixtures goes
// through the same code the reader uses (listVault, makeResolver, buildDoc, parseBlocks).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { splitFrontmatter, parseBlocks, makeResolver, section, headings } from "../mods/vault-reader/parse.js";
import { buildDoc } from "../mods/vault-reader/doc.js";
import { listVault } from "../mods/vault-reader/vault-files.js";
import { parseVaults } from "../mods/vault/obsidian-config.js";
import { VAULT, ROOT, walk, readVaultFile } from "./helpers.mjs";

const readdir = (d, o) => fs.promises.readdir(d, o);

test("listVault finds the sample vault's files and skips dot folders", async () => {
  const files = (await listVault(VAULT, readdir)).sort();
  assert.deepEqual(files, walk(VAULT).sort());
  assert.ok(files.includes("Feature tour.md") && files.includes("projects/a/plan.md") && files.includes("attachments/photo.png"));
  assert.equal(files.some((f) => f.startsWith(".")), false);
});

test("every note parses, every heading is a reachable section, block counts match the tour", async () => {
  const files = walk(VAULT);
  const resolve = makeResolver(files);
  const count = {};
  let links = 0, unresolved = 0;
  const notes = files.filter((f) => f.endsWith(".md"));
  assert.equal(notes.length, 5);
  for (const f of notes) {
    const { body } = splitFrontmatter(readVaultFile(f));
    const ctx = { from: f, resolve: (t, from) => { links++; const r = resolve(t, from); if (!r) unresolved++; return r; } };
    const visit = (bs) => bs.forEach((b) => { count[b.type] = (count[b.type] ?? 0) + 1; if (b.body) visit(b.body); });
    visit(parseBlocks(body, ctx));
    for (const h of headings(body)) assert.notEqual(section(body, h.text), null, `${f}: section "${h.text}"`);
  }
  assert.equal(unresolved, 1, "exactly one intentionally unresolved link");
  assert.deepEqual({ callout: count.callout, flow: count.flow, math: count.math, mermaid: count.mermaid, embed: count.embed, code: count.code, query: count.query },
    { callout: 5, flow: 1, math: 1, mermaid: 2, embed: 6, code: 1, query: 1 });
});

test("buildDoc opens every file of the sample vault without an error", async () => {
  const files = walk(VAULT);
  const resolve = makeResolver(files);
  for (const f of files) {
    const env = { read: async (r) => { try { return readVaultFile(r); } catch { return null; } }, resolve, deps: new Set(), abs: (r) => path.join(VAULT, r) };
    const doc = await buildDoc(f, null, 0, env);
    assert.equal(doc.error, undefined, f);
  }
});

test("the fixtures in tests/fixtures: odd anchors, fence info strings and list math", async () => {
  const text = fs.readFileSync(path.join(ROOT, "tests", "fixtures", "odd-anchors.md"), "utf8");
  assert.equal(section(text, "^a(b")?.includes("block id"), true);
  assert.equal(section(text, "Real heading")?.startsWith("# Real heading"), true, "the ```js line inside the ```md fence did not close it");
  const blocks = parseBlocks(splitFrontmatter(text).body, { from: "x.md", resolve: () => null });
  assert.ok(blocks.filter((b) => b.type === "flow").length >= 2, "list items with math each keep their line");
  const code = blocks.find((b) => b.type === "code");
  assert.ok(code.text.includes("# fake heading inside a fence"));
});

test("an obsidian.json that lists the sample vault is accepted by the vault-list parser", () => {
  const text = JSON.stringify({ vaults: { a: { path: VAULT, open: true } } });
  const res = parseVaults(text, ROOT); // the repo checkout stands in for the home folder
  assert.deepEqual(res.vaults.map((v) => v.name), ["sample-vault"]);
  assert.deepEqual(res.outside, []);
});
