// Renders a note's Mermaid diagrams, math and Excalidraw drawings to PNG, in a headless
// Chromium-family browser, with Obsidian's own copies of Mermaid and MathJax (taken out of the
// installed Obsidian app, so the output matches what Obsidian shows).
// Nothing leaves the machine: the page is served from 127.0.0.1.
//
//   node render.mjs <appHome> <jobs.json>
//   jobs.json: { theme: {fg, bg, muted, accent, border, surface, dark, font, size},
//                discover: { asar: [paths], browsers: [paths], names: [programs] },   (from ../platform.js)
//                jobs: [{ id, kind: "mermaid" | "math" | "excalidraw", src?, display?, file?, out }] }
//   out: an absolute path without extension; writes <out>.png and <out>.json ({w, h}, logical px).
// Prints [{ id, ok, w, h, error }] as JSON. A problem with the machine (no browser, no Obsidian,
// Node older than 22) is one entry without id: [{ error: "no-browser" | "no-obsidian" | "needs-node-22" }]
// and nothing is cached for it. Environment: HERDR_VAULT_ASAR, HERDR_VAULT_BROWSER, CHROME_PATH.

import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { findAsar, findBrowser, findNear, safeJoin, profileName, DEADLINE_MS } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const started = Date.now();
const results = [];
const say = (list) => process.stdout.write(JSON.stringify(list));

class Known extends Error {}

if (typeof WebSocket !== "function" || Number(process.versions.node.split(".")[0]) < 22) {
  say([{ error: "needs-node-22" }]);
  process.exit(0);
}

const [appHome, jobsFile] = process.argv.slice(2);
const DATA = path.join(appHome, "data", "vault");
const LIB = path.join(DATA, "lib");
const spec = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
const { theme, jobs } = spec;
const discover = spec.discover ?? {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Known(what)), ms))]);

// ---- Obsidian's libraries --------------------------------------------------------------

// Obsidian's lib/mermaid.min.js and lib/mathjax/**, once per Obsidian version. Extracted into a
// temporary folder and renamed, under a lock, so two runs never serve a half-written file.
function extract(asar, into) {
  const fd = fs.openSync(asar, "r");
  try {
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const hsize = head.readUInt32LE(12);
    const hb = Buffer.alloc(hsize);
    fs.readSync(fd, hb, 0, hsize, 16);
    const header = JSON.parse(hb.toString());
    const base = 8 + head.readUInt32LE(4);
    const walk = (node, prefix) => {
      for (const [name, v] of Object.entries(node.files ?? {})) {
        const p = prefix + name;
        if (v.files) walk(v, p + "/");
        else if (!v.unpacked && /^lib\/(mermaid\.min\.js|mathjax\/)/.test(p)) {
          const out = path.join(into, p.slice(4));
          if (!out.startsWith(into + path.sep)) continue;
          const buf = Buffer.alloc(v.size);
          fs.readSync(fd, buf, 0, v.size, base + Number(v.offset));
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, buf);
        }
      }
    };
    walk(header, "");
  } finally { fs.closeSync(fd); }
}

async function ensureLib(asar) {
  const st = fs.statSync(asar);
  const stamp = `${st.size}:${st.mtimeMs}`;
  const stampFile = path.join(LIB, "stamp");
  const current = () => { try { return fs.readFileSync(stampFile, "utf8") === stamp; } catch { return false; } };
  if (current()) return;
  fs.mkdirSync(DATA, { recursive: true });
  const lock = path.join(DATA, "lib.lock");
  let held = false;
  for (let i = 0; i < 300 && !held; i++) {
    try { fs.mkdirSync(lock); held = true; }
    catch {
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 60_000) fs.rmSync(lock, { recursive: true, force: true }); } catch { /* gone */ }
      if (current()) return;
      await sleep(100);
    }
  }
  if (!held) throw new Known("libs-not-ready");
  try {
    if (current()) return;
    const tmp = path.join(DATA, `lib.tmp-${process.pid}`);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    extract(asar, tmp);
    fs.writeFileSync(path.join(tmp, "stamp"), stamp);
    fs.rmSync(LIB, { recursive: true, force: true });
    fs.renameSync(tmp, LIB);
  } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

// ---- the page server ----------------------------------------------------------------------

// /lib/* from Obsidian's copies, everything else from this folder.
function serve() {
  const types = { ".js": "text/javascript", ".html": "text/html", ".woff": "font/woff", ".woff2": "font/woff2", ".css": "text/css" };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x").pathname;
    const file = url.startsWith("/lib/") ? safeJoin(LIB, url.slice(5)) : safeJoin(HERE, url);
    if (!file) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

// ---- the browser --------------------------------------------------------------------------

let proc = null, profile = null;

function killBrowser() {
  if (proc && proc.exitCode === null) {
    try {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      else proc.kill("SIGKILL");
    } catch { /* already gone */ }
  }
  if (profile) { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ } }
}

// Profiles of runs that were killed before they could clean up.
function sweepOldProfiles() {
  try {
    for (const n of fs.readdirSync(DATA)) {
      if (!/^(chrome-|lib\.tmp-)/.test(n)) continue;
      const p = path.join(DATA, n);
      if (Date.now() - fs.statSync(p).mtimeMs > 3_600_000) fs.rmSync(p, { recursive: true, force: true });
    }
  } catch { /* nothing to sweep */ }
}

function launch(bin) {
  // One profile per run: two readers drawing at once must not share one.
  profile = path.join(DATA, profileName(process.pid));
  fs.mkdirSync(profile, { recursive: true });
  proc = spawn(bin, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-background-networking", "--disable-sync", "--mute-audio",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--hide-scrollbars", "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"], detached: false });
  return new Promise((ok, fail) => {
    let err = "";
    const t = setTimeout(() => fail(new Known("no-browser")), 15000);
    proc.on("error", () => { clearTimeout(t); fail(new Known("no-browser")); });
    proc.stderr.on("data", (d) => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); ok(m[1]); }
    });
    proc.on("exit", () => { clearTimeout(t); fail(new Known("no-browser")); });
  });
}

function cdp(url) {
  const ws = new WebSocket(url);
  let n = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) {
      const { ok, fail } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const id = ++n;
    waiting.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  return new Promise((ok, fail) => { ws.onopen = () => ok({ send, close: () => ws.close() }); ws.onerror = () => fail(new Error("DevTools connection failed")); });
}

// ---- drawings -----------------------------------------------------------------------------

// An .excalidraw.md (the Excalidraw plugin's format) or .excalidraw file → its scene,
// with files embedded by reference (## Embedded Files: id: [[img.png]]) inlined.
function scene(file) {
  const text = fs.readFileSync(file, "utf8");
  let json;
  const compressed = text.match(/```compressed-json\s*\n([\s\S]*?)```/);
  const plain = text.match(/```json\s*\n([\s\S]*?)```/);
  if (compressed) json = { compressed: compressed[1].replace(/\s+/g, "") };
  else if (plain) json = { json: plain[1] };
  else json = { json: text };
  const files = {};
  const emb = text.match(/## Embedded Files\s*\n([\s\S]*?)(?:\n%%|\n## |$)/);
  if (emb) {
    for (const m of emb[1].matchAll(/^([0-9a-f]{20,}):\s*\[\[([^\]|]+)/gim)) {
      const target = findNear(file, m[2], { existsSync: fs.existsSync, readdirSync: fs.readdirSync });
      if (!target) continue;
      const ext = path.extname(target).slice(1).toLowerCase();
      const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      files[m[1]] = { id: m[1], mimeType: mime, dataURL: `data:${mime};base64,${fs.readFileSync(target).toString("base64")}` };
    }
  }
  return { ...json, files };
}

// ---- the run ------------------------------------------------------------------------------

async function main() {
  sweepOldProfiles();
  const env = process.env;
  const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  const common = { env, home: os.homedir(), exists, readdirSync: fs.readdirSync };
  const bin = findBrowser({ ...common, candidates: discover.browsers ?? [], names: discover.names ?? [], win: process.platform === "win32" });
  if (!bin) throw new Known("no-browser");
  const asar = findAsar({ ...common, candidates: discover.asar ?? [] });
  if (!asar) throw new Known("no-obsidian");
  await ensureLib(asar);
  const server = await serve();
  const wsUrl = await launch(bin);
  const b = await cdp(wsUrl);
  try {
    const { targetId } = await b.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await b.send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => b.send(m, p, sessionId);
    await s("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 2, mobile: false });
    await s("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    await s("Page.enable");
    const port = server.address().port;
    await s("Page.navigate", { url: `http://127.0.0.1:${port}/page.html` });
    const ev = async (expr) => {
      const r = await s("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      ready = await ev("typeof window.renderJob === 'function' && window.libsReady === true").catch(() => false);
      if (!ready) await sleep(100);
    }
    if (!ready) {
      // The libraries didn't load: say so for every job, and cache nothing.
      for (const job of jobs) results.push({ id: job.id, ok: false, error: "libs-not-ready" });
      return;
    }
    await ev(`window.setTheme(${JSON.stringify(theme)})`);
    for (const job of jobs) {
      if (Date.now() - started > DEADLINE_MS) { results.push({ id: job.id, ok: false, error: "timeout" }); continue; }
      try {
        const payload = { ...job };
        if (job.kind === "excalidraw") payload.scene = scene(job.file);
        const box = await withTimeout(ev(`window.renderJob(${JSON.stringify(payload)})`), 12_000, "timeout");
        if (box.error) throw new Error(box.error);
        const shot = await s("Page.captureScreenshot", { format: "png", captureBeyondViewport: true,
          clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 } });
        fs.mkdirSync(path.dirname(job.out), { recursive: true });
        fs.writeFileSync(job.out + ".png", Buffer.from(shot.data, "base64"));
        fs.writeFileSync(job.out + ".json", JSON.stringify({ w: box.w, h: box.h, baseline: box.baseline ?? null }));
        results.push({ id: job.id, ok: true, w: box.w, h: box.h });
      } catch (e) {
        if (e instanceof Known) { results.push({ id: job.id, ok: false, error: e.message }); continue; } // timeouts: try again next time
        const error = String(e.message ?? e).slice(0, 500);
        fs.mkdirSync(path.dirname(job.out), { recursive: true });
        fs.writeFileSync(job.out + ".json", JSON.stringify({ error }));
        results.push({ id: job.id, ok: false, error });
      }
    }
  } finally {
    try { b.close(); } catch { /* closed */ }
    server.close();
  }
}

// Whatever happens (a signal, the exec limit, a crash), the browser goes and the results so far are printed.
const finish = (code = 0) => { killBrowser(); say(results); process.exit(code); };
process.on("SIGTERM", () => finish(0));
process.on("SIGINT", () => finish(0));
setTimeout(() => finish(0), DEADLINE_MS + 3_500).unref();

main().then(() => finish(0), (e) => {
  killBrowser();
  say([...results, { error: e instanceof Known ? e.message : String(e?.message ?? e) }]);
  process.exit(0);
});
