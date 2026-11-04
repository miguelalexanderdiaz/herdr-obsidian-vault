// Shared by the tests: tiny hand-built image files, a fake exec, an in-memory fs, a vault walker.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VAULT = path.join(ROOT, "examples", "sample-vault");
export const MODS = path.join(ROOT, "mods");

// ---- image bytes ----------------------------------------------------------------------
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const l16 = (n) => [n & 255, (n >> 8) & 255];
const l24 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const l32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const txt = (s) => [...s].map((c) => c.charCodeAt(0));

export const png = (w, h) => Uint8Array.from([0x89, ...txt("PNG"), 0x0d, 0x0a, 0x1a, 0x0a, ...u32(13), ...txt("IHDR"), ...u32(w), ...u32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0]);
export const gif = (w, h) => Uint8Array.from([...txt("GIF89a"), ...l16(w), ...l16(h), 0, 0, 0, 0, 0, 0]);
export const bmp = (w, h) => { const b = new Uint8Array(40); b[0] = 0x42; b[1] = 0x4d; b.set(l32(w), 18); b.set(l32(h), 22); return b; };
export const jpeg = (w, h) => Uint8Array.from([0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x10, ...txt("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, // APP0 (length 16)
  0xff, 0xc0, 0x00, 0x11, 8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
export const webpLossy = (w, h) => { const b = new Uint8Array(40); b.set(txt("RIFF")); b.set(txt("WEBP"), 8); b.set(txt("VP8 "), 12); b.set(l16(w), 26); b.set(l16(h), 28); return b; };
export const webpExt = (w, h) => { const b = new Uint8Array(40); b.set(txt("RIFF")); b.set(txt("WEBP"), 8); b.set(txt("VP8X"), 12); b.set(l24(w - 1), 24); b.set(l24(h - 1), 27); return b; };
export const webpLossless = (w, h) => { const b = new Uint8Array(40); b.set(txt("RIFF")); b.set(txt("WEBP"), 8); b.set(txt("VP8L"), 12); b[20] = 0x2f; b.set(l32((w - 1) | ((h - 1) << 14)), 21); return b; };

// ---- fakes ------------------------------------------------------------------------------
// exec(cmd, args, opts): `script` is a function (cmd, args, opts) → { code, stdout, stderr } | throws | undefined.
export function fakeExec(script) {
  const calls = [];
  const exec = async (cmd, args = [], opts) => {
    calls.push({ cmd, args, opts });
    const r = await script(cmd, args, opts);
    if (r === undefined) throw new Error(`spawn ${cmd} ENOENT`);
    return { code: 0, stdout: "", stderr: "", ...r };
  };
  exec.calls = calls;
  return exec;
}

// An in-memory fs with the surface assets-core needs. Files are Uint8Array or string.
export function fakeFs(initial = {}) {
  const files = new Map(Object.entries(initial));
  const dirs = new Set();
  const enc = new TextEncoder(), dec = new TextDecoder();
  const api = {
    files, dirs,
    readFile: async (p) => { if (!files.has(p)) throw new Error(`ENOENT ${p}`); const v = files.get(p); return typeof v === "string" ? enc.encode(v) : v; },
    readText: async (p) => { if (!files.has(p)) throw new Error(`ENOENT ${p}`); const v = files.get(p); return typeof v === "string" ? v : dec.decode(v); },
    writeFile: async (p, data) => { files.set(p, data); },
    exists: async (p) => files.has(p) || dirs.has(p),
    mkdir: async (p) => { dirs.add(p); },
    unlink: async (p) => { files.delete(p); },
    rmdir: async (p) => { dirs.delete(p); },
    readdir: async (p) => { const pre = p.replace(/\/$/, "") + "/"; return [...files.keys()].filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes("/")).map((k) => k.slice(pre.length)); },
  };
  return api;
}

// ---- the sample vault ---------------------------------------------------------------------
export function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
}
export const readVaultFile = (rel, vault = VAULT) => fs.readFileSync(path.join(vault, rel), "utf8");
