import test from "node:test";
import assert from "node:assert/strict";
import {
  createAssets, hash, themeKey, parseSettings, remoteUrlOk, curlArgs, extFromBytes, parseStamp, pruneList,
  BATCH, REL, REMOTE_RETRY_MS,
} from "../mods/vault-reader/assets-core.js";
import { fakeExec, fakeFs, png, jpeg, withoutNodeGlobals } from "./helpers.mjs";

const APP = "/app";
const mk = (script, { platform = "linux", files = {}, now = () => 0 } = {}) => {
  const exec = fakeExec(script);
  const fs = fakeFs(files);
  const assets = createAssets({ exec, fs, appHome: APP, home: "/h", platform, now });
  return { assets, exec, fs };
};
// curl "downloads" by writing the -o file.
const curlScript = (bytes, fs) => (cmd, args) => {
  if (cmd === "curl" && args.includes("--version")) return { stdout: "curl 8" };
  if (cmd === "curl") { fs.files.set(args[args.indexOf("-o") + 1], bytes); return { code: 0 }; }
  return undefined;
};

test("hash is stable and 16 hex characters; the theme key changes with the colors", () => {
  assert.match(hash("a"), /^[0-9a-f]{16}$/);
  assert.equal(hash("a"), hash("a"));
  assert.notEqual(hash("a"), hash("b"));
  const t = { foreground: "1", background: "2", muted: "3", accent: "4", surface: "5", raised: "6", border: "7" };
  assert.notEqual(themeKey(t), themeKey({ ...t, accent: "x" }));
});

test("settings: remote images default on, only booleans accepted", () => {
  assert.deepEqual(parseSettings(undefined), { remoteImages: true });
  assert.deepEqual(parseSettings("{bad"), { remoteImages: true });
  assert.deepEqual(parseSettings('{"remoteImages":false}'), { remoteImages: false });
  assert.deepEqual(parseSettings('{"remoteImages":"no"}'), { remoteImages: true });
});

test("settings: browser and asar are absolute paths in either style, anything else is ignored (R2-CR-8)", () => {
  assert.deepEqual(parseSettings('{"browser":"/usr/bin/chromium","asar":"C:\\\\Apps\\\\Obsidian\\\\resources\\\\obsidian.asar"}'),
    { remoteImages: true, browser: "/usr/bin/chromium", asar: "C:\\Apps\\Obsidian\\resources\\obsidian.asar" });
  assert.deepEqual(parseSettings('{"browser":"D:/b/chrome.exe"}'), { remoteImages: true, browser: "D:/b/chrome.exe" });
  for (const bad of ['"chromium"', '"./chrome"', "42", "null", "true", '["/x"]', '"~/chrome"', '""']) assert.deepEqual(parseSettings(`{"browser":${bad},"asar":${bad}}`), { remoteImages: true }, bad);
  assert.deepEqual(parseSettings('["/x"]'), { remoteImages: true });
});

test("remote urls and curl arguments (CR-1-1)", () => {
  assert.equal(remoteUrlOk("https://example.com/a.png?x=1&y=2"), true);
  for (const bad of ["file:///etc/passwd", "-o/etc/x", "ftp://x/y", "https://a b", "https://a\"b", "javascript:x"]) assert.equal(remoteUrlOk(bad), false, bad);
  const args = curlArgs("https://example.com/a.png", "/tmp/x.part");
  assert.deepEqual(args.slice(-3), ["/tmp/x.part", "--", "https://example.com/a.png"], "the url comes after --, never as an option");
  assert.ok(args.includes("--max-filesize") && args.includes("--max-time") && args.includes("--proto"));
  assert.equal(args[args.indexOf("--max-filesize") + 1], "20000000");
});

test("extension from magic bytes, not from the URL", () => {
  assert.equal(extFromBytes(png(1, 1)), "png");
  assert.equal(extFromBytes(jpeg(2, 2)), "jpg");
  assert.equal(extFromBytes(new TextEncoder().encode('<svg xmlns="x"></svg>')), "svg");
  assert.equal(extFromBytes(new TextEncoder().encode("<!doctype html><title>404</title>")), null);
});

test("remote image: success is cached on disk and not downloaded twice", async () => {
  const fs = fakeFs();
  const exec = fakeExec(curlScript(png(40, 30), fs));
  const a = createAssets({ exec, fs, appHome: APP, home: "/h", platform: "linux", now: () => 0 });
  const r = await a.remoteImage("https://example.com/pic.jpg");
  assert.match(r.path, /^data\/vault\/cache\/[0-9a-f]{16}\.png$/, "extension from the bytes (png), not the url (jpg)");
  assert.deepEqual([r.w, r.h], [40, 30]);
  assert.ok(fs.files.has(`${APP}/${r.path}`));
  const downloads = () => exec.calls.filter((c) => c.args.includes("-o")).length;
  assert.equal(downloads(), 1);
  const again = await a.remoteImage("https://example.com/pic.jpg");
  assert.equal(again.path, r.path);
  assert.equal(downloads(), 1, "second call comes from the cache");
  assert.equal([...fs.files.keys()].some((k) => k.endsWith(".part")), false, "the temp file is removed");
});

test("remote image: a failed download is not cached; it is retried later and then succeeds", async () => {
  const fs = fakeFs();
  let online = false, t = 0;
  const exec = fakeExec((cmd, args) => {
    if (args.includes("--version")) return { stdout: "curl" };
    if (!online) return { code: 6, stderr: "curl: (6) Could not resolve host: example.com" };
    fs.files.set(args[args.indexOf("-o") + 1], png(8, 8));
    return { code: 0 };
  });
  const a = createAssets({ exec, fs, appHome: APP, home: "/h", platform: "linux", now: () => t });
  const fail = await a.remoteImage("https://example.com/x.png");
  assert.match(fail.error, /Couldn't download/);
  assert.equal(fail.transient, true);
  assert.equal([...fs.files.keys()].some((k) => k.endsWith(".json")), false, "no failure stored on disk");
  // within the retry window: no new download attempt
  const before = exec.calls.length;
  await a.remoteImage("https://example.com/x.png");
  assert.equal(exec.calls.length, before);
  // back online, after the window
  online = true; t = REMOTE_RETRY_MS + 1;
  const ok = await a.remoteImage("https://example.com/x.png");
  assert.equal(ok.error, undefined);
  assert.deepEqual([ok.w, ok.h], [8, 8]);
});

test("remote image: an HTML page saved by curl is rejected and that verdict is cached", async () => {
  const fs = fakeFs();
  const exec = fakeExec(curlScript(new TextEncoder().encode("<html>nope</html>"), fs));
  const a = createAssets({ exec, fs, appHome: APP, home: "/h", platform: "linux", now: () => 0 });
  const r = await a.remoteImage("https://example.com/page");
  assert.match(r.error, /isn't a picture/);
  const n = exec.calls.filter((c) => c.args.includes("-o")).length;
  await a.remoteImage("https://example.com/page");
  assert.equal(exec.calls.filter((c) => c.args.includes("-o")).length, n);
});

test("remote image: no curl, switched off, or a bad address are plain messages", async () => {
  const noCurl = mk(() => undefined);
  const r = await noCurl.assets.remoteImage("https://example.com/a.png");
  assert.equal(r.missing, "curl");
  assert.match(r.error, /curl/);
  assert.equal([...noCurl.fs.files.keys()].length, 0, "nothing cached for a missing tool");

  const off = mk(() => undefined, { files: { [`${APP}/data/vault/settings.json`]: '{"remoteImages":false}' } });
  const o = await off.assets.remoteImage("https://example.com/a.png");
  assert.equal(o.off, true);
  assert.equal(off.exec.calls.length, 0, "turned off: no process is started");

  assert.match((await mk(() => undefined).assets.remoteImage("file:///etc/passwd")).error, /Not a web address/);
});

test("settings can be saved and read back", async () => {
  const { assets, fs } = mk(() => undefined);
  assert.equal((await assets.loadSettings()).remoteImages, true);
  await assets.saveSettings({ remoteImages: false });
  assert.match(fs.files.get(`${APP}/data/vault/settings.json`), /"remoteImages": false/);
  const second = createAssets({ exec: fakeExec(() => undefined), fs, appHome: APP, home: "/h", platform: "linux" });
  assert.equal((await second.loadSettings()).remoteImages, false);
});

test("vault images are copied with fs (no cp), sized from the header (no sips)", async () => {
  const { assets, exec, fs } = mk(() => undefined, { files: { "/h/v/pic.png": png(300, 200) } });
  const r = await assets.vaultImage("/h/v/pic.png", "1:2");
  assert.deepEqual([r.w, r.h], [300, 200]);
  assert.ok(fs.files.has(`${APP}/${r.path}`));
  assert.equal(exec.calls.length, 0, "no process was started");
  const again = await assets.vaultImage("/h/v/pic.png", "1:2");
  assert.equal(again.path, r.path);
  const changed = await assets.vaultImage("/h/v/pic.png", "9:9");
  assert.notEqual(changed.path, r.path, "a new stamp is a new picture");
});

test("vault images: not an image and too large are cached messages, svg is sized from its text", async () => {
  const { assets } = mk(() => undefined, { files: { "/h/v/bad.png": "plain text", "/h/v/v.svg": '<svg width="10" height="20"></svg>' } });
  assert.match((await assets.vaultImage("/h/v/bad.png", "1:1")).error, /Not an image/);
  const svg = await assets.vaultImage("/h/v/v.svg", "1:1");
  assert.deepEqual([svg.w, svg.h], [10, 20]);
  assert.match((await assets.vaultImage("/h/v/missing.png", "1:1")).error, /ENOENT/);
});

test("pdf without Poppler: an install hint per OS, nothing cached; macOS falls back to Quick Look", async () => {
  for (const [platform, hint] of [["linux", /poppler-utils/], ["windows", /scoop install poppler/]]) {
    const { assets, fs } = mk(() => undefined, { platform });
    const info = await assets.pdfInfo("/h/v/a.pdf", "1:1");
    assert.equal(info.missing, "poppler");
    assert.match(info.error, hint);
    const page = await assets.pdfPage("/h/v/a.pdf", "1:1");
    assert.match(page.error, hint);
    assert.equal(page.missing, "poppler");
    assert.equal([...fs.files.keys()].length, 0);
    const at = await assets.pdfPageAt("/h/v/a.pdf", "1:1", 1);
    assert.equal(at.missing, "poppler");
  }
  const fs = fakeFs();
  const exec = fakeExec((cmd, args) => {
    if (cmd === "qlmanage") { fs.files.set(`${args[args.indexOf("-o") + 1]}/a.pdf.png`, png(1200, 1600)); return { code: 0 }; }
    return undefined;
  });
  const mac = createAssets({ exec, fs, appHome: APP, home: "/Users/x", platform: "macos" });
  const q = await mac.pdfPage("/Users/x/v/a.pdf", "1:1");
  assert.deepEqual([q.w, q.h], [600, 800]);
  assert.ok(fs.files.has(`${APP}/${q.path}`));
});

test("pdf pages with Poppler", async () => {
  const fs = fakeFs();
  const exec = fakeExec((cmd, args) => {
    if (args.includes("-v")) return { stderr: "pdftoppm version 24" };
    if (cmd === "pdfinfo") return { stdout: "Title: x\nPages:          7\n" };
    if (cmd === "pdftoppm") { fs.files.set(args.at(-1) + ".png", png(1224, 1584)); return { code: 0 }; }
    return undefined;
  });
  const a = createAssets({ exec, fs, appHome: APP, home: "/h", platform: "linux" });
  assert.deepEqual(await a.pdfInfo("/h/v/a.pdf", "1:1"), { pages: 7 });
  const p = await a.pdfPageAt("/h/v/a.pdf", "1:1", 3);
  assert.deepEqual([p.w, p.h], [612, 792]);
  assert.ok(exec.calls.filter((c) => c.cmd === "pdftoppm").at(-1).args.includes("-singlefile"));
});

test("stamps use the platform's stat, with the fallback flavour", async () => {
  const { assets } = mk((cmd, args) => (cmd === "stat" && args[0] === "-c" ? { stdout: "10:20 /h/v/a.png\n" } : undefined));
  assert.equal((await assets.stamps(["/h/v/a.png"])).get("/h/v/a.png"), "10:20");
});

test("render: no node, old node and a missing browser are one sentence each, never cached", async () => {
  const jobs = [{ key: "k1", kind: "mermaid", src: "graph TD" }];
  const none = mk(() => undefined, { platform: "linux" });
  const r1 = (await none.assets.renderJobs(jobs, {})).get("k1");
  assert.equal(r1.transient, true);
  assert.match(r1.error, /Node\.js 22/);

  const old = mk((cmd, args) => (args[0] === "--version" ? { stdout: "v20.11.1" } : undefined));
  assert.match((await old.assets.renderJobs(jobs, {})).get("k1").error, /Node\.js 22\.4 or newer/);

  const fs = fakeFs();
  const exec = fakeExec((cmd, args) => {
    if (args[0] === "--version") return { stdout: "v22.14.0" };
    if (args[0].endsWith("render.mjs")) return { stdout: JSON.stringify([{ error: "no-browser" }]) };
    return undefined;
  });
  const a = createAssets({ exec, fs, appHome: APP, home: "/h", platform: "windows" });
  const r = (await a.renderJobs(jobs, {})).get("k1");
  assert.match(r.error, /browser/);
  assert.match(r.error, /Edge is built into Windows/);
  assert.doesNotMatch(r.error, /\[\{|ENOENT/);
  assert.equal([...fs.files.keys()].filter((k) => k.endsWith("k1.json")).length, 0);
  assert.equal([...fs.files.keys()].some((k) => k.includes("jobs-")), false, "the job file is removed");
});

test("render: the raw ENOENT JSON from the old renderer becomes a sentence naming Obsidian (DOC 2)", async () => {
  const fs = fakeFs();
  const exec = fakeExec((cmd, args) => {
    if (args[0] === "--version") return { stdout: "v22.14.0" };
    return { code: 1, stdout: '[{"error":"ENOENT: no such file or directory, stat \'/Applications/Obsidian.app/Contents/Resources/obsidian.asar\'"}]' };
  });
  const a = createAssets({ exec, fs, appHome: APP, home: "/h", platform: "macos" });
  const r = (await a.renderJobs([{ key: "k", kind: "math", src: "x" }], {})).get("k");
  assert.match(r.error, /Obsidian/);
  assert.doesNotMatch(r.error, /ENOENT|\/Applications/);
});

test("render: successes are read from the files the renderer wrote; batches stay small", async () => {
  const fs = fakeFs();
  const keys = Array.from({ length: BATCH + 2 }, (_, i) => `k${i}`);
  const specs = [];
  const exec = fakeExec(async (cmd, args) => {
    if (args[0] === "--version") return { stdout: "v22.14.0" };
    const spec = JSON.parse(await fs.readText(args[2]));
    specs.push(spec);
    for (const j of spec.jobs) { fs.files.set(j.out + ".png", png(5, 5)); fs.files.set(j.out + ".json", JSON.stringify({ w: 50, h: 20 })); }
    return { stdout: JSON.stringify(spec.jobs.map((j) => ({ id: j.id, ok: true }))) };
  });
  const a = createAssets({ exec, fs, appHome: APP, home: "/h", platform: "linux" });
  const seen = [];
  const res = await a.renderJobs(keys.map((key) => ({ key, kind: "math", src: "x" })), { fg: "#fff" }, (m) => seen.push(m.size));
  assert.equal(specs.length, 2, "two batches");
  assert.ok(specs.every((s) => s.jobs.length <= BATCH));
  assert.deepEqual(specs[0].discover.names.includes("google-chrome"), true, "candidates come from platform.js");
  assert.deepEqual([res.get("k0").w, res.get("k0").h], [50, 20]);
  assert.deepEqual(seen, [BATCH, BATCH + 2], "progress after each batch");
  // cached now: nothing runs again
  const n = exec.calls.length;
  await a.renderJobs(keys.map((key) => ({ key, kind: "math", src: "x" })), {});
  assert.equal(exec.calls.length, n);
});

test("render: two readers at once run one after the other with distinct job files (CR-1-6)", async () => {
  const fs = fakeFs();
  let running = 0, peak = 0;
  const jobFiles = [];
  const exec = fakeExec(async (cmd, args) => {
    if (args[0] === "--version") return { stdout: "v22.14.0" };
    jobFiles.push(args[2]);
    running++; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    return { stdout: "[]" };
  });
  const a = createAssets({ exec, fs, appHome: APP, home: "/h", platform: "linux" });
  await Promise.all([
    a.renderJobs([{ key: "same", kind: "math", src: "x" }], {}),
    a.renderJobs([{ key: "same", kind: "math", src: "x" }], {}),
  ]);
  assert.equal(peak, 1);
  assert.equal(new Set(jobFiles).size, 2, "the same job in two readers does not share a file");
});

test("cache pruning: stamps → age, then size, whole entries together", () => {
  assert.deepEqual(parseStamp("1700000000:2048"), { ms: 1700000000000, size: 2048 });
  const ticks = (ms) => String(Math.round((ms + 62135596800000) * 10000));
  assert.equal(Math.round(parseStamp(`${ticks(1700000000000)}:5`).ms), 1700000000000, "Windows ticks");
  const DAY = 86_400_000, now = 100 * DAY, MB = 1_048_576;
  const files = [
    { name: "old.png", ms: now - 40 * DAY, size: MB }, { name: "old.json", ms: now - 40 * DAY, size: 10 },
    { name: "a.png", ms: now - 3 * DAY, size: 60 * MB }, { name: "a.json", ms: now - 3 * DAY, size: 10 },
    { name: "b.png", ms: now - 2 * DAY, size: 60 * MB }, { name: "b.json", ms: now - 2 * DAY, size: 10 },
    { name: "c.png", ms: now - 1 * DAY, size: 60 * MB }, { name: "c.json", ms: now - 1 * DAY, size: 10 },
  ];
  const drop = pruneList(files, now, 30 * DAY, 200 * MB);
  assert.deepEqual(drop.sort(), ["old.json", "old.png"], "only the old entry goes while under the cap");
  const tight = pruneList(files, now, 30 * DAY, 130 * MB);
  assert.deepEqual(tight.sort(), ["a.json", "a.png", "old.json", "old.png"], "then the oldest until it fits");
  assert.deepEqual(pruneList([], now, DAY, MB), []);
  // json goes before its picture
  const ordered = pruneList([{ name: "x.png", ms: 0, size: 1 }, { name: "x.json", ms: 0, size: 1 }], now, DAY, MB);
  assert.deepEqual(ordered, ["x.json", "x.png"]);
});

test("pruneCache runs through stat and unlink (fake clock and sizes)", async () => {
  const DAY = 86_400_000;
  const dir = `${APP}/${REL}`;
  const fs = fakeFs({ [`${dir}/old.png`]: "x", [`${dir}/old.json`]: "{}", [`${dir}/new.png`]: "x", [`${dir}/new.json`]: "{}" });
  const exec = fakeExec((cmd, args) => {
    if (cmd !== "stat") return undefined;
    return { stdout: args.slice(2).map((p) => `${p.includes("old") ? 1_000_000 : 9_000_000}:100 ${p}`).join("\n") };
  });
  const a = createAssets({ exec, fs, appHome: APP, home: "/h", platform: "linux", now: () => 9_000_000 * 1000 + DAY });
  const gone = await a.pruneCache(30, 200);
  assert.equal(gone, 2);
  assert.deepEqual([...fs.files.keys()].sort(), [`${dir}/new.json`, `${dir}/new.png`]);
});

// ---- no TextDecoder in Herdr (R2-CR-3, CR-2-1) ----------------------------------------------------------

test("svg images are sized and shown where TextDecoder does not exist (CR-2-1)", async () => {
  const svg = '<?xml version="1.0"?><!-- Zeichnung \u00fcber \u4e16\u754c \ud83d\ude00 --><svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"></svg>';
  const { assets, fs } = mk(() => undefined, { files: { "/h/v/logo.svg": svg } });
  await withoutNodeGlobals(async () => {
    assert.equal(typeof globalThis.TextDecoder, "undefined");
    const r = await assets.vaultImage("/h/v/logo.svg", "1:1");
    assert.equal(r.error, undefined);
    assert.deepEqual([r.w, r.h], [64, 48]);
    assert.ok(fs.files.has(`${APP}/${r.path}`));
  });
});

test("a web svg is recognised without TextDecoder, and a non-picture is still 'not a picture' (CR-2-1)", async () => {
  const fs = fakeFs();
  const exec = fakeExec(curlScript(new TextEncoder().encode('<svg viewBox="0 0 30 20"></svg>'), fs));
  const assets = createAssets({ exec, fs, appHome: APP, home: "/h", platform: "linux" });
  await withoutNodeGlobals(async () => {
    const r = await assets.remoteImage("https://example.com/a.svg");
    assert.deepEqual([r.w, r.h], [30, 20]);
    assert.equal(extFromBytes(new Uint8Array([104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115])), null);
  });
});

test("an unexpected error is returned but never written to the cache (CR-2-1)", async () => {
  const { assets, fs } = mk(() => undefined, { files: { "/h/v/pic.png": png(5, 5) } });
  fs.writeFile = async () => { throw new ReferenceError("TextDecoder is not defined"); };
  const r = await assets.vaultImage("/h/v/pic.png", "1:1");
  assert.match(r.error, /TextDecoder is not defined/);
  assert.equal([...fs.files.keys()].filter((k) => k.endsWith(".json")).length, 0, "nothing cached");
  // a file problem is cached
  const bad = mk(() => undefined, { files: { "/h/v/bad.png": "not an image at all" } });
  assert.match((await bad.assets.vaultImage("/h/v/bad.png", "1:1")).error, /Not an image/);
  assert.equal([...bad.fs.files.keys()].filter((k) => k.endsWith(".json")).length, 1);
});

test("poisoned cache entries from before the fix are ignored: the image key changed (CR-2-1)", async () => {
  const old = hash("img:/h/v/logo.svg:1:1");
  const { assets, fs } = mk(() => undefined, { files: { "/h/v/logo.svg": '<svg width="1" height="2"></svg>', [`${APP}/${REL}/${old}.json`]: '{"error":"TextDecoder is not defined"}' } });
  const r = await assets.vaultImage("/h/v/logo.svg", "1:1");
  assert.deepEqual([r.w, r.h], [1, 2]);
  void fs;
});

// ---- a PDF inside a note goes through Poppler where it is installed (R2-CR-5, CR-2-2) -----------------------

const poppler = (fs, log = []) => (cmd, args) => {
  log.push([cmd, args]);
  if (args.includes("-v")) return cmd === "pdftoppm" || cmd === "pdfinfo" ? { stderr: `${cmd} version 24` } : undefined;
  if (cmd === "pdftoppm" || cmd.endsWith("pdftoppm")) { fs.files.set(args.at(-1) + ".png", png(1224, 1584)); return { code: 0 }; }
  if (cmd === "qlmanage") { fs.files.set(`${args[args.indexOf("-o") + 1]}/a.pdf.png`, png(100, 100)); return { code: 0 }; }
  return undefined;
};

test("embedded pdf: pdftoppm page 1 on linux, windows and macOS when Poppler is installed (CR-2-2)", async () => {
  for (const platform of ["linux", "windows", "macos"]) {
    const fs = fakeFs();
    const log = [];
    const exec = fakeExec(poppler(fs, log));
    const a = createAssets({ exec, fs, appHome: APP, home: "/h", platform });
    const r = await a.pdfPage("/h/v/a.pdf", "1:1");
    assert.equal(r.error, undefined, platform);
    assert.deepEqual([r.w, r.h], [612, 792], platform);
    const ppm = log.filter(([cmd, args]) => cmd.includes("pdftoppm") && args.includes("-f"));
    assert.equal(ppm.length, 1, platform);
    assert.deepEqual(ppm[0][1].slice(ppm[0][1].indexOf("-f"), ppm[0][1].indexOf("-f") + 4), ["-f", "1", "-l", "1"]);
    assert.ok(!log.some(([cmd]) => cmd === "qlmanage"), `${platform}: Quick Look is only the fallback`);
    // the same picture the opened-PDF view uses for page 1
    const again = await a.pdfPageAt("/h/v/a.pdf", "1:1", 1);
    assert.equal(again.path, r.path);
  }
});

test("embedded pdf without Poppler: macOS uses Quick Look, others get the install hint (CR-2-2)", async () => {
  for (const [platform, hint] of [["linux", /poppler-utils/], ["windows", /scoop install poppler/]]) {
    const { assets } = mk(() => undefined, { platform });
    const r = await assets.pdfPage("/h/v/a.pdf", "1:1");
    assert.match(r.error, hint);
    assert.match(r.error, /default app/);
    assert.equal(r.missing, "poppler");
  }
  const fs = fakeFs();
  const log = [];
  const exec = fakeExec((cmd, args) => (cmd === "qlmanage" ? poppler(fs, log)(cmd, args) : undefined));
  const mac = createAssets({ exec, fs, appHome: APP, home: "/Users/x", platform: "macos" });
  assert.deepEqual([(await mac.pdfPage("/Users/x/v/a.pdf", "1:1")).w], [50]);
});

// ---- browser and asar discovery in the mod (R2-CR-8, CR-2-9) ---------------------------------------------

test("render: Node 22.0 to 22.3 is rejected with a plain sentence (no global WebSocket there) (CR-2-9)", async () => {
  for (const v of ["v22.3.0", "v22.0.0"]) {
    const old = mk((cmd, args) => (args[0] === "--version" ? { stdout: v } : undefined));
    const r = (await old.assets.renderJobs([{ key: "k1", kind: "mermaid", src: "graph TD" }], {})).get("k1");
    assert.match(r.error, /Node\.js 22\.4 or newer/);
    assert.equal(r.transient, true);
  }
});

const renderEnv = ({ settings, noBrowserUntil = null, shell = "" } = {}) => {
  const fs = fakeFs(settings ? { [`${APP}/data/vault/settings.json`]: JSON.stringify(settings) } : {});
  const specs = [];
  const exec = fakeExec(async (cmd, args) => {
    if (args[0] === "--version") return { stdout: "v22.14.0" };
    if (cmd === "sh" || cmd === "where") return { stdout: shell };
    if (args[0]?.endsWith("render.mjs")) {
      const spec = JSON.parse(await fs.readText(args[2]));
      specs.push(spec);
      const d = spec.discover;
      if (noBrowserUntil && !(d.browserFound ?? []).includes(noBrowserUntil)) return { stdout: JSON.stringify([{ error: d.browserPath ? "no-browser-setting" : "no-browser" }]) };
      for (const j of spec.jobs) { fs.files.set(j.out + ".png", png(5, 5)); fs.files.set(j.out + ".json", JSON.stringify({ w: 5, h: 5 })); }
      return { stdout: JSON.stringify(spec.jobs.map((j) => ({ id: j.id, ok: true }))) };
    }
    return undefined;
  });
  return { assets: createAssets({ exec, fs, appHome: APP, home: "/h", platform: "linux" }), specs, exec, fs };
};
const job = [{ key: "kk", kind: "math", src: "x" }];

test("render: settings.json browser and asar travel in the job spec, read fresh each run (CR-2-9)", async () => {
  const { assets, specs, fs } = renderEnv({ settings: { browser: "/opt/mine/chrome", asar: "/opt/mine/obsidian.asar" } });
  await assets.renderJobs(job, {});
  assert.equal(specs[0].discover.browserPath, "/opt/mine/chrome");
  assert.equal(specs[0].discover.asarPath, "/opt/mine/obsidian.asar");
  assert.ok(specs[0].discover.browsers.includes("/usr/bin/chromium"), "the candidates are still there for after the setting");
  // edited while Herdr runs
  fs.files.set(`${APP}/data/vault/settings.json`, JSON.stringify({ browser: "/other/chrome" }));
  await assets.renderJobs([{ key: "k2", kind: "math", src: "y" }], {});
  assert.equal(specs[1].discover.browserPath, "/other/chrome");
  assert.equal(specs[1].discover.asarPath, undefined);
});

test("render: no browser by the usual ways asks the login shell once and runs again with its answer (CR-2-9)", async () => {
  const { assets, specs, exec } = renderEnv({ noBrowserUntil: "/home/me/.local/bin/chromium", shell: "alias x=y\n/home/me/.local/bin/chromium\n" });
  const r = (await assets.renderJobs(job, {})).get("kk");
  assert.equal(r.error, undefined);
  assert.equal(specs.length, 2, "first without, then with the shell's answer");
  assert.deepEqual(specs[0].discover.browserFound, []);
  assert.deepEqual(specs[1].discover.browserFound, ["/home/me/.local/bin/chromium"]);
  assert.equal(exec.calls.filter((c) => c.cmd === "sh").length, 1);
  // the session remembers it: the next batch already carries the path, no second lookup
  await assets.renderJobs([{ key: "k2", kind: "math", src: "y" }], {});
  assert.deepEqual(specs[2].discover.browserFound, ["/home/me/.local/bin/chromium"]);
  assert.equal(exec.calls.filter((c) => c.cmd === "sh").length, 1);
});

test("render: no browser anywhere (shell finds nothing) is the browser sentence, and the shell is not asked again for 30 s", async () => {
  let t = 0;
  const fs = fakeFs();
  const exec = fakeExec(async (cmd, args) => {
    if (args[0] === "--version") return { stdout: "v22.14.0" };
    if (cmd === "sh") return { stdout: "" };
    if (args[0]?.endsWith("render.mjs")) return { stdout: JSON.stringify([{ error: "no-browser" }]) };
    return undefined;
  });
  const a = createAssets({ exec, fs, appHome: APP, home: "/h", platform: "linux", now: () => t });
  assert.match((await a.renderJobs(job, {})).get("kk").error, /browser/);
  t = 5_000;
  await a.renderJobs([{ key: "k2", kind: "math", src: "y" }], {});
  assert.equal(exec.calls.filter((c) => c.cmd === "sh").length, 1, "one lookup inside 30 s");
  t = 40_000;
  await a.renderJobs([{ key: "k3", kind: "math", src: "z" }], {});
  assert.equal(exec.calls.filter((c) => c.cmd === "sh").length, 2, "asked again later");
});

// ---- the fetch pipeline (R2-CR-11, CR-2-11) --------------------------------------------------------------------

import { mapPool, FETCH_CONCURRENCY, IMAGE_MAX_BYTES } from "../mods/vault-reader/assets-core.js";

test("mapPool runs every item with at most `limit` at once (6 images, 4 at a time)", async () => {
  assert.equal(FETCH_CONCURRENCY, 4);
  let live = 0, peak = 0;
  const done = [];
  await mapPool([1, 2, 3, 4, 5, 6], FETCH_CONCURRENCY, async (n) => {
    live++; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 5 * (7 - n)));
    live--; done.push(n);
  });
  assert.equal(peak, 4);
  assert.deepEqual([...done].sort(), [1, 2, 3, 4, 5, 6]);
  await mapPool([], 4, () => { throw new Error("never"); });
  let one = 0;
  await mapPool([1, 2], 0, async () => { one++; }); // a limit below 1 still makes progress
  assert.equal(one, 2);
});

test("a 20 MB+ image is refused from its stamp, without reading the file (CR-2-11)", async () => {
  const fs = fakeFs({ "/h/v/huge.png": png(10, 10) });
  let reads = 0;
  const read = fs.readFile;
  fs.readFile = async (p) => { reads++; return read(p); };
  const a = createAssets({ exec: fakeExec(() => undefined), fs, appHome: APP, home: "/h", platform: "linux" });
  const big = await a.vaultImage("/h/v/huge.png", `1700000000:${IMAGE_MAX_BYTES + 1}`);
  assert.match(big.error, /too large/);
  assert.equal(reads, 0, "never read");
  const ok = await a.vaultImage("/h/v/huge.png", `1700000000:${IMAGE_MAX_BYTES}`);
  assert.equal(ok.error, undefined);
  assert.equal(reads, 1);
});

// ---- cache hygiene (R2-CR-16, CR-2-15) -------------------------------------------------------------------------

import { TOUCH_AFTER_MS } from "../mods/vault-reader/assets-core.js";

test("a cache hit older than a week writes its json again, once per session; the caller never sees `at`", async () => {
  let t = 1_000_000;
  const fs = fakeFs({ "/h/v/p.png": png(8, 6) });
  const a = createAssets({ exec: fakeExec(() => undefined), fs, appHome: APP, home: "/h", platform: "linux", now: () => t });
  const first = await a.vaultImage("/h/v/p.png", "1:2");
  const jsonKey = [...fs.files.keys()].find((k) => k.endsWith(".json"));
  assert.equal(JSON.parse(fs.files.get(jsonKey)).at, t, "written with the time");
  assert.deepEqual(Object.keys(first).sort(), ["h", "path", "w"]);
  let writes = 0;
  const w = fs.writeFile;
  fs.writeFile = async (p, d) => { if (p === jsonKey) writes++; return w(p, d); };
  t += TOUCH_AFTER_MS - 1000;
  await a.vaultImage("/h/v/p.png", "1:2");
  assert.equal(writes, 0, "used inside the week: nothing written");
  t += 2000;
  await a.vaultImage("/h/v/p.png", "1:2");
  assert.equal(writes, 1, "older than a week: refreshed");
  assert.equal(JSON.parse(fs.files.get(jsonKey)).at, t);
  t += TOUCH_AFTER_MS + 1;
  await a.vaultImage("/h/v/p.png", "1:2");
  assert.equal(writes, 1, "at most once per entry per session");
});

test("Quick Look leaves no temporary folder behind, on success and on failure", async () => {
  for (const works of [true, false]) {
    const fs = fakeFs();
    const exec = fakeExec((cmd, args) => {
      if (cmd === "qlmanage") { if (works) fs.files.set(`${args[args.indexOf("-o") + 1]}/a.pdf.png`, png(1200, 1600)); return { code: 0, stderr: "" }; }
      return undefined;
    });
    const a = createAssets({ exec, fs, appHome: APP, home: "/Users/x", platform: "macos" });
    const r = await a.pdfPage("/Users/x/v/a.pdf", "1:1");
    assert.equal(Boolean(r.error), !works);
    assert.deepEqual([...fs.dirs].filter((d) => d.includes("/ql-")), [], `works=${works}`);
    assert.deepEqual([...fs.files.keys()].filter((k) => k.includes("/ql-")), []);
  }
});

test("the job file is removed even when the renderer cannot start (no job-* leftover)", async () => {
  const fs = fakeFs();
  const exec = fakeExec((cmd, args) => {
    if (args[0] === "--version") return { stdout: "v22.14.0" };
    if (args[0]?.endsWith("render.mjs")) throw new Error("spawn EAGAIN");
    return undefined;
  });
  const a = createAssets({ exec, fs, appHome: APP, home: "/h", platform: "linux" });
  const r = (await a.renderJobs([{ key: "kk", kind: "math", src: "x" }], {})).get("kk");
  assert.equal(r.transient, true);
  assert.deepEqual([...fs.files.keys()].filter((k) => k.includes("jobs-")), []);
});
