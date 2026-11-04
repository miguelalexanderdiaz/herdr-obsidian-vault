// Renders a note's Mermaid diagrams, math and Excalidraw drawings to PNG, in
// headless Chrome, with Obsidian's own copies of Mermaid and MathJax (taken out
// of the installed Obsidian.app, so the output matches what Obsidian shows).
// Nothing leaves the machine: the page is served from 127.0.0.1.
//
//   node render.mjs <appHome> <jobs.json>
//   jobs.json: { theme: {fg, bg, muted, accent, border, surface, dark, font, size},
//                jobs: [{ id, kind: "mermaid" | "math" | "excalidraw", src?, display?, file?, out }] }
//   out: an absolute path without extension; writes <out>.png and <out>.json ({w, h}, logical px).
// Prints [{ id, ok, w, h, error }] as JSON.

import fs from "fs";
import path from "path";
import http from "http";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [appHome, jobsFile] = process.argv.slice(2);
const DATA = path.join(appHome, "data", "vault");
const LIB = path.join(DATA, "lib");
const ASAR = "/Applications/Obsidian.app/Contents/Resources/obsidian.asar";
const BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

const { theme, jobs } = JSON.parse(fs.readFileSync(jobsFile, "utf8"));

// Obsidian's lib/mermaid.min.js and lib/mathjax/**, once per Obsidian version.
function ensureLib() {
  const st = fs.statSync(ASAR);
  const stamp = `${st.size}:${st.mtimeMs}`;
  const stampFile = path.join(LIB, "stamp");
  if (fs.existsSync(stampFile) && fs.readFileSync(stampFile, "utf8") === stamp) return;
  const fd = fs.openSync(ASAR, "r");
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
        const buf = Buffer.alloc(v.size);
        fs.readSync(fd, buf, 0, v.size, base + Number(v.offset));
        const out = path.join(LIB, p.slice(4));
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, buf);
      }
    }
  };
  walk(header, "");
  fs.closeSync(fd);
  fs.writeFileSync(stampFile, stamp);
}

// /lib/* from Obsidian's copies, everything else from this folder.
function serve() {
  const types = { ".js": "text/javascript", ".html": "text/html", ".woff": "font/woff", ".css": "text/css" };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = url.startsWith("/lib/") ? path.join(LIB, url.slice(5)) : path.join(HERE, url.slice(1));
    if (!file.startsWith(LIB) && !file.startsWith(HERE)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

function launch() {
  const bin = BROWSERS.find((b) => fs.existsSync(b));
  if (!bin) throw new Error("No Chrome, Chromium, Brave or Edge in /Applications");
  const profile = path.join(DATA, "chrome");
  fs.mkdirSync(profile, { recursive: true });
  const proc = spawn(bin, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-background-networking", "--disable-sync", "--mute-audio",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--hide-scrollbars", "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] });
  return new Promise((ok, fail) => {
    let err = "";
    const t = setTimeout(() => fail(new Error("Chrome didn't start: " + err.slice(-300))), 15000);
    proc.stderr.on("data", (d) => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); ok({ proc, ws: m[1] }); }
    });
    proc.on("exit", () => fail(new Error("Chrome exited: " + err.slice(-300))));
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
      const target = findNear(file, m[2]);
      if (!target) continue;
      const ext = path.extname(target).slice(1).toLowerCase();
      const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      files[m[1]] = { id: m[1], mimeType: mime, dataURL: `data:${mime};base64,${fs.readFileSync(target).toString("base64")}` };
    }
  }
  return { ...json, files };
}

// A file a drawing names: next to it, else anywhere in its vault (by name).
function findNear(from, name) {
  const near = path.join(path.dirname(from), name);
  if (fs.existsSync(near)) return near;
  let dir = path.dirname(from);
  while (dir !== "/" && !fs.existsSync(path.join(dir, ".obsidian"))) dir = path.dirname(dir);
  if (dir === "/") return null;
  const base = path.basename(name);
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === base) return p;
    }
  }
  return null;
}

async function main() {
  ensureLib();
  const server = await serve();
  const { proc, ws } = await launch();
  const results = [];
  try {
    const b = await cdp(ws);
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
    for (let i = 0; i < 100; i++) {
      if (await ev("typeof window.renderJob === 'function' && window.libsReady === true").catch(() => false)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await ev(`window.setTheme(${JSON.stringify(theme)})`);
    for (const job of jobs) {
      try {
        const payload = { ...job };
        if (job.kind === "excalidraw") payload.scene = scene(job.file);
        const box = await ev(`window.renderJob(${JSON.stringify(payload)})`);
        if (box.error) throw new Error(box.error);
        const shot = await s("Page.captureScreenshot", { format: "png", captureBeyondViewport: true,
          clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 } });
        fs.mkdirSync(path.dirname(job.out), { recursive: true });
        fs.writeFileSync(job.out + ".png", Buffer.from(shot.data, "base64"));
        fs.writeFileSync(job.out + ".json", JSON.stringify({ w: box.w, h: box.h, baseline: box.baseline ?? null }));
        results.push({ id: job.id, ok: true, w: box.w, h: box.h });
      } catch (e) {
        const error = String(e.message ?? e).slice(0, 500);
        fs.mkdirSync(path.dirname(job.out), { recursive: true });
        fs.writeFileSync(job.out + ".json", JSON.stringify({ error }));
        results.push({ id: job.id, ok: false, error });
      }
    }
    b.close();
  } finally {
    proc.kill("SIGKILL");
    server.close();
  }
  process.stdout.write(JSON.stringify(results));
}

main().then(() => process.exit(0), (e) => { process.stdout.write(JSON.stringify([{ error: String(e.message ?? e) }])); process.exit(1); });
