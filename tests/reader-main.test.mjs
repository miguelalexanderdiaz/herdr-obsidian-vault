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
  const tasks = [], timers = [];
  const cx = {
    tasks, timers, notified: 0,
    focus_handle: () => ({ focus() {} }),
    timer: { after: (ms, fn) => { const t = { ms, fn, live: true, cancel() { t.live = false; } }; timers.push(t); return t; }, every: () => ({ cancel() {} }) },
    spawn: (fn) => { const p = Promise.resolve(fn(cx)); tasks.push(p); return p; },
    notify() { cx.notified++; },
    pendingTimers: () => timers.filter((t) => t.live).length,
    // run every pending one-shot timer, then what it started
    async fire() { for (const t of timers.splice(0)) if (t.live) { t.live = false; t.fn(cx); } for (let i = 0; i < 5; i++) await Promise.all(tasks.splice(0)); },
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
  cx.timers.length = 0;
  const gen = r.gen;
  await r.changed(r.vault, [path.join(r.vault, ".obsidian", "workspace.json")], cx);
  assert.equal(r.gen, gen, "dot folders are ignored");
  const dep = [...r.deps][0];
  await r.changed(r.vault, [dep], cx);
  assert.equal(r.gen, gen + 1, "the shown note changed: reload");
  // a deleted file leaves the file list (the walk waits out RELIST_MIN_MS since the last one, then runs once)
  r.fileSet.add("ghost.md");
  r.files.push("ghost.md");
  await r.changed(r.vault, [path.join(r.vault, "ghost.md")], cx);
  assert.equal(r.fileSet.has("ghost.md"), true, "inside the window the walk is deferred");
  await cx.fire();
  assert.equal(r.fileSet.has("ghost.md"), false, "deleted notes stop resolving");
});

// ---- the vault is not walked again for every event (R2-CR-12, CR-2-12) ---------------------------------------

// A vault folder with a counting readdir: walks = calls on the vault root.
async function watched() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-walk-vault-"));
  fs.mkdirSync(path.join(vault, "sub", "deeper"), { recursive: true });
  fs.writeFileSync(path.join(vault, "a.md"), "# A\n[[b]]");
  fs.writeFileSync(path.join(vault, "sub", "b.md"), "# B");
  fs.writeFileSync(path.join(vault, "sub", "deeper", "c.md"), "# C");
  const { r, cx } = await open(vault, "a.md");
  cx.timers.length = 0; // the focus and prune timers of init are not what is under test
  return { vault, r, cx };
}
const countWalks = (r) => { const orig = r.relist.bind(r); r.walks = 0; r.relist = async () => { r.walks++; return orig(); }; };

test("change events for folders that hold files never walk the vault again", async () => {
  const { vault, r, cx } = await watched();
  countWalks(r);
  assert.deepEqual([...r.dirSet].sort(), ["sub", "sub/deeper"]);
  for (let i = 0; i < 50; i++) await r.changed(vault, [path.join(vault, "sub"), path.join(vault, "sub", "deeper")], cx);
  assert.equal(r.walks, 0, "folder paths are not new files");
});

test("fifty events for new notes in a burst make at most one walk now and one later", async () => {
  const { vault, r, cx } = await watched();
  countWalks(r);
  for (let i = 0; i < 50; i++) await r.changed(vault, [path.join(vault, `new-${i}.md`)], cx);
  assert.ok(r.walks <= 1, `walks: ${r.walks}`);
  assert.equal(cx.pendingTimers(), 1, "the rest is one timer");
  await cx.fire();
  assert.equal(r.walks, 1);
  assert.equal(cx.pendingTimers(), 0);
  // quiet for a second: the next event walks at once
  r.lastRelist = Date.now() - 5_000;
  await r.changed(vault, [path.join(vault, "another.md")], cx);
  assert.equal(r.walks, 2);
});

test("a note added while the walk waited makes the open note draw again so its link resolves", async () => {
  const { vault, r, cx } = await watched();
  fs.writeFileSync(path.join(vault, "late.md"), "# Late");
  const gen = r.gen;
  await r.changed(vault, [path.join(vault, "late.md")], cx);
  assert.equal(r.gen, gen, "deferred");
  await cx.fire();
  assert.ok(r.fileSet.has("late.md"));
  assert.equal(r.gen, gen + 1, "reloaded after the walk");
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

test("a note over 1 MiB gets its own message, a missing one keeps 'no longer in the vault' (R2-CR-9)", async () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-big-vault-"));
  fs.writeFileSync(path.join(vault, "Huge.md"), "# Big\n" + "word ".repeat(260_000)); // about 1.3 MB
  fs.writeFileSync(path.join(vault, "Huge.canvas"), JSON.stringify({ nodes: [{ id: "a", type: "text", text: "x".repeat(1_200_000), x: 0, y: 0, width: 10, height: 10 }], edges: [] }));
  const note = await open(vault, "Huge.md");
  assert.equal(note.r.doc.error, "This note is larger than 1 MiB, so the reader can't open it. Open it in Obsidian.");
  const canvas = await open(vault, "Huge.canvas");
  assert.equal(canvas.r.doc.error, "This canvas is larger than 1 MiB, so the reader can't open it. Open it in Obsidian.");
  const gone = await open(vault, "Gone.md");
  assert.equal(gone.r.doc.error, "This file is no longer in the vault");
});

// ---- the fetch pipeline (R2-CR-11, CR-2-11) --------------------------------------------------------------------

// A vault with a note that shows 6 pictures; exec answers `stat` from the real files and counts the calls.
function picsVault() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-pics-vault-"));
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000050000000308060000008d6f26e5", "hex");
  const names = Array.from({ length: 6 }, (_, i) => `pic${i}.png`);
  for (const n of names) fs.writeFileSync(path.join(vault, n), png);
  fs.writeFileSync(path.join(vault, "Pics.md"), names.map((n) => `![[${n}]]`).join("\n\n"));
  return vault;
}
const statExec = (log) => async (cmd, args) => {
  if (cmd !== "stat") throw new Error(`spawn ${cmd} ENOENT`);
  log.push(args.length - 2);
  const out = args.slice(2).map((p) => { const s = fs.statSync(p); return `${Math.floor(s.mtimeMs / 1000)}:${s.size} ${p}`; }).join("\n");
  return { code: 0, stdout: out, stderr: "" };
};

test("six pictures all arrive; a reload of the note stats nothing it already knows; a changed picture is stat'ed again", async () => {
  const vault = picsVault();
  const stats = [];
  const { r, cx } = await open(vault, "Pics.md", { exec: statExec(stats) });
  const shown = r.doc.blocks.filter((b) => b.type === "embed");
  assert.equal(shown.length, 6);
  assert.ok(shown.every((b) => r.assets.get(b.key)?.w === 5), "every picture drew, 5 x 3");
  assert.equal(stats.reduce((a, b) => a + b, 0), 6, "first load: one stat call, six files");
  stats.length = 0;
  // only the note changed
  await r.changed(vault, [path.join(vault, "Pics.md")], cx);
  for (let i = 0; i < 5; i++) await Promise.all(cx.tasks.splice(0));
  assert.deepEqual(stats, [], "no stat on the reload");
  assert.ok(shown.length === 6);
  // one picture changed
  fs.writeFileSync(path.join(vault, "pic3.png"), Buffer.concat([fs.readFileSync(path.join(vault, "pic3.png")), Buffer.from([0])]));
  await r.changed(vault, [path.join(vault, "pic3.png")], cx);
  for (let i = 0; i < 5; i++) await Promise.all(cx.tasks.splice(0));
  assert.deepEqual(stats, [1], "only the changed picture");
});
