#!/usr/bin/env node
// Structure, contract and licensing checks for the repo. Node 22, no dependencies, same result on every OS.
//
//   node scripts/check-repo.mjs            checks that must always hold (CI)
//   node scripts/check-repo.mjs --release  adds the publish gate (preview.png, no TODO, no placeholders,
//                                          no Obsidian logo in history). Fails until the author steps in
//                                          scripts/PUBLISH.md are done.
//   node scripts/check-repo.mjs --root DIR a temp copy of the repo (used by --self-test)
//   node scripts/check-repo.mjs --self-test  seeds faults into temp copies and expects them to be caught
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ROOT, SELF_ROOT, Report, abs, badWorkflowCommand, exists, git, isBinaryName, pngSize, readBytes, readText, repoFiles, workflowCommands } from "./lib/repo.mjs";

const RELEASE = process.argv.includes("--release");
// Licence headers are written by code-review (R2-CR-15). A warning until they are on the branch; flipped to an error
// by the last herdr-completeness task of round 2 (R2-HC-12) by changing this one constant.
const HEADERS_ERROR = false;
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
  // Drawn by herdr-portrait-layout's bar strip (its bar-strip/main.js, allow-listed in its tests): a frozen path (PLAN D11).
  iconPaths: ["mods/vault/icons/book-open.svg"],
};
// The Obsidian logo that was imported by mistake. It is judged by content, never by file name (PLAN D2).
// ctrl-shift-<letter> chords Herdr binds by default, plus the portrait layout's: a snapshot in scripts/herdr-default-keys.json.
const SNAPSHOT = JSON.parse(readText("scripts/herdr-default-keys.json"));
const TAKEN_CHORDS = new Set(SNAPSHOT.chords);
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
for (const f of ["LICENSE", "NOTICE", "RECIPE.md", "keys.json", ".gitignore", ".gitattributes", "scripts/ci.workflow.yml",
  "scripts/check-recipe.mjs", "scripts/install-sim.mjs", "scripts/install-ci.mjs", "scripts/PUBLISH.md", "scripts/PREVIEW.md"]) {
  r.check(has(f), `${f} present`, `${f} is missing`);
}
// The workflow is installed by the author (pushing .github/workflows needs a token scope the unattended run lacked).
if (has(".github/workflows/ci.yml")) {
  const body = (f) => readText(f).replace(/^#[^\n]*\n/gm, "").trim();
  r.check(body(".github/workflows/ci.yml") === body("scripts/ci.workflow.yml"), ".github/workflows/ci.yml matches scripts/ci.workflow.yml", ".github/workflows/ci.yml differs from scripts/ci.workflow.yml (the template is the source of truth)");
} else if (RELEASE) {
  r.error(".github/workflows/ci.yml is missing: run node scripts/install-ci.mjs (scripts/PUBLISH.md)");
} else {
  r.warn(".github/workflows/ci.yml is not installed yet: run node scripts/install-ci.mjs (scripts/PUBLISH.md)");
}
// CI cannot run here, so the template is checked statically: every command must exist, nothing may be skippable.
if (has("scripts/ci.workflow.yml")) {
  console.log("CI template");
  const ci = readText("scripts/ci.workflow.yml");
  const pkg = has("package.json") ? JSON.parse(readText("package.json")) : {};
  const cmds = workflowCommands(ci);
  let bad = 0;
  for (const { line, cmd } of cmds) {
    const why = badWorkflowCommand(cmd, pkg.scripts ?? {}, has);
    if (why) {
      bad++;
      r.error(`scripts/ci.workflow.yml:${line}: \`${cmd}\` cannot work: ${why}`);
    }
  }
  if (!bad) r.ok(`${cmds.length} workflow command(s) resolve to package.json scripts or files in scripts/`);
  const code = ci.replace(/^\s*#.*$/gm, "");
  r.check(!/continue-on-error/.test(code), "no step may fail silently (continue-on-error)", "scripts/ci.workflow.yml: continue-on-error makes a step unable to fail the run");
  r.check(!/hashFiles\(/.test(code), "no step is skipped by hashFiles()", "scripts/ci.workflow.yml: an `if: hashFiles(...)` guard lets a missing test folder pass silently");
  r.check(/timeout-minutes:\s*\d+/.test(code), "jobs have a timeout", "scripts/ci.workflow.yml: add timeout-minutes to the job");
  const uses = [...code.matchAll(/uses:\s*([^\s#]+)/g)].map((m) => m[1]);
  r.check(uses.length > 0 && uses.every((u) => /@[0-9a-f]{40}$/.test(u)), `${uses.length} action(s) pinned to a full commit`, "scripts/ci.workflow.yml: pin every `uses:` to a full 40-character commit with the tag in a comment");
  r.check(/ubuntu-latest/.test(code) && /windows-latest/.test(code) && /macos-latest/.test(code), "ubuntu, windows and macos legs", "scripts/ci.workflow.yml must run on ubuntu, windows and macos");
  r.check(/node-version:\s*['"]?22/.test(code), "Node 22 leg", "scripts/ci.workflow.yml must use Node 22");
  r.check(/permissions:\s*\n\s+contents:\s*read/.test(code), "read-only token", "scripts/ci.workflow.yml must set permissions: contents: read");
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

// Issue forms (.github/ISSUE_TEMPLATE/*.yml): there is no YAML parser in Node, so the structure GitHub requires is checked
// line by line: name, description, a body list of known element types, unique ids, no tabs.
for (const f of files.filter((f) => /^\.github\/ISSUE_TEMPLATE\/.+\.ya?ml$/.test(f) && !f.endsWith("config.yml"))) {
  const t = readText(f);
  const problems = [];
  if (/\t/.test(t)) problems.push("contains a tab (YAML forbids tabs for indentation)");
  for (const key of ["name", "description", "body"]) if (!new RegExp(`^${key}:`, "m").test(t)) problems.push(`has no top-level ${key}:`);
  const types = [...t.matchAll(/^\s+- type:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  if (!types.length) problems.push("has no body elements");
  for (const ty of types) if (!["markdown", "textarea", "input", "dropdown", "checkboxes"].includes(ty)) problems.push(`unknown element type "${ty}"`);
  const ids = [...t.matchAll(/^\s+id:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  if (new Set(ids).size !== ids.length) problems.push("repeats an id");
  if (types.filter((ty) => ty !== "markdown").length && !ids.length) problems.push("elements have no id");
  r.check(!problems.length, `${f} is a well-formed issue form (${types.length} elements)`, `${f}: ${problems.join("; ")}`);
}

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
    // kind/at/offset are what Herdr's own shipped picker mods and the official tmux-prefix example write (herdr.d.ts documents kind and at for openOverlay).
    if (o && "kind" in o) r.check(["dialog", "popup", "window"].includes(o.kind), `${f}: overlay.kind "${o.kind}"`, `${f}: overlay.kind must be dialog, popup or window`);
    if (o && "at" in o) r.check(o.at === "top" || o.at === "pointer" || (o.at && typeof o.at === "object" && Number.isFinite(o.at.x) && Number.isFinite(o.at.y)), `${f}: overlay.at ${JSON.stringify(o.at)}`, `${f}: overlay.at must be "top", "pointer" or {x, y}`);
    if (o && "offset" in o) r.check(typeof o.offset === "number" && o.offset >= 0, `${f}: overlay.offset ${o.offset}`, `${f}: overlay.offset must be a number of px`);
    for (const k of Object.keys(o ?? {})) if (!["kind", "at", "offset", "width", "height", "frame", "modal"].includes(k)) r.warn(`${f}: overlay field "${k}" is not one Herdr documents or ships`);
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
        if (TAKEN_CHORDS.has(key)) r.error(`keys.json: "${key}" is already a Herdr default (or the portrait layout's); pick a free chord`);
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

// The snapshot is only as good as the Herdr it was taken from. With herdr-app on this machine, say whether the version
// is the same and whether every command keys.json uses exists; without it, say that only the snapshot was used.
{
  const v = spawnSync("herdr-app", ["--version"], { encoding: "utf8" });
  if (v.error || v.status !== 0) {
    r.note(`herdr-app is not on PATH: default chords checked against the snapshot of Herdr ${SNAPSHOT.herdr} only`);
  } else {
    const installed = (/(\d+\.\d+\.\d+)/.exec(v.stdout) ?? [])[1];
    if (installed === SNAPSHOT.herdr) r.ok(`default chords: snapshot matches the installed Herdr ${installed}`);
    else r.warn(`default chords: scripts/herdr-default-keys.json is the snapshot of Herdr ${SNAPSHOT.herdr}, this machine has ${installed}: re-check the chords`);
    const cmds = spawnSync("herdr-app", ["commands"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    let names = null;
    try {
      names = new Set(JSON.parse(cmds.stdout).map((c) => c.name));
    } catch {}
    if (names && has("keys.json")) {
      const k = readJson("keys.json") ?? {};
      for (const [section, map] of Object.entries(k)) {
        for (const action of Object.values(map ?? {})) {
          const base = String(action).split(":")[0];
          if (/^[a-z]+\.[a-z.]+$/.test(base) && !CONTRACT.mods.includes(base.split(".")[0]) && !names.has(base)) r.error(`keys.json (${section}): "${base}" is not a command of Herdr ${installed} (herdr-app commands)`);
        }
      }
      r.ok("every Herdr command keys.json uses exists in herdr-app commands");
    }
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
for (const p of CONTRACT.iconPaths) r.check(has(p), `${p} exists (the portrait layout draws it)`, `${p} must stay as a path (the portrait layout's bar strip draws it, PLAN D11)`);
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
  for (const f of vendored) {
    r.check(notice.includes(f) && /lz-string/i.test(notice) && /MIT/.test(notice), `NOTICE names ${f} (lz-string, MIT)`, `NOTICE must name ${f} with its MIT license`);
    // An installer copies only mods/<name>/: the licence text must sit in the same folder, and the file must point at it.
    const lic = `${path.posix.dirname(f)}/LICENSE-lz-string.txt`;
    r.check(has(lic) && /Permission is hereby granted/.test(readText(lic)) && /pieroxy/.test(readText(lic)), `${lic} holds the MIT text`, `${lic} is missing or is not the lz-string MIT text`);
    r.check(notice.includes(lic), `NOTICE names ${lic}`, `NOTICE must name ${lic}`);
    // The pointer is a comment edit in lzstring.js, owned by code-review (R2-CR-15): a warning until it lands.
    const ptr = /LICENSE-lz-string\.txt/.test(readText(f).slice(0, 600));
    if (ptr) r.ok(`${f} points at LICENSE-lz-string.txt`);
    else if (HEADERS_ERROR) r.error(`${f}: the first comment must point at LICENSE-lz-string.txt`);
    else r.warn(`${f}: the first comment does not point at LICENSE-lz-string.txt yet (R2-CR-15)`);
  }
  // Each mod's main.js says under which licence it is shared, because only the mod folder is copied on install.
  for (const m of CONTRACT.mods) {
    const f = `mods/${m}/main.js`;
    if (!has(f)) continue;
    const head = readText(f).split(/\r?\n/).slice(0, 6).join("\n");
    const ok = /SPDX-License-Identifier:\s*Apache-2\.0/.test(head) && /Copyright\s+(?:\(c\)\s+)?\d{4}\s+\S/.test(head);
    if (ok) r.ok(`${f} has an SPDX line and a copyright line`);
    else if (HEADERS_ERROR) r.error(`${f}: add "// SPDX-License-Identifier: Apache-2.0" and a "// Copyright <year> <holder>" line in the first lines`);
    else r.warn(`${f}: no SPDX/copyright header yet (R2-CR-15)`);
  }
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
  // RECIPE.md against the code (programs, labels, constants, keys, callouts): scripts/check-recipe.mjs has the ledger.
  {
    const res = spawnSync(process.execPath, [path.join(SELF_ROOT, "scripts", "check-recipe.mjs"), "--root", ROOT], { cwd: ROOT, encoding: "utf8" });
    if (res.error) r.error(`check-recipe could not run: ${res.error.message}`);
    else if (res.status === 0) r.ok("check-recipe: every claim in RECIPE.md has a source in the code");
    else {
      r.error("check-recipe fails (node scripts/check-recipe.mjs):");
      for (const l of `${res.stdout}`.split(/\r?\n/).filter((l) => /FAIL/.test(l)).slice(0, 10)) console.log(`        ${l.trim()}`);
    }
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
// The publish steps are read from scripts/PUBLISH.md, so the list printed here is the list in that file. It must be a
// consecutive numbered list with a bold title on every step.
const publishSteps = has("scripts/PUBLISH.md")
  ? [...readText("scripts/PUBLISH.md").matchAll(/^(\d+)\.\s+\*\*(.+?)\*\*/gm)].map((m) => ({ n: Number(m[1]), title: m[2].replace(/[.:]$/, "") }))
  : [];
r.check(publishSteps.length >= 8 && publishSteps.every((st, k) => st.n === k + 1), `scripts/PUBLISH.md lists ${publishSteps.length} numbered steps`, "scripts/PUBLISH.md needs a consecutive numbered list of bold-titled steps (at least 8)");
if (RELEASE) {
  console.log("Release gate");
  if (has("preview.png")) {
    const size = pngSize(readBytes("preview.png"));
    r.check(size && size.width >= 800 && size.height >= 500, `preview.png ${size?.width}x${size?.height}`, "preview.png must be a PNG of at least 800x500");
  } else {
    r.error("preview.png is missing (author step in scripts/PUBLISH.md: capture it from examples/sample-vault, see scripts/PREVIEW.md)");
  }
  // The image line in RECIPE.md sits inside a publish mark until the real picture exists; it must be live to publish.
  if (has("RECIPE.md") && !/^!\[[^\]]*\]\(preview\.png\)/m.test(readText("RECIPE.md").replace(/<!--[\s\S]*?-->/g, ""))) r.error("RECIPE.md: the preview.png image line is still inside its <!-- publish: preview --> comment (author step: scripts/PUBLISH.md)");
  for (const f of ["RECIPE.md", "NOTICE", "LICENSE", "scripts/PUBLISH.md", "scripts/PREVIEW.md", "README.md"]) {
    if (!has(f)) {
      r.error(`${f} is missing`);
      continue;
    }
    const t = readText(f);
    if (/\bTODO\b|\bFIXME\b/.test(t)) r.error(`${f} still has a TODO/FIXME`);
    if (/<author[^>]*>|\[yyyy\]|\[name of copyright owner\]/i.test(t)) r.error(`${f} still has an unfilled placeholder`);
  }
  // The <owner> placeholder stands for the GitHub owner in docs; agents may not write usernames. Every text file that
  // will be published counts, except scripts/ (which explain the placeholder) and plans/ (not published, PUBLISH.md).
  {
    const open = [];
    for (const f of files) {
      if (f.startsWith("plans/") || f.startsWith("scripts/") || f.startsWith("tests/") || isBinaryName(f)) continue; // tests/ use it as a fixture
      const n = (readText(f).match(/<owner>/g) ?? []).length;
      if (n) open.push(`${f} (${n})`);
    }
    if (open.length) r.error(`the <owner> placeholder is still in ${open.length} file(s): ${open.join(", ")} (author step: replace it, scripts/PUBLISH.md)`);
    else r.ok("no <owner> placeholder is left outside scripts/ and plans/");
  }
  // Publish-time marks in docs: documentation's own gate knows its wording (check-docs --release), we only run it.
  {
    const res = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-docs.mjs"), "--release"], { cwd: ROOT, encoding: "utf8" });
    const lines = `${res.stdout ?? ""}${res.stderr ?? ""}`.split(/\r?\n/).filter((l) => /FAIL|release:/.test(l));
    if (res.error) r.warn(`check-docs --release could not run: ${res.error.message}`);
    else if (res.status !== 0) {
      r.error("check-docs --release fails (open publish marks in the docs, scripts/PUBLISH.md):");
      for (const l of lines.slice(0, 12)) console.log(`        ${l.trim()}`);
    } else r.ok("check-docs --release passes");
    const marked = files.filter((f) => !f.startsWith("plans/") && !f.startsWith("scripts/") && !isBinaryName(f) && /<!--\s*publish:/.test(readText(f)));
    if (marked.length) r.note(`publish marks (rg "publish:") remain in: ${marked.join(", ")}`);
  }
  // The original logo must not be in git history of a public repo.
  const objs = git(["rev-list", "--objects", "--all"]);
  if (objs) {
    const inHistory = objs.toString("utf8").split("\n").some((l) => l.startsWith(LOGO_GIT_BLOB));
    if (inHistory) r.error("the Obsidian logo is still in git history: squash or recreate the repo before making it public (scripts/PUBLISH.md)");
    else r.ok("the Obsidian logo is not in git history");
  } else {
    r.warn("git history not available: cannot confirm the logo is gone from history");
  }
  console.log("  note  author-only steps that no script can do, from scripts/PUBLISH.md:");
  for (const st of publishSteps) console.log(`  note    ${st.n}. ${st.title}`);
}

// ---- 11. Self-test: seeded faults must be caught ----
if (process.argv.includes("--self-test")) await selfTest();

r.finish();

async function selfTest() {
  console.log("Self-test (seeded faults in temp copies)");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const run = (root, args = []) => spawnSync(process.execPath, [path.join(SELF_ROOT, "scripts", "check-repo.mjs"), "--root", root, ...args], { cwd: root, encoding: "utf8" });
  const copy = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-selftest-"));
    for (const f of files) {
      if (f.startsWith("plans/")) continue;
      fs.mkdirSync(path.dirname(path.join(dir, ...f.split("/"))), { recursive: true });
      fs.copyFileSync(abs(f), path.join(dir, ...f.split("/")));
    }
    return dir;
  };
  const edit = (dir, rel, fn) => {
    const file = path.join(dir, ...rel.split("/"));
    fs.writeFileSync(file, fn(fs.readFileSync(file, "utf8")));
  };
  const cases = [
    ["the template runs `node --test tests/`", "scripts/ci.workflow.yml", (t) => t.replace("run: npm test", "run: node --test tests/"), [], /node --test/],
    ["a step is skippable with hashFiles()", "scripts/ci.workflow.yml", (t) => t.replace("- name: Unit tests", "- name: Unit tests\n        if: ${{ hashFiles('tests/**') != '' }}"), []],
    ["a step may fail (continue-on-error)", "scripts/ci.workflow.yml", (t) => t.replace("- name: Docs checks", "- name: Docs checks\n        continue-on-error: true"), []],
    ["an action floats on a tag", "scripts/ci.workflow.yml", (t) => t.replace(/actions\/setup-node@[0-9a-f]{40}/, "actions/setup-node@v4"), []],
    ["the template runs a script that does not exist", "scripts/ci.workflow.yml", (t) => t.replace("node scripts/check-docs.mjs", "node scripts/nope.mjs"), []],
    ["a placeholder <owner> is left in the docs", "README.md", (t) => `${t}\nSee https://github.com/<owner>/x\n`, ["--release"], /<owner> placeholder is still in 1 file|<owner> placeholder is still in \d+ file.*README\.md/],
    ["the portrait layout's icon path is gone", "mods/vault/icons/book-open.svg", null, [], /book-open\.svg/],
    ["RECIPE.md puts cmd /c start back", "RECIPE.md", (t) => t.replace("`xdg-open` or `rundll32`", "`xdg-open` or `cmd /c start`"), [], /check-recipe/],
    ["a lz-string licence text is missing", "mods/vault-reader/render/LICENSE-lz-string.txt", null, [], /LICENSE-lz-string/],
  ];
  let n = 0;
  for (const [what, rel, fn, extra, expect] of cases) {
    const dir = copy();
    try {
      if (fn) edit(dir, rel, fn);
      else fs.rmSync(path.join(dir, ...rel.split("/")));
      const res = run(dir, extra);
      n++;
      const caught = res.status === 1 && (!expect || expect.test(res.stdout));
      r.check(caught, `seeded fault caught: ${what}`, `seeded fault NOT caught (exit ${res.status}${expect && res.status === 1 ? ", but not for this reason" : ""}): ${what}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  const clean = copy();
  try {
    const res = run(clean);
    r.check(res.status === 0, "the unmodified copy passes (no false positive)", `the unmodified copy fails:\n${res.stdout.split("\n").filter((l) => /FAIL/.test(l)).join("\n")}`);
  } finally {
    fs.rmSync(clean, { recursive: true, force: true });
  }
}
