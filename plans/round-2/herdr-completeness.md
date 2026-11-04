# Round 2 audit: herdr-completeness

Base: `feat/round-1-portable-release` at 5f96349 (`git pull` of the branch was already up to date). Read: every file I own
(RECIPE.md, keys.json, both mod.json, LICENSE, NOTICE, .gitignore, .gitattributes, scripts/**), the code those files make
claims about (platform.js x2, main.js x2, assets-core.js, render/lib.mjs and render.mjs, tests), `plans/round-1/*`, the board,
Herdr's AGENTS.md sections "Layouts and mods other people made", Keys and Mods, `herdr-app commands`, and the official
`herdrdev/herdr-layout-examples` repo (its `tmux-prefix` mod is the closest reference: `RECIPE.md`, `preview.png`, `keys.json`,
`mods/<name>/{main.js,mod.json}`).

## Summary

What holds: Apache-2.0 LICENSE with the copyright line; NOTICE covers Lucide, lz-string, the Obsidian trademark and the
run-time use of Mermaid/MathJax; no Obsidian logo bytes in the tree; `herdr-app check` passes on both mods; `check-repo`,
`privacy-scan` (0 findings), `syntax-check` and `check-docs` are green locally; keys.json avoids `cmd-`, plain ctrl+letter
and Herdr's default chords; folder layout matches the official shape (root RECIPE.md, preview.png, `mods/<name>/`, keys.json).

What does not hold, in order of impact:
1. The CI template that is the only CI we have **fails on every OS** (`node --test tests/`), a fix both other roles asked for
   in round 1 and nobody applied. Once installed it would be red on its first run.
2. RECIPE.md still states things the code contradicts (Windows opener, a button label, "never a shell string", the profile
   folder) and its disclosure of what the mods run is incomplete (`sh -c`, `stat`, `powershell`, `where`, a DevTools port).
   Herdr installers rely on that disclosure.
3. At least one test cannot run on Windows (`import()` of a raw drive path), so the "runs on all three OS" claim in RECIPE
   "Done when" is not backed by anything; no Windows or Linux job has ever run.
4. `check-repo`'s RECIPE checks are regexes that passed while RECIPE was wrong; nothing cross-checks RECIPE against the code.
5. Release gate gaps (`<owner>` placeholder, `plans/` unscanned), licence text that does not travel with an installed mod
   folder, `mod.json` overlay without `kind`, no preview, no install simulation, no type check.

Ownership key used below: CR = code-review (.js/.mjs, assets, tests), DOC = documentation (README, docs/, AGENTS.md,
llms.txt, CHANGELOG, CONTRIBUTING), HC = herdr-completeness (RECIPE.md, preview.png, mod.json, layouts/, keys.json, LICENSE,
NOTICE, .gitignore, .github/, scripts/).

---

## HC-2-1 (high) The CI template fails on all three operating systems

**Evidence.** `scripts/ci.workflow.yml:50` runs `node --test tests/`. I ran it on this branch: `test at tests:1:1 ... test failed`
(a bare directory is read as a module path; code-review's closing board post and documentation's both asked for `npm test`;
`plans/round-1/SUMMARY.md` says the integration fixed RECIPE, for-agents and PUBLISH but not the workflow). Further in the
same file: `actions/checkout@v4` and `actions/setup-node@v4` are floating tags on the Node 20 action runtime (current majors
are checkout v6/v7, setup-node v7 as of today), no `timeout-minutes`, the `hashFiles('tests/**')` and
`hashFiles('scripts/check-docs.mjs')` guards make the two most important steps silently skippable, and `check-repo` only
compares the workflow with the template, it never checks that the commands in it work.

**Change (HC).**
- `run: npm test`; drop both `if: hashFiles(...)` guards (the files exist; a missing test folder should fail).
- Bump both actions to current majors and pin them to full commit SHAs with the tag in a comment (look the SHAs up with
  `gh api repos/actions/<name>/git/ref/tags/<tag>` at implement time); add `timeout-minutes: 15`; keep
  `permissions: contents: read`, `fail-fast: false`, the three-OS matrix, Node 22 (add a `node-version: 24` leg only if cheap).
- New check in `scripts/check-repo.mjs`: parse every `run:` line of the template and require that each is `npm test`,
  `npm run <script that exists>` or `node scripts/<file that exists>` (flag `node --test <dir>`), so a template that cannot work
  is an error even though CI cannot run here.
- New `scripts/install-ci.mjs` (copies the template to `.github/workflows/ci.yml` without its two header comment lines,
  refuses to overwrite a different file). PUBLISH.md step 5 becomes one command plus the `gh auth refresh -s workflow`
  and push. Nobody pushes under `.github/` from here (token has no `workflow` scope).

**Owner.** HC only (`scripts/**`). **Verify.** `node scripts/check-repo.mjs` shows the new "workflow commands resolve" checks
and fails when `node --test tests/` is put back (try it in a temp copy with `--root`-style copy); run each `run:` line of the
template locally once (`npm test`, the five `node scripts/...`). Real proof is the first green run on ubuntu, windows, macos
after the author installs it (PUBLISH.md step 5).

## HC-2-2 (high) RECIPE.md contradicts the code and under-discloses what the mods run

RECIPE is what a fresh build and a Herdr installer trust. Each line below is checked against code.

| RECIPE.md | Code says | Fix |
| --- | --- | --- |
| l.38 reader bar: "Open externally" button | `mods/vault-reader/platform.js:69` `previewLabel`: "Open in Preview" (macOS) / "Open in the default app" (elsewhere), used at `mods/vault-reader/main.js:437` | quote both labels |
| l.38 bar list | a "Web images: on/off" button exists when the note has web pictures (`main.js:439`); it is missing from the bar description | add it, between the folder path and the open button |
| l.115 opener: `cmd /c start` on Windows | `platform.js:54` `rundll32 url.dll,FileProtocolHandler <target>` (the file comments say `cmd /c start` was rejected on purpose) | rundll32 |
| l.129 "Arguments are passed as an array, never through a shell string" | `platform.js:150` (vault) and `:257` (reader) run `sh -c 'exec "${SHELL:-sh}" -lc "command -v <tool>"'` to find a program in the login shell's PATH. The tool name is from a fixed list (not injectable) but it is a shell string, and it starts the person's login shell and so their profile scripts | say so, name `sh`, `$SHELL -lc`, `where` (Windows) |
| l.129 programs list | missing: `stat` (macOS/Linux) and `powershell` (Windows) for file stamps (`platform.js:91-94`), `where`, the login shell | add; docs/privacy.html and AGENTS.md already list them |
| l.129 "No `hc`" | true (no `hc(` in mods/); keep, and keep it checked | keep |
| "Local server" row | `render.mjs:153-155` also starts the browser with `--remote-debugging-port=0` (a DevTools port on loopback for the length of one run) and `--user-data-dir` | add: the port is loopback only, random, closed when the run ends |
| l.131 `chrome/` "a temporary browser profile per job" | `render/lib.mjs:111` names it `chrome-<pid>-<time>-<rand>`, removed after the run, stale ones swept after 1 h; also `lib.tmp-<pid>/`, `lib.lock/` during extraction | correct names |
| Shared keys paragraph | `mods/vault/main.js:105` also publishes `vault.outside` (additive) and `vault.adding`; command `vault.import` exists (`main.js:443`) | list them as additive, not part of the frozen four |
| panel menu in "What you see" | menu also has "Import from Obsidian" | add |
| "Requirements" paragraph: "Windows needs none of them installed for Edge and notes" | Windows still needs ripgrep for search, Poppler for PDF pages, Node 22 and Obsidian for diagrams; only the browser (Edge) is built in | rewrite the sentence per OS; link `docs/requirements.html` |
| Format | the official recipe has one line after the preview: "This file is the brief ... build it again from here" | add that line |

**Owner.** HC (RECIPE.md). DOC: docs already match the code on these points except none found; CR: no change.
**Verify.** Re-read each row against the cited line; HC-2-4 automates it so it cannot drift again.

## HC-2-3 (high, owner CR) Tests that cannot run on Windows

The Windows leg of CI has never run. Static review found:
- `tests/excalidraw.test.mjs:8` does `await import(path.join(...))`. On Windows that is `import("C:\\...\\excalidraw.js")`, which
  Node rejects (`ERR_UNSUPPORTED_ESM_URL_SCHEME`, protocol `c:`). Use `import(pathToFileURL(...).href)` (check-docs already does).
  This one failure stops the whole file, and with it `npm test`, on windows-latest.
- `tests/render-lib.test.mjs:113` builds a "clean" env with `PATH: ""`; Windows env keys are `Path` and case-insensitive when
  spawning, so the copy of `process.env` keeps the real `Path` and the test would find the runner's tools. Delete the key
  case-insensitively, then set it.
- `tests/stubs/herdr.mjs:5` hard-codes `appHome: "/tmp/herdr-test-app"`: fine as a stub string, but any test that really
  touches that path would fail on Windows; make it `os.tmpdir()`-based.
- CRLF: `.gitattributes` forces `eol=lf`, so byte-identical-copy tests (`platform.js`, `watch.js`) are safe on checkout; keep it.

**Verify.** Cannot be run here. After the fix, grep: no `import(` with a `path.join`/`path.resolve` argument anywhere in `tests/`
or `scripts/`; the Windows job in the first CI run is the proof. If the author has a Windows machine, `npm test` there.
RECIPE "Done when" #2 and the "commands run on all three operating systems" sentence stay, but PUBLISH.md gets "confirm a
green Windows job before publishing" (HC).

## HC-2-4 (medium) Nothing checks RECIPE against the code; the existing checks passed while it was wrong

**Evidence.** `scripts/check-repo.mjs:233-243`: the disclosure checks are loose regexes (`/network|download|curl|remote image/`,
`/\bexec\b|programs? (it|the mod) (runs|starts)/`) and a fixed list of six program names. They passed with every error in
HC-2-2. `check-docs.mjs` ties the docs to the code with a claim ledger; RECIPE has none.

**Change (HC).** New `scripts/check-recipe.mjs` (also called from check-repo or CI separately; Node only, dynamic
`import(pathToFileURL(...))` like check-docs does for platform.js):
- every program name that the code can exec (collect from the `toolCandidates`/opener/stat tables in `platform.js`, and the
  literal first arguments of `exec(` in `assets-core.js`, `main.js`) appears in RECIPE's Programs row; `hc(` in `mods/` fails the
  check unless RECIPE says it runs `hc`;
- no "never through a shell string" while `sh -c` exists in `platform.js`;
- the opener per OS and the preview label equal what `openCommand` / `previewLabel` return for the three platforms;
- numbers: `PER_FOLDER` (vault/main.js:26), `MAX` (search-core.js:8), `PDF_PAGES` (reader/main.js:36), `listVault` limit
  (vault-files.js:5), `COLUMN` (reader/main.js:34), `CACHE_MAX_*` and `CACHE_MAX_AGE_DAYS` (assets-core.js), overlay 78%/86%
  and 420x640 (main.js:43, mod.json) are each quoted in RECIPE;
- the callout table in RECIPE equals `CALLOUT` in reader/main.js:42-44 (type -> colour);
- shared keys and commands: every `setShared("vault.*")` key is in RECIPE; the four frozen ones are marked frozen;
- the key rows in RECIPE equal keys.json;
- `data/vault` subfolders RECIPE names exist in code and the other way round.
Add a `--self-test` that feeds a RECIPE with a wrong label and the `cmd /c start` sentence and expects failures.

**Owner.** HC; reads CR files only. **Verify.** `node scripts/check-recipe.mjs` green after HC-2-2 and red on the pre-fix RECIPE
(`git stash`-free: run it with `--root` on a temp copy of the base commit's RECIPE).

## HC-2-5 (medium) `mods/vault/mod.json` overlay has no `kind`

**Evidence.** `mods/vault/mod.json`: `{ "place": "none", "title": "Vault", "overlay": { "width": 420, "height": 640 } }`. RECIPE says
the key opens "a popup of 420 x 640 px". Herdr documents `mod.open` as "Toggle a mod as the overlay its mod.json describes" and
`openOverlay` has `kind: "dialog" | "popup" | "window"` with popups placed "at `at` (default: the pointer)", but nothing says what
`mod.open` uses when `kind` is missing. The official example (`herdr-layout-examples/tmux-prefix/mods/tmux-prefix/mod.json`) states it:
`{ "kind": "popup", "at": "top", "offset": 64, "width": 520, "height": 420 }`. With a keyboard shortcut there is no pointer
anchor to rely on, and a 640 px popup placed at a stray pointer can run off a small screen.

**Change (HC).** Spell out `kind` (popup, as the RECIPE says) and a placement that does not depend on the pointer, following
the official example's field names (`at: "top"` with an `offset`, or the dialog kind if popup+top cannot fit 640 px); keep width/height. Update RECIPE "What you see"
and the check-repo mod.json validator (it currently ignores `overlay.kind`). Ask CR to confirm that `main.js` does not assume
a pointer-anchored popup.

**Owner.** HC (mod.json, RECIPE) with a CR confirmation. **Verify.** `herdr-app check <abs>/mods/vault` still passes; the author
presses `ctrl-shift-m` in a scratch `HERDR_APP_HOME` on a small window and on a large one (the one thing no agent may do).
Until then this is a proposal, not a certainty: the field set of the mod.json overlay is inferred from the official example.

## HC-2-6 (medium) Licence texts do not travel with an installed mod folder

**Evidence.** Herdr's install procedure (AGENTS.md, "Layouts and mods other people made", step 2) copies each `mods/<name>/` folder and leaves
everything else out. The Lucide licence is already inside both `icons/` folders. But `mods/vault-reader/render/lzstring.js`
(a port of lz-string, MIT) has only a one-line comment; the MIT permission notice the licence requires lives only in the repo-root NOTICE,
which an installer does not copy. The project's own Apache-2.0 LICENSE is likewise absent from an installed copy (Apache 2.0 section 4(a)
asks that recipients get a copy of the licence).

**Change.** HC: add `mods/vault-reader/render/LICENSE-lz-string.txt` (MIT text, pieroxy copyright, same text as NOTICE item 2), and
`LICENSE` copies in `mods/vault/` and `mods/vault-reader/` (byte-identical to the root file; a check-repo rule enforces equality so
they cannot drift). CR: add a `// SPDX-License-Identifier: Apache-2.0` + copyright line to the top of each mod's `main.js` and a
pointer to `LICENSE-lz-string.txt` in `lzstring.js`'s first comment (a comment-only edit). NOTICE gets the new file names.

**Verify.** `check-repo` rules: a licence file next to every vendored file named in NOTICE, equal LICENSE copies; `herdr-app check` on
both mods still passes; `privacy-scan` clean. Note: new files in a mod folder reload the mod once at install time only.

## HC-2-7 (medium) The release gate misses the placeholder and the unscanned `plans/`

**Evidence.** The docs use `<owner>` (README, CHANGELOG, CONTRIBUTING, AGENTS.md, llms.txt x2 14 times each, docs/install.html and more).
`check-repo.mjs:270` only flags `<author...>`, `[yyyy]`, `[name of copyright owner]` and only in six files, so `--release` would go green with
`<owner>` everywhere. `privacy-scan.mjs:29` skips `plans/` entirely, yet `plans/` (192 KB of agent logs, board copies) is tracked and would be
published; today a manual grep finds no home path, email or username in it, so scanning it costs nothing now. Also: the git history
carries the author's real name on 30 commits (noreply email); the orphan-commit step in PUBLISH.md will do the same on the new commit.

**Change (HC).**
- `--release` fails on `<owner>` in any tracked file outside `scripts/` and `plans/`; the file list becomes "every tracked text file
  that is not under plans/".
- `privacy-scan` scans `plans/` with the generic rules (home paths, emails, hosts, private words), skipping only the "d3" literal rule and
  the author-name rule there.
- PUBLISH.md: new step "decide whether `plans/` ships (default: exclude it from the first public commit, keep it on a private branch)";
  step 3 states that the git author name and noreply address become public with the first commit.

**Owner.** HC (scripts, PUBLISH.md); DOC keeps `<owner>` in text. **Verify.** In a temp copy, `check-repo --release` lists each `<owner>`
file; after replacing them it passes that rule; `privacy-scan --self-test` gains a case for a path inside `plans/`.

## HC-2-8 (medium) No `preview.png`; README and RECIPE show a broken image

**Evidence.** `check-repo --release` fails on it; README and RECIPE.md line 7 embed `preview.png`; herdr.dev needs one. Agents may not drive the
app (hard rule 2), so a real screenshot is the author's step (PREVIEW.md). The sibling repo (herdr-portrait-layout) agreed on a
synthetic, invented-content preview built by `scripts/make-preview.mjs` from an SVG.

**Change (HC), optional this round.** Build `scripts/make-preview.mjs` the same way: an SVG source drawn from numbers already in RECIPE
(420x640 panel, 78x86% reader, 13 callout colours) with the sample vault's note names (`Feature tour`, `Board`, `Flow sketch`), then PNG via
headless Chrome/Chromium (`--screenshot`, already a dependency of the reader) or `rsvg-convert` if present; commit `scripts/preview-source.svg` and
`preview.png` (about 1600x1000). PREVIEW.md and README must say plainly that it is an illustration until the author replaces it with a real
capture. If the author prefers only real screenshots, skip this and leave the release-gate failure as the reminder.

**Owner.** HC (preview.png, scripts); DOC copies it to `docs/assets/` afterwards. **Verify.** `check-repo --release` preview line (>= 800x500);
`privacy-scan` binary metadata check on the PNG (no text chunks or EXIF); open the image and compare with RECIPE "What you see".

## HC-2-9 (medium) No simulation of what an installer does, so "self-contained mod folder" is only asserted

**Evidence.** Tests import `../mods/...` from the repo; nobody has tried the documented install (copy `mods/<name>/` only, merge keys.json,
`herdr-app check` on the copies). AGENTS.md and PUBLISH.md step 7 describe it as a manual author task.

**Change (HC).** `scripts/install-sim.mjs` (Node, no dependencies, any OS): copy only `mods/vault` and `mods/vault-reader` into a temp
`<home>/mods/`, then (1) fail if any `import`/`import()` in the copies resolves outside its own folder, (2) fail if a path string
`mods/<name>/...` used in code (icons, svg, render files) does not exist in the copy, (3) merge `keys.json` into a sample keys.json
with Herdr's documented rules (never overwrite; report a conflict instead; a second run is a no-op), (4) when `herdr-app` is on PATH, run
`herdr-app check <abs copy>` for each (skipped with a note in CI). Never touches the real Herdr home; uses `HERDR_APP_HOME` only for the
check command, pointing at the temp folder.

**Owner.** HC. **Verify.** Passes now; make it fail by adding `import "../vault/tree.js"` to a mod file in a temp copy.

## HC-2-10 (low) CI cannot run the privacy words rule

**Evidence.** `privacy-scan.mjs:92` reads `scripts/.privacy-words` (gitignored) or `HERDR_PRIVACY_WORDS`. On a CI runner neither exists, so real names,
employers and project names are only caught on the author's machine; CI runs the generic rules only (it prints a note).

**Change (HC).** In the workflow, an optional step before the scan: when the repository secret `PRIVACY_WORDS` is set, write it to
`$RUNNER_TEMP/words.txt` (works in bash on all three runners via `shell: bash`) and export `HERDR_PRIVACY_WORDS`. Add the step to PUBLISH.md ("add the
secret"). Without the secret nothing changes.

**Verify.** Template review plus `HERDR_PRIVACY_WORDS=<file> node scripts/privacy-scan.mjs` locally with a word that appears in a temp file.

## HC-2-11 (low) Type-check step and `.gitignore` scope

**Evidence.** Round-1 priority 3 asked for a `tsc` pass against `herdr.d.ts`. `.gitignore` ignores `*.d.ts` and `jsconfig.json` repo-wide, which
would also hide a repo-level types file or tsconfig someone adds. Herdr writes both files into each mod folder and `<name>.error` files
next to a broken mod (AGENTS.md "Rules for editing"); those are not ignored.

**Change (HC).** `scripts/typecheck.mjs`: finds `herdr.d.ts` and `gpui-kit.d.ts` in the Herdr home (`HERDR_APP_HOME`, else the per-OS default
Herdr prints in `herdr-app --help`), writes a temp tsconfig (`allowJs`, `checkJs`, `noEmit`, `paths` mapping `herdr` and `gpui-kit`), runs a pinned
`npx typescript@<version>`; prints "skipped: Herdr's type files not found" and exits 0 when they are absent, so it is local only and
never in CI. The files are Herdr's own, so they are not vendored. `.gitignore`: scope to `/mods/**/*.d.ts`, `/mods/**/jsconfig.json`, add
`/mods/*.error`, `/mods/**/*.error`, `.env*`, `*.orig`, `.claude/`. CR fixes the type errors it reports (separate round-2 CR item).

**Verify.** `git status` shows no new untracked noise after running Herdr in a mod folder; the script exits 0 with the skip note on a machine
without Herdr and prints diagnostics with it.

## HC-2-12 (low) Listing format with two mods in one repo

**Evidence.** Herdr: "one folder each if there are several". The official examples repo keeps one folder per example, each with its own
RECIPE.md and preview.png. This repo is one example with two mods (root RECIPE, `mods/vault`, `mods/vault-reader`), which fits "a folder laid
out like the Herdr home", but whether herdr.dev lists a repo-root example or only subfolders cannot be checked offline.

**Change (HC).** PUBLISH.md step 12 gets a concrete post-publish check (does herdr.dev/mods show the card, with preview and RECIPE) and
the fallback: move everything the card needs into one folder `vault/` (RECIPE, preview, keys.json, both mod folders) without changing any
mod path inside the repo's own tests. PUBLISH.md step 10 keeps "do not add `herdr-layout`".

**Verify.** Author-side after publishing; nothing to run now.

## HC-2-13 (low) The default-chord list is a frozen snapshot

**Evidence.** `check-repo.mjs:29-30` hard-codes Herdr 0.1.12's default `ctrl-shift-<letter>` chords. `herdr-app --version` is 0.1.12 now, so it
is right today; a newer Herdr silently makes it wrong, and `ctrl-shift-m` has no automatic check against the user's own bindings
(RECIPE says "keep your key if taken").

**Change (HC).** Move the list to `scripts/herdr-default-keys.json` with a `herdr` version field; when `herdr-app` is on PATH, `check-repo` warns if its
version differs from the snapshot. Reuse the portrait repo's `scripts/default-keys.json` format if it is compatible (ask on its board).

**Verify.** `node scripts/check-repo.mjs` unchanged output on this machine; with a faked version in a temp copy it warns.

---

## Order of work for the implement step

1. HC-2-1 (CI template + install-ci + workflow command checks), HC-2-2 (RECIPE text), then HC-2-4 (check-recipe) and HC-2-7 (release gate).
2. HC-2-6 and HC-2-5 (mod folder files; coordinate with CR for the comment edits), HC-2-9, HC-2-8, HC-2-10, HC-2-11, HC-2-13, HC-2-12.
3. CR items handed over: HC-2-3 (Windows tests), the SPDX header part of HC-2-6, the pointer-popup confirmation in HC-2-5, type errors from HC-2-11.

## Open questions I decided without asking

- Preview: recommend the clearly labelled illustration (as the sibling repo did) but keep it optional; real capture remains the author's.
- I did not run anything that changes the tree: this file is the only file written. No git command that stages, commits or switches branches was run
  after the initial checkout/fetch (the `git pull` returned "Cannot fast-forward to multiple branches" because of a refspec quirk; the branch already
  equalled origin: `5f96349`).
