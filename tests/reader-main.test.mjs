// Loads the reader's real main.js with Herdr stubbed, to prove a failing picture or renderer never
// replaces the document (CR-1-2), and that the reader's own bookkeeping holds up.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import "./stubs/runtime.mjs"; // Herdr has no TextDecoder, TextEncoder or structuredClone
import { VAULT, ROOT } from "./helpers.mjs";

register("./stubs/hooks.mjs", import.meta.url);
const { herdrTest } = await import("./stubs/herdr.mjs");
const { default: Reader } = await import("../mods/vault-reader/main.js");

const FIXTURES = path.join(ROOT, "tests", "fixtures");

function fakeCx() {
  const tasks = [];
  const cx = {
    tasks, notified: 0,
    focus_handle: () => ({ focus() {} }),
    timer: { after: () => ({ cancel() {} }), every: () => ({ cancel() {} }) },
    spawn: (fn) => { const p = Promise.resolve(fn(cx)); tasks.push(p); return p; },
    notify() { cx.notified++; },
  };
  return cx;
}

async function open(vault, file, { exec, appHome } = {}) {
  herdrTest.props = { vault, file };
  herdrTest.appHome = appHome ?? fs.mkdtempSync(path.join(os.tmpdir(), "herdr-reader-test-"));
  herdrTest.exec = exec ?? (async () => { throw new Error("spawn ENOENT"); });
  herdrTest.shared.clear();
  const cx = fakeCx();
  const r = new Reader();
  r.init({}, cx);
  // wait for the load and everything it started
  for (let i = 0; i < 5; i++) await Promise.all(cx.tasks.splice(0));
  return { r, cx };
}

test("a note with a broken image keeps its document; the image shows its own message", async () => {
  const { r } = await open(FIXTURES, "note-with-broken-image.md");
  assert.equal(r.doc.error, undefined, "the document was not replaced by an error");
  assert.ok(r.doc.blocks.length >= 3);
  const img = r.doc.blocks.find((b) => b.type === "embed");
  const asset = r.assets.get(img.key);
  assert.match(asset.error, /Not an image/);
});

test("when the renderer's folder cannot be written, the note stays and a line says what failed", async () => {
  // appHome is a regular file, so every write under it fails; node is "found" and new enough.
  const blocker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "herdr-blocker-")), "file");
  fs.writeFileSync(blocker, "x");
  const exec = async (cmd, args) => (args?.[0] === "--version" ? { code: 0, stdout: "v22.14.0", stderr: "" } : { code: 1, stdout: "", stderr: "" });
  const { r } = await open(FIXTURES, "note-with-broken-image.md", { exec, appHome: blocker });
  assert.equal(r.doc.error, undefined);
  assert.ok(r.doc.blocks.some((b) => b.type === "mermaid"));
  assert.ok(r.notes.some((n) => /^Diagrams and math:/.test(n)), `notes: ${JSON.stringify(r.notes)}`);
});

test("no node at all: one notice, the diagram source stays", async () => {
  const { r } = await open(FIXTURES, "note-with-broken-image.md");
  const notices = r.notes.filter((n) => /Node\.js/.test(n));
  assert.equal(notices.length, 1, "said once, not once per diagram");
  const merm = r.doc.blocks.find((b) => b.type === "mermaid");
  assert.equal(r.assets.get(merm.key).transient, true);
});

test("an empty canvas opens without a crash", async () => {
  const { r } = await open(FIXTURES, "empty.canvas");
  assert.equal(r.doc.kind, "canvas");
  assert.equal(r.doc.canvas.empty, true);
  assert.equal(r.doc.error, undefined);
  assert.deepEqual(r.notes, []);
});

test("the sample vault's notes all open", async () => {
  for (const file of ["Feature tour.md", "Other note.md", "Board.canvas", "Flow sketch.excalidraw.md"]) {
    const { r } = await open(VAULT, file);
    assert.equal(r.doc.error, undefined, file);
  }
});

test("follow(): web links open, file: and obsidian: do not; programs and outside paths are refused (CR-1-7)", async () => {
  const opened = [];
  const exec = async (cmd, args) => { opened.push([cmd, ...args]); return { code: 0, stdout: "", stderr: "" }; };
  const { r, cx } = await open(VAULT, "Feature tour.md", { exec });
  opened.length = 0;
  for (const url of ["file:///etc/passwd", "obsidian://open?vault=x", "javascript:alert(1)", "-a Calculator"]) r.follow(url, cx);
  assert.deepEqual(opened, []);
  r.follow("https://example.com/a?b=1&c=2", cx);
  assert.deepEqual(opened, [["xdg-open", "https://example.com/a?b=1&c=2"]]);
  opened.length = 0;
  r.follow("vault:" + encodeURIComponent("../../../etc/passwd"), cx);
  r.follow("vault:" + encodeURIComponent("nope.command"), cx);
  assert.deepEqual(opened, [], "not in this vault");
});

test("Windows opens through rundll32, macOS through open", async () => {
  const opened = [];
  const exec = async (cmd, args) => { opened.push([cmd, ...args]); return { code: 0, stdout: "", stderr: "" }; };
  herdrTest.platform = "windows";
  try {
    const { r, cx } = await open(VAULT, "Feature tour.md", { exec });
    opened.length = 0;
    r.follow("https://example.com/", cx);
    assert.deepEqual(opened, [["rundll32", "url.dll,FileProtocolHandler", "https://example.com/"]]);
  } finally { herdrTest.platform = "linux"; }
});

test("close() stops the watcher and cancels the poll timer", async () => {
  const { r } = await open(VAULT, "Other note.md");
  let cancelled = false;
  r.pollTask = { cancel: () => { cancelled = true; } };
  await r.close();
  assert.equal(r.closed, true);
  assert.equal(cancelled, true);
});

test("a changed file outside the note's files does not reload; a changed dependency does", async () => {
  const { r, cx } = await open(VAULT, "Feature tour.md");
  const gen = r.gen;
  await r.changed(r.vault, [path.join(r.vault, ".obsidian", "workspace.json")], cx);
  assert.equal(r.gen, gen, "dot folders are ignored");
  const dep = [...r.deps][0];
  await r.changed(r.vault, [dep], cx);
  assert.equal(r.gen, gen + 1, "the shown note changed: reload");
  // a deleted file leaves the file list
  r.fileSet.add("ghost.md");
  r.files.push("ghost.md");
  await r.changed(r.vault, [path.join(r.vault, "ghost.md")], cx);
  assert.equal(r.fileSet.has("ghost.md"), false, "deleted notes stop resolving");
});

test("when the watch is refused the reader polls and says so (CR-1-9)", async () => {
  const { r, cx } = await open(VAULT, "Other note.md");
  let every = 0;
  cx.timer.every = () => { every++; return { cancel() {} }; };
  r.poll(cx);
  r.poll(cx);
  assert.equal(every, 1, "one timer");
  assert.match(r.hint, /Live updates are off/);
  assert.equal(JSON.stringify(r.content(herdrTestTheme(), 800).length >= 1), "true");
  await r.close();
});

function herdrTestTheme() { return { dim: "#777" }; }
