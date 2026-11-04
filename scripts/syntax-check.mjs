#!/usr/bin/env node
// `node --check` over every .js and .mjs file of the repo, without shell globbing (works on Windows).
// Files with import/export are checked as ES modules or scripts according to how Herdr loads them
// (mods are ES modules; render/page.js, excalidraw.js and lzstring.js are plain browser scripts).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Report, readText, repoFiles } from "./lib/repo.mjs";

const rep = new Report("syntax-check");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "syntax-"));
let n = 0;
try {
  for (const f of repoFiles().filter((f) => /\.(js|mjs)$/.test(f))) {
    const text = readText(f);
    const isModule = f.endsWith(".mjs") || /^\s*(import|export)\s/m.test(text);
    // node --check decides module vs script from the extension; copy to a temp file with the right one.
    const copy = path.join(tmp, `${n++}${isModule ? ".mjs" : ".cjs"}`);
    fs.writeFileSync(copy, text);
    const res = spawnSync(process.execPath, ["--check", copy], { encoding: "utf8" });
    if (res.status !== 0) rep.error(`${f}: ${(res.stderr || "").split("\n").slice(0, 4).join(" | ")}`);
  }
  rep.ok(`${n} JavaScript file(s) parsed`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
rep.finish();
