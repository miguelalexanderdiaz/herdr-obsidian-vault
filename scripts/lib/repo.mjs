// Shared helpers for the repo scripts (check-repo, privacy-scan). Node 22, no dependencies.
// Works the same on macOS, Linux and Windows: no shell, no globbing, UTF-8, forward-slash repo paths.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// `--root <dir>` points every script at another copy of the repo (self-tests mutate a temp copy, never the checkout).
const rootArg = process.argv.indexOf("--root");
export const ROOT = rootArg > 1 && process.argv[rootArg + 1] ? fs.realpathSync(path.resolve(process.argv[rootArg + 1])) : HERE_ROOT;
export const SELF_ROOT = HERE_ROOT;

/** Run git with an argument array (no shell). Returns stdout (Buffer) or null when git fails. */
export function git(args, root = ROOT) {
  const r = spawnSync("git", args, { cwd: root, maxBuffer: 256 * 1024 * 1024 });
  if (r.error || r.status !== 0) return null;
  return r.stdout;
}

/** Repo-relative, forward-slash paths of the files that belong to the repo (tracked, plus untracked and not ignored). */
export function repoFiles(root = ROOT) {
  const out = git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"], root);
  let list;
  if (out) {
    list = out.toString("utf8").split("\0").filter(Boolean);
  } else {
    list = [];
    const skip = new Set([".git", "node_modules"]);
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        if (skip.has(e.name)) continue;
        const rel = dir ? `${dir}/${e.name}` : e.name;
        if (e.isDirectory()) walk(rel);
        else list.push(rel);
      }
    };
    walk("");
  }
  // A path git lists can be a deleted file in a dirty tree: keep only what exists.
  return [...new Set(list)].filter((f) => fs.existsSync(path.join(root, f))).sort();
}

export const abs = (rel, root = ROOT) => path.join(root, ...rel.split("/"));
export const readText = (rel, root = ROOT) => fs.readFileSync(abs(rel, root), "utf8");
export const readBytes = (rel, root = ROOT) => fs.readFileSync(abs(rel, root));
export const exists = (rel, root = ROOT) => fs.existsSync(abs(rel, root));

const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".ico", ".woff", ".woff2", ".zip", ".gz", ".asar"]);
export const isBinaryName = (f) => BINARY_EXT.has(path.extname(f).toLowerCase());

/** Collects findings; prints them; sets process.exitCode. */
export class Report {
  constructor(name) {
    this.name = name;
    this.errors = 0;
    this.warnings = 0;
  }
  error(msg) {
    this.errors++;
    console.log(`  FAIL  ${msg}`);
  }
  warn(msg) {
    this.warnings++;
    console.log(`  warn  ${msg}`);
  }
  ok(msg) {
    console.log(`  ok    ${msg}`);
  }
  note(msg) {
    console.log(`  note  ${msg}`);
  }
  check(cond, okMsg, failMsg) {
    if (cond) this.ok(okMsg);
    else this.error(failMsg ?? okMsg);
    return !!cond;
  }
  finish() {
    console.log(`${this.name}: ${this.errors} error(s), ${this.warnings} warning(s)`);
    if (this.errors) process.exitCode = 1;
    return this.errors === 0;
  }
}

/** PNG width and height from the IHDR chunk, or null. */
export function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Every `run:` command of a GitHub workflow file, one entry per command line: [{ line, cmd }].
 * Handles `run: cmd` and `run: |` blocks. Comments and blank lines are skipped. No YAML library needed.
 */
export function workflowCommands(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const rest = m[2].trim();
    if (rest && !/^[|>][+-]?$/.test(rest)) {
      out.push({ line: i + 1, cmd: rest.replace(/\s+#.*$/, "") });
      continue;
    }
    const indent = m[1].length;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim()) continue;
      if (l.length - l.trimStart().length <= indent) break;
      out.push({ line: j + 1, cmd: l.trim() });
    }
  }
  return out;
}

/** Why a workflow command cannot work, or null. `scripts` is package.json scripts, `has(rel)` tells whether a repo file exists. */
export function badWorkflowCommand(cmd, scripts, has) {
  if (/^(?:if|fi|then|else|printf|echo|\[)\b/.test(cmd) || /^\w+=/.test(cmd)) return null; // shell glue of the word-list step
  if (cmd === "npm test") return scripts.test ? null : "package.json has no `test` script";
  let m = /^npm run ([\w:.-]+)(?:\s|$)/.exec(cmd);
  if (m) return scripts[m[1]] ? null : `package.json has no script "${m[1]}"`;
  if (/^node\s+--test\b/.test(cmd)) return "`node --test <dir>` reads a bare folder as a module on Node 22 and fails; use `npm test`";
  m = /^node\s+(scripts\/[\w./-]+\.mjs)(?:\s|$)/.exec(cmd);
  if (m) return has(m[1]) ? null : `${m[1]} does not exist`;
  return "only `npm test`, `npm run <script>` and `node scripts/<file>.mjs` are allowed in the template";
}
