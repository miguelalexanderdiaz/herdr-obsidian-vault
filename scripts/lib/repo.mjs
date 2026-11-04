// Shared helpers for the repo scripts (check-repo, privacy-scan). Node 22, no dependencies.
// Works the same on macOS, Linux and Windows: no shell, no globbing, UTF-8, forward-slash repo paths.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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
