#!/usr/bin/env node
// Copies scripts/ci.workflow.yml to .github/workflows/ci.yml (without the header comment that explains why the file
// lives in scripts/). Author step in scripts/PUBLISH.md: pushing the result needs a GitHub token with the `workflow`
// scope (`gh auth refresh -s workflow`), which unattended agent runs do not have, so agents never run this.
//
//   node scripts/install-ci.mjs          write the file; refuses to overwrite a different one
//   node scripts/install-ci.mjs --check  only say whether the installed file is up to date (exit 1 when not)
import fs from "node:fs";
import path from "node:path";
import { ROOT, abs } from "./lib/repo.mjs";

const template = abs("scripts/ci.workflow.yml");
const target = abs(".github/workflows/ci.yml");
const lines = fs.readFileSync(template, "utf8").split(/\r?\n/);
const start = lines.findIndex((l) => /^name:/.test(l));
if (start < 0) {
  console.error("scripts/ci.workflow.yml has no `name:` line");
  process.exit(1);
}
const body = lines.slice(start).join("\n").replace(/\n*$/, "\n");

const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") : null;
if (process.argv.includes("--check")) {
  const ok = current === body;
  console.log(ok ? ".github/workflows/ci.yml is up to date" : current === null ? ".github/workflows/ci.yml is not installed" : ".github/workflows/ci.yml differs from the template");
  process.exit(ok ? 0 : 1);
}
if (current === body) {
  console.log(".github/workflows/ci.yml is already up to date");
} else if (current !== null) {
  console.error(".github/workflows/ci.yml exists and differs from the template: review it, then delete it and run this again");
  process.exit(1);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  console.log(`wrote .github/workflows/ci.yml in ${ROOT === abs("") ? "this repo" : "the given root"}`);
  console.log("next: gh auth refresh -s workflow, then commit and push it (scripts/PUBLISH.md)");
}
