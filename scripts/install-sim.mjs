#!/usr/bin/env node
// Simulates what a Herdr installer does (AGENTS.md of Herdr, "Layouts and mods other people made"), without Herdr:
// copy each mods/<name>/ folder ALONE into a temp Herdr home, then check that the copy stands on its own and that
// keys.json merges without overwriting anything. Node 22, no dependencies, any OS. Never touches the real Herdr home.
//
//   node scripts/install-sim.mjs            run the simulation (exit 1 on a finding)
//   node scripts/install-sim.mjs --self-test  break a temp copy on purpose and expect each break to be caught
//
// With `herdr-app` on PATH, `herdr-app check <abs copy>` is run for each copy too (HERDR_APP_HOME points at the temp home).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SELF_ROOT, ROOT, Report, abs, readText, repoFiles } from "./lib/repo.mjs";

const MODS = ["vault", "vault-reader"];
// Specifiers the Herdr runtime provides to a mod (herdr.d.ts, gpui-kit.d.ts) or that Node provides to render.mjs.
const PROVIDED = /^(?:herdr|gpui-kit|gpui-base|fs\/promises|fs|os|path|http|child_process|url|crypto|zlib|node:[\w/]+)$/;

/** Merge a mod's keys.json into a person's keys, Herdr's documented way: add sections and keys, never overwrite. */
export function mergeKeys(person, incoming) {
  const merged = JSON.parse(JSON.stringify(person));
  const added = [];
  const conflicts = [];
  for (const [section, map] of Object.entries(incoming)) {
    merged[section] ??= {};
    for (const [key, action] of Object.entries(map)) {
      if (!(key in merged[section])) {
        merged[section][key] = action;
        added.push(`${section}/${key}`);
      } else if (merged[section][key] !== action) conflicts.push(`${section}/${key} is already ${merged[section][key]}`);
    }
  }
  return { merged, added, conflicts };
}

/** Import specifiers of a source file: static import/export-from and import("..."). */
export function specifiers(text) {
  const out = [];
  for (const m of text.matchAll(/(?:^|[\n;])\s*(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of text.matchAll(/(?:^|[\n;])\s*import\s*["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

/** Everything that stops the copy in `home`/mods/`name` from standing alone. Returns messages. */
export function checkCopy(home, name) {
  const dir = path.join(home, "mods", name);
  const problems = [];
  const listing = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else listing.push(p);
    }
  };
  walk(dir);
  const inside = (p) => path.relative(dir, p) && !path.relative(dir, p).startsWith("..") && !path.isAbsolute(path.relative(dir, p));
  const others = MODS.filter((m) => m !== name);
  const iconNames = new Set();
  for (const file of listing) {
    const rel = path.relative(dir, file).split(path.sep).join("/");
    if (!/\.(js|mjs)$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    // (1) imports resolve inside the folder, or are provided by the runtime
    for (const s of specifiers(text)) {
      if (s.startsWith(".")) {
        const target = path.resolve(path.dirname(file), s);
        if (!inside(target)) problems.push(`${name}/${rel}: import "${s}" leaves the mod folder`);
        else if (!fs.existsSync(target)) problems.push(`${name}/${rel}: import "${s}" does not exist in the copy`);
      } else if (!PROVIDED.test(s)) problems.push(`${name}/${rel}: import "${s}" is neither a Herdr module nor a Node built-in (a mod has no node_modules)`);
    }
    // (2) no reference to another mod's folder
    const code = text.replace(/^\s*\/\/.*$/gm, "");
    for (const o of others) if (new RegExp(`mods/${o}/|\\.\\./${o}/`).test(code)) problems.push(`${name}/${rel}: refers to the other mod "${o}" (an installer may copy only one)`);
    // (3) static asset paths built from MOD_DIR / ICON(S)
    const dirs = { MOD_DIR: ".", ICON: "icons", ICONS: "icons" };
    for (const m of text.matchAll(/\$\{(MOD_DIR|ICONS?)\}\/([\w./-]+\.(?:svg|png|mjs|js|html|json))/g)) {
      const target = path.join(dir, dirs[m[1]], m[2]);
      if (!fs.existsSync(target)) problems.push(`${name}/${rel}: refers to ${dirs[m[1]] === "." ? "" : dirs[m[1]] + "/"}${m[2]}, which is not in the copy`);
    }
    // dynamic icon names the code builds from tables (vault: ICONS = { kind: "file" }, reader: CALLOUT = { type: ["icon", "#colour"] })
    for (const m of text.matchAll(/\bICONS\s*=\s*\{([^}]*)\}/g)) for (const v of m[1].matchAll(/:\s*"([\w-]+)"/g)) iconNames.add(v[1]);
    for (const m of text.matchAll(/\[\s*"([\w-]+)"\s*,\s*"#[0-9a-fA-F]{3,8}"\s*\]/g)) iconNames.add(m[1]);
    for (const m of text.matchAll(/chevron-(?:down|right)/g)) iconNames.add(m[0]);
    if (/\bfolder\b/.test(text) && /\$\{ICON\}\/\$\{entry\.dir \? "folder"/.test(text)) iconNames.add("folder");
  }
  for (const n of iconNames) {
    if (fs.existsSync(path.join(dir, "icons"))) {
      if (!fs.existsSync(path.join(dir, "icons", `${n}.svg`))) problems.push(`${name}: icon "${n}" is used by a table in the code but icons/${n}.svg is not in the copy`);
    }
  }
  // (4) the render page's script tags
  const page = path.join(dir, "render", "page.html");
  if (fs.existsSync(page)) {
    for (const m of fs.readFileSync(page, "utf8").matchAll(/\bsrc="(\/[^"]+)"/g)) {
      if (m[1].startsWith("/lib/")) continue; // extracted at run time into <Herdr home>/data/vault/lib
      if (!fs.existsSync(path.join(dir, "render", m[1]))) problems.push(`${name}/render/page.html: <script src="${m[1]}"> is not in the copy`);
    }
  }
  // (5) mod.json present and the files Herdr needs
  for (const f of ["main.js", "mod.json"]) if (!fs.existsSync(path.join(dir, f))) problems.push(`${name}: ${f} is missing in the copy`);
  return problems;
}

/** Copy only mods/<name>/ files (as git tracks them) into <home>/mods/<name>/. */
export function installCopies(home, root = ROOT) {
  const files = repoFiles(root);
  for (const name of MODS) {
    for (const f of files.filter((f) => f.startsWith(`mods/${name}/`))) {
      const to = path.join(home, ...f.split("/"));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(root, ...f.split("/")), to);
    }
  }
}

function simulate() {
  const rep = new Report("install-sim");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-home-sim-"));
  try {
    installCopies(home);
    for (const name of MODS) {
      const problems = checkCopy(home, name);
      for (const p of problems) rep.error(p);
      if (!problems.length) rep.ok(`mods/${name} stands alone: imports, assets and render page resolve inside the copy`);
    }
    // keys.json merge, twice: into an empty keys file and into one that already has a different binding
    const incoming = JSON.parse(readText("keys.json"));
    const empty = mergeKeys({}, incoming);
    rep.check(empty.added.length > 0 && !empty.conflicts.length, `keys.json merges into an empty file (${empty.added.join(", ")})`, "keys.json did not merge into an empty keys file");
    const again = mergeKeys(empty.merged, incoming);
    rep.check(!again.added.length && !again.conflicts.length && JSON.stringify(again.merged) === JSON.stringify(empty.merged), "a second merge changes nothing", "a second merge of keys.json is not a no-op");
    const taken = mergeKeys({ global: { "ctrl-shift-m": "something.else" } }, incoming);
    rep.check(taken.conflicts.length === Object.values(incoming).reduce((n, m) => n + Object.keys(m).length, 0) && taken.merged.global["ctrl-shift-m"] === "something.else", "a key the person already uses is reported, never overwritten", "merge overwrote a key the person already uses");
    // Herdr's own checker, when it is installed. It validates the code, not mod.json fields.
    const probe = spawnSync("herdr-app", ["--version"], { encoding: "utf8" });
    if (probe.error || probe.status !== 0) rep.note("herdr-app not on PATH: `herdr-app check` on the copies skipped");
    else {
      for (const name of MODS) {
        const res = spawnSync("herdr-app", ["check", path.join(home, "mods", name)], { encoding: "utf8", env: { ...process.env, HERDR_APP_HOME: home } });
        rep.check(res.status === 0, `herdr-app check passes on the copy of ${name}`, `herdr-app check fails on the copy of ${name}: ${(res.stdout + res.stderr).trim().split("\n")[0]}`);
      }
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
  rep.finish();
}

function selfTest() {
  const rep = new Report("install-sim --self-test");
  const fresh = () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-home-sim-"));
    installCopies(home);
    return home;
  };
  const cases = [
    ["a file a mod needs is deleted", "vault-reader", (h) => fs.rmSync(path.join(h, "mods", "vault-reader", "parse.js")), /parse\.js/],
    ["an icon is deleted", "vault", (h) => fs.rmSync(path.join(h, "mods", "vault", "icons", "plus.svg")), /plus\.svg/],
    ["the render page script is deleted", "vault-reader", (h) => fs.rmSync(path.join(h, "mods", "vault-reader", "render", "page.js")), /page\.js/],
    ["an import reaches the other mod", "vault", (h) => fs.appendFileSync(path.join(h, "mods", "vault", "tree.js"), '\nimport "../vault-reader/parse.js";\n'), /leaves the mod folder|other mod/],
    ["an import needs node_modules", "vault", (h) => fs.appendFileSync(path.join(h, "mods", "vault", "tree.js"), '\nimport "left-pad";\n'), /left-pad/],
  ];
  for (const [what, name, mutate, expect] of cases) {
    const home = fresh();
    try {
      mutate(home);
      const problems = checkCopy(home, name).join("\n");
      rep.check(expect.test(problems), `caught: ${what}`, `NOT caught: ${what}`);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }
  const clean = fresh();
  try {
    rep.check(MODS.every((m) => checkCopy(clean, m).length === 0), "an untouched copy has no findings", "an untouched copy has findings (false positive)");
  } finally {
    fs.rmSync(clean, { recursive: true, force: true });
  }
  rep.finish();
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(path.join(SELF_ROOT, "scripts", "install-sim.mjs"))) {
  if (process.argv.includes("--self-test")) selfTest();
  else simulate();
}
