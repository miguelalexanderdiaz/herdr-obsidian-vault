// Keeps the suite itself portable (CR-2-5): a Windows CI leg must not fail for harness reasons.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./helpers.mjs";

function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "fixtures") out.push(...files(p)); }
    else if (e.name.endsWith(".mjs") && e.name !== "test-hygiene.test.mjs") out.push(p);
  }
  return out;
}

test("no dynamic import() of a joined filesystem path without pathToFileURL (Windows drive paths throw)", () => {
  const bad = [];
  for (const f of files(path.join(ROOT, "tests"))) {
    fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      // a relative specifier ("./x.mjs", "../x.js") is a URL and fine; path.join(...) / a variable is not
      const m = line.match(/\bimport\(\s*([^)]*)/);
      if (m && !/^["'`]\.{1,2}\//.test(m[1]) && !/pathToFileURL/.test(line)) bad.push(`${path.relative(ROOT, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});

test("tests do not hard-code a POSIX temp directory as a real location", () => {
  const bad = [];
  for (const f of files(path.join(ROOT, "tests"))) {
    fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (/["'`]\/tmp\/(?!.*(fake|nowhere|nonexistent))/.test(line) && /mkdir|writeFileSync|appHome:\s*["']\/tmp/.test(line)) bad.push(`${path.relative(ROOT, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});
