// The logic behind the reader's pictures, without Herdr imports: node tests it with a
// fake exec and a fake fs. assets.js wires it to the real ones.
//
// Pictures are cached under <app home>/data/vault/cache (never inside a mod folder:
// Herdr reloads a mod whose folder changes). Each cached picture:
//   <key>.png (or its own extension) + <key>.json  { w, h } in logical px, or { error }.
// Errors that depend on the machine (a missing tool, no network) are NOT cached, so
// installing the tool or coming back online fixes them without clearing anything.

import {
  normPlatform, openCommand, stampsOf, macImageSizeCommand, macThumbnailCommand, imageInfo, svgSize, looksLikeSvg, utf8Text, makeToolFinder,
  missingMessage, renderProblem, nodeOk, obsidianAsarCandidates, browserCandidates, browserNames, browserLookupCommand, pathsFromLookup,
} from "./platform.js";
import { MOD_DIR } from "./mod-name.js";

export const REL = "data/vault/cache";
export const BATCH = 6; // render jobs per node run: a cold Chrome start must fit the 30 s exec limit
export const CACHE_MAX_AGE_DAYS = 30;
export const TOUCH_AFTER_MS = 7 * 86_400_000; // a cache hit older than this is written again, so use keeps it from the prune
export const CACHE_MAX_MB = 200;
export const REMOTE_MAX_BYTES = 20_000_000;
export const IMAGE_MAX_BYTES = 40_000_000;
export const FETCH_CONCURRENCY = 4; // pictures fetched at the same time for one note (render jobs stay one at a time)
export const REMOTE_RETRY_MS = 5 * 60_000; // a failed download is not tried again for this long (and never stored on disk)

// A problem that is the file's own (not an image, a page that cannot be drawn): cached, so it is not
// tried again until the file changes. Any other exception (a missing function, a full disk, a tool that
// failed to start) is not cached: it is the machine's or ours, and the next load should try again.
export class FileProblem extends Error {}

// FNV-1a, twice with different seeds: a 64-bit key as hex.
export function hash(s) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

// fn(item, index) for every item, at most `limit` at a time; results are not collected (fn commits its own).
// An exception in fn ends that worker only after it is thrown to the caller: fn is expected to catch.
export async function mapPool(items, limit, fn) {
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
}

// The theme part of a picture's key: a new theme draws new pictures.
export function themeKey(t) {
  return [t.foreground, t.background, t.muted, t.accent, t.surface, t.raised, t.border].join(",");
}

// ---- settings: data/vault/settings.json ---------------------------------------------

export const DEFAULT_SETTINGS = { remoteImages: true };
// An absolute path in either style ("/x", "C:\\x", "C:/x", "\\\\server\\x"): the only kind a setting may name.
const absolutePath = (v) => typeof v === "string" && v.length < 1024 && /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(v.trim()) && !/[\0\r\n]/.test(v);
// Keys: remoteImages (boolean), browser and asar (absolute paths of a Chromium-family browser and of
// Obsidian's obsidian.asar; they win over discovery and are the one override that reaches a Herdr started
// from Finder or a launcher). Anything else, or a value of the wrong type, is ignored.
export function parseSettings(text) {
  let data = {};
  try { data = JSON.parse(text ?? "{}") ?? {}; } catch { data = {}; }
  if (typeof data !== "object" || Array.isArray(data)) data = {};
  const out = { remoteImages: typeof data.remoteImages === "boolean" ? data.remoteImages : DEFAULT_SETTINGS.remoteImages };
  if (absolutePath(data.browser)) out.browser = data.browser.trim();
  if (absolutePath(data.asar)) out.asar = data.asar.trim();
  return out;
}

// ---- remote images -----------------------------------------------------------------

// Only plain web URLs are fetched; nothing that curl could take for an option or another scheme.
export function remoteUrlOk(url) {
  return /^https?:\/\/[^\s"'<>\\]+$/i.test(String(url)) && !String(url).startsWith("-");
}
export function curlArgs(url, dest) {
  return ["-fsSL", "--proto", "=http,https", "--max-redirs", "5", "--max-time", "20", "--max-filesize", String(REMOTE_MAX_BYTES), "-o", dest, "--", url];
}
// The extension of an image from its first bytes ("png", "jpg", ...) or null when it isn't one.
export function extFromBytes(bytes) {
  const info = imageInfo(bytes);
  if (info) return info.type;
  const head = utf8Text(bytes, 2000);
  return looksLikeSvg(head) ? "svg" : null;
}

// ---- cache pruning -------------------------------------------------------------------

// A stamp "mtime:size" → { ms, size }. Unix prints seconds, Windows prints .NET ticks.
export function parseStamp(stamp) {
  const [t, s] = String(stamp).split(":").map(Number);
  const ms = t > 1e15 ? t / 10000 - 62135596800000 : t * 1000;
  return { ms, size: s || 0 };
}

const stemOf = (name) => name.replace(/\.[^.]+$/, "");

// files: [{ name, ms, size }] in the cache folder. → names to delete: whole entries (picture +
// its json, grouped by stem) older than maxAgeMs first, then oldest first until under maxBytes.
export function pruneList(files, now, maxAgeMs, maxBytes) {
  const groups = new Map();
  for (const f of files) {
    const g = groups.get(stemOf(f.name)) ?? { names: [], ms: 0, size: 0 };
    g.names.push(f.name);
    g.ms = Math.max(g.ms, f.ms);
    g.size += f.size;
    groups.set(stemOf(f.name), g);
  }
  const drop = [];
  let keep = [...groups.values()].filter((g) => {
    if (now - g.ms > maxAgeMs) { drop.push(g); return false; }
    return true;
  });
  let total = keep.reduce((n, g) => n + g.size, 0);
  keep.sort((a, b) => a.ms - b.ms);
  while (total > maxBytes && keep.length) {
    const g = keep.shift();
    total -= g.size;
    drop.push(g);
  }
  // json first: a half-finished delete then re-renders instead of pointing at a missing picture.
  return drop.flatMap((g) => [...g.names].sort((a, b) => Number(b.endsWith(".json")) - Number(a.endsWith(".json"))));
}

// ---- the factory ---------------------------------------------------------------------

// deps: { exec, fs: { readFile, readText, writeFile, exists, mkdir, unlink, readdir },
//         appHome, home, platform, now? }
export function createAssets(deps) {
  const { exec, fs, appHome, home } = deps;
  const platform = normPlatform(deps.platform);
  const now = deps.now ?? (() => Date.now());
  const abs = (rel) => `${appHome}/${rel}`;
  const tool = makeToolFinder({ platform, home, exec, readdir: fs.readdir, now });
  let ready = false;

  const ensureDir = async () => {
    if (ready) return;
    await fs.mkdir(abs(REL), { recursive: true }).catch(() => {});
    ready = true;
  };
  // `at` (when the entry was written or last used) keeps a picture that is read every day from the 30-day
  // prune: a use older than TOUCH_AFTER_MS rewrites the small json (whose mtime pruning looks at), once per
  // entry per session. Callers never see `at`.
  const touched = new Set();
  const meta = async (key) => {
    let parsed;
    try { parsed = JSON.parse(await fs.readText(abs(`${REL}/${key}.json`))); } catch { return null; }
    if (!parsed || typeof parsed !== "object") return null;
    const { at, ...m } = parsed;
    if (!(now() - at < TOUCH_AFTER_MS) && !touched.has(key)) { touched.add(key); await putMeta(key, m); }
    return m;
  };
  const putMeta = (key, value) => fs.writeFile(abs(`${REL}/${key}.json`), JSON.stringify({ ...value, at: now() })).catch(() => {});
  const hit = (key, ext, m) => (m.error ? { error: m.error } : { path: `${REL}/${key}.${ext}`, w: m.w, h: m.h });
  // Cache a failure only when the file itself is the problem (FileProblem), not the machine.
  const fail = async (key, e) => {
    const error = String(e?.message ?? e);
    if (e instanceof FileProblem) await putMeta(key, { error });
    return { error };
  };

  // ---- settings ----
  let settings = null;
  const loadSettings = async () => {
    if (settings) return settings;
    settings = parseSettings(await fs.readText(abs("data/vault/settings.json")).catch(() => null));
    return settings;
  };
  const saveSettings = async (patch) => {
    settings = { ...(await loadSettings()), ...patch };
    await fs.mkdir(abs("data/vault"), { recursive: true }).catch(() => {});
    await fs.writeFile(abs("data/vault/settings.json"), JSON.stringify(settings, null, 2)).catch(() => {});
    return settings;
  };

  // ---- stamps ----
  const stamps = (paths) => stampsOf(platform, paths, exec);

  // ---- vault images ----
  // Size from the file's own header; on macOS the system tool only for formats read here (AVIF, TIFF).
  async function sizeOf(bytes, ext, destPath) {
    if (ext === "svg") return svgSize(utf8Text(bytes, 4000));
    const info = imageInfo(bytes);
    if (info) return { w: info.w, h: info.h };
    if (platform === "macos" && destPath) {
      const [cmd, args] = macImageSizeCommand(destPath);
      const r = await exec(cmd, args).catch(() => null);
      const w = Number((r?.stdout?.match(/pixelWidth:\s*(\d+)/) || [])[1]);
      const h = Number((r?.stdout?.match(/pixelHeight:\s*(\d+)/) || [])[1]);
      if (w && h) return { w, h };
    }
    throw new FileProblem("Not an image this reader can show");
  }

  // A vault image (absolute path) → { path, w, h } | { error }, at its pixel size
  // (as Obsidian shows it), fitted to the column when drawn. Copied into the cache because
  // image() only loads files under the app's folder.
  async function vaultImage(file, stamp) {
    await ensureDir();
    const ext = (file.match(/\.(\w+)$/) || [, "png"])[1].toLowerCase();
    const key = hash(`img2:${file}:${stamp}`);
    const m = await meta(key);
    if (m) return hit(key, ext, m);
    try {
      // The stamp is "mtime:size": a huge file is refused before it is read into memory.
      if (parseStamp(stamp).size > IMAGE_MAX_BYTES) throw new FileProblem("This image is too large to show here");
      const bytes = await fs.readFile(file);
      if (bytes.length > IMAGE_MAX_BYTES) throw new FileProblem("This image is too large to show here");
      const dest = abs(`${REL}/${key}.${ext}`);
      await fs.writeFile(dest, bytes);
      const { w, h } = await sizeOf(bytes, ext, dest);
      await putMeta(key, { w, h });
      return { path: `${REL}/${key}.${ext}`, w, h };
    } catch (e) { return fail(key, e); }
  }

  // ---- PDFs ----
  // A PDF's first page through Quick Look (macOS only) → { path, w, h } | { error }.
  async function quickLook(file, key) {
    const tmp = abs(`${REL}/ql-${key}`);
    await fs.mkdir(tmp, { recursive: true });
    try {
      const [cmd, args] = macThumbnailCommand(tmp, file);
      const r = await exec(cmd, args);
      const made = (await fs.readdir(tmp)).find((f) => f.endsWith(".png"));
      if (!made) throw new FileProblem(r.stderr?.trim() || "Quick Look made no preview");
      const bytes = await fs.readFile(`${tmp}/${made}`);
      await fs.writeFile(abs(`${REL}/${key}.png`), bytes);
      const { w, h } = await sizeOf(bytes, "png");
      const shown = { w: Math.round(w / 2), h: Math.round(h / 2) };
      await putMeta(key, shown);
      return { path: `${REL}/${key}.png`, ...shown };
    } finally {
      // whatever happened, the temporary folder and what is in it go (it used to stay when Quick Look failed)
      for (const f of await fs.readdir(tmp).catch(() => [])) await fs.unlink(`${tmp}/${f}`).catch(() => {});
      await fs.rmdir(tmp).catch(() => {});
    }
  }

  // The first page of a PDF that sits inside a note or a canvas → { path, w, h } | { error, missing? }.
  // Poppler's pdftoppm wherever it is installed (the same page-1 picture the opened-PDF view uses);
  // macOS falls back to Quick Look only when Poppler is missing; elsewhere the install hint.
  async function pdfPage(file, stamp) {
    if (await tool("pdftoppm")) return pdfPageAt(file, stamp, 1);
    if (platform !== "macos") return { error: missingMessage(platform, "poppler") + ". Until then PDFs open in your default app.", missing: "poppler" };
    await ensureDir();
    const key = hash(`pdf2:${file}:${stamp}`);
    const m = await meta(key);
    if (m) return hit(key, "png", m);
    try { return await quickLook(file, key); } catch (e) { return fail(key, e); }
  }

  // How many pages a PDF has → { pages } | { error, missing? }.
  async function pdfInfo(file, stamp) {
    await ensureDir();
    const key = hash(`pdfinfo:${file}:${stamp}`);
    const m = await meta(key);
    if (m) return m;
    const bin = await tool("pdfinfo");
    if (!bin) return { error: missingMessage(platform, "poppler"), missing: "poppler" }; // not cached: installing it fixes it
    const r = await exec(bin, [file]).catch((e) => ({ code: 1, stderr: String(e) }));
    const pages = Number((r.stdout?.match(/^Pages:\s+(\d+)/m) || [])[1]);
    const res = r.code === 0 && pages ? { pages } : { error: (r.stderr || "Couldn't read the PDF").trim().slice(0, 200) };
    await putMeta(key, res);
    return res;
  }

  // Page n (from 1) of a PDF, drawn at 2x → { path, w, h } | { error }.
  async function pdfPageAt(file, stamp, n) {
    await ensureDir();
    const key = hash(`pdfpage:${file}:${stamp}:${n}`);
    const m = await meta(key);
    if (m) return hit(key, "png", m);
    const bin = await tool("pdftoppm");
    if (!bin) return { error: missingMessage(platform, "poppler"), missing: "poppler" };
    try {
      const r = await exec(bin, ["-png", "-r", "144", "-f", String(n), "-l", String(n), "-singlefile", file, abs(`${REL}/${key}`)]);
      if (r.code !== 0) throw new FileProblem(r.stderr?.trim() || `Couldn't draw page ${n}`);
      const bytes = await fs.readFile(abs(`${REL}/${key}.png`));
      const { w, h } = await sizeOf(bytes, "png");
      const shown = { w: Math.round(w / 2), h: Math.round(h / 2) };
      await putMeta(key, shown);
      return { path: `${REL}/${key}.png`, ...shown };
    } catch (e) { return fail(key, e); }
  }

  // ---- images on the web ----
  // Downloaded with curl (fetch in Herdr returns text, not bytes). Network failures are not
  // cached; "not an image" is.
  const recentFailures = new Map(); // url → { at, res }
  async function remoteImage(url) {
    await ensureDir();
    if (!(await loadSettings()).remoteImages) return { error: "Images from the web are turned off (“Web images” in the bar above turns them on)", off: true };
    if (!remoteUrlOk(url)) return { error: "Not a web address this reader will fetch" };
    const key = hash(`url2:${url}`);
    const m = await meta(key);
    if (m) {
      const ext = m.ext ?? "png";
      return hit(key, ext, m);
    }
    const curl = await tool("curl");
    if (!curl) return { error: missingMessage(platform, "curl"), missing: "curl" };
    const again = recentFailures.get(url);
    if (again && now() - again.at < REMOTE_RETRY_MS) return again.res;
    const tmp = abs(`${REL}/${key}.part`);
    try {
      const r = await exec(curl, curlArgs(url, tmp)).catch((e) => ({ code: 127, stderr: String(e?.message ?? e) }));
      if (r.code !== 0) {
        const res = { error: `Couldn't download the image (${(r.stderr || `curl ${r.code}`).trim().split("\n").pop().slice(0, 120)})`, transient: true };
        recentFailures.set(url, { at: now(), res });
        return res;
      }
      recentFailures.delete(url);
      const bytes = await fs.readFile(tmp);
      const ext = extFromBytes(bytes);
      if (!ext) return fail(key, new FileProblem("The address isn't a picture"));
      await fs.writeFile(abs(`${REL}/${key}.${ext}`), bytes);
      const { w, h } = await sizeOf(bytes, ext, abs(`${REL}/${key}.${ext}`));
      await putMeta(key, { w, h, ext });
      return { path: `${REL}/${key}.${ext}`, w, h };
    } catch (e) { return fail(key, e); }
    finally { await fs.unlink(tmp).catch(() => {}); }
  }

  // A generated SVG (canvas edges) → its path.
  async function svgFile(text) {
    await ensureDir();
    const key = hash(`svg:${text}`);
    const rel = `${REL}/${key}.svg`;
    if (!(await fs.exists(abs(rel)).catch(() => false))) await fs.writeFile(abs(rel), text);
    return rel;
  }

  // ---- Mermaid / math / Excalidraw through render/render.mjs (headless browser) ----
  let nodeCheck = null; // { ok, text, at }
  async function nodeReady() {
    if (nodeCheck && now() - nodeCheck.at < 30_000) return nodeCheck;
    const bin = await tool("node");
    let res;
    if (!bin) res = { problem: renderProblem(platform, "no-node") };
    else {
      const r = await exec(bin, ["--version"]).catch(() => null);
      res = nodeOk(r?.stdout) ? { bin } : { problem: renderProblem(platform, "needs-node-22") };
    }
    nodeCheck = { ...res, at: now() };
    return nodeCheck;
  }

  let queue = Promise.resolve();
  let seq = 0;

  // jobs: [{ key, kind, src?, display?, file? }]; returns Map key → { path, w, h } | { error }.
  // Runs one at a time per mod instance; render.mjs gives every run its own browser profile.
  function renderJobs(jobs, theme, onBatch) {
    const run = queue.then(() => renderNow(jobs, theme, onBatch));
    queue = run.catch(() => {});
    return run;
  }

  async function renderNow(jobs, theme, onBatch) {
    await ensureDir();
    const out = new Map();
    const todo = [];
    for (const j of jobs) {
      const m = await meta(j.key);
      if (m) out.set(j.key, hit(j.key, "png", m));
      else todo.push(j);
    }
    if (!todo.length) return out;
    const ready = await nodeReady();
    if (ready.problem) {
      for (const j of todo) out.set(j.key, { error: ready.problem, transient: true });
      onBatch?.(out);
      return out;
    }
    // Read afresh: someone who just added "browser" to settings.json should not have to restart Herdr.
    const { browser, asar } = parseSettings(await fs.readText(abs("data/vault/settings.json")).catch(() => null));
    const discover = { asar: obsidianAsarCandidates(platform), browsers: browserCandidates(platform), names: browserNames(platform), browserPath: browser, asarPath: asar };
    // Runs one batch: → { problem } (null when it went well). `found` are browsers the login shell knows.
    const attempt = async (batch, found) => {
      const spec = { theme, discover: { ...discover, browserFound: found }, jobs: batch.map((j) => ({ id: j.key, kind: j.kind, src: j.src, display: j.display, file: j.file, out: abs(`${REL}/${j.key}`) })) };
      const file = abs(`${REL}/jobs-${hash(`${batch[0].key}:${now()}:${++seq}`)}.json`);
      await fs.writeFile(file, JSON.stringify(spec));
      try {
        const r = await exec(ready.bin, [abs(`${MOD_DIR}/render/render.mjs`), appHome, file]);
        let results = null;
        try { results = JSON.parse(r.stdout); } catch { /* not JSON: handled below */ }
        const global = Array.isArray(results) ? results.find((x) => x && !x.id && x.error) : null;
        if (global) return { problem: renderProblem(platform, global), kind: global.error };
        if (r.code !== 0 || !Array.isArray(results)) return { problem: renderProblem(platform, r.stderr || r.stdout || "the renderer stopped") };
        return { problem: null };
      } catch (e) { return { problem: renderProblem(platform, e) }; }
      finally { await fs.unlink(file).catch(() => {}); } // also when exec throws: no job file is left
    };
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      const known = await shellBrowsers(false);
      let { problem, kind } = await attempt(batch, known);
      // Nothing found by the usual ways: ask the person's login shell once, and try again with its answer.
      if (kind === "no-browser" || kind === "no-browser-setting") {
        const found = await shellBrowsers(true);
        if (found.length && found.join("\n") !== known.join("\n")) ({ problem } = await attempt(batch, found));
      }
      for (const j of batch) {
        const m = await meta(j.key);
        out.set(j.key, m ? hit(j.key, "png", m) : { error: problem ?? "Not drawn", transient: true });
      }
      onBatch?.(out);
    }
    return out;
  }

  // Browsers found by the person's shell (`command -v` / `where`), asked for only after the install folders
  // and PATH failed (a login shell takes a moment to start); remembered for the session, a miss for 30 s.
  let shellFound = null; // { list, at }
  async function shellBrowsers(ask) {
    if (shellFound && (shellFound.list.length || now() - shellFound.at < 30_000)) return shellFound.list;
    if (!ask) return shellFound?.list ?? [];
    const [cmd, args] = browserLookupCommand(platform, browserNames(platform));
    const r = await exec(cmd, args).catch(() => null);
    shellFound = { list: pathsFromLookup(r?.stdout), at: now() };
    return shellFound.list;
  }

  // ---- cache size ----
  // Entries older than maxAgeDays go, then the oldest until the folder is under maxMB.
  async function pruneCache(maxAgeDays = CACHE_MAX_AGE_DAYS, maxMB = CACHE_MAX_MB) {
    const names = await fs.readdir(abs(REL)).catch(() => []);
    const paths = names.filter((n) => /\.[a-z0-9]+$/i.test(n)).map((n) => abs(`${REL}/${n}`));
    const files = [];
    for (let i = 0; i < paths.length; i += 150) {
      const chunk = paths.slice(i, i + 150);
      const st = await stamps(chunk);
      for (const [p, stamp] of st) files.push({ name: p.slice(p.lastIndexOf("/") + 1), ...parseStamp(stamp) });
    }
    const drop = pruneList(files, now(), maxAgeDays * 86_400_000, maxMB * 1_048_576);
    for (const n of drop) await fs.unlink(abs(`${REL}/${n}`)).catch(() => {});
    return drop.length;
  }

  const openTarget = (target) => { const [cmd, args] = openCommand(platform, target); return exec(cmd, args); };

  return { tool, stamps, vaultImage, pdfPage, pdfInfo, pdfPageAt, remoteImage, svgFile, renderJobs, pruneCache, loadSettings, saveSettings, openTarget, platform };
}
