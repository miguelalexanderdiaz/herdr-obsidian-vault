// Loads the Vault panel's real main.js with Herdr stubbed: vault list import per OS, the add-vault
// guard (docked + popup copies), command loops that survive errors, live-refresh fallback.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";

register("./stubs/hooks.mjs", import.meta.url);
// Herdr gives mods a localStorage.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { herdrTest } = await import("./stubs/herdr.mjs");
const { default: Vault } = await import("../mods/vault/main.js");

const tick = () => new Promise((r) => setImmediate(r));
// Loops like nextCommand() never finish, so wait a moment instead of awaiting the tasks.
const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));
function fakeCx() {
  const tasks = [], timers = [];
  const cx = {
    tasks, timers, notified: 0,
    focus_handle: () => ({ focus() {} }),
    timer: { after: (ms, fn) => { timers.push({ ms, fn, kind: "after" }); return { cancel() {} }; }, every: (ms, fn) => { const t = { ms, fn, kind: "every", cancelled: false }; timers.push(t); return { cancel() { t.cancelled = true; } }; } },
    spawn: (fn) => { const p = Promise.resolve(fn(cx)); tasks.push(p); return p; },
    notify() { cx.notified++; },
  };
  return cx;
}

// A fake home with Obsidian's config where `platform` keeps it.
function makeHome(platform, vaults) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-vault-home-"));
  const rel = { macos: "Library/Application Support/obsidian", linux: ".config/obsidian", windows: "AppData/Roaming/obsidian" }[platform];
  fs.mkdirSync(path.join(home, rel), { recursive: true });
  const entries = {};
  vaults(home).forEach((p, i) => { entries[`id${i}`] = { path: p, ts: 100 + i, ...(i === 0 ? { open: true } : {}) }; });
  fs.writeFileSync(path.join(home, rel, "obsidian.json"), JSON.stringify({ vaults: entries }));
  return home;
}
function reset(home, platform = "linux") {
  herdrTest.home = home; herdrTest.platform = platform; herdrTest.props = {};
  herdrTest.shared.clear(); herdrTest.notices.length = 0; herdrTest.commands.length = 0;
  herdrTest.pickFolder = async () => null; herdrTest.watch = () => new Promise(() => {});
}
async function start() {
  const cx = fakeCx();
  const v = new Vault();
  v.init({}, cx);
  await settle();
  return { v, cx };
}

for (const platform of ["macos", "linux", "windows"]) {
  test(`first run imports Obsidian's vault list on ${platform}`, async () => {
    const home = makeHome(platform, (h) => [path.join(h, "Notes"), path.join(h, "Work", "Plans")]);
    reset(home, platform);
    const { v } = await start();
    const list = herdrTest.shared.get("vault.list");
    assert.deepEqual(list.map((x) => x.name), ["Notes", "Plans"]);
    assert.equal(herdrTest.shared.get("vault.current"), list[0].path);
    assert.equal(v.list().length, 2);
  });
}

test("vaults outside the home folder are listed dimmed, not lost; none found says where it looked", async () => {
  const home = makeHome("linux", (h) => [path.join(h, "In"), "/mnt/disk/Out"]);
  reset(home);
  await start();
  assert.deepEqual(herdrTest.shared.get("vault.list").map((x) => x.name), ["In"]);
  assert.deepEqual(herdrTest.shared.get("vault.outside"), [{ path: "/mnt/disk/Out", name: "Out" }]);

  reset(fs.mkdtempSync(path.join(os.tmpdir(), "herdr-empty-home-")));
  const { v } = await start();
  assert.deepEqual(herdrTest.shared.get("vault.list"), []);
  assert.match(v.importInfo, /wasn't found \(looked in ~\/\.config\/obsidian/);
});

test("Import from Obsidian adds only what is missing and keeps the current vault", async () => {
  const home = makeHome("linux", (h) => [path.join(h, "A"), path.join(h, "B")]);
  reset(home);
  const { v, cx } = await start();
  herdrTest.shared.set("vault.list", [{ path: path.join(home, "A"), name: "A" }, { path: "/custom/Z", name: "Z" }]);
  herdrTest.shared.set("vault.current", "/custom/Z");
  await v.importVaults(false);
  assert.deepEqual(herdrTest.shared.get("vault.list").map((x) => x.name), ["A", "Z", "B"]);
  assert.equal(herdrTest.shared.get("vault.current"), "/custom/Z");
  assert.match(herdrTest.notices.at(-1).body, /Added 1 vault/);
  void cx;
});

test("overlay + docked copies: one folder picker at a time (R1-CR-2)", async () => {
  reset(makeHome("linux", () => []));
  const a = (await start()).v, b = (await start()).v;
  let opened = 0, release;
  herdrTest.pickFolder = () => { opened++; return new Promise((r) => { release = r; }); };
  const one = a.addVault(), two = b.addVault();
  await tick();
  assert.equal(opened, 1, "the second copy sees the shared guard");
  release(null);
  await Promise.all([one, two]);
  assert.equal(herdrTest.shared.get("vault.adding"), null, "guard released");
});

test("add-vault checks for a .obsidian folder, normalizes the path, and releases the guard on errors", async () => {
  const home = makeHome("linux", () => []);
  reset(home);
  const { v } = await start();
  const good = path.join(home, "Fresh");
  fs.mkdirSync(path.join(good, ".obsidian"), { recursive: true });
  herdrTest.pickFolder = async () => good + "/";
  await v.addVault();
  assert.deepEqual(herdrTest.shared.get("vault.list").at(-1), { path: good, name: "Fresh" });
  const plain = path.join(home, "Plain");
  fs.mkdirSync(plain);
  herdrTest.pickFolder = async () => plain;
  await v.addVault();
  assert.equal(herdrTest.notices.at(-1).title, "Not an Obsidian vault");
  herdrTest.pickFolder = async () => { throw new Error("picker crashed"); };
  await assert.rejects(v.addVault(), /picker crashed/);
  assert.equal(herdrTest.shared.get("vault.adding"), null);
});

test("the command loop survives a failing command (R1-CR-10)", async () => {
  const home = makeHome("linux", (h) => [path.join(h, "A")]);
  reset(home);
  herdrTest.pickFolder = async () => { throw new Error("picker crashed"); };
  herdrTest.commands.push("add", "import");
  const cx = fakeCx();
  const v = new Vault();
  v.init({}, cx);
  await settle(80);
  assert.ok(herdrTest.notices.some((n) => /picker crashed/.test(n.body)), "the failure was reported");
  assert.ok(herdrTest.notices.some((n) => /vault/i.test(n.body) && n.title === "Vault" && n.level === "info"), "and the next command still ran");
  await v.close();
});

test("a refused watch starts a timer refresh and shows the hint; switching vaults cancels it", async () => {
  const home = makeHome("linux", (h) => [path.join(h, "A"), path.join(h, "B")]);
  reset(home);
  fs.mkdirSync(path.join(home, "A"), { recursive: true });
  fs.mkdirSync(path.join(home, "B"), { recursive: true });
  herdrTest.watch = async () => { throw new Error("too many directories"); };
  const { v, cx } = await start();
  v.sync(cx);
  await settle();
  assert.match(v.hint, /Live updates are off/);
  const t = cx.timers.find((x) => x.kind === "every");
  assert.ok(t, "a polling timer");
  assert.equal(t.ms, 10_000);
  herdrTest.shared.set("vault.current", path.join(home, "B"));
  v.sync(cx);
  assert.equal(t.cancelled, true, "the old vault's timer is gone");
  assert.equal(v.hint === null || v.hint === undefined || /Live updates/.test(v.hint), true);
});

test("opening a program from the tree is refused; documents go to the OS opener", async () => {
  const home = makeHome("linux", (h) => [path.join(h, "A")]);
  reset(home);
  const calls = [];
  herdrTest.exec = async (cmd, args) => { calls.push([cmd, ...args]); return { code: 0, stdout: "", stderr: "" }; };
  const { v } = await start();
  v.root = "/home/x/A";
  v.open("tool.command");
  assert.deepEqual(calls, []);
  assert.equal(herdrTest.notices.at(-1).title, "Not opened");
  v.open("sheet.xlsx");
  assert.deepEqual(calls, [["xdg-open", "/home/x/A/sheet.xlsx"]]);
});
