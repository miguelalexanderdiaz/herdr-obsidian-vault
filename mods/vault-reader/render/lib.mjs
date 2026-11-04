// Pure helpers of render.mjs (it runs under node, outside Herdr): finding Obsidian's bundle
// and a browser, a safe static file server path, and the search for a file a drawing names.
// The candidate lists themselves come from ../platform.js (the mod passes them in the job
// spec), so this file has no operating-system paths. Tested in tests/render-lib.test.mjs.

import path from "node:path";

// "~/x" and "%NAME%/x" → real paths; null when a variable isn't set. A "*" segment matches
// any one folder (flatpak puts its version in the path).
export function expandCandidate(pattern, { home, env = {}, readdirSync = () => [], pathMod = path } = {}) {
  let p = String(pattern);
  if (p === "~" || p.startsWith("~/")) p = (home ?? "") + p.slice(1);
  let missing = false;
  const lower = new Map(Object.entries(env).map(([k, v]) => [k.toLowerCase(), v]));
  p = p.replace(/%([^%]+)%/g, (_, name) => {
    const v = lower.get(name.toLowerCase());
    if (!v) missing = true;
    return v ?? "";
  });
  if (missing || !p) return [];
  p = p.replace(/\\/g, "/");
  if (!p.includes("*")) return [pathMod.normalize(p)];
  // Expand one segment at a time.
  let bases = [""];
  const parts = p.split("/");
  parts.forEach((seg, i) => {
    const next = [];
    for (const b of bases) {
      const prefix = i === 0 ? seg : `${b}/${seg}`;
      if (!seg.includes("*")) { next.push(i === 0 ? seg : prefix); continue; }
      const dir = i === 0 ? "." : b;
      let names = [];
      try { names = readdirSync(dir || "/"); } catch { names = []; }
      const re = new RegExp("^" + seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
      for (const n of names) if (re.test(String(n))) next.push(i === 0 ? String(n) : `${b}/${n}`);
    }
    bases = next;
  });
  return bases.map((b) => pathMod.normalize(b));
}

const firstThat = (list, exists) => list.find((p) => exists(p)) ?? null;

// Obsidian's obsidian.asar: the path from data/vault/settings.json ("asar", `preferred`), HERDR_VAULT_ASAR,
// then the candidates. → path | null
export function findAsar({ env = {}, home, candidates = [], preferred = [], exists, readdirSync, pathMod = path }) {
  const list = [...preferred];
  if (env.HERDR_VAULT_ASAR) list.push(env.HERDR_VAULT_ASAR);
  for (const c of candidates) list.push(...expandCandidate(c, { home, env, readdirSync, pathMod }));
  return firstThat(list, exists);
}

// A Chromium-family browser, first match wins: the path from data/vault/settings.json ("browser",
// `preferred`), HERDR_VAULT_BROWSER, CHROME_PATH, the install folders, names on PATH, and last what the
// mod found through the person's shell (`fallback`). → path | null
export function findBrowser({ env = {}, home, candidates = [], names = [], preferred = [], fallback = [], exists, readdirSync, pathMod = path, win = false }) {
  const list = [...preferred];
  for (const v of [env.HERDR_VAULT_BROWSER, env.CHROME_PATH]) if (v) list.push(v);
  for (const c of candidates) list.push(...expandCandidate(c, { home, env, readdirSync, pathMod }));
  const found = firstThat(list, exists);
  if (found) return found;
  const dirs = String(env.PATH ?? env.Path ?? "").split(pathMod.delimiter).filter(Boolean);
  for (const d of dirs) for (const n of names) {
    const p = pathMod.join(d, win && !n.endsWith(".exe") ? n + ".exe" : n);
    if (exists(p)) return p;
  }
  return firstThat(fallback, exists);
}

// A request path → a file under `root`, or null if it would leave it (also for malformed %).
export function safeJoin(root, urlPath, pathMod = path) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { return null; }
  if (rel.includes("\0")) return null;
  const full = pathMod.resolve(root, "." + (rel.startsWith("/") ? rel : "/" + rel));
  const base = pathMod.resolve(root);
  return full === base || full.startsWith(base.endsWith(pathMod.sep) ? base : base + pathMod.sep) ? full : null;
}

// A file a drawing names: next to it, else anywhere in its vault (by name). The walk up stops
// at the filesystem root of whatever OS this is ("/" or "C:\").
export function findNear(from, name, { existsSync, readdirSync, pathMod = path }) {
  const near = pathMod.join(pathMod.dirname(from), name);
  if (existsSync(near)) return near;
  let dir = pathMod.dirname(from);
  const root = pathMod.parse(dir).root;
  while (dir !== root && !existsSync(pathMod.join(dir, ".obsidian"))) {
    const up = pathMod.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  if (dir === root && !existsSync(pathMod.join(dir, ".obsidian"))) return null;
  const base = pathMod.basename(name);
  const stack = [dir];
  let seen = 0;
  while (stack.length && seen++ < 20000) {
    const d = stack.pop();
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const p = pathMod.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === base) return p;
    }
  }
  return null;
}

export const DEADLINE_MS = 24_000; // the mod's exec() gives a command 30 s; stop starting jobs after this

// A browser profile folder name for one run: two runs at once (two readers) never share one.
export const profileName = (pid, now = Date.now(), rand = Math.random()) => `chrome-${pid}-${now.toString(36)}-${rand.toString(36).slice(2, 7)}`;

// The content-security policy of render/page.html (page.html carries the same text in a <meta>; a test
// compares the two). A note's Mermaid label may hold an <img src="http://...">, and Mermaid's sanitiser
// lets it through: without this the browser would fetch it (reproduced in round 2). Nothing but the page's
// own loopback origin, data: and blob: may load.
export const PAGE_CSP = "default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; "
  + "font-src 'self' data: blob:; img-src 'self' data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'";

// The browser's command line for one run. Belt and braces behind the CSP: no name resolves except the
// loopback address the page is served from (the rule list is comma separated), and no proxy is used, so a
// system proxy could not be asked for an outside address either.
export const browserArgs = (profile) => ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--disable-background-networking", "--disable-sync", "--mute-audio",
  "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1", "--no-proxy-server",
  `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--hide-scrollbars", "about:blank"];
