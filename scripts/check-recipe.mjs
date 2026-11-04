#!/usr/bin/env node
// RECIPE.md against the code. A claim ledger: every statement RECIPE.md makes about what the mods do (programs run,
// labels, constants, shared keys, commands, paths, callout colours, key bindings) is looked up in the mod source or in
// the values the mods compute, and the script fails when the two disagree or when the code does something RECIPE.md
// does not say. Herdr installers rely on RECIPE.md's disclosure (network, programs, reads outside the mod folder).
//
//   node scripts/check-recipe.mjs               check RECIPE.md of this checkout
//   node scripts/check-recipe.mjs --root DIR    check another copy of the repo
//   node scripts/check-recipe.mjs --self-test   feed RECIPE texts with known faults and expect them to be caught
//
// Node 22, no dependencies, same result on every OS. Reads the mod files; never writes anything.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, SELF_ROOT, Report, abs, readText, repoFiles } from "./lib/repo.mjs";

const PLATFORMS = ["macos", "linux", "windows"];
const FROZEN_KEYS = ["vault.list", "vault.current", "vault.open", "vault.panes"]; // the contract with herdr-portrait-layout

// Quoted in RECIPE.md but not a literal in the mods: Herdr's own menu names, product names and the like.
const UI_NOT_IN_CODE = ["Feature tour", "Keep ▾ then New tab"]; // a sample-vault note name; a click path made of two labels

/** Source text without whole-line comments and block comments, so a claim cannot be "backed" by a comment. */
const stripComments = (t) => t.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");

/** Collect what the code does. Everything here is read from files, nothing is typed in. */
export async function loadFacts(root = ROOT) {
  const list = repoFiles(root).filter((f) => /^mods\/.+\.(js|mjs)$/.test(f));
  const text = (rel) => stripComments(fs.readFileSync(path.join(root, ...rel.split("/")), "utf8"));
  const mods = list.map((f) => ({ file: f, code: text(f) }));
  const all = mods.map((m) => m.code).join("\n");
  const get = (rel) => mods.find((m) => m.file === rel)?.code ?? "";
  const platformUrl = (m) => pathToFileURL(path.join(root, "mods", m, "platform.js")).href;
  const reader = await import(platformUrl("vault-reader"));
  const vault = await import(platformUrl("vault"));
  const num = (rel, re) => {
    const m = re.exec(get(rel));
    return m ? Number(m[1].replace(/_/g, "")) : null;
  };
  const f = { mods, all, get, reader, vault, num };

  // Programs: what the platform tables return for each OS, plus literal exec(...) first arguments and tuple tables.
  const programs = new Set();
  for (const p of PLATFORMS) {
    programs.add(reader.openCommand(p, "x")[0]);
    programs.add(reader.previewCommand(p, "x")[0]);
    programs.add(reader.statCommand(p, ["x"], 0)[0]);
    if (reader.statVariants(p) > 1) programs.add(reader.statCommand(p, ["x"], 1)[0]);
  }
  programs.add(reader.macImageSizeCommand("x")[0]);
  programs.add(reader.macThumbnailCommand("o", "x")[0]);
  for (const m of mods) {
    for (const x of m.code.matchAll(/\bexec\(\s*"([\w.-]+)"/g)) programs.add(x[1]);
    if (m.file.endsWith("platform.js")) for (const x of m.code.matchAll(/\[\s*"([a-z][\w-]*)"\s*,\s*\[/g)) programs.add(x[1]);
  }
  for (const k of Object.keys(/HINTS\s*=\s*\{([\s\S]*?)\n\};/.exec(get("mods/vault-reader/platform.js"))?.[1] ? Object.fromEntries([...get("mods/vault-reader/platform.js").matchAll(/^\s{2}(\w+):\s*\{\s*macos:/gm)].map((x) => [x[1], 1])) : {})) {
    if (k === "poppler" || k === "browser" || k === "obsidian") continue;
    programs.add(k);
  }
  for (const x of get("mods/vault-reader/platform.js").matchAll(/VERSION_ARGS\s*=\s*\{([^}]*)\}/g)) for (const n of x[1].matchAll(/(\w+):/g)) programs.add(n[1]);
  f.programs = [...programs].sort();
  f.usesHc = /\bhc\(/.test(all);
  f.usesLoginShell = /exec\("sh",\s*\["-c"/.test(all);

  f.sharedKeys = new Set([...all.matchAll(/\b(?:setShared|shared)\(\s*"(vault\.[\w.]+)"/g)].map((x) => x[1]));
  f.commandsRun = new Set([...all.matchAll(/\brun\(\s*"([\w.]+)"/g)].map((x) => x[1]));
  f.herdrImports = new Set();
  f.gpuiImports = new Set();
  for (const m of mods) {
    for (const x of m.code.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(herdr|gpui-kit|gpui-base)"/g)) {
      for (const n of x[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) (x[2] === "herdr" ? f.herdrImports : f.gpuiImports).add(n);
    }
  }
  f.envVars = new Set([...all.matchAll(/\b(HERDR_VAULT_[A-Z]+|CHROME_PATH)\b/g)].map((x) => x[1]));
  f.dataFolders = new Set();
  for (const m of mods) {
    for (const x of m.code.matchAll(/data\/vault\/([\w.-]+)/g)) f.dataFolders.add(x[1]);
    for (const x of m.code.matchAll(/path\.join\(DATA,\s*[`"]([\w.-]+)/g)) f.dataFolders.add(x[1]);
  }
  if (/`chrome-\$\{pid\}-/.test(get("mods/vault-reader/render/lib.mjs"))) f.dataFolders.add("chrome-");
  f.settingsKeys = new Set();
  const settingsBlock = /DEFAULT_SETTINGS\s*=\s*\{([^}]*)\}/.exec(get("mods/vault-reader/assets-core.js"));
  if (settingsBlock) for (const x of settingsBlock[1].matchAll(/(\w+):/g)) f.settingsKeys.add(x[1]);
  const parse = /function parseSettings[\s\S]*?\n\}/.exec(get("mods/vault-reader/assets-core.js"))?.[0] ?? "";
  for (const x of parse.matchAll(/\bdata\.(\w+)/g)) f.settingsKeys.add(x[1]);
  f.networkCalls = mods.filter((m) => /\bfetch\(|https?\.(?:get|request)\(|XMLHttpRequest|from\s+"(?:node:)?https"|\bnet\.connect/.test(m.code)).map((m) => m.file);
  f.callouts = [...get("mods/vault-reader/main.js").matchAll(/\b(\w+):\s*\["([\w-]+)",\s*"(#[0-9a-fA-F]{6})"\]/g)].map((x) => ({ type: x[1], icon: x[2], color: x[3] }));
  const aliasBlock = /CALLOUT_ALIAS\s*=\s*\{([\s\S]*?)\};/.exec(get("mods/vault-reader/main.js"));
  f.aliases = aliasBlock ? [...aliasBlock[1].matchAll(/(\w+):\s*"(\w+)"/g)].map((x) => [x[1], x[2]]) : [];
  f.webImageLabels = [...get("mods/vault-reader/main.js").matchAll(/"(Web images: (?:on|off))"/g)].map((x) => x[1]);
  return f;
}

const paragraph = (recipe, startsWith) => {
  const i = recipe.indexOf(startsWith);
  if (i < 0) return "";
  const end = recipe.indexOf("\n\n", i);
  return recipe.slice(i, end < 0 ? undefined : end);
};
const word = (name) => new RegExp(`(^|[^\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\w-])`);

/** All findings for one RECIPE text. Returns [{ id, msg }]; empty means every claim is backed. */
export function checkRecipe(recipe, f, keysJson, modJson) {
  const out = [];
  const bad = (id, msg) => out.push({ id, msg });
  const has = (re) => (typeof re === "string" ? recipe.includes(re) : re.test(recipe));

  // 1. Programs: everything the code can run is named in the Programs paragraph; hc is not used.
  const programsPara = paragraph(recipe, "Programs run through `exec`");
  if (!programsPara) bad("programs", "RECIPE.md has no paragraph starting \"Programs run through `exec`\"");
  const tableRow = (recipe.split("\n").find((l) => l.startsWith("| Programs (`exec`)")) ?? "");
  for (const name of f.programs) {
    if (!word(name).test(programsPara)) bad("programs", `the code can run \`${name}\` but the Programs paragraph (Built from) does not name it`);
    if (!word(name).test(tableRow)) bad("programs", `the code can run \`${name}\` but the Programs row of the Watch out table does not name it`);
  }
  if (f.usesHc && !/\bhc\b/.test(tableRow.replace(/No `hc`\./, ""))) bad("programs", "the code calls hc() but RECIPE.md does not say so");
  if (!f.usesHc && !/No `hc`/.test(tableRow)) bad("programs", "RECIPE.md should say \"No `hc`\" in the Programs row (the code never calls hc)");
  if (f.usesLoginShell) {
    if (/never through a shell string/i.test(recipe)) bad("shell", "RECIPE.md says arguments never go through a shell string, but platform.js runs sh -c for the login-shell lookup");
    if (!/sh -c/.test(tableRow) || !/login shell/.test(tableRow)) bad("shell", "the Programs row must say that sh -c starts the login shell to find a program");
  }

  // 2. The opener and the preview label per OS, as the platform tables compute them.
  for (const p of PLATFORMS) {
    const [cmd, args] = f.reader.openCommand(p, "x");
    if (!has(new RegExp(`\`${cmd}\`|\`${cmd} `))) bad("opener", `RECIPE.md does not name the ${p} opener \`${cmd}\``);
    if (p === "windows" && !has(args[0])) bad("opener", `RECIPE.md does not name \`${args[0]}\`, the Windows opener's first argument`);
    const label = f.reader.previewLabel(p);
    if (!has(`"${label}"`)) bad("labels", `RECIPE.md does not quote the ${p} button label "${label}"`);
  }
  if (/(?<!not use )`cmd \/c start`/.test(recipe)) bad("opener", "RECIPE.md says `cmd /c start`, but the Windows opener is rundll32 (platform.js)");
  if (/Open externally/.test(recipe)) bad("labels", "RECIPE.md says \"Open externally\", a label no button has");
  for (const l of f.webImageLabels) if (!has(`"${l}"`)) bad("labels", `RECIPE.md does not quote the button label "${l}"`);
  if (/`chrome\/`/.test(recipe)) bad("paths", "RECIPE.md names a `chrome/` profile folder; profiles are chrome-<pid>-<time>-<rand>");

  // 3. Constants.
  const lim = [
    ["PER_FOLDER", f.num("mods/vault/main.js", /const PER_FOLDER = ([\d_]+)/), (v) => new RegExp(`\\b${v}\\b[^.\\n]{0,40}per folder`), "entries per folder"],
    ["MAX search results", f.num("mods/vault/search-core.js", /export const MAX = ([\d_]+)/), (v) => new RegExp(`\\b${v}\\b[^.\\n]{0,12}(?:search )?results`), "search results"],
    ["PDF_PAGES", f.num("mods/vault-reader/main.js", /const PDF_PAGES = ([\d_]+)/), (v) => new RegExp(`\\b${v}\\b[^.\\n]{0,12}pages`), "PDF pages"],
    ["listVault limit", f.num("mods/vault-reader/vault-files.js", /limit = ([\d_]+)/), (v) => new RegExp(`\\b${v}\\b[^.\\n]{0,30}files`), "files walked"],
    ["COLUMN", f.num("mods/vault-reader/main.js", /const COLUMN = ([\d_]+)/), (v) => new RegExp(`\\b${v}px`), "column width"],
    ["CACHE_MAX_AGE_DAYS", f.num("mods/vault-reader/assets-core.js", /CACHE_MAX_AGE_DAYS = ([\d_]+)/), (v) => new RegExp(`older than ${v} days`), "cache age"],
    ["CACHE_MAX_MB", f.num("mods/vault-reader/assets-core.js", /CACHE_MAX_MB = ([\d_]+)/), (v) => new RegExp(`under ${v} MB`), "cache size"],
    ["BATCH", f.num("mods/vault-reader/assets-core.js", /export const BATCH = ([\d_]+)/), (v) => new RegExp(`at most ${v} render jobs`), "render jobs per run"],
    ["DEADLINE_MS", f.num("mods/vault-reader/render/lib.mjs", /DEADLINE_MS = ([\d_]+)/), (v) => new RegExp(`after ${v / 1000} seconds`), "render deadline"],
    ["overlay width", Math.round((f.num("mods/vault/main.js", /key: READER, width: ([\d.]+)/) ?? 0) * 100), (v) => new RegExp(`\\b${v}%`), "reader window width"],
    ["overlay height", Math.round((f.num("mods/vault/main.js", /key: READER, width: [\d.]+, height: ([\d.]+)/) ?? 0) * 100), (v) => new RegExp(`\\b${v}%`), "reader window height"],
  ];
  // Optional constants: checked only where the code has them (they arrived with code-review's later waves).
  const opt = [
    ["ROWS_MAX", f.num("mods/vault/main.js", /export const ROWS_MAX = ([\d_]+)/), (v) => new RegExp(`\\b${v} rows`), "tree rows drawn"],
    ["REMOTE_MAX_BYTES", f.num("mods/vault-reader/assets-core.js", /REMOTE_MAX_BYTES = ([\d_]+)/), (v) => new RegExp(`\\b${v / 1e6} MB per picture`), "web picture size"],
    ["IMAGE_MAX_BYTES", f.num("mods/vault-reader/assets-core.js", /IMAGE_MAX_BYTES = ([\d_]+)/), (v) => new RegExp(`over ${v / 1e6} MB`), "vault picture size"],
    ["curl --max-redirs", Number(/"--max-redirs",\s*"(\d+)"/.exec(f.get("mods/vault-reader/assets-core.js"))?.[1]) || null, (v) => new RegExp(`at most ${v} redirects`), "curl redirects"],
    ["curl --max-time", Number(/"--max-time",\s*"(\d+)"/.exec(f.get("mods/vault-reader/assets-core.js"))?.[1]) || null, (v) => new RegExp(`\\b${v} seconds and`), "curl time"],
    ["FETCH_CONCURRENCY", f.num("mods/vault-reader/assets-core.js", /export const FETCH_CONCURRENCY = ([\d_]+)/), (v) => new RegExp(`at most ${["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"][v] ?? v} pictures at a time`), "pictures fetched at once"],
  ];
  for (const [name, v, re, what] of opt) if (v && !re(v).test(recipe)) bad("limits", `RECIPE.md does not state ${what} = ${v} (${name} in the code)`);
  // The CSP sentence may say "automated" only when the end-to-end test exists, and must say "not yet" while it does not.
  const e2e = fs.existsSync(path.join(ROOT, "tests", "render-e2e.test.mjs"));
  if (e2e && /not yet by an automated test/.test(recipe)) bad("network", "tests/render-e2e.test.mjs exists: RECIPE.md should no longer say the render page's isolation is not yet tested automatically");
  if (!e2e && /automated end-to-end test/.test(recipe)) bad("network", "RECIPE.md claims an automated end-to-end test, but tests/render-e2e.test.mjs does not exist");
  for (const [name, v, re, what] of lim) {
    if (!v) bad("limits", `${name}: could not read its value from the code (the ledger must follow the code; update scripts/check-recipe.mjs)`);
    else if (!re(v).test(recipe)) bad("limits", `RECIPE.md does not state ${what} = ${v} (${name} in the code)`);
  }
  if (modJson?.vault?.overlay) {
    const { width, height } = modJson.vault.overlay;
    if (!has(`${width} x ${height} px`)) bad("limits", `RECIPE.md does not state the popup size ${width} x ${height} px (mods/vault/mod.json)`);
    if (!has(`"width": ${width}`) || !has(`"height": ${height}`)) bad("limits", "RECIPE.md quotes a mods/vault/mod.json that differs from the file");
  }
  for (const [name, mj] of Object.entries(modJson ?? {})) {
    const flat = JSON.stringify(mj);
    const quoted = recipe.split("\n").join(" ");
    const normalise = (s) => s.replace(/\s+/g, "").replace(/'/g, '"');
    if (!normalise(quoted).includes(normalise(flat))) bad("mod.json", `RECIPE.md does not quote mods/${name}/mod.json exactly (${flat})`);
  }

  // 4. Callouts: every type with its colour, every alias with its target.
  if (f.callouts.length < 13) bad("callouts", `only ${f.callouts.length} callout types could be read from vault-reader/main.js (expected 13)`);
  for (const c of f.callouts) if (!new RegExp(`\\b${c.type}\\b\\s*\`${c.color}\``, "i").test(recipe)) bad("callouts", `RECIPE.md does not give callout "${c.type}" the colour ${c.color}`);
  for (const [a, t] of f.aliases) if (!new RegExp(`(?:^|[\\s,(])(?:\\w+ and )?${a}(?: and \\w+)? to ${t}\\b`).test(recipe)) bad("callouts", `RECIPE.md does not say that the callout alias "${a}" maps to "${t}"`);

  // 5. Shared keys and commands.
  const sharedPara = paragraph(recipe, "Shared keys (persisted");
  const additiveAt = sharedPara.indexOf("Additive keys");
  for (const k of f.sharedKeys) {
    const at = sharedPara.indexOf(`\`${k}\``);
    if (at < 0) bad("shared", `the code uses the shared key ${k} but the "Shared keys" paragraph does not name it`);
    else if (FROZEN_KEYS.includes(k) && additiveAt >= 0 && at > additiveAt) bad("shared", `${k} belongs to the frozen four but is listed after "Additive keys"`);
    else if (!FROZEN_KEYS.includes(k) && (additiveAt < 0 || at < additiveAt)) bad("shared", `${k} is not in the contract: list it after "Additive keys"`);
  }
  for (const k of FROZEN_KEYS) if (!f.sharedKeys.has(k)) bad("shared", `the frozen contract key ${k} is no longer used by the code`);
  if (!/frozen/.test(sharedPara)) bad("shared", "the Shared keys paragraph must say the four contract keys are frozen");
  for (const c of f.commandsRun) if (!has(`\`${c}\``)) bad("commands", `the code runs the command ${c} but RECIPE.md does not name it`);

  // 6. herdr and gpui functions, both directions.
  const fnPara = paragraph(recipe, "`herdr` functions used:");
  const [herdrPart, gpuiPart = ""] = fnPara.split("gpui-kit and gpui-base:");
  const listed = (s) => new Set([...s.matchAll(/`(\w+)`/g)].map((x) => x[1]));
  const herdrListed = listed(herdrPart.split("Commands run:")[0].replace("`herdr` functions used:", ""));
  for (const n of f.herdrImports) if (!herdrListed.has(n)) bad("api", `the code imports \`${n}\` from herdr but RECIPE.md does not list it`);
  for (const n of herdrListed) if (!f.herdrImports.has(n)) bad("api", `RECIPE.md lists herdr function \`${n}\`, which no mod imports`);
  const gpuiListed = listed(gpuiPart);
  for (const n of f.gpuiImports) if (!gpuiListed.has(n)) bad("api", `the code imports \`${n}\` from gpui-kit or gpui-base but RECIPE.md does not list it`);
  for (const n of gpuiListed) if (!f.gpuiImports.has(n)) bad("api", `RECIPE.md lists gpui function \`${n}\`, which no mod imports`);

  // 7. keys.json, both directions.
  for (const [section, map] of Object.entries(keysJson ?? {})) {
    for (const [key, action] of Object.entries(map)) {
      if (!has(`\`${key}\``)) bad("keys", `keys.json binds ${key} but RECIPE.md does not name it`);
      if (!has(`\`${action}\``)) bad("keys", `keys.json maps ${key} to ${action} but RECIPE.md does not name that action`);
    }
  }
  const bound = new Set(Object.values(keysJson ?? {}).flatMap((m) => Object.keys(m)));
  for (const m of recipe.matchAll(/`((?:ctrl|alt|shift|cmd|super)(?:-[\w\[\]]+)+)`/g)) if (!bound.has(m[1]) && !/-(?:Left|\[)$/.test(m[1])) bad("keys", `RECIPE.md names the key ${m[1]}, which keys.json does not bind`);

  // 7b. The Node minimum: the smallest version nodeOk() accepts, as the platform file computes it.
  const nodeMin = f.reader.nodeOk("v22.3.9") ? "22" : "22.4";
  if (nodeMin === "22.4") {
    if (/Node(?:\.js)? 22 or newer/.test(recipe) || /`node` 22 or newer/.test(recipe)) bad("node", "RECIPE.md says Node 22 or newer but the gate is 22.4 (nodeOk in platform.js)");
    if (!/Node\.js 22\.4 or newer/.test(recipe)) bad("node", "RECIPE.md must say Node.js 22.4 or newer (nodeOk in platform.js)");
  } else if (!/Node(?:\.js)? 22(?:\.\d+)? or newer|`node` 22(?:\.\d+)? or newer/.test(recipe)) bad("node", "RECIPE.md does not state the Node minimum");

  // 7c. Every UI text RECIPE.md quotes ("...", at least 12 characters, no code spans) is a string literal in the code.
  // `<name>` holes in the recipe match anything; a few constants are substituted in the code before comparing.
  {
    const consts = { ROWS_MAX: f.num("mods/vault/main.js", /export const ROWS_MAX = ([\d_]+)/) };
    const lit = f.all.replace(/\$\{(\w+)\}/g, (m, k) => (consts[k] != null ? String(consts[k]) : m));
    const found = (msg) => msg.split(/<[^>]+>/).map((x) => x.trim()).filter((x) => x.length >= 8).every((x) => lit.includes(x) || lit.includes(x.replace(/'/g, "\\'")));
    // Quotes are paired in order ("a" ... "b"): the odd pieces of a split on the quote mark are the quoted ones. Code
    // blocks and inline code are cut out first, because they hold JSON and key names, not messages.
    const prose = recipe.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/\s+/g, " ");
    const pieces = prose.split('"');
    const skip = new Set(UI_NOT_IN_CODE);
    for (let i = 1; i < pieces.length; i += 2) {
      const q = pieces[i].trim().replace(/\.$/, "");
      if (q.length >= 12 && !skip.has(q) && !found(q)) bad("messages", `RECIPE.md quotes "${q.slice(0, 70)}", which is not a string in the code`);
    }
  }

  // 7c2. The sample vault: every name and file the "Done when" list uses exists in examples/sample-vault.
  {
    const vaultDir = path.join(ROOT, "examples", "sample-vault");
    const names = new Set();
    if (fs.existsSync(vaultDir)) for (const e of fs.readdirSync(vaultDir)) if (!e.startsWith(".")) names.add(e.replace(/\.excalidraw\.md$|\.md$|\.canvas$/, ""));
    const tree = /tree shows the folders ([^.]*)\./.exec(recipe.replace(/\s+/g, " "));
    if (!tree) bad("sample", "the Done-when list no longer says what the tree shows (\"tree shows the folders ...\")");
    else for (const m of tree[1].matchAll(/`([^`]+)`/g)) if (!names.has(m[1])) bad("sample", `RECIPE.md says the sample vault has \`${m[1]}\` at its top level; it does not`);
    for (const m of recipe.matchAll(/`((?:attachments|projects)\/[^`]+)`/g)) if (!fs.existsSync(path.join(vaultDir, ...m[1].split("/")))) bad("sample", `RECIPE.md names \`${m[1]}\`, which is not in examples/sample-vault`);
  }

  // 7d. Discovery order of the browser: RECIPE.md lists the sources in the order lib.mjs tries them.
  {
    const para = paragraph(recipe, "**Finding the browser");
    if (/\bbrowserPath\b|\bpreferred\b/.test(f.get("mods/vault-reader/render/lib.mjs"))) {
      if (!para) bad("discovery", "RECIPE.md has no \"Finding the browser and Obsidian's bundle\" paragraph, but the code reads a browser setting");
      const seq = ["`browser` key", "`HERDR_VAULT_BROWSER`", "`CHROME_PATH`", "install", "PATH", "login shell"];
      let at = -1;
      for (const x of seq) {
        const i = para.indexOf(x, at + 1);
        if (i < 0) { bad("discovery", `the browser paragraph does not mention "${x}" after the previous source`); break; }
        at = i;
      }
      const lib = f.get("mods/vault-reader/render/lib.mjs");
      const fb = /export function findBrowser[\s\S]*?\n\}/.exec(lib)?.[0] ?? "";
      const order = [/\.\.\.preferred/, /env\.HERDR_VAULT_BROWSER/, /env\.CHROME_PATH/, /of candidates/, /of names/, /firstThat\(fallback/].map((re) => fb.search(re));
      if (order.some((i) => i < 0) || order.some((i, k) => k && i < order[k - 1])) bad("discovery", "findBrowser() in render/lib.mjs no longer tries the sources in the order RECIPE.md lists");
      const fa = /export function findAsar[\s\S]*?\n\}/.exec(lib)?.[0] ?? "";
      const ao = [/\.\.\.preferred/, /env\.HERDR_VAULT_ASAR/, /of candidates/].map((re) => fa.search(re));
      if (ao.some((i) => i < 0) || ao.some((i, k) => k && i < ao[k - 1])) bad("discovery", "findAsar() in render/lib.mjs no longer tries the sources in the order RECIPE.md lists");
    }
  }

  // 8. What the mods write and read outside their folder.
  for (const d of f.dataFolders) {
    const base = d.replace(/-.*$/, "");
    if (!recipe.includes(base)) bad("paths", `the code uses data/vault/${d} but RECIPE.md does not name \`${base}\``);
  }
  for (const key of f.settingsKeys) if (!has(`\`${key}\``)) bad("settings", `settings.json key "${key}" is not named in RECIPE.md`);
  if (!has("`chrome-<pid>-<time>-<rand>/`") || !/`chrome-\$\{pid\}-\$\{now[^}]*\}-\$\{rand/.test(fs.readFileSync(path.join(ROOT, "mods/vault-reader/render/lib.mjs"), "utf8"))) bad("paths", "the browser profile folder name in RECIPE.md differs from profileName() in render/lib.mjs");
  for (const p of PLATFORMS) for (const c of f.vault.obsidianConfigCandidates(p, "~")) if (!has(c)) bad("reads", `RECIPE.md does not list the vault list location ${c}`);
  for (const v of f.envVars) if (!has(`\`${v}\``)) bad("env", `the code reads ${v} but RECIPE.md does not name it`);
  if (f.networkCalls.length) bad("network", `new network code in ${f.networkCalls.join(", ")}: describe it in the Network row and teach scripts/check-recipe.mjs about it`);
  if (/\bcurl\b/.test(f.all) && !/^\| Network \|/m.test(recipe)) bad("network", "the code runs curl but RECIPE.md has no Network row");
  if (!/127\.0\.0\.1/.test(recipe) || !/--remote-debugging-port=0/.test(recipe)) bad("network", "RECIPE.md must state the loopback server and the --remote-debugging-port=0 DevTools port");
  const renderCode = ["render.mjs", "lib.mjs", "browser.mjs"].map((n) => f.get(`mods/vault-reader/render/${n}`)).join("\n");
  if (!/--remote-debugging-port=0/.test(renderCode)) bad("network", "the render run no longer opens a DevTools port (--remote-debugging-port=0): update RECIPE.md");
  // The page cannot reach the network: only claimed when the code has the two measures, and then both must be claimed.
  if (/host-resolver-rules=MAP \* ~NOTFOUND , EXCLUDE 127\.0\.0\.1/.test(renderCode) && /--no-proxy-server/.test(renderCode)) {
    if (!has("--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1") || !has("--no-proxy-server")) bad("network", "the browser runs with a host-resolver rule and --no-proxy-server but the Network row does not say so");
  }
  if (/\bPAGE_CSP\b/.test(renderCode) && !/content-security policy/i.test(recipe)) bad("network", "the render page has a content-security policy (PAGE_CSP) that RECIPE.md does not mention");
  if (/-lc\b/.test(f.all) && !/-lc\b/.test(recipe)) bad("shell", "the login-shell lookup uses -lc; RECIPE.md must show the command");
  return out;
}

async function run() {
  const rep = new Report("check-recipe");
  const f = await loadFacts();
  const keys = JSON.parse(readText("keys.json"));
  const modJson = {};
  for (const m of ["vault", "vault-reader"]) modJson[m] = JSON.parse(readText(`mods/${m}/mod.json`));
  const findings = checkRecipe(readText("RECIPE.md").replace(/\r\n/g, "\n"), f, keys, modJson);
  for (const x of findings) rep.error(`[${x.id}] ${x.msg}`);
  if (!findings.length) rep.ok(`RECIPE.md agrees with the code: ${f.programs.length} programs, ${f.sharedKeys.size} shared keys, ${f.commandsRun.size} commands, ${f.callouts.length} callouts, ${f.herdrImports.size + f.gpuiImports.size} API names, ${f.dataFolders.size} data folders`);
  rep.finish();
}

async function selfTest() {
  const rep = new Report("check-recipe --self-test");
  const f = await loadFacts();
  const keys = JSON.parse(readText("keys.json"));
  const modJson = Object.fromEntries(["vault", "vault-reader"].map((m) => [m, JSON.parse(readText(`mods/${m}/mod.json`))]));
  const base = readText("RECIPE.md").replace(/\r\n/g, "\n"); // a CRLF checkout must not change the result
  // Findings of the real RECIPE.md are the baseline (there are none once every role's branch is merged); a seeded
  // fault counts as caught only when it adds a finding the baseline does not have.
  const baseline = checkRecipe(base, f, keys, modJson);
  rep.note(`baseline: ${baseline.length} finding(s) in the real RECIPE.md${baseline.length ? " (node scripts/check-recipe.mjs lists them)" : ""}`);
  const added = (text, facts = f) => checkRecipe(text, facts, keys, modJson).filter((x) => !baseline.some((b) => b.msg === x.msg));
  const cases = [
    ["cmd /c start put back as the Windows opener", (t) => t.replace("`rundll32 url.dll,FileProtocolHandler` on\nWindows", "`cmd /c start` on Windows"), /opener/],
    ["the old \"Open externally\" label", (t) => t.replace('an "Open in Preview" (macOS)', 'an "Open externally" (macOS)'), /Open externally|Open in Preview/],
    ["a wrong button label for Linux and Windows", (t) => t.replace('"Open in the default app"', '"Open in Files"'), /labels/],
    ["\"never through a shell string\" is claimed", (t) => t + "\nArguments are passed as an array, never through a shell string.\n", /shell/],
    ["a program is missing from the Programs paragraph", (t) => t.replace("Poppler `pdftoppm` and `pdfinfo` (PDF pages)", "Poppler (PDF pages)"), /pdftoppm|pdfinfo/],
    ["a limit differs from the code", (t) => t.replaceAll("2000", "1500"), /PER_FOLDER|entries per folder/],
    ["a callout colour differs", (t) => t.replace("warning `#e9973f`", "warning `#e9973e`"), /callouts/],
    ["a shared key is not named", (t) => t.replaceAll("`vault.outside`", "`vault.elsewhere`"), /vault\.outside/],
    ["the profile folder is called chrome/", (t) => t.replace("`chrome-<pid>-<time>-<rand>/`", "`chrome/`"), /chrome/],
    ["the key binding is renamed", (t) => t.replaceAll("`ctrl-shift-m`", "`ctrl-shift-q`"), /keys/],
    ["a herdr function is not listed", (t) => t.replace("`watchFolder`,\n`exec`", "\n`exec`"), /watchFolder/],
    ["a message that no string in the code has", (t) => t.replace("Degraded behaviour,", 'Degraded behaviour (the panel says "Nothing is wrong with this vault at all"),'), /messages/],
    ["the Node gate is 22.4 but RECIPE says 22", (t) => t + "\nNeeds Node.js 22 or newer.\n", /node/, { ...f, reader: { ...f.reader, nodeOk: (v) => /v22\.(?:[4-9]|\d\d)/.test(v) || /v(?:2[3-9]|[3-9]\d)/.test(v) } }],
    ["a note the sample vault does not have", (t) => t.replace("`Other note`", "`Third note`"), /sample/],
    ["the DevTools port sentence is dropped", (t) => t.replaceAll("--remote-debugging-port=0", "--remote-debugging-off"), /network/],
  ];
  for (const [what, mutate, expect, facts] of cases) {
    const text = mutate(base);
    const found = added(text, facts);
    rep.check(text !== base && found.some((x) => expect.test(`${x.id} ${x.msg}`)), `caught: ${what}`, `NOT caught: ${what}${text === base ? " (the mutation changed nothing: update the self-test)" : ""}`);
  }
  rep.finish();
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(path.join(SELF_ROOT, "scripts", "check-recipe.mjs"))) {
  if (process.argv.includes("--self-test")) await selfTest();
  else await run();
}
