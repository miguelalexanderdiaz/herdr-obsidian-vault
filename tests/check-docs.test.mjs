// Seeded-fault tests for scripts/check-docs.mjs: a checker that cannot fail proves nothing.
// Each test copies the documentation, the code it is checked against and the checker into a temp folder,
// breaks one thing, and expects exit code 1 with a message that names it. The copy of the CI template is
// replaced by a known-good one, because that file belongs to another part of the repository and has its own
// tests; the CI-template check of check-docs is exercised below with its own seeded fault.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOOD_CI = `name: CI
on: [push]
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
      - run: node scripts/check-docs.mjs
`;

let base;
before(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "check-docs-base-"));
  const keep = ["README.md", "AGENTS.md", "CONTRIBUTING.md", "CHANGELOG.md", "RECIPE.md", "LICENSE", "NOTICE", "llms.txt", "keys.json", "package.json", "docs", "mods", "examples",
    "scripts/check-docs.mjs", "scripts/build-llms-full.mjs", "scripts/doc-claims.json", "scripts/PUBLISH.md", "scripts/PREVIEW.md", "scripts/check-repo.mjs", "scripts/privacy-scan.mjs", "scripts/syntax-check.mjs"];
  for (const k of keep) {
    const from = path.join(repo, k);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(path.dirname(path.join(base, k)), { recursive: true });
    fs.cpSync(from, path.join(base, k), { recursive: true });
  }
  fs.writeFileSync(path.join(base, "scripts", "ci.workflow.yml"), GOOD_CI);
});
after(() => { if (base) fs.rmSync(base, { recursive: true, force: true }); });

function copy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-docs-case-"));
  fs.cpSync(base, dir, { recursive: true });
  return dir;
}
const run = (root, ...args) => spawnSync(process.execPath, [path.join(root, "scripts", "check-docs.mjs"), "--root", root, ...args], { encoding: "utf8" });
const edit = (root, file, fn) => {
  const p = path.join(root, file);
  const before = fs.readFileSync(p, "utf8");
  const after = fn(before);
  assert.notEqual(after, before, `the seeded edit changed nothing in ${file}`);
  fs.writeFileSync(p, after);
};
const rebuildFull = (root) => spawnSync(process.execPath, [path.join(root, "scripts", "build-llms-full.mjs"), "--root", root], { encoding: "utf8" });
// Runs one seeded case, always cleans up, returns the process result.
function seeded(mutate, ...args) {
  const root = copy();
  try { mutate(root); return run(root, ...args); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const expectFail = (r, needle) => {
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}${r.stderr}`);
  assert.ok(r.stderr.includes(needle), `expected "${needle}" in:\n${r.stderr}`);
};

test("the unmodified copy passes", () => {
  const r = run(base);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /check-docs: ok/);
});

test("a reworded message in the code fails (message no longer a string literal)", () => {
  const r = seeded((root) => edit(root, "mods/vault/main.js", (s) => s.replaceAll("Not an Obsidian vault", "Not a vault of Obsidian")));
  expectFail(r, "Not an Obsidian vault");
});

test("a message that exists only in a comment does not count", () => {
  const r = seeded((root) => {
    edit(root, "docs/troubleshooting.html", (s) => s.replace("<h2 id=\"reader\">", "<h3 id=\"x-comment\"><code class=\"msg\">Only mentioned in a comment</code></h3>\n<h2 id=\"reader\">"));
    edit(root, "mods/vault/main.js", (s) => "// Only mentioned in a comment\n" + s);
    rebuildFull(root);
  });
  expectFail(r, "Only mentioned in a comment");
});

test("a short quote must be a whole literal, not part of a longer one", () => {
  const r = seeded((root) => {
    edit(root, "docs/troubleshooting.html", (s) => s.replace("<h2 id=\"reader\">", "<h3 id=\"x-short\"><code class=\"msg\">No fi</code></h3>\n<h2 id=\"reader\">"));
    rebuildFull(root);
  });
  expectFail(r, "No fi");
});

test("a changed constant fails the claims table", () => {
  const r = seeded((root) => edit(root, "mods/vault/main.js", (s) => s.replace(/PER_FOLDER = 2000/, "PER_FOLDER = 2001")));
  expectFail(r, "claim per-folder");
});

test("a constant that is only in a comment does not satisfy a claim", () => {
  const r = seeded((root) => edit(root, "mods/vault/main.js", (s) => s.replace(/const PER_FOLDER = 2000;/, "const PER_FOLDER = 1999; // was PER_FOLDER = 2000")));
  expectFail(r, "claim per-folder");
});

test("a documented number off by one fails the claims table", () => {
  const r = seeded((root) => {
    edit(root, "docs/configuration.html", (s) => s.replace(/(<code>PER_FOLDER<\/code><\/th><td><code>mods\/vault\/main\.js<\/code><\/td><td>)2000/, "$12001"));
    rebuildFull(root);
  });
  expectFail(r, "claim per-folder");
});

test("a reworded support-level sentence fails", () => {
  const r = seeded((root) => {
    edit(root, "llms.txt", (s) => s.replace("covered by fake-platform unit tests", "covered by tests"));
    fs.copyFileSync(path.join(root, "llms.txt"), path.join(root, "docs", "llms.txt"));
  });
  expectFail(r, "support-level sentence");
});

test("an unconditional support claim fails", () => {
  const r = seeded((root) => {
    edit(root, "docs/usage.html", (s) => s.replace("<h1>Usage</h1>", "<h1>Usage</h1>\n<p>It runs on macOS, Linux and Windows.</p>"));
    rebuildFull(root);
  });
  expectFail(r, "unconditional support claim");
});

test("a CI template that runs `node --test tests/` fails", () => {
  const r = seeded((root) => fs.writeFileSync(path.join(root, "scripts", "ci.workflow.yml"), GOOD_CI.replace("npm test", "node --test tests/")));
  expectFail(r, "node --test tests/");
});

test("a CI template that runs a script that does not exist fails", () => {
  const r = seeded((root) => fs.appendFileSync(path.join(root, "scripts", "ci.workflow.yml"), "      - run: node scripts/not-there.mjs\n"));
  expectFail(r, "not-there.mjs");
});

test("a stale docs/llms-full.txt fails", () => {
  const r = seeded((root) => edit(root, "README.md", (s) => s + "\nOne more sentence that the full text does not have yet.\n"));
  expectFail(r, "llms-full.txt");
});

test("a verify step that names a file the sample vault does not have fails", () => {
  const r = seeded((root) => {
    edit(root, "docs/verify.html", (s) => s.replace(/<code class="sv">Board\.canvas<\/code>/, '<code class="sv">Gone.canvas</code>'));
    rebuildFull(root);
  });
  expectFail(r, "Gone.canvas");
});

test("a link to a missing anchor fails", () => {
  const r = seeded((root) => {
    edit(root, "docs/index.html", (s) => s.replace('href="requirements.html#matrix"', 'href="requirements.html#no-such-anchor"'));
    rebuildFull(root);
  });
  expectFail(r, "anchor not found");
});

test("--release lists every open publish-time item and fails; the plain run does not", () => {
  const root = copy();
  try {
    assert.equal(run(root).status, 0);
    const r = run(root, "--release");
    assert.equal(r.status, 1);
    for (const needle of ["open mark: preview", "open mark: ci", "<owner> placeholder", "still has to install"]) {
      assert.ok(r.stderr.includes(needle), `release output lacks "${needle}":\n${r.stderr}`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("--release passes once the marks and placeholders are resolved", () => {
  const root = copy();
  try {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const files = ["README.md", "AGENTS.md", "CONTRIBUTING.md", "CHANGELOG.md", "llms.txt", ...walk(path.join(root, "docs")).map((f) => path.relative(root, f))];
    for (const f of files) {
      if (!/\.(md|html|txt)$/.test(f)) continue;
      const p = path.join(root, f);
      let s = fs.readFileSync(p, "utf8");
      s = s.replace(/<!--\s*publish:[\s\S]*?-->/g, "").replaceAll("<owner>", "someone").replaceAll("&lt;owner&gt;", "someone")
        .replace(/not published yet/gi, "published").replace(/still has to install/gi, "has installed");
      fs.writeFileSync(p, s);
    }
    rebuildFull(root);
    const r = run(root, "--release");
    // Rewording the CI sentence also trips the plain checks only if it breaks a rule; here it must not.
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
