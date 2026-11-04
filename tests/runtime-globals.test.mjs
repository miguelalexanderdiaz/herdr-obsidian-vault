// Herdr's JavaScript runtime is not Node and not a browser. Probed with throw-away mods under
// `herdr-app check` (round 2): TextDecoder, TextEncoder, structuredClone and Intl are undefined,
// localeCompare ignores its options argument, fs/promises offers seven functions. Node has all of those,
// so a unit test that runs under Node cannot see a mod using them. This test reads the mod source
// (comments and string contents blanked) and fails on every such use (R2-CR-2).
//
// Exempt: render/ (render.mjs and lib.mjs run in Node, page.js and the rest in the headless browser).
// To re-probe after a Herdr update: see "Probe mods" in CONTRIBUTING.md.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MODS, ROOT } from "./helpers.mjs";

// ---- a small scanner: blanks comments and the inside of strings / templates / regex literals ----------
export function stripCode(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let prev = ""; // last significant character, to tell a regex from a division
  const keep = (c) => (c === "\n" ? "\n" : " ");
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") { out += " "; i++; } continue; }
    if (c === "/" && d === "*") { while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += keep(src[i]); i++; } out += "  "; i += 2; continue; }
    if (c === '"' || c === "'") {
      out += c; i++;
      while (i < n && src[i] !== c && src[i] !== "\n") { if (src[i] === "\\") { out += " "; i++; } out += " "; i++; }
      out += c; i++; prev = c; continue;
    }
    if (c === "`") {
      out += c; i++;
      let depth = 0;
      while (i < n && !(src[i] === "`" && depth === 0)) {
        if (src[i] === "\\") { out += "  "; i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") { depth++; out += "${"; i += 2; continue; }
        if (depth > 0 && src[i] === "}") { depth--; out += "}"; i++; continue; }
        // code inside ${ } stays visible, text outside is blanked
        out += depth > 0 ? src[i] : keep(src[i]); i++;
      }
      out += "`"; i++; prev = "`"; continue;
    }
    if (c === "/" && /[(,=:[!&|?{};]|^$/.test(prev)) { // a regex literal
      out += c; i++;
      let cls = false;
      while (i < n && src[i] !== "\n" && (cls || src[i] !== "/")) {
        if (src[i] === "\\") { out += "  "; i += 2; continue; }
        if (src[i] === "[") cls = true; else if (src[i] === "]") cls = false;
        out += " "; i++;
      }
      out += "/"; i++; prev = "/";
      while (i < n && /[a-z]/.test(src[i])) { out += src[i]; i++; }
      continue;
    }
    out += c; i++;
    if (!/\s/.test(c)) prev = c;
  }
  return out;
}

// The text of the call that starts at the "(" after `idx`, as top-level argument count.
function argCount(code, open) {
  let depth = 0, args = 1, any = false;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) { depth--; if (depth === 0) return any ? args : 0; }
    else if (c === "," && depth === 1) args++;
    else if (depth >= 1 && !/\s/.test(c)) any = true;
  }
  return args;
}

const FORBIDDEN = [
  [/\bTextDecoder\b/, "TextDecoder is undefined in Herdr: decode bytes with the function in platform.js"],
  [/\bTextEncoder\b/, "TextEncoder is undefined in Herdr"],
  [/\bstructuredClone\b/, "structuredClone is undefined in Herdr: copy with JSON or spread"],
  [/\bIntl\b/, "Intl is undefined in Herdr: write the comparison or format by hand"],
  [/\bsetTimeout\b|\bsetInterval\b|\bclearTimeout\b|\bclearInterval\b/, "use cx.timer, never the global timers"],
  [/(?<![.\w])process\b/, "no Node `process` in a mod"],
  [/(?<![.\w])require\s*\(/, "no require() in a mod"],
  [/(?<![.\w])Buffer\b/, "no Buffer global in a mod"],
  [/(?<![.\w])(document|navigator|XMLHttpRequest|requestAnimationFrame|addEventListener)\b/, "no DOM global in a mod"],
  [/\.(innerHTML|outerHTML)\b/, "no DOM in a mod"],
];
// Only where `fs` is the real module (an injected `fs` dependency has its own small surface).
const FS_RULE = [/\bfs\.(?!(readFile|writeFile|readdir|exists|unlink|rmdir|mkdir)\b)\w+/, "fs/promises offers readFile, writeFile, readdir, exists, unlink, rmdir, mkdir only"];

export function scan(src) {
  const code = stripCode(src);
  const hits = [];
  const rules = /from\s+["']fs\/promises["']/.test(src) || !src.includes("import ") ? [...FORBIDDEN, FS_RULE] : FORBIDDEN;
  const lineOf = (idx) => code.slice(0, idx).split("\n").length;
  for (const [re, why] of rules) {
    const g = new RegExp(re.source, "g");
    for (let m; (m = g.exec(code));) hits.push({ line: lineOf(m.index), what: m[0].trim(), why });
  }
  const lc = /\.localeCompare\s*\(/g;
  for (let m; (m = lc.exec(code));) {
    if (argCount(code, m.index + m[0].length - 1) > 1) hits.push({ line: lineOf(m.index), what: "localeCompare(a, locale, options)", why: "Herdr's localeCompare ignores locale and options: use naturalCompare from tree.js" });
  }
  return hits;
}

export function modSources() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "render") walk(p); }
      else if (/\.(js|mjs)$/.test(e.name)) out.push(p);
    }
  };
  walk(MODS);
  return out;
}

test("the scanner blanks comments, strings, templates and regex literals but keeps code", () => {
  const code = stripCode("const a = 'TextDecoder'; // Intl\n/* structuredClone */ const b = `x ${Intl.y} TextEncoder`; const c = /TextDecoder[/]/g;");
  assert.ok(!/TextDecoder|structuredClone|TextEncoder/.test(code));
  assert.ok(/Intl\.y/.test(code), "code inside ${} stays visible");
});

test("mod source uses nothing Herdr's runtime lacks (probed: no TextDecoder/TextEncoder/structuredClone/Intl)", () => {
  const files = modSources();
  assert.ok(files.length >= 15, `found only ${files.length} mod sources`);
  const found = [];
  for (const f of files) for (const h of scan(fs.readFileSync(f, "utf8"))) found.push(`${path.relative(ROOT, f)}:${h.line}  ${h.what}  (${h.why})`);
  assert.deepEqual(found, []);
});

// ---- seeded faults: the guard must be able to fail --------------------------------------------------

test("seeded fault: a TextDecoder use in a copy of a mod file is reported", () => {
  const clean = fs.readFileSync(path.join(MODS, "vault-reader", "canvas.js"), "utf8");
  assert.deepEqual(scan(clean), [], "the unmodified file is clean");
  const hits = scan(clean + "\nexport const seeded = new TextDecoder().decode(new Uint8Array());\n");
  assert.equal(hits.length, 1);
  assert.match(hits[0].what, /TextDecoder/);
});

test("seeded fault: fs.stat, a global timer and localeCompare with options are reported", () => {
  const hits = scan("await fs.stat(p); setTimeout(f, 1); a.localeCompare(b, undefined, { numeric: true }); a.localeCompare(b); fs.readFile(p);");
  assert.deepEqual(hits.map((h) => h.what).sort(), ["fs.stat", "localeCompare(a, locale, options)", "setTimeout"]);
});
