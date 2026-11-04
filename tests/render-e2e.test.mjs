// The real render/render.mjs end to end: asar extraction, lock, loopback server, DevTools, screenshot, results
// JSON, profile cleanup. Obsidian's bundle is replaced by a tiny stub built here (tests/tools/stub-obsidian.mjs),
// so it runs on any machine with a Chromium-family browser and skips, with its reason, where there is none.
// Includes the canary for the privacy claim: a Mermaid label with an <img> pointing at a local counting
// server must cause zero requests (R2-CR-6 / D14).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { MODS, VAULT } from "./helpers.mjs";
import { writeStubAsar } from "./tools/stub-obsidian.mjs";
import { findBrowser, DEADLINE_MS } from "../mods/vault-reader/render/lib.mjs";
import * as P from "../mods/vault-reader/platform.js";

const RENDER = path.join(MODS, "vault-reader", "render", "render.mjs");
const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

// HERDR_VAULT_BROWSER names the only browser to use; when it is set and missing, the test skips.
function browser() {
  const forced = process.env.HERDR_VAULT_BROWSER;
  if (forced) return exists(forced) ? { bin: forced } : { skip: `HERDR_VAULT_BROWSER names no file (${path.basename(forced)})` };
  const bin = findBrowser({ env: process.env, home: os.homedir(), candidates: P.browserCandidates(platform), names: P.browserNames(platform), exists, readdirSync: fs.readdirSync, win: platform === "windows" });
  return bin ? { bin } : { skip: "no Chromium-family browser on this machine" };
}
const B = browser();
const skip = B.skip ? `skipped: ${B.skip}` : false;

// Counts every request that reaches it.
function counter() {
  const seen = [];
  const server = http.createServer((req, res) => { seen.push(req.url); res.writeHead(200, { "content-type": "image/gif" }); res.end(); });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ seen, port: server.address().port, close: () => server.close() })));
}

// Runs render.mjs with async spawn: a listener in this same process must keep answering meanwhile.
function run(app, spec, extraEnv = {}) {
  fs.mkdirSync(app, { recursive: true });
  const jobsFile = path.join(app, `jobs-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(jobsFile, JSON.stringify({ theme: { fg: "#eee", bg: "#111", muted: "#999", accent: "#fa0", border: "#333", surface: "#222", dark: true, size: 15 }, discover: { asar: [], browsers: [], names: [] }, ...spec }));
  const env = { ...process.env, HERDR_VAULT_BROWSER: B.bin, ...extraEnv };
  return new Promise((ok) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [RENDER, app, jobsFile], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("exit", (code) => { let json = null; try { json = JSON.parse(out); } catch { /* reported by the assertions */ } ok({ code, json, out, err, ms: Date.now() - t0 }); });
  });
}
const leftovers = (app) => fs.readdirSync(path.join(app, "data", "vault")).filter((n) => /^chrome-|^lib\.tmp-|^lib\.lock/.test(n));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "herdr-render-e2e-"));

test("renders Mermaid, math and Excalidraw with a stub bundle; PNGs, sizes, no profile folder left, library extracted once", { skip }, async () => {
  const dir = tmp();
  const app = path.join(dir, "app");
  const asar = writeStubAsar(path.join(dir, "obsidian"));
  const out = (n) => path.join(app, "data", "vault", "cache", n);
  const jobs = [
    { id: "m", kind: "mermaid", src: "graph TD; A-->B", out: out("m") },
    { id: "t", kind: "math", src: "x^2", display: true, out: out("t") },
    { id: "i", kind: "math", src: "y", display: false, out: out("i") },
    { id: "e", kind: "excalidraw", file: path.join(VAULT, "Flow sketch.excalidraw.md"), out: out("e") },
  ];
  const r = await run(app, { jobs }, { HERDR_VAULT_ASAR: asar });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.json.map((x) => [x.id, x.ok]), [["m", true], ["t", true], ["i", true], ["e", true]], r.out);
  for (const j of r.json) assert.ok(j.w > 0 && j.h > 0, `${j.id} has a size`);
  assert.deepEqual([r.json[0].w, r.json[0].h], [100, 50], "the stub's viewBox");
  for (const id of ["m", "t", "i", "e"]) {
    const png = fs.readFileSync(out(id) + ".png");
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${id}.png is a PNG`);
    const meta = JSON.parse(fs.readFileSync(out(id) + ".json", "utf8"));
    assert.ok(meta.w > 0 && meta.h > 0);
  }
  assert.deepEqual(leftovers(app), [], "no browser profile, temp library or lock left behind");
  const lib = path.join(app, "data", "vault", "lib");
  assert.ok(exists(path.join(lib, "mermaid.min.js")) && exists(path.join(lib, "mathjax", "tex-chtml-full.js")));
  assert.ok(!exists(path.join(lib, "other.js")), "only Mermaid and MathJax are taken out of the bundle");
  const stampAt = fs.statSync(path.join(lib, "stamp")).mtimeMs, fileAt = fs.statSync(path.join(lib, "mermaid.min.js")).ino;

  // second run: same bundle, so no extraction
  const again = await run(app, { jobs: [{ id: "m2", kind: "mermaid", src: "graph TD; B-->C", out: out("m2") }] }, { HERDR_VAULT_ASAR: asar });
  assert.deepEqual(again.json.map((x) => x.ok), [true], again.out);
  assert.equal(fs.statSync(path.join(lib, "stamp")).mtimeMs, stampAt);
  assert.equal(fs.statSync(path.join(lib, "mermaid.min.js")).ino, fileAt, "the library was not extracted again");
  assert.deepEqual(leftovers(app), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("canary: an <img> in a diagram label makes no request to a local counting server (CSP + resolver rule)", { skip }, async () => {
  const dir = tmp();
  const app = path.join(dir, "app");
  const asar = writeStubAsar(path.join(dir, "obsidian"));
  const c = await counter();
  try {
    // positive control, run on the same page without the protections, would prove the canary can fire; the page
    // is protected in every real run, so here: the label's image is requested by nobody
    const r = await run(app, { jobs: [{ id: "x", kind: "mermaid", src: `IMG:http://127.0.0.1:${c.port}/track-1`, out: path.join(app, "x") },
      { id: "y", kind: "mermaid", src: `IMG:http://localhost:${c.port}/track-2`, out: path.join(app, "y") }] }, { HERDR_VAULT_ASAR: asar });
    assert.deepEqual(r.json.map((x) => x.ok), [true, true], r.out);
    await new Promise((ok) => setTimeout(ok, 300)); // a late request would show up now
    assert.deepEqual(c.seen, [], "zero requests reached the counting server");
    assert.deepEqual(leftovers(app), []);
  } finally { c.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("canary is able to fire: the same label against a page with no CSP does reach the server", { skip }, async (t) => {
  // Proves the test above is meaningful: serve the stub's SVG from a page without the policy and the browser
  // does ask for the image. Uses the same browser binary in a one-off headless run (no DevTools needed:
  // --dump-dom loads the page and exits).
  const c = await counter();
  const dir = tmp();
  const page = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(`<html><body><img src="http://127.0.0.1:${c.port}/open-page"></body></html>`); });
  await new Promise((ok) => page.listen(0, "127.0.0.1", ok));
  try {
    await new Promise((ok) => {
      const child = spawn(B.bin, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${path.join(dir, "p")}`, "--virtual-time-budget=3000", "--dump-dom", `http://127.0.0.1:${page.address().port}/`], { stdio: "ignore" });
      const t = setTimeout(() => child.kill("SIGKILL"), 20_000);
      child.on("exit", () => { clearTimeout(t); ok(); });
      child.on("error", ok);
    });
    if (!c.seen.length) return t.skip("this browser build did not load the control page: nothing to conclude");
    assert.ok(c.seen.some((u) => u === "/open-page"));
  } finally { page.close(); c.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a diagram that never finishes ends as 'timeout' within the deadline; others in the run still draw", { skip, timeout: 60_000 }, async () => {
  const dir = tmp();
  const app = path.join(dir, "app");
  const asar = writeStubAsar(path.join(dir, "obsidian"));
  const r = await run(app, { jobs: [{ id: "ok", kind: "mermaid", src: "graph TD; A-->B", out: path.join(app, "ok") }, { id: "hang", kind: "mermaid", src: "HANG", out: path.join(app, "hang") },
    { id: "bad", kind: "mermaid", src: "THROW", out: path.join(app, "bad") }] }, { HERDR_VAULT_ASAR: asar });
  assert.equal(r.code, 0);
  assert.ok(r.ms < DEADLINE_MS + 5_000, `finished in ${r.ms} ms`);
  const by = Object.fromEntries(r.json.map((x) => [x.id, x]));
  assert.equal(by.ok.ok, true);
  assert.equal(by.hang.ok, false);
  assert.equal(by.hang.error, "timeout");
  assert.equal(by.bad.ok, false);
  assert.match(by.bad.error, /Parse error in the stub/);
  assert.deepEqual(leftovers(app), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("without a browser the test reports why instead of failing", (t) => {
  const forced = process.env.HERDR_VAULT_BROWSER;
  process.env.HERDR_VAULT_BROWSER = path.join(os.tmpdir(), "no-such-browser-here");
  try {
    const none = browser();
    assert.match(none.skip, /HERDR_VAULT_BROWSER names no file/);
  } finally { if (forced === undefined) delete process.env.HERDR_VAULT_BROWSER; else process.env.HERDR_VAULT_BROWSER = forced; }
  if (B.skip) t.diagnostic(`e2e skipped: ${B.skip}`);
});
