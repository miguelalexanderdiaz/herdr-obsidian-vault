import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { expandCandidate, findAsar, findBrowser, safeJoin, findNear, profileName, DEADLINE_MS } from "../mods/vault-reader/render/lib.mjs";
import * as P from "../mods/vault-reader/platform.js";

const existsIn = (set) => (p) => set.has(p);

test("candidates expand ~ and %VAR% (case-insensitive), and skip unset variables", () => {
  const env = { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" };
  assert.deepEqual(expandCandidate("~/Applications/x", { home: "/Users/me", pathMod: path.posix }), ["/Users/me/Applications/x"]);
  assert.deepEqual(expandCandidate("%localappdata%/Programs/Obsidian/resources/obsidian.asar", { env, pathMod: path.win32 }),
    ["C:\\Users\\me\\AppData\\Local\\Programs\\Obsidian\\resources\\obsidian.asar"]);
  assert.deepEqual(expandCandidate("%ProgramW6432%/Obsidian/x", { env, pathMod: path.win32 }), []);
});

test("a * segment matches one folder (flatpak versions)", () => {
  const dirs = { "/var/lib/flatpak/app/md.obsidian.Obsidian": ["x86_64"], "/var/lib/flatpak/app/md.obsidian.Obsidian/x86_64": ["stable"] };
  const readdirSync = (d) => { if (!(d in dirs)) throw new Error("ENOENT"); return dirs[d]; };
  const got = expandCandidate("/var/lib/flatpak/app/md.obsidian.Obsidian/*/*/files/obsidian.asar", { readdirSync, pathMod: path.posix });
  assert.deepEqual(got, ["/var/lib/flatpak/app/md.obsidian.Obsidian/x86_64/stable/files/obsidian.asar"]);
});

test("asar: the override first, then each OS's candidates", () => {
  const exists = existsIn(new Set(["/opt/Obsidian/resources/obsidian.asar"]));
  const candidates = P.obsidianAsarCandidates("linux");
  assert.equal(findAsar({ env: {}, home: "/h", candidates, exists, pathMod: path.posix }), "/opt/Obsidian/resources/obsidian.asar");
  assert.equal(findAsar({ env: { HERDR_VAULT_ASAR: "/custom/obsidian.asar" }, home: "/h", candidates, exists: existsIn(new Set(["/custom/obsidian.asar", "/opt/Obsidian/resources/obsidian.asar"])), pathMod: path.posix }), "/custom/obsidian.asar");
  assert.equal(findAsar({ env: {}, home: "/h", candidates, exists: () => false, pathMod: path.posix }), null);
  const win = findAsar({ env: { LOCALAPPDATA: "C:\\U\\me\\AppData\\Local" }, home: "C:\\U\\me", candidates: P.obsidianAsarCandidates("windows"),
    exists: existsIn(new Set(["C:\\U\\me\\AppData\\Local\\Programs\\Obsidian\\resources\\obsidian.asar"])), pathMod: path.win32 });
  assert.equal(win, "C:\\U\\me\\AppData\\Local\\Programs\\Obsidian\\resources\\obsidian.asar");
});

test("browser: env overrides, install folders, then PATH names", () => {
  const mac = P.browserCandidates("macos");
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  assert.equal(findBrowser({ env: {}, home: "/h", candidates: mac, names: [], exists: existsIn(new Set([chrome])), pathMod: path.posix }), chrome);
  assert.equal(findBrowser({ env: { HERDR_VAULT_BROWSER: "/mine/chrome" }, home: "/h", candidates: mac, names: [], exists: existsIn(new Set(["/mine/chrome", chrome])), pathMod: path.posix }), "/mine/chrome");
  assert.equal(findBrowser({ env: { CHROME_PATH: "/c/chrome" }, home: "/h", candidates: [], names: [], exists: existsIn(new Set(["/c/chrome"])), pathMod: path.posix }), "/c/chrome");
  // Linux: nothing in install folders, found by name on PATH
  assert.equal(findBrowser({ env: { PATH: "/usr/local/bin:/usr/bin" }, home: "/h", candidates: [], names: P.browserNames("linux"), exists: existsIn(new Set(["/usr/bin/chromium"])), pathMod: path.posix }), "/usr/bin/chromium");
  // Windows: Edge is always there
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  assert.equal(findBrowser({ env: { "ProgramFiles(x86)": "C:\\Program Files (x86)", ProgramFiles: "C:\\Program Files" }, home: "C:\\U\\me", candidates: P.browserCandidates("windows"), names: [], exists: existsIn(new Set([edge])), pathMod: path.win32 }), edge);
  assert.equal(findBrowser({ env: {}, home: "/h", candidates: mac, names: [], exists: () => false, pathMod: path.posix }), null);
});

test("PATH lookup adds .exe on Windows", () => {
  const found = findBrowser({ env: { Path: "C:\\tools" }, home: "C:\\h", candidates: [], names: ["chrome"], exists: existsIn(new Set(["C:\\tools\\chrome.exe"])), pathMod: path.win32, win: true });
  assert.equal(found, "C:\\tools\\chrome.exe");
});

test("safeJoin stays inside the root, also against a sibling folder and bad escapes (CR-1-6)", () => {
  const root = "/data/render";
  assert.equal(safeJoin(root, "/page.html", path.posix), "/data/render/page.html");
  assert.equal(safeJoin(root, "/a/b.js", path.posix), "/data/render/a/b.js");
  assert.equal(safeJoin(root, "/../render-x/secret", path.posix), null);
  assert.equal(safeJoin(root, "/%2e%2e/render-x/secret", path.posix), null);
  assert.equal(safeJoin(root, "/..%2f..%2fetc/passwd", path.posix), null);
  assert.equal(safeJoin(root, "/%E0%A4%A", path.posix), null, "malformed % does not throw");
  assert.equal(safeJoin(root, "/a%00b", path.posix), null);
  assert.equal(safeJoin("C:\\data\\render", "/..\\render-x\\s", path.win32), null);
});

test("findNear ends at the filesystem root on POSIX and on a Windows-style root (CR-1-5)", () => {
  const tree = (files, dirs = []) => ({
    existsSync: (p) => files.includes(p) || dirs.includes(p),
    readdirSync: (d) => {
      const names = new Map();
      for (const f of files) if (path.posix.dirname(f) === d) names.set(path.posix.basename(f), false);
      for (const x of dirs) if (path.posix.dirname(x) === d) names.set(path.posix.basename(x), true);
      return [...names].map(([name, dir]) => ({ name, isDirectory: () => dir }));
    },
  });
  const t = tree(["/v/pics/a.png", "/v/notes/d.excalidraw.md"], ["/v/.obsidian", "/v/pics", "/v/notes"]);
  assert.equal(findNear("/v/notes/d.excalidraw.md", "a.png", { ...t, pathMod: path.posix }), "/v/pics/a.png");
  assert.equal(findNear("/v/notes/d.excalidraw.md", "missing.png", { ...t, pathMod: path.posix }), null);
  // no .obsidian anywhere: must stop at "/" instead of looping
  const bare = tree(["/x/y/d.md"], []);
  assert.equal(findNear("/x/y/d.md", "a.png", { ...bare, pathMod: path.posix }), null);

  // Windows: path.win32.dirname("C:\\") === "C:\\", the old loop condition never ended
  let n = 0;
  const win = {
    existsSync: () => { if (++n > 1000) throw new Error("did not terminate"); return false; },
    readdirSync: () => [],
    pathMod: path.win32,
  };
  assert.equal(findNear("C:\\Users\\me\\notes\\d.md", "a.png", win), null);
  assert.ok(n < 100, "bounded number of probes");
});

test("two parallel runs get distinct browser profile folders (CR-1-6)", () => {
  const a = profileName(1000, 5), b = profileName(1001, 5), c = profileName(1000, 5, 0.123), d = profileName(1000, 5, 0.456);
  assert.equal(new Set([a, b, c, d]).size, 4);
  assert.match(a, /^chrome-1000-/);
  assert.ok(DEADLINE_MS < 30_000, "under the 30 s exec limit");
});

// ---- render.mjs itself: the machine problems it can report without any browser -------------------

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const RENDER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "mods", "vault-reader", "render", "render.mjs");
export function envWithout(env, lowerKey) {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (k.toLowerCase() !== lowerKey) out[k] = v;
  return out;
}
function runRender(spec, env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-render-test-"));
  const file = path.join(dir, "jobs.json");
  fs.writeFileSync(file, JSON.stringify({ theme: {}, jobs: [], ...spec }));
  const clean = envWithout(process.env, "path"); // "Path" on Windows: drop the key in any letter case
  Object.assign(clean, { HERDR_VAULT_BROWSER: "", HERDR_VAULT_ASAR: "", CHROME_PATH: "", PATH: "" });
  const r = spawnSync(process.execPath, [RENDER, dir, file], { env: { ...clean, ...env }, encoding: "utf8", timeout: 20000 });
  return { out: JSON.parse(r.stdout || "null"), code: r.status, stderr: r.stderr };
}

test("render.mjs: no browser anywhere is a structured no-browser, exit 0, nothing thrown", () => {
  const r = runRender({ discover: { asar: [], browsers: [], names: [] } }, {});
  assert.deepEqual(r.out, [{ error: "no-browser" }]);
  assert.equal(r.code, 0);
});

test("render.mjs: a browser but no Obsidian app is a structured no-obsidian", () => {
  const r = runRender({ discover: { asar: ["/nonexistent/obsidian.asar"], browsers: [], names: [] } }, { HERDR_VAULT_BROWSER: process.execPath });
  assert.deepEqual(r.out, [{ error: "no-obsidian" }]);
});

test("envWithout drops PATH in any letter case, so a Windows Path cannot survive (CR-2-5)", () => {
  const win = { Path: "C:\\Windows", PATH: "x", HOME: "h", pAtH: "y" };
  assert.deepEqual(envWithout(win, "path"), { HOME: "h" });
});

// ---- the render page cannot fetch what a note names (R2-CR-6, CR-2-3) ------------------------------------

import { PAGE_CSP, browserArgs } from "../mods/vault-reader/render/lib.mjs";

test("page.html carries exactly PAGE_CSP, as its first meta after the charset, and names no outside source", () => {
  const html = fs.readFileSync(path.join(path.dirname(RENDER), "page.html"), "utf8");
  const metas = [...html.matchAll(/<meta\s+([^>]*)>/g)].map((m) => m[1]);
  assert.match(metas[0], /charset/);
  const csp = metas[1].match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/);
  assert.ok(csp, "second meta is the CSP");
  assert.equal(csp[1], PAGE_CSP);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/i, "no outside script, style or image source");
  assert.match(PAGE_CSP, /default-src 'none'/);
  assert.match(PAGE_CSP, /connect-src 'none'/);
  for (const d of PAGE_CSP.split(";")) assert.doesNotMatch(d, /https?:|\*/, d);
});

test("the browser starts with a resolver that maps everything but loopback to nothing, and no proxy", () => {
  const args = browserArgs("/data/vault/chrome-1-x-y");
  assert.ok(args.includes("--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"));
  assert.ok(args.includes("--no-proxy-server"));
  assert.ok(args.includes("--user-data-dir=/data/vault/chrome-1-x-y"), "a per-run profile");
  assert.ok(args.includes("--remote-debugging-port=0") && args.includes("--headless=new"));
});

test("browser precedence: settings > environment > install folders > PATH > login shell (D7, CR-2-9)", () => {
  const all = new Set(["/s/chrome", "/e/hv", "/e/cp", "/usr/bin/google-chrome", "/bin/chromium", "/shell/chromium"]);
  const base = { home: "/h", candidates: ["/usr/bin/google-chrome"], names: ["chromium"], fallback: ["/shell/chromium"], pathMod: path.posix };
  const env = { HERDR_VAULT_BROWSER: "/e/hv", CHROME_PATH: "/e/cp", PATH: "/bin" };
  const find = (have, over = {}) => findBrowser({ ...base, env, exists: existsIn(have), ...over });
  assert.equal(find(all, { preferred: ["/s/chrome"] }), "/s/chrome");
  all.delete("/s/chrome");
  assert.equal(find(all, { preferred: ["/s/chrome"] }), "/e/hv", "a settings path that is not there falls through");
  all.delete("/e/hv"); assert.equal(find(all), "/e/cp");
  all.delete("/e/cp"); assert.equal(find(all), "/usr/bin/google-chrome");
  all.delete("/usr/bin/google-chrome"); assert.equal(find(all), "/bin/chromium");
  all.delete("/bin/chromium"); assert.equal(find(all), "/shell/chromium");
  all.delete("/shell/chromium"); assert.equal(find(all), null);
  // asar: settings, then environment, then candidates
  const asar = (have, over) => findAsar({ home: "/h", candidates: ["/opt/Obsidian/resources/obsidian.asar"], env: { HERDR_VAULT_ASAR: "/e/o.asar" }, exists: existsIn(have), pathMod: path.posix, ...over });
  const a = new Set(["/s/o.asar", "/e/o.asar", "/opt/Obsidian/resources/obsidian.asar"]);
  assert.equal(asar(a, { preferred: ["/s/o.asar"] }), "/s/o.asar");
  assert.equal(asar(a), "/e/o.asar");
  assert.equal(asar(new Set(["/opt/Obsidian/resources/obsidian.asar"])), "/opt/Obsidian/resources/obsidian.asar");
});

test("render.mjs reports a settings path that does not exist as its own kind (CR-2-9)", () => {
  const r = runRender({ discover: { asar: [], browsers: [], names: [], browserPath: "/nonexistent/chrome" } }, {});
  assert.deepEqual(r.out, [{ error: "no-browser-setting" }]);
  const o = runRender({ discover: { asar: [], browsers: [], names: [], asarPath: "/nonexistent/o.asar" } }, { HERDR_VAULT_BROWSER: process.execPath });
  assert.deepEqual(o.out, [{ error: "no-obsidian-setting" }]);
});
