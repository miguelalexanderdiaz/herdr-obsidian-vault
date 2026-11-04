#!/usr/bin/env node
// Type-checks the mods against Herdr's own declaration files (herdr.d.ts, gpui-kit.d.ts), the way Herdr's generated
// jsconfig.json does for one mod. LOCAL ONLY: it needs TypeScript (`tsc` on PATH, ./node_modules/.bin/tsc or $TSC) and
// Herdr's two .d.ts files (in the Herdr home: $HERDR_APP_HOME, else the home `herdr-app --help` prints, else
// ~/.config/herdr-app). Without either it prints "skipped: <reason>" and exits 0, so it never blocks CI or a machine
// that has no Herdr. The declaration files are Herdr's own and are never copied into the repo.
//
//   node scripts/typecheck.mjs            check mods/**/*.js (not render/, which runs in Node and a browser)
//   node scripts/typecheck.mjs --warn     print the diagnostics but exit 0
//   node scripts/typecheck.mjs --self-test  run the config and parsing logic against a fake tsc
//
// Not run by CI. Findings go to the code-review role (the mods are theirs).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, SELF_ROOT, abs, repoFiles } from "./lib/repo.mjs";

const expandHome = (p) => (p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p);

/** The Herdr home: $HERDR_APP_HOME, the "Home:" line of `herdr-app --help`, else ~/.config/herdr-app. */
export function herdrHome(env = process.env, run = spawnSync) {
  if (env.HERDR_APP_HOME) return path.resolve(expandHome(env.HERDR_APP_HOME));
  const res = run("herdr-app", ["--help"], { encoding: "utf8" });
  const m = /^Home:\s*(.+?)\s*(?:\(|$)/m.exec(`${res?.stdout ?? ""}`);
  return path.resolve(expandHome(m ? m[1] : "~/.config/herdr-app"));
}

/** A tsc we can run: $TSC, ./node_modules/.bin/tsc, or `tsc` on PATH. → [cmd, args] | null */
export function findTsc(env = process.env, root = ROOT, run = spawnSync) {
  const local = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
  const candidates = [env.TSC, fs.existsSync(local) ? local : null, "tsc"].filter(Boolean);
  for (const c of candidates) {
    const isScript = /\.(?:m?js|cjs)$/.test(c);
    const [cmd, args] = isScript ? [process.execPath, [c]] : [c, []];
    const res = run(cmd, [...args, "--version"], { encoding: "utf8", shell: process.platform === "win32" && !isScript });
    if (!res.error && res.status === 0) return [cmd, args];
  }
  return null;
}

/** The tsconfig used for the check, as an object (paths absolute, forward slashes). */
export function makeConfig(home, files) {
  const fwd = (p) => p.split(path.sep).join("/");
  return {
    compilerOptions: {
      target: "ES2022", module: "ES2022", moduleResolution: "bundler", lib: ["ES2022"],
      allowJs: true, checkJs: true, noEmit: true, strict: true, strictNullChecks: false, skipLibCheck: true,
      types: [], baseUrl: ".", paths: { herdr: [fwd(path.join(home, "herdr.d.ts"))] },
    },
    files: [fwd(path.join(home, "gpui-kit.d.ts")), fwd(path.join(home, "herdr.d.ts")), ...files],
  };
}

/** tsc's `file(line,col): error TSnnnn: message` lines → [{ file, line, code, msg }]. */
export function parseDiagnostics(out) {
  const res = [];
  for (const l of String(out).split(/\r?\n/)) {
    const m = /^(.+?)\((\d+),\d+\):\s+error\s+(TS\d+):\s+(.*)$/.exec(l.trim());
    if (m) res.push({ file: m[1], line: Number(m[2]), code: m[3], msg: m[4] });
  }
  return res;
}

function main() {
  const warnOnly = process.argv.includes("--warn");
  const skip = (why) => {
    console.log(`typecheck: skipped: ${why}`);
    process.exit(0);
  };
  const home = herdrHome();
  for (const f of ["herdr.d.ts", "gpui-kit.d.ts"]) {
    if (!fs.existsSync(path.join(home, f))) skip(`Herdr's ${f} was not found in the Herdr home (set HERDR_APP_HOME)`);
  }
  const tsc = findTsc();
  if (!tsc) skip("TypeScript's tsc was not found (install it, or set TSC to its path)");
  const files = repoFiles().filter((f) => /^mods\/.+\.js$/.test(f) && !f.includes("/render/")).map((f) => abs(f));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "typecheck-"));
  try {
    const config = path.join(dir, "tsconfig.json");
    fs.writeFileSync(config, JSON.stringify(makeConfig(home, files.map((f) => f.split(path.sep).join("/"))), null, 2));
    const res = spawnSync(tsc[0], [...tsc[1], "-p", config, "--pretty", "false"], { encoding: "utf8", cwd: dir, shell: process.platform === "win32" && !/node/i.test(path.basename(tsc[0])) });
    const diags = parseDiagnostics(`${res.stdout}\n${res.stderr}`);
    const mine = diags.filter((d) => !/(?:herdr|gpui-kit)\.d\.ts$/.test(d.file));
    for (const d of mine) console.log(`  ${path.relative(ROOT, d.file).split(path.sep).join("/")}:${d.line} ${d.code} ${d.msg}`);
    const own = diags.length - mine.length;
    console.log(`typecheck: ${mine.length} problem(s) in ${files.length} mod file(s)${own ? `, ${own} inside Herdr's own declaration files (not counted)` : ""}`);
    process.exitCode = mine.length && !warnOnly ? 1 : 0;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function selfTest() {
  let bad = 0;
  const check = (c, m) => { console.log(`  ${c ? "ok  " : "FAIL"}  ${m}`); if (!c) bad++; };
  const cfg = makeConfig(path.join(os.tmpdir(), "h"), ["/x/a.js"]);
  check(cfg.compilerOptions.checkJs && cfg.compilerOptions.strictNullChecks === false, "config checks JS with Herdr's own strictNullChecks setting");
  check(cfg.files.length === 3 && cfg.files[2] === "/x/a.js" && !cfg.files.some((f) => f.includes("\\")), "config lists both d.ts files and the mod files with forward slashes");
  const d = parseDiagnostics("mods/a.js(12,5): error TS2339: Property 'x' does not exist on type 'Y'.\nnoise\nC:/r/b.js(3,1): error TS7006: Parameter implicitly has an 'any' type.");
  check(d.length === 2 && d[0].line === 12 && d[1].code === "TS7006", "tsc output is parsed, including a Windows drive path");
  check(herdrHome({ HERDR_APP_HOME: "/tmp/hh" }) === path.resolve("/tmp/hh"), "HERDR_APP_HOME wins");
  check(findTsc({ TSC: path.join(os.tmpdir(), "no-such-tsc.js") }, path.join(os.tmpdir(), "no-root"), () => ({ error: new Error("nope") })) === null, "no tsc found gives null (the script then skips)");
  const out = spawnSync(process.execPath, [path.join(SELF_ROOT, "scripts", "typecheck.mjs")], { encoding: "utf8", env: { ...process.env, HERDR_APP_HOME: path.join(os.tmpdir(), "no-herdr-home-here") } });
  check(out.status === 0 && /typecheck: skipped:/.test(out.stdout), "a missing Herdr home prints \"skipped\" and exits 0");
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(path.join(SELF_ROOT, "scripts", "typecheck.mjs"))) {
  if (process.argv.includes("--self-test")) selfTest();
  else main();
}
