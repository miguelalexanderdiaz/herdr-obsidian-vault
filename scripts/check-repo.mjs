#!/usr/bin/env node
// Structure, contract and licensing checks for the repo. Node 22, no dependencies, same result on every OS.
//
//   node scripts/check-repo.mjs            checks that must always hold (CI)
//   node scripts/check-repo.mjs --release  adds the publish gate (preview.png, no TODO, no placeholders,
//                                          no Obsidian logo in history). Fails until the author steps in
//                                          scripts/PUBLISH.md are done.
import crypto from "node:crypto";
import path from "node:path";
import { ROOT, Report, abs, exists, git, pngSize, readBytes, readText, repoFiles } from "./lib/repo.mjs";

const RELEASE = process.argv.includes("--release");
const files = repoFiles();
const has = (f) => files.includes(f);
const r = new Report(RELEASE ? "check-repo --release" : "check-repo");

// ---- The contract with herdr-portrait-layout (PLAN section 6). Do not edit without a post on that board. ----
const CONTRACT = {
  mods: ["vault", "vault-reader"],
  sharedKeys: ["vault.list", "vault.current", "vault.open", "vault.panes"],
  commands: ["vault.add"],
  tabName: "obsidian",
  readerProps: ["vault", "file", "anchor", "kept", "id", "overlay"],
  compatImage: "mods/vault-reader/obsidian.png",
};
// The Obsidian logo that was imported by mistake. It is judged by content, never by file name (PLAN D2).
const LOGO_SHA256 = "df5329070f7ff72c589e97abae5498f5bbe0d3fa8f59fdad4867856666e7911f";
const LOGO_GIT_BLOB = "7c7b02d475b3edb51bceabe36f08f3257df47061";

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const readJson = (rel) => {
  try {
    return JSON.parse(readText(rel));
  } catch (e) {
    r.error(`${rel}: not valid JSON (${e.message})`);
    return null;
  }
};
const source = files.filter((f) => /^mods\/.+\.(js|mjs)$/.test(f));
const sourceText = source.map((f) => readText(f)).join("\n");

// ---- 1. Required files ----
console.log("Files");
for (const f of ["LICENSE", "NOTICE", "RECIPE.md", "keys.json", ".gitignore", ".gitattributes", ".github/workflows/ci.yml"]) {
  r.check(has(f), `${f} present`, `${f} is missing`);
}
if (has("LICENSE")) {
  const t = readText("LICENSE");
  r.check(/Apache License/.test(t) && /Version 2\.0/.test(t), "LICENSE is Apache-2.0", "LICENSE is not the Apache-2.0 text");
  r.check(/^\s*Copyright (?:\(c\) )?\d{4}\s+\S/m.test(t), "LICENSE has a copyright line", "LICENSE has no 'Copyright <year> <holder>' line");
}
for (const m of CONTRACT.mods) {
  r.check(has(`mods/${m}/main.js`) && has(`mods/${m}/mod.json`), `mods/${m} has main.js and mod.json`, `mods/${m} needs main.js and mod.json`);
}
r.check(!files.some((f) => /^mods\/[^/]+\/package\.json$/.test(f)), "no package.json inside a mod folder", "package.json inside a mod folder would be published with the mod (PLAN D13): move it to the repo root");
r.check(!files.some((f) => /^mods\/.*\.d\.ts$|^mods\/[^/]+\/jsconfig\.json$/.test(f)), "no Herdr-written d.ts or jsconfig.json tracked", "a generated d.ts or jsconfig.json is tracked");

// ---- 2. JSON validity ----
console.log("JSON");
for (const f of files.filter((f) => /\.(json|canvas)$/.test(f))) {
  try {
    JSON.parse(readText(f));
  } catch (e) {
    r.error(`${f}: not valid JSON (${e.message})`);
  }
}
r.ok(`${files.filter((f) => /\.(json|canvas)$/.test(f)).length} JSON/canvas file(s) parsed`);

// ---- 3. mod.json ----
console.log("mod.json");
const PLACES = new Set(["right", "left", "top", "bottom", "none"]);
const KNOWN = new Set(["place", "size", "title", "focusable", "overlay"]);
const isNum = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
for (const m of CONTRACT.mods) {
  const f = `mods/${m}/mod.json`;
  if (!has(f)) continue;
  const j = readJson(f);
  if (!j) continue;
  r.check(PLACES.has(j.place), `${f}: place "${j.place}"`, `${f}: place must be one of ${[...PLACES].join(", ")}`);
  if ("size" in j) r.check(isNum(j.size), `${f}: size ${j.size}`, `${f}: size must be a positive number`);
  if ("title" in j) r.check(typeof j.title === "string" && j.title.length > 0, `${f}: title`, `${f}: title must be a non-empty string`);
  if ("focusable" in j) r.check(typeof j.focusable === "boolean", `${f}: focusable`, `${f}: focusable must be a boolean`);
  if ("overlay" in j) {
    const o = j.overlay;
    r.check(o && isNum(o.width) && isNum(o.height), `${f}: overlay ${o?.width}x${o?.height}`, `${f}: overlay needs numeric width and height`);
  }
  for (const k of Object.keys(j)) if (!KNOWN.has(k)) r.warn(`${f}: field "${k}" is not in Herdr's documented mod.json fields`);
  if ("version" in j) r.warn(`${f}: "version" is not a documented field (PLAN D7)`);
}
r.check(readModJson("vault-reader")?.focusable === true, "vault-reader stays focusable (it handles keys)", "vault-reader must keep \"focusable\": true");
function readModJson(m) {
  try {
    return JSON.parse(readText(`mods/${m}/mod.json`));
  } catch {
    return null;
  }
}

// ---- 4. keys.json ----
console.log("keys.json");
if (has("keys.json")) {
  const k = readJson("keys.json");
  if (k && typeof k === "object") {
    const SECTION = /^(global|terminal|layout:[\w.-]+|mod:[\w.-]+)$/;
    let rows = 0;
    for (const [section, map] of Object.entries(k)) {
      if (!SECTION.test(section)) r.error(`keys.json: unknown section "${section}"`);
      const mm = /^mod:([\w.-]+)$/.exec(section);
      if (mm && !CONTRACT.mods.includes(mm[1])) r.error(`keys.json: section "${section}" names a mod this repo does not ship`);
      if (!map || typeof map !== "object") {
        r.error(`keys.json: section "${section}" must be an object`);
        continue;
      }
      for (const [key, action] of Object.entries(map)) {
        rows++;
        if (typeof action !== "string" || !action) {
          r.error(`keys.json: "${key}" needs a non-empty string action`);
          continue;
        }
        if (!/^[a-z0-9\[\]\\;',./`=-]+$/.test(key)) r.warn(`keys.json: "${key}" does not look like a Herdr key spelling`);
        if (/^(?:cmd|super)-/.test(key) || /-(?:cmd|super)-/.test(key)) {
          r.error(`keys.json: "${key}" uses cmd/super, which differs per OS; use ctrl-shift-<letter> or alt-<key>`);
        }
        if (/^ctrl-[a-z]$/.test(key)) r.error(`keys.json: "${key}" is a plain ctrl+letter that programs in the terminal rely on`);
        const open = /^mod\.(?:open|clone):(.+)$/.exec(action);
        if (open && !CONTRACT.mods.includes(open[1])) r.error(`keys.json: "${action}" names a mod this repo does not ship`);
        const cmd = /^([\w-]+)\.[\w.-]+/.exec(action);
        if (cmd && CONTRACT.mods.includes(cmd[1])) {
          const name = action.split(":")[0];
          if (!CONTRACT.commands.includes(name) && !sourceText.includes(`"${name.slice(cmd[1].length + 1)}"`)) {
            r.warn(`keys.json: "${action}" is not a command handled in ${cmd[1]}'s source`);
          }
        }
      }
    }
    r.ok(`${rows} key row(s) checked`);
  }
}

// ---- 5. Contract with the portrait layout ----
console.log("Contract");
for (const key of CONTRACT.sharedKeys) r.check(sourceText.includes(`"${key}"`), `shared key ${key} still used`, `shared key ${key} disappeared from mods/ (frozen contract, PLAN section 6)`);
for (const c of CONTRACT.commands) r.check(sourceText.includes(c), `command ${c} still referenced`, `command ${c} disappeared`);
r.check(sourceText.includes(`"${CONTRACT.tabName}"`), `tab name "${CONTRACT.tabName}" still used`, `tab name "${CONTRACT.tabName}" disappeared from mods/`);
{
  const reader = source.filter((f) => f.startsWith("mods/vault-reader/") && !f.includes("/render/")).map((f) => readText(f)).join("\n");
  for (const p of CONTRACT.readerProps) {
    if (!new RegExp(`\\b${p}\\b`).test(reader)) r.warn(`reader prop "${p}" no longer appears in vault-reader source`);
  }
}
r.check(has(CONTRACT.compatImage), `${CONTRACT.compatImage} exists (portrait layout loads it)`, `${CONTRACT.compatImage} must stay as a path (generic image, PLAN D1)`);

// ---- 6. Obsidian logo ban (by content) ----
console.log("Trademark");
{
  let bad = 0;
  for (const f of files.filter((f) => /\.(png|svg|ico|jpe?g|webp)$/i.test(f))) {
    if (sha256(readBytes(f)) === LOGO_SHA256) {
      bad++;
      r.error(`${f} is the Obsidian logo (trademark, must not be distributed): replace it with the generic vault icon`);
    }
    if (/(^|\/)obsidian\.svg$/i.test(f)) {
      bad++;
      r.error(`${f}: do not ship an Obsidian-named vector logo`);
    }
  }
  if (!bad) r.ok("no file has the Obsidian logo's content");
  for (const f of files.filter((f) => /(^|\/)obsidian\.png$/i.test(f))) {
    if (f !== "mods/vault/obsidian.png" && f !== CONTRACT.compatImage) r.warn(`${f}: unexpected obsidian.png (only the two compatibility copies are allowed)`);
  }
}

// ---- 7. Licensing: every vendored third-party file is named in NOTICE ----
console.log("Licensing");
if (has("NOTICE")) {
  const notice = readText("NOTICE");
  const iconDirs = new Set(files.filter((f) => /^mods\/[^/]+\/icons\/.+\.svg$/.test(f)).map((f) => path.posix.dirname(f)));
  for (const d of iconDirs) {
    r.check(has(`${d}/LICENSE-lucide.txt`), `${d}/LICENSE-lucide.txt present`, `${d} holds svg icons but no LICENSE-lucide.txt`);
    r.check(notice.includes(`${d}/`), `NOTICE names ${d}/`, `NOTICE does not name ${d}/`);
  }
  r.check(/Lucide/.test(notice) && /ISC/.test(notice), "NOTICE credits Lucide (ISC)", "NOTICE must credit Lucide (ISC)");
  const vendored = files.filter((f) => /^mods\/.*lzstring\.js$/.test(f));
  for (const f of vendored) r.check(notice.includes(f) && /lz-string/i.test(notice) && /MIT/.test(notice), `NOTICE names ${f} (lz-string, MIT)`, `NOTICE must name ${f} with its MIT license`);
  r.check(/not affiliated/i.test(notice) && /Obsidian/.test(notice), "NOTICE has the Obsidian trademark disclaimer", "NOTICE needs 'not affiliated with ... Obsidian'");
  r.check(/Mermaid/.test(notice) && /MathJax/.test(notice) && /run time/i.test(notice), "NOTICE says Mermaid/MathJax are read at run time", "NOTICE must say Mermaid and MathJax are read at run time and not redistributed");
  // Any other file that looks like third-party code (license header naming someone else) must be in NOTICE.
  for (const f of source) {
    const head = readText(f).slice(0, 600);
    if (/\b(MIT|ISC|BSD|Apache)\b.*\b(License|licensed)\b|Copyright \(c\)/i.test(head) && !notice.includes(f)) r.warn(`${f} carries a license/copyright header but is not named in NOTICE`);
  }
}

// ---- 8. RECIPE.md ----
console.log("RECIPE.md");
if (has("RECIPE.md")) {
  const t = readText("RECIPE.md");
  const SECTIONS = ["What you see", "How it behaves", "Built from", "Watch out", "Done when"];
  const first = /^# (.+)$/m.exec(t);
  r.check(!!first, `title "${first?.[1]}"`, "RECIPE.md needs a '# Name' title");
  r.check(/!\[[^\]]*\]\(preview\.png\)/.test(t), "RECIPE.md links preview.png", "RECIPE.md must contain ![Name](preview.png)");
  let at = first ? first.index : 0;
  for (const s of SECTIONS) {
    const m = new RegExp(`^##\\s+(?:\\*\\*)?${s}:?(?:\\*\\*)?\\s*$`, "mi").exec(t.slice(at));
    if (m) at += m.index + m[0].length;
    r.check(!!m, `section "${s}" (in order)`, `section "## ${s}" missing or out of order`);
  }
  // Paths the recipe mentions must exist.
  let bad = 0;
  for (const m of t.matchAll(/`((?:mods|examples|scripts|docs|tests|plans)\/[^`\s]+?)`/g)) {
    const p = m[1].replace(/[.,;:)]+$/, "");
    if (/[*<>{}]/.test(p)) continue;
    if (!exists(p) && !files.some((f) => f.startsWith(p.replace(/\/$/, "") + "/"))) {
      bad++;
      r.error(`RECIPE.md mentions ${p}, which does not exist`);
    }
  }
  if (!bad) r.ok("every path RECIPE.md mentions exists");
  // Disclosure: whatever the code does that Herdr installers warn about must be in the recipe.
  const lower = t.toLowerCase();
  const need = [];
  if (/\bfetch\(|\bcurl\b/.test(sourceText)) need.push(["network", /network|download|curl|remote image/]);
  if (/\bexec\(/.test(sourceText)) need.push(["programs it runs (exec)", /\bexec\b|programs? (it|the mod) (runs|starts)/]);
  if (/readTextFile|readdir|watchFolder/.test(sourceText)) need.push(["reads outside the mod folder", /outside (its|the mod|of the mod)/]);
  if (/data\/vault/.test(sourceText)) need.push(["writes to data/vault", /data\/vault/]);
  for (const [what, re] of need) r.check(re.test(lower), `RECIPE.md discloses: ${what}`, `RECIPE.md must disclose: ${what}`);
  for (const prog of ["pdftoppm", "pdfinfo", "xdg-open", "curl", "qlmanage", "sips"]) {
    if (new RegExp(`\\b${prog}\\b`).test(sourceText) && !lower.includes(prog)) r.warn(`the code runs ${prog} but RECIPE.md does not name it`);
  }
}

// ---- 9. Scripts present ----
console.log("Repo tooling");
for (const f of ["scripts/check-repo.mjs", "scripts/privacy-scan.mjs"]) r.check(has(f), `${f} present`, `${f} missing`);
if (has("package.json")) {
  const p = readJson("package.json");
  if (p) r.check(p.private === true, "package.json is private", "root package.json must be private");
}

// ---- 10. Release gate ----
if (RELEASE) {
  console.log("Release gate");
  if (has("preview.png")) {
    const size = pngSize(readBytes("preview.png"));
    r.check(size && size.width >= 800 && size.height >= 500, `preview.png ${size?.width}x${size?.height}`, "preview.png must be a PNG of at least 800x500");
  } else {
    r.error("preview.png is missing (author step 1 in scripts/PUBLISH.md: capture it from examples/sample-vault, see scripts/PREVIEW.md)");
  }
  for (const f of ["RECIPE.md", "NOTICE", "LICENSE", "scripts/PUBLISH.md", "scripts/PREVIEW.md", "README.md"]) {
    if (!has(f)) {
      r.error(`${f} is missing`);
      continue;
    }
    const t = readText(f);
    if (/\bTODO\b|\bFIXME\b/.test(t)) r.error(`${f} still has a TODO/FIXME`);
    if (/<author[^>]*>|\[yyyy\]|\[name of copyright owner\]/i.test(t)) r.error(`${f} still has an unfilled placeholder`);
  }
  // The original logo must not be in git history of a public repo.
  const objs = git(["rev-list", "--objects", "--all"]);
  if (objs) {
    const inHistory = objs.toString("utf8").split("\n").some((l) => l.startsWith(LOGO_GIT_BLOB));
    if (inHistory) r.error("the Obsidian logo is still in git history: squash or recreate the repo before making it public (scripts/PUBLISH.md step 2)");
    else r.ok("the Obsidian logo is not in git history");
  } else {
    r.warn("git history not available: cannot confirm the logo is gone from history");
  }
  console.log("  note  author-only steps that no script can do (scripts/PUBLISH.md): confirm the copyright name, enable GitHub Pages (main /docs),");
  console.log("  note  make the repo public, add the topic herdr-mod, wait for herdr.dev/mods, tell the portrait layout repo to link here.");
}

r.finish();
