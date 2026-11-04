// Draws every view of both mods with element stubs: catches a misspelled name or a wrong property in
// drawing code that no other test reaches (the real gpui-kit is not available under node).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import "./stubs/runtime.mjs"; // Herdr has no TextDecoder, TextEncoder or structuredClone
import { VAULT, ROOT } from "./helpers.mjs";

register("./stubs/hooks.mjs", import.meta.url);
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { herdrTest } = await import("./stubs/herdr.mjs");
const { built } = await import("./stubs/element.mjs");
const { default: Reader } = await import("../mods/vault-reader/main.js");
const { default: Vault } = await import("../mods/vault/main.js");

const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
function fakeCx() {
  const cx = {
    focus_handle: () => ({ focus() {} }),
    timer: { after: () => ({ cancel() {} }), every: () => ({ cancel() {} }) },
    spawn: (fn) => Promise.resolve(fn(cx)),
    notify() {}, stop_propagation() {},
  };
  return cx;
}
const FIXTURES = path.join(ROOT, "tests", "fixtures");

async function drawReader(vault, file, extra = {}) {
  herdrTest.props = { vault, file, ...extra };
  herdrTest.appHome = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-smoke-"));
  herdrTest.exec = async () => { throw new Error("spawn ENOENT"); };
  const cx = fakeCx();
  const r = new Reader();
  r.init({}, cx);
  await settle(250);
  built.text.length = 0;
  assert.doesNotThrow(() => r.render(cx), `render ${file}`);
  return { r, cx, text: [...built.text] };
}

test("the reader draws every file of the sample vault, in a floating window and as a kept pane", async () => {
  for (const file of ["Feature tour.md", "Other note.md", "projects/a/plan.md", "Board.canvas", "Flow sketch.excalidraw.md", "attachments/photo.png", "attachments/manual.pdf"]) {
    await drawReader(VAULT, file, { overlay: "o1" });
    await drawReader(VAULT, file, { kept: true, id: "n1" });
  }
});

test("the reader draws the fixtures: empty canvas, broken image with notices", async () => {
  const empty = await drawReader(FIXTURES, "empty.canvas");
  assert.ok(empty.text.includes("This canvas is empty"));
  const broken = await drawReader(FIXTURES, "note-with-broken-image.md");
  assert.ok(broken.text.some((t) => /Node\.js 22/.test(t)), "the renderer problem is shown above the note");
  assert.ok(broken.text.some((t) => /Not an image/.test(t)));
});

test("the reader's bar: back, anchor, Web images switch and the Keep menu draw", async () => {
  const { r, cx } = await drawReader(VAULT, "Feature tour.md", { overlay: "o1" });
  r.history.push({ file: "Other note.md", anchor: null });
  r.anchor = "Callouts";
  r.hasRemote = true;
  r.hint = "Live updates are off";
  r.notes = ["something could not be drawn"];
  assert.doesNotThrow(() => r.render(cx));
  herdrTest.props = { menu: true, window: "w1", overlay: "o2", vault: VAULT, file: "Feature tour.md" };
  const menu = new Reader();
  menu.init({}, cx);
  assert.doesNotThrow(() => menu.render(cx));
  r.toggleRemote(cx);
});

test("the Vault panel draws: empty, tree, search results, outside vaults and the selector menu", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-smoke-home-"));
  herdrTest.home = home; herdrTest.shared.clear(); herdrTest.props = {};
  const cx = fakeCx();
  const v = new Vault();
  v.init({}, cx);
  await settle();
  assert.doesNotThrow(() => v.render(cx), "empty state");
  herdrTest.shared.set("vault.list", [{ path: VAULT, name: "sample-vault" }]);
  herdrTest.shared.set("vault.current", VAULT);
  herdrTest.shared.set("vault.outside", [{ path: "/mnt/x/Out", name: "Out" }]);
  v.sync(cx);
  await settle();
  assert.doesNotThrow(() => v.render(cx), "tree");
  v.toggle("projects", cx);
  await settle();
  v.more.set("", 3);
  v.hint = "Live updates are off";
  assert.doesNotThrow(() => v.render(cx), "tree with folder open, hint and truncation");
  v.query = "plan";
  v.results = [{ rel: "projects/a/plan.md", line: 1, text: "the plan" }, { rel: "Feature tour.md" }];
  assert.doesNotThrow(() => v.render(cx), "results");
  v.searchError = "ripgrep (rg) isn't installed: x"; v.searchMissing = true; v.results = [];
  assert.doesNotThrow(() => v.render(cx), "search error");
  herdrTest.props = { menu: true, overlay: "o9" };
  const menu = new Vault();
  menu.init({}, cx);
  assert.doesNotThrow(() => menu.render(cx), "selector menu");
});
