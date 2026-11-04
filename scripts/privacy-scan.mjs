#!/usr/bin/env node
// Privacy and portability scan over the files that belong to the repo (git ls-files, plus untracked and not
// ignored) and over the commit messages. Node 22, no dependencies, same result on every OS.
//
//   node scripts/privacy-scan.mjs              scan the repo; exit 1 on a finding
//   node scripts/privacy-scan.mjs --root DIR   scan another folder (a temp copy, for example)
//   node scripts/privacy-scan.mjs --self-test  feed known-bad and known-good strings through the rules
//
// What it fails on: home paths of a person (macOS, Linux, Windows), e-mail addresses, private host names,
// the current OS user name, extra words from a local untracked list, personal metadata in PNG/JPEG/PDF
// files, and (rule D3) OS-specific literals in mods/ outside a file named platform.js.
//
// Local word list (never committed): scripts/.privacy-words, or the file named by HERDR_PRIVACY_WORDS.
// One word or phrase per line, # for comments. Put real names, employers and project names there.
//
// Findings print as file:line and a masked match, never the full secret.
import os from "node:os";
import { ROOT, Report, abs, exists, git, isBinaryName, readBytes, readText, repoFiles } from "./lib/repo.mjs";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

// plans/ (agent plans, audits, logs, board copies) is scanned too, because it is tracked and would be published with
// the repo (PLAN D4). There the author-name rule and rule D3 are off (the logs discuss both), and a line that carries
// the marker below is skipped, so a plan can quote a pattern. Write examples with a placeholder (`~`, `<home>`,
// `/Users/x`) instead of a real path wherever possible.
const PLANS = "plans/";
const EXAMPLE_MARK = "privacy-scan: example";
// The scanner and its tests mention patterns in regexes; they are built so they do not match themselves,
// but keep them out of the word-list pass anyway.
const SELF = new Set(["scripts/privacy-scan.mjs"]);

const GENERIC = new Set(["user", "username", "you", "your", "yourname", "name", "me", "runner", "example", "foo", "bar", "x", "alice", "bob", "ubuntu", "someone", "shared", "home", "person"]);
// A name that ends a sentence ("/home/x.") must not count the full stop as part of the name.
const nameOf = (s) => s.replace(/[._-]+$/, "").toLowerCase();
const mask = (s) => (s.length <= 3 ? "***" : `${s.slice(0, 2)}***${s.slice(-1)}`);

const RULES = [
  {
    id: "mac-home",
    re: /\/Users\/([A-Za-z0-9._-]+)/g,
    bad: (m) => !GENERIC.has(nameOf(m[1])),
    msg: "macOS home path (write ~ or <home>)",
  },
  {
    id: "linux-home",
    re: /\/home\/([A-Za-z0-9._-]+)/g,
    bad: (m) => !GENERIC.has(nameOf(m[1])),
    msg: "Linux home path (write ~ or <home>)",
  },
  {
    id: "windows-home",
    re: /[A-Za-z]:[\\/]+Users[\\/]+([A-Za-z0-9._-]+)/g,
    bad: (m) => !GENERIC.has(nameOf(m[1])) && !/^(public|default)$/i.test(nameOf(m[1])),
    msg: "Windows home path (write ~ or <home>)",
  },
  {
    id: "email",
    re: /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g,
    bad: (m) => {
      const domain = m[1].toLowerCase();
      if (domain === "anthropic.com" && /^noreply@/i.test(m[0])) return false;
      if (domain === "users.noreply.github.com") return false;
      if (/^example\.(com|org|net)$/.test(domain)) return false;
      return true;
    },
    msg: "e-mail address",
  },
  {
    id: "private-host",
    re: /\b([a-z0-9-]+)\.(?:local|lan|home\.arpa)\b(?![.\w-])/gi,
    bad: () => true,
    msg: "private host name",
  },
];

// Rule D3 (PLAN): every OS-specific literal lives in one platform.js per mod.
const D3_RE = /\/Applications\b|\/opt\/homebrew|Library\/Application Support|\bstat -f\b|\bqlmanage\b|\bsips\b/g;
const D3_FILE = /^mods\/.+\.(js|mjs|html)$/;
const D3_ALLOWED = /(^|\/)platform\.js$/;

/** Words that must never appear: OS user name, git user name (allowed in LICENSE/NOTICE), local list. */
function personalWords() {
  const words = new Set();
  const add = (w) => {
    const t = (w ?? "").trim();
    if (t.length >= 4 && !GENERIC.has(t.toLowerCase())) words.add(t);
  };
  try {
    const u = os.userInfo().username;
    if (!/^(root|admin|administrator|runneradmin|vsts|ubuntu|builder|build|ci|node|user)$/i.test(u)) add(u);
  } catch {}
  const listFiles = [abs("scripts/.privacy-words", ROOT), process.env.HERDR_PRIVACY_WORDS].filter(Boolean);
  for (const f of listFiles) {
    try {
      for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
        if (line.trim() && !line.trim().startsWith("#")) add(line);
      }
    } catch {}
  }
  const nameOut = git(["config", "user.name"]);
  const gitName = nameOut ? nameOut.toString("utf8").trim() : "";
  return { words: [...words], gitName };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Scan one text. Returns [{line, rule, msg, sample}]. d3 is "off" | "warn" | "error". */
export function scanText(rel, text, { words = [], gitName = "", d3 = "off" } = {}) {
  const out = [];
  const lines = text.split(/\r?\n/);
  const inPlans = rel.startsWith(PLANS);
  if (inPlans) {
    gitName = "";
    d3 = "off";
  }
  const nameAllowed = rel === "LICENSE" || rel === "NOTICE";
  const wordRes = words.map((w) => new RegExp(`(^|[^A-Za-z0-9])${escapeRe(w)}(?![A-Za-z0-9])`, "i"));
  const nameRe = gitName && !nameAllowed ? new RegExp(escapeRe(gitName), "i") : null;
  lines.forEach((line, i) => {
    if (inPlans && line.includes(EXAMPLE_MARK)) return;
    for (const rule of RULES) {
      for (const m of line.matchAll(rule.re)) {
        if (rule.bad(m)) out.push({ line: i + 1, rule: rule.id, msg: rule.msg, sample: mask(m[0]) });
      }
    }
    wordRes.forEach((re, k) => {
      if (re.test(line)) out.push({ line: i + 1, rule: "personal-word", msg: "a word from your private list or your OS user name", sample: mask(words[k]) });
    });
    if (nameRe?.test(line)) out.push({ line: i + 1, rule: "author-name", msg: "the author's name outside LICENSE and NOTICE", sample: mask(gitName) });
    if (d3 !== "off" && D3_FILE.test(rel) && !D3_ALLOWED.test(rel)) {
      for (const m of line.matchAll(D3_RE)) {
        out.push({ line: i + 1, rule: "d3-os-literal", level: d3, msg: "OS-specific literal outside platform.js (rule D3)", sample: m[0] });
      }
    }
  });
  return out;
}

/** Personal metadata inside binary files. Returns [{rule,msg}]. */
export function scanBinary(rel, buf) {
  const out = [];
  const ext = rel.slice(rel.lastIndexOf(".")).toLowerCase();
  const latin = buf.toString("latin1");
  const personal = /\/Users\/|\/home\/|[A-Za-z]:\\Users\\|@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;
  if (ext === ".png") {
    for (const m of latin.matchAll(/(tEXt|iTXt|zTXt)([\x20-\x7e]{1,40})\0/g)) {
      const key = m[2];
      if (/^(Author|Copyright|Creation Time|Comment|Description|Source|Software|Title|Warning|Disclaimer)/i.test(key)) {
        out.push({ rule: "png-metadata", msg: `PNG text chunk "${key.slice(0, 20)}": strip metadata` });
      }
    }
    if (latin.includes("eXIf")) out.push({ rule: "png-metadata", msg: "PNG has an EXIF chunk: strip metadata" });
  } else if (ext === ".jpg" || ext === ".jpeg") {
    if (latin.includes("Exif\0\0")) out.push({ rule: "jpeg-metadata", msg: "JPEG has EXIF data (may carry GPS, device, time): strip metadata" });
  } else if (ext === ".pdf") {
    for (const key of ["Author", "Creator", "Producer", "Title", "Subject", "Keywords"]) {
      const m = new RegExp(`/${key}\\s*\\(((?:[^()\\\\]|\\\\.)*)\\)`).exec(latin);
      if (!m) continue;
      const v = m[1].trim();
      if (key === "Author" && v) out.push({ rule: "pdf-metadata", msg: "PDF /Author is set: strip metadata" });
      else if (personal.test(v) || /(macOS|Windows|Mac OS X) (Version )?[\d.]+|Build \w+/i.test(v)) out.push({ rule: "pdf-metadata", msg: `PDF /${key} names a machine or a path: strip metadata` });
    }
    if (/<x:xmpmeta/.test(latin) && /<dc:creator>|<xmp:CreatorTool>/.test(latin)) out.push({ rule: "pdf-metadata", msg: "PDF has XMP creator metadata: check it" });
  }
  return out;
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function d3Mode(root) {
  // Enabled as an error as soon as both mods have their platform.js (PLAN R1-HC-4); a warning before.
  const both = exists("mods/vault/platform.js", root) && exists("mods/vault-reader/platform.js", root);
  return both ? "error" : "warn";
}

function selfTest() {
  const rep = new Report("privacy-scan --self-test");
  const U = "/Us" + "ers/"; // built in pieces so this file does not contain a real-looking path
  const H = "/ho" + "me/";
  const W = "C:" + "\\Us" + "ers\\";
  const bad = [
    [`open ${U}jane/notes`, "mac-home"],
    [`cd ${H}jane/projects`, "linux-home"],
    [`${W}Jane\\Documents`, "windows-home"],
    ["contact jane" + "@" + "acme.io", "email"],
    ["ssh dev-box.lo" + "cal", "private-host"],
  ];
  for (const [text, rule] of bad) {
    const hits = scanText("x.md", text).filter((h) => h.rule === rule);
    rep.check(hits.length === 1, `flags ${rule}`, `did not flag ${rule}: ${text}`);
  }
  const good = [
    `${U}x/file`, `${H}user/file`, `see ${H}x.`, `${U}x, ${U}you.`, "~/code/thing", "<home>/data", "noreply" + "@anthropic.com", "12345+bot" + "@users.noreply.github.com",
    "settings.local.json", "name" + "@example.com", "see https://herdr.dev/mods",
  ];
  for (const text of good) rep.check(scanText("x.md", text).length === 0, `accepts: ${text.slice(0, 40)}`, `false positive: ${text}`);
  // plans/: a real-looking path is flagged, the documented placeholders and the example marker are not
  rep.check(scanText("plans/round-2/a.md", `see ${U}jane/notes`).length === 1, "flags a home path inside plans/", "plans/ must be scanned for home paths");
  rep.check(scanText("plans/round-2/a.md", `see ${U}x/notes and ${H}user/x and <home>/y and ~/z`).length === 0, "plans/ accepts the documented placeholders", "plans/ placeholders flagged");
  rep.check(scanText("plans/round-2/a.md", `quoted: ${U}jane/notes  <!-- privacy-scan: example -->`).length === 0, "plans/ accepts a line with the example marker", "example marker ignored");
  rep.check(scanText("plans/round-2/a.md", "by Jane Doe", { gitName: "Jane Doe" }).length === 0, "the author-name rule is off in plans/", "author-name rule must be off in plans/");
  rep.check(scanText("plans/round-2/a.md", "contact jane" + "@acme.io").length === 1, "flags an e-mail inside plans/", "plans/ must be scanned for e-mail addresses");
  const words = scanText("x.md", "my employer is Acme Corp", { words: ["Acme Corp"] });
  rep.check(words.length === 1 && words[0].rule === "personal-word", "flags a word from the private list", "private word list rule broken");
  rep.check(scanText("LICENSE", "Copyright 2026 Jane Doe", { gitName: "Jane Doe" }).length === 0, "author name allowed in LICENSE", "author name should be allowed in LICENSE");
  rep.check(scanText("README.md", "by Jane Doe", { gitName: "Jane Doe" }).length === 1, "author name flagged elsewhere", "author name should be flagged outside LICENSE/NOTICE");
  rep.check(scanText("mods/a/main.js", 'x = "/Applica' + 'tions/Foo"', { d3: "error" }).length === 1, "D3 flags OS literal outside platform.js", "D3 rule broken");
  rep.check(scanText("mods/a/platform.js", 'x = "/Applica' + 'tions/Foo"', { d3: "error" }).length === 0, "D3 allows platform.js", "D3 must allow platform.js");
  const pdf = Buffer.from(`%PDF-1.4\n<< /Producer (mac` + `OS Version 26.1 \\(Build 25A\\) Quartz) /Author (Jane) >>`, "latin1");
  rep.check(scanBinary("a.pdf", pdf).length === 2, "flags PDF author and OS producer", "PDF metadata rule broken");
  rep.check(scanBinary("a.pdf", Buffer.from("%PDF-1.4\n<< /Producer (Sample vault) >>", "latin1")).length === 0, "accepts a clean PDF", "clean PDF flagged");
  rep.finish();
}

function main() {
  if (args.includes("--self-test")) return selfTest();
  const root = argValue("--root") ? fs.realpathSync(argValue("--root")) : ROOT;
  const rep = new Report("privacy-scan");
  const { words, gitName } = personalWords();
  const d3 = d3Mode(root);
  const files = repoFiles(root);
  let scanned = 0;
  let binaries = 0;
  for (const f of files) {
    if (SELF.has(f)) continue;
    const buf = readBytes(f, root);
    if (isBinaryName(f) || looksBinary(buf)) {
      binaries++;
      for (const h of scanBinary(f, buf)) rep.error(`${f}: ${h.msg}`);
      continue;
    }
    scanned++;
    for (const h of scanText(f, buf.toString("utf8"), { words, gitName, d3 })) {
      const line = `${f}:${h.line}: ${h.msg} [${h.sample}]`;
      if (h.level === "warn") rep.warn(line);
      else rep.error(line);
    }
  }
  rep.ok(`${scanned} text file(s) and ${binaries} binary file(s) scanned${words.length ? ` with ${words.length} private word(s)` : ""}`);
  if (!words.length) rep.note("no private word list found (scripts/.privacy-words); only the generic rules ran");
  if (d3 === "warn") rep.note("rule D3 reports as warnings until both mods have a platform.js");

  // Commit messages on the current branch.
  const log = git(["log", "--format=%H%x00%B%x01"], root);
  if (log) {
    let n = 0;
    for (const entry of log.toString("utf8").split("\x01")) {
      const [sha, body] = entry.trim().split("\0");
      if (!sha || body === undefined) continue;
      n++;
      for (const h of scanText("commit", body, { words, gitName: "" })) rep.error(`commit ${sha.slice(0, 8)}:${h.line}: ${h.msg} [${h.sample}]`);
    }
    rep.ok(`${n} commit message(s) scanned`);
  }
  rep.finish();
}

// Run only when executed directly (the test above may import scanText).
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
