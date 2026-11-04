import test from "node:test";
import assert from "node:assert/strict";
import { Watcher, POLL_MS, LIVE_OFF } from "../mods/vault/watch.js";
import { visibleChanges, isHidden, folderEntries, naturalCompare } from "../mods/vault/tree.js";
import { listVault } from "../mods/vault-reader/vault-files.js";

// A fake watchFolder: every call parks until the test sends a batch (or an error) to it.
function fakeWatch() {
  const waiting = [];
  const watch = (root) => new Promise((ok, no) => waiting.push({ root, ok, no }));
  watch.waiting = waiting;
  watch.send = async (i, paths) => { waiting[i].ok(paths); await new Promise((r) => setImmediate(r)); };
  watch.fail = async (i, e) => { waiting[i].no(e); await new Promise((r) => setImmediate(r)); };
  return watch;
}
const tick = () => new Promise((r) => setImmediate(r));

test("a batch reaches onBatch and the loop keeps going", async () => {
  const watch = fakeWatch(), seen = [];
  const w = new Watcher(watch);
  w.start("/v", { onBatch: (c) => seen.push(c) });
  await tick();
  await watch.send(0, ["/v/a.md"]);
  await watch.send(1, ["/v/b.md"]);
  assert.deepEqual(seen, [["/v/a.md"], ["/v/b.md"]]);
  assert.equal(watch.waiting.length, 3, "waiting for the next batch");
  w.stop();
});

test("switching A → B → A leaves one live loop on A (CR-1-9)", async () => {
  const watch = fakeWatch(), seen = [];
  const w = new Watcher(watch);
  const onBatch = (root) => (c) => seen.push([root, c[0]]);
  w.start("/A", { onBatch: onBatch("A1") });
  await tick();
  w.start("/B", { onBatch: onBatch("B") });
  await tick();
  w.start("/A", { onBatch: onBatch("A2") });
  await tick();
  // all three parked watchFolder calls wake up with a change
  await watch.send(0, ["/A/x.md"]);
  await watch.send(1, ["/B/y.md"]);
  await watch.send(2, ["/A/z.md"]);
  assert.deepEqual(seen, [["A2", "/A/z.md"]], "only the newest loop reports; stale ones end quietly");
  assert.equal(watch.waiting.length, 4, "and only that loop watches again");
  w.stop();
});

test("a rejected watch calls onFail once (the timer fallback) and ends the loop", async () => {
  const watch = fakeWatch();
  let fails = 0;
  const w = new Watcher(watch);
  const done = w.start("/v", { onBatch: () => {}, onFail: (e) => { fails++; assert.match(String(e), /4096/); } });
  await tick();
  await watch.fail(0, new Error("too many directories (4096)"));
  await done;
  assert.equal(fails, 1);
  assert.equal(watch.waiting.length, 1);
  assert.ok(POLL_MS >= 5000 && POLL_MS <= 30000);
  assert.match(LIVE_OFF, /10 seconds/);
});

test("a stale loop whose watch rejects stays silent", async () => {
  const watch = fakeWatch();
  let fails = 0;
  const w = new Watcher(watch);
  w.start("/A", { onFail: () => fails++ });
  await tick();
  w.start("/B", {});
  await tick();
  await watch.fail(0, new Error("x"));
  assert.equal(fails, 0);
  w.stop();
});

test("an error in onBatch or onFail does not end or crash the loop", async () => {
  const watch = fakeWatch();
  let n = 0;
  const w = new Watcher(watch);
  w.start("/v", { onBatch: () => { n++; throw new Error("boom"); } });
  await tick();
  await watch.send(0, ["/v/a"]);
  await watch.send(1, ["/v/b"]);
  assert.equal(n, 2);
  w.stop();
  const failing = fakeWatch();
  const w3 = new Watcher(failing);
  const p = w3.start("/v", { onFail: () => { throw new Error("bad handler"); } });
  await tick();
  await failing.fail(0, new Error("x"));
  await p; // resolves, does not reject
});

test("stop() ends the loop at its next wake-up", async () => {
  const watch = fakeWatch(), seen = [];
  const w = new Watcher(watch);
  w.start("/v", { onBatch: (c) => seen.push(c) });
  await tick();
  w.stop();
  await watch.send(0, ["/v/a"]);
  assert.deepEqual(seen, []);
  assert.equal(watch.waiting.length, 1);
});

test("visibleChanges: dot folders ignored, Windows separators normalized, root means everything", () => {
  assert.deepEqual(visibleChanges("/v", ["/v/.obsidian/workspace.json", "/v/a/b.md", "/other/x", "/v/.git/HEAD"]), { all: false, rels: ["a/b.md"] });
  assert.deepEqual(visibleChanges("C:/v", ["C:\\v\\notes\\a.md", "C:\\v\\.trash\\x"]), { all: false, rels: ["notes/a.md"] });
  assert.deepEqual(visibleChanges("/v", ["/v"]), { all: true, rels: [] });
  assert.equal(isHidden("a/.hidden/b.md"), true);
  assert.equal(isHidden("a/b.md"), false);
});

test("folderEntries: folders first, natural order, hidden dropped, truncation counted (CR-1-13)", () => {
  const e = (name, dir = false) => ({ name, isDirectory: () => dir });
  const label = (n) => n.replace(/\.md$/, "");
  const { items, more } = folderEntries([e("b10.md"), e("b2.md"), e(".hidden"), e("zdir", true), e("adir", true)], label, 100);
  assert.deepEqual(items.map((i) => i.name), ["adir", "zdir", "b2.md", "b10.md"]);
  assert.equal(more, 0);
  const cut = folderEntries(Array.from({ length: 12 }, (_, i) => e(`n${i}.md`)), label, 5);
  assert.equal(cut.items.length, 5);
  assert.equal(cut.more, 7);
});

test("listVault: walks folders, skips dot folders, honours the limit and unreadable folders", async () => {
  const tree = { "/v": [["a.md", 0], ["sub", 1], [".obsidian", 1]], "/v/sub": [["b.md", 0], ["deeper", 1]], "/v/sub/deeper": [["c.md", 0]], "/v/.obsidian": [["x.json", 0]] };
  const readdir = async (d) => { if (!tree[d]) throw new Error("EACCES"); return tree[d].map(([name, dir]) => ({ name, isDirectory: () => Boolean(dir) })); };
  assert.deepEqual((await listVault("/v", readdir)).sort(), ["a.md", "sub/b.md", "sub/deeper/c.md"]);
  assert.equal((await listVault("/v", readdir, 2)).length, 2);
  assert.deepEqual(await listVault("/nope", readdir), []);
  assert.deepEqual((await listVault("C:\\v\\", async (d) => (d === "C:/v" ? [{ name: "w.md", isDirectory: () => false }] : []))), ["w.md"]);
});

// ---- natural order without Intl or localeCompare options (R2-CR-4, CR-2-6) ------------------------------

test("naturalCompare: case-insensitive, numbers as numbers, total and stable (CR-2-6)", () => {
  const sort = (list) => [...list].sort(naturalCompare);
  assert.deepEqual(sort(["Zebra", "apple", "Mango"]), ["apple", "Mango", "Zebra"]);
  assert.deepEqual(sort(["Note 10", "Note 2", "note 1"]), ["note 1", "Note 2", "Note 10"]);
  assert.deepEqual(sort(["10", "9", "1", "100"]), ["1", "9", "10", "100"]);
  assert.deepEqual(sort(["a1b10", "a1b9", "a1b2", "a01b3"]), ["a1b2", "a01b3", "a1b9", "a1b10"]);
  assert.deepEqual(sort(["b", "a", "ab", "a1", "A"]), ["A", "a", "a1", "ab", "b"]);
  // equal when folded: raw code-unit order decides, the same every time
  assert.deepEqual(sort(["a", "A"]), ["A", "a"]);
  assert.deepEqual(sort(["A", "a"]), ["A", "a"]);
  assert.deepEqual(sort(["1", "01"]), ["01", "1"]);
  assert.equal(naturalCompare("x", "x"), 0);
  // a number longer than 2^53 still compares right
  assert.ok(naturalCompare("n12345678901234567890", "n12345678901234567891") < 0);
  assert.ok(naturalCompare("n99999999999999999999", "n100000000000000000000") < 0);
});

test("folderEntries never calls localeCompare, so Herdr and Node agree", () => {
  const orig = String.prototype.localeCompare;
  String.prototype.localeCompare = () => { throw new Error("localeCompare was called"); };
  try {
    const e = (name, dir = false) => ({ name, isDirectory: () => dir });
    const { items } = folderEntries([e("Zebra.md"), e("apple.md"), e("Note 10.md"), e("Note 2.md"), e("Dir", true)], (n) => n.replace(/\.md$/, ""), 100);
    assert.deepEqual(items.map((i) => i.name), ["Dir", "apple.md", "Note 2.md", "Note 10.md", "Zebra.md"]);
  } finally { String.prototype.localeCompare = orig; }
});
