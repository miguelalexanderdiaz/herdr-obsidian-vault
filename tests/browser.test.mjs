// The browser process lifecycle of one render run, with a fake spawn: the profile folder is gone after
// success, after an error and after a timeout, and the process tree is killed after a polite close (R2-CR-13).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createBrowser, Known } from "../mods/vault-reader/render/browser.mjs";

// A fake child process: prints the DevTools line (unless told not to), exits when asked to.
function fakeSpawn({ announce = true, exitOnClose = true, helperWrites = false } = {}) {
  const made = [];
  const spawn = (bin, args, opts) => {
    const proc = new EventEmitter();
    proc.pid = 4242;
    proc.exitCode = null;
    proc.signalCode = null;
    proc.stderr = new EventEmitter();
    proc.args = args; proc.opts = opts; proc.bin = bin;
    proc.kills = [];
    proc.die = () => { proc.exitCode = 0; proc.emit("exit", 0); };
    made.push(proc);
    const profile = args.find((a) => a.startsWith("--user-data-dir=")).slice(16);
    if (helperWrites) fs.writeFileSync(path.join(profile, "Cookies"), "x"); // the browser writes into its profile
    if (announce) setImmediate(() => proc.stderr.emit("data", "DevTools listening on ws://127.0.0.1:9/devtools/browser/abc\n"));
    proc.closeRequested = () => { if (exitOnClose) setImmediate(proc.die); };
    return proc;
  };
  return { spawn, made };
}

function setup(opts = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-browser-test-"));
  const f = fakeSpawn(opts);
  const killed = [];
  const b = createBrowser({ spawn: f.spawn, spawnSync: (cmd, args) => killed.push([cmd, args]), fs, path, dataDir, pid: 77, platform: opts.platform ?? "linux", startTimeoutMs: 80, exitWaitMs: 60 });
  const cleanup = () => { fs.rmSync(dataDir, { recursive: true, force: true }); };
  return { b, f, dataDir, killed, cleanup };
}
const profiles = (dir) => fs.readdirSync(dir).filter((n) => n.startsWith("chrome-"));

test("success: close politely, the process ends, the profile folder is gone", async () => {
  const t = setup({ helperWrites: true });
  try {
    const url = await t.b.launch("/bin/browser");
    assert.match(url, /^ws:\/\/127\.0\.0\.1:9\//);
    assert.equal(profiles(t.dataDir).length, 1, "a profile exists while it runs");
    assert.equal(t.f.made[0].opts.detached, true, "POSIX: its own process group");
    assert.ok(t.f.made[0].args.some((a) => a.startsWith("--host-resolver-rules=")));
    let closed = 0;
    await t.b.stop(() => { closed++; t.f.made[0].closeRequested(); });
    assert.equal(closed, 1);
    assert.deepEqual(profiles(t.dataDir), []);
    assert.equal(t.b.profile(), null);
  } finally { t.cleanup(); }
});

test("error: the browser never announces itself -> no-browser, profile gone after stopNow", async () => {
  const t = setup({ announce: false });
  try {
    await assert.rejects(t.b.launch("/bin/browser"), (e) => e instanceof Known && e.message === "no-browser");
    assert.equal(profiles(t.dataDir).length, 1);
    t.b.stopNow();
    assert.deepEqual(profiles(t.dataDir), []);
  } finally { t.cleanup(); }
});

test("timeout: a browser that ignores the close request is killed (process group) and the profile removed", async () => {
  const t = setup({ exitOnClose: false, helperWrites: true });
  const calls = [];
  const realKill = process.kill;
  process.kill = (pid, sig) => { calls.push([pid, sig]); t.f.made[0].die(); };
  try {
    await t.b.launch("/bin/browser");
    const started = Date.now();
    await t.b.stop(() => t.f.made[0].closeRequested());
    assert.ok(Date.now() - started < 1500, "bounded wait");
    assert.deepEqual(calls, [[-4242, "SIGKILL"]], "the group, so helpers die too");
    assert.deepEqual(profiles(t.dataDir), []);
  } finally { process.kill = realKill; t.cleanup(); }
});

test("windows: the tree is taskkill'ed, no process group", async () => {
  const t = setup({ exitOnClose: false, platform: "win32" });
  try {
    await t.b.launch("C:/b/chrome.exe");
    assert.equal(t.f.made[0].opts.detached, false);
    await t.b.stop(null);
    assert.deepEqual(t.killed, [["taskkill", ["/pid", "4242", "/T", "/F"]]]);
    assert.deepEqual(profiles(t.dataDir), []);
  } finally { t.cleanup(); }
});

test("stop without a launch, or twice, does nothing and does not throw", async () => {
  const t = setup();
  try {
    await t.b.stop(null);
    t.b.stopNow();
    await t.b.launch("/bin/browser");
    await t.b.stop(() => t.f.made[0].closeRequested());
    await t.b.stop(null);
    t.b.stopNow();
    assert.deepEqual(profiles(t.dataDir), []);
  } finally { t.cleanup(); }
});
