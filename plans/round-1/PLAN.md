# Round 1 plan: portable, publishable Vault mods

Branch: `feat/round-1-portable-release`. Written by the round-lead from the three role audits in this folder
(`code-review.md`, `documentation.md`, `herdr-completeness.md`) and the board.
Nobody answers questions during the run: every decision below is final for this round and has its reason.

## 1. Goal

Turn the two imported mods (`mods/vault`, `mods/vault-reader`) from "works on the author's Mac" into a repo that
can be published to herdr.dev:

1. Runs on macOS, Linux and Windows. Every missing external tool is named in the UI with a one-line install hint for
   that OS, never a stack trace or raw JSON.
2. No crash on valid vault content (empty canvas, remote images, odd anchors) and no code execution or
   arbitrary-URL opening driven by note content.
3. Ships what a Herdr community mod needs: LICENSE, NOTICE, RECIPE.md, keys.json, CI on three OSes, privacy scan,
   no Obsidian logo, a standalone way to show the panel.
4. Has real tests (`node --test tests/`, Node 22+, no dependencies, no Chrome/rg/Poppler/Obsidian needed).
5. Has complete human and agent documentation (README, GitHub Pages site under `docs/`, AGENTS.md, llms.txt,
   CHANGELOG, CONTRIBUTING) that states the real support level, re-synced at the end of the round to what the
   code does.

## 2. Scope and non-goals

In scope: everything in section 4.

Non-goals this round (and why):

- Driving the live Herdr app. Forbidden by the run rules, so Windows/Linux behaviour is proven by pure-module unit
  tests with a fake `exec` and a fake platform plus the CI matrix, not by running the mods there.
- `preview.png`. The author captures it (agents may not drive the app). The release gate stays red until it exists.
- Enabling GitHub Pages, adding the `herdr-mod` topic, making the repo public. Author-only (run rules). Listed in
  `scripts/PUBLISH.md`.
- Changing the portrait layout repo. We only post on its board and keep the contract stable (section 6).
- Rewriting git history. The first commit contains the Obsidian logo; see risks.

## 3. Decisions on disagreements between the audits

| # | Question | Decision | Reason |
| --- | --- | --- | --- |
| D1 | `obsidian.png` (trademark) | Stop shipping the Obsidian logo. In both mods, replace the file at the same path with a generic gem icon (64x65 png rendered from the vendored Lucide `gem` svg) and add `vault.svg` beside it. Code uses the svg; the png exists only so `herdr-portrait-layout` (which loads `mods/vault-reader/obsidian.png`) keeps working. Loading the real logo at runtime from the user's own install is deferred to round 2. | HC-1-5 and CR-1-13 agree on direction; keeping the path avoids breaking the sibling repo. |
| D2 | `check-repo` rule "no file named obsidian.png" (HC-1-5) vs the compat copy | The check fails on the **sha256 of the original logo**, not on the file name. The name is allowed only for the generic compat copy. | Both requirements hold at once. |
| D3 | Where OS-specific literals live | One `platform.js` per mod (`mods/vault/platform.js`, `mods/vault-reader/platform.js`). Mods must stay self-contained folders (share flow copies one folder), so no cross-mod import. The privacy scan fails on `/Applications`, `/opt/homebrew`, `Library/Application Support`, `stat -f` outside files named `platform.js`. | Matches HC-1-4 verify rule and CR-1-3. |
| D4 | Back key | Keep Cmd+[ on macOS; on all OS bind Alt+Left and Backspace. | CR-1-13 and board note from HC agree. |
| D5 | Node minimum | 22. CI matrix uses Node 22 on ubuntu, macos, windows. | Global `WebSocket` and `fetch` are needed by `render.mjs`; docs said 22+. |
| D6 | `vault` as overlay (HC-1-2) | HC adds `overlay` (width 420, height 640) and `keys.json` `mod.open:vault`. CR is the first to act: it reads `mods/vault/main.js` and posts on the board whether the add-vault menu and `nextCommand` loop are safe in an overlay, before HC edits `mod.json`. If CR says no, HC ships `keys.json` with a documented layout snippet instead and RECIPE says "docked only". | HC owns `mod.json`; CR owns the code facts. Order below. |
| D7 | Version | No version field in `mod.json` (not in the Herdr schema; unverified fields risk `herdr-app check` failures). CHANGELOG uses `0.1.0` as the first release heading; `[Unreleased]` collects round changes. | Answers DOC question 6. |
| D8 | Who writes credits and trademark text (DOC-1-12) | HC owns `LICENSE`, `NOTICE`, `RECIPE.md`. Documentation owns `README.md` and `docs/` and quotes the NOTICE wording (HC posts it on the board when NOTICE lands). | A file has one owner; text is shared by quoting. |
| D9 | Troubleshooting messages (DOC-1-8) | Code-review owns the strings in code; documentation owns `docs/troubleshooting.html` and quotes them. CR posts the final catalogue (tool name, discovery order, message) on the board when CR-4/CR-5 land. | Docs must quote real strings. |
| D10 | Remote images off switch (HC-1-6) | A reader setting persisted at `data/vault/settings.json` (key `remoteImages`, default `true`, same as Obsidian), toggled in the reader menu. If the menu change turns out larger than the round allows, ship the constant `REMOTE_IMAGES = true` at the top of `assets.js` and defer the toggle; say so on the board. | HC wants a switch, docs want it described; default stays Obsidian-compatible. |
| D11 | Cache growth (DOC question 5) | Prune `data/vault/cache` at reader start: entries older than 30 days, then oldest first until under 200 MB. Documented as constants. | Cheap, bounded, no UI needed. |
| D12 | Copyright holder name | HC writes the `LICENSE` copyright line from `git config user.name` of this repo. If empty, it writes the placeholder `<author legal name>` and `check-repo --release` fails until replaced. The name appears nowhere else. | Hard rule 3 allows the name only in LICENSE. |
| D13 | `package.json` at the root | CR creates it (`private`, `type: module`, `scripts.test`). `check-repo` verifies it is never present inside a mod folder. | Avoids a stray package.json being published with a mod. |
| D14 | Pages workflow | None. Pages serves `main:/docs` with `.nojekyll`, so `.github/` has only the CI workflow. | Documentation request; fewer moving parts. |
| D15 | Sample vault content | CR does not edit `examples/sample-vault`; edge-case fixtures (empty canvas, odd anchors, fence info strings) go in `tests/fixtures/`. HC owns the `.obsidian` stub and PDF/PNG metadata cleanup in the sample vault. | One owner per file; tests stay hermetic. |

## 4. Tasks

Every file or glob is owned by exactly one role. Globs are exclusive: a role never edits a path matched by another
role's glob. Ids: `R1-CR-n` code-review, `R1-DOC-n` documentation, `R1-HC-n` herdr-completeness.
"Audit ids" point to the finding the task implements.

### 4.1 Ownership map

| Role | Owns (exclusive) |
| --- | --- |
| code-review | `mods/**` **except** `mods/*/mod.json` and `mods/*/icons/LICENSE-lucide.txt`; `tests/**`; `package.json`; the move of `mods/vault-reader/render/test-parse.mjs` and `make-fixture.mjs` to `tests/tools/` |
| documentation | `README.md`, `AGENTS.md`, `llms.txt`, `CHANGELOG.md`, `CONTRIBUTING.md`, `docs/**`, `scripts/check-docs.mjs` |
| herdr-completeness | `LICENSE`, `NOTICE`, `RECIPE.md`, `keys.json`, `.gitignore`, `.gitattributes`, `.github/**`, `scripts/**` except `scripts/check-docs.mjs`, `mods/*/mod.json`, `mods/*/icons/LICENSE-lucide.txt`, `examples/**` (the `.obsidian` stub and binary metadata only; content notes untouched), `preview.png` (deferred) |
| round-lead | `plans/**` |

Exception noted: the replacement `mods/*/obsidian.png` and new `mods/*/vault.svg` are code-review files (they sit in
mod folders and the `image()`/`svg()` calls change in the same commit). HC supplies the license text for them.

### 4.2 code-review tasks

| Id | Title | Audit ids | Files | Acceptance check |
| --- | --- | --- | --- | --- |
| R1-CR-1 | Scaffold: root `package.json`; `tests/` with `node --test`; split pure logic out of glue files that import `herdr` (`assets.js`, `search.js`, vault list parsing) so node can load them; move the two dev scripts to `tests/tools/`; first tests on `examples/sample-vault` for `parse.js`, `doc.js`, `canvas.js`, search snippet. Post on the board when the folder is in (docs and HC wait for it). | CR-1-11 | `package.json`, `tests/**`, `mods/vault/search.js`, `mods/vault-reader/assets.js`, `mods/vault-reader/render/test-parse.mjs`, `mods/vault-reader/render/make-fixture.mjs` | `node --test tests/` exits 0 with no Chrome, rg, Poppler or Obsidian installed; `git ls-files mods | grep -E "test-parse|make-fixture"` is empty. |
| R1-CR-2 | Overlay safety answer for `vault` (read-only analysis), then fix if the add-vault menu or `nextCommand` loop breaks in an overlay. Post the answer on the board first (D6). | HC-1-2 | `mods/vault/main.js` | Board message exists; `herdr-app check <abs>/mods/vault` passes. |
| R1-CR-3 | Crashes: empty canvas no longer throws in `edgesSvg`, default node sizes; asset/render errors show inline and never replace the document; `load()` catch narrowed. Tests with a fixture. | CR-1-2 | `mods/vault-reader/canvas.js`, `mods/vault-reader/main.js`, `tests/**` | Canvas test with zero nodes passes; test proves a failing asset leaves the rendered document. |
| R1-CR-4 | `platform.js` per mod: OS detection, stat variants, JS image-header parser (replaces `sips`), file opener (`open` / `xdg-open` / `cmd /c start`), Poppler and `rg` lookup (PATH, `where`, common per-OS dirs) with install hints per OS, path normalisation of backslashes. Replace `stat -f`, `sips`, `cp`, `mv`, `qlmanage` (macOS-only fallback, clearly gated), `open`. Tests with a fake `exec` and fake platform for darwin, linux, win32. | CR-1-3, HC-1-4 | `mods/vault/platform.js`, `mods/vault-reader/platform.js`, `mods/vault-reader/assets.js`, `mods/vault-reader/main.js`, `mods/vault/main.js`, `tests/**` | Tests pass for all three fake platforms; `rg -n "/Applications\|/opt/homebrew\|Library/Application Support\|stat -f\|sips\|qlmanage" mods --glob '!platform.js'` finds nothing. |
| R1-CR-5 | Obsidian vault list per OS (macOS, Linux, Flatpak, Snap, Windows), vaults outside home shown as "outside home folder, not readable" instead of vanishing; search: ignore-file exclusions, `--null` path parsing, tolerate rg exit 2, snippet guard, cached file list, dead code removed. | CR-1-4, CR-1-10 | `mods/vault/main.js`, `mods/vault/search.js`, `mods/vault/platform.js`, `tests/**` | Tests parse a fake `obsidian.json` per OS; search tests on a path containing `:12:`; missing `rg` yields the install-hint string. |
| R1-CR-6 | Renderer: discovery of Obsidian asar and Chromium-family browser per OS with env overrides (`HERDR_VAULT_ASAR`, `HERDR_VAULT_BROWSER`, `CHROME_PATH`); Node 22 `WebSocket` check; fix Windows `findNear` infinite loop; no login-shell wrapper on Windows; structured errors mapped to one plain sentence naming the missing piece (no raw JSON); per-job Chrome profile and one-time lib extraction lock; batch size and timeout under the 30 s exec limit; kill orphaned Chrome; `serve()` decode and prefix checks. | CR-1-5, CR-1-6, DOC-1-8 | `mods/vault-reader/render/render.mjs`, `mods/vault-reader/assets.js`, `mods/vault-reader/platform.js`, `tests/**` | Unit tests for discovery tables and `findNear` termination on a Windows-style root; error mapper test: renderer ENOENT JSON becomes a sentence; two parallel dry-run jobs get distinct profile dirs. |
| R1-CR-7 | Remote images via `curl` through `exec` (no `res.arrayBuffer()`), no failure caching, size cap; reader setting `remoteImages` (D10); cache pruning (D11). | CR-1-1, HC-1-6, D10, D11 | `mods/vault-reader/assets.js`, `mods/vault-reader/main.js`, `tests/**` | Test with a fake `exec`: failure is not cached, success is; prune test with fake clock and sizes. |
| R1-CR-8 | Untrusted content hardening: escape Excalidraw attributes before `innerHTML`; canvas link cards and note links open only `http`, `https`, `mailto`; drop `file:` and `obsidian:`. | CR-1-7, HC-1-6 | `mods/vault-reader/render/excalidraw.js`, `mods/vault-reader/render/page.js`, `mods/vault-reader/main.js`, `tests/**` | Tests: malicious attribute string is escaped; URL allow-list function rejects `file:///x`, `javascript:`, accepts `https://a`. |
| R1-CR-9 | `parse.js` bugs: `section()` on `^a(b`, `fenced()` closer rule, inline-math list flattening, YAML quoted commas, shared global regex `lastIndex`. | CR-1-8 | `mods/vault-reader/parse.js`, `tests/**` | Regression tests reproduce each bug on `tests/fixtures/` and pass after the fix. |
| R1-CR-10 | Watchers and command loops: no duplicate watcher after vault switching, timer fallback when the Linux watch is rejected plus a visible hint, `nextCommand` loops survive an error, `Set` instead of O(n^2) `includes`, refresh on deletion. | CR-1-9 | `mods/vault/main.js`, `mods/vault-reader/main.js`, `tests/**` | Tests on the extracted watcher helper with a fake watcher that rejects; switching A to B to A keeps one watcher. |
| R1-CR-11 | Cleanups: vendor `mods/vault/icons/search.svg` (Lucide) and stop loading `mods/workspace-chrome/search.svg`; swap `obsidian.png` for the generic gem (`vault.svg` plus compat png, D1); fonts from `settings().font_family` with generic fallbacks instead of macOS font names; back keys (D4); vault.panes cleanup on close; unused import; tilde regex; PER_FOLDER truncation shown, not silent; reader "Preview" wording. | CR-1-13, HC-1-5, HC-1-4 | `mods/vault/main.js`, `mods/vault/icons/search.svg`, `mods/vault/vault.svg`, `mods/vault/obsidian.png`, `mods/vault-reader/main.js`, `mods/vault-reader/vault.svg`, `mods/vault-reader/obsidian.png`, `mods/vault-reader/render/page.html`, `mods/vault-reader/render/excalidraw.js` | `sha256` of both pngs differs from the original logo; `rg -n "workspace-chrome" mods` is empty; `herdr-app check` passes on both mods. |

Each CR task ends with the audit finding id in its commit subject. Order inside code-review is the order above
(CR-1 first because it moves files; CR-2 early because HC waits for it).

### 4.3 herdr-completeness tasks

| Id | Title | Audit ids | Files | Acceptance check |
| --- | --- | --- | --- | --- |
| R1-HC-1 | `LICENSE` (Apache-2.0, holder per D12), `NOTICE` (Lucide ISC, lz-string MIT, Obsidian trademark and not-affiliated sentence, Mermaid/MathJax read at run time from the user's own Obsidian install and not redistributed), Lucide license text in both mods' `icons/`. Post the NOTICE wording on the board for documentation. | HC-1-1, DOC-1-12 | `LICENSE`, `NOTICE`, `mods/vault/icons/LICENSE-lucide.txt`, `mods/vault-reader/icons/LICENSE-lucide.txt` | Files exist; `check-repo` verifies the SPDX line and that every vendored third-party file is named in NOTICE. |
| R1-HC-2 | Repo hygiene: `.gitignore` additions (d.ts, jsconfig, OS and editor files, `data/`) without hiding `.obsidian` in examples; `.gitattributes` (LF for text, binary markers); sample vault `.obsidian/app.json` stub so Add vault accepts it after clone; strip metadata from sample PDFs/PNG if the scan finds any. | HC-1-9, HC-1-11, HC-1-8 | `.gitignore`, `.gitattributes`, `examples/sample-vault/.obsidian/**`, `examples/sample-vault/attachments/**` | `git status` clean after `herdr-app check` on both mods; sample vault opens by the vault list parser test (CR) after a fresh clone. |
| R1-HC-3 | `scripts/check-repo.mjs`: JSON validity of `mod.json` and `keys.json`, `mod.json` fields vs `place` / `size` / `overlay` / `focusable`, `keys.json` rows reference existing mods, contract list (mod folder names, shared keys, command, reader props, D1/D2 logo hash rule, D13 no `package.json` in a mod), third-party files named in NOTICE, `--release` gate (preview.png present, no `TODO` strings, copyright placeholder gone). | HC-1-7, HC-1-10, HC-1-12, D2, D12, D13 | `scripts/check-repo.mjs` | `node scripts/check-repo.mjs` exits 0 on the branch; `--release` exits non-zero only because `preview.png` is missing. |
| R1-HC-4 | `scripts/privacy-scan.mjs` over `git ls-files`: `/Users/x`, `/home/x`, `C:\Users`, emails, hostnames, a local word list file read from an untracked path (never committed), binary metadata of PDFs and PNG, and the D3 rule (OS literals only in `platform.js`). Rule D3 is enabled only after R1-CR-4 lands (until then it reports as a warning). | HC-1-8, D3 | `scripts/privacy-scan.mjs` | Exit 0 on the branch at the end of the round; a seeded fake path in a temp copy makes it exit 1 (script self-test flag). |
| R1-HC-5 | `.github/workflows/ci.yml`: matrix ubuntu, macos, windows on Node 22: `node --test tests/`, `check-repo`, `privacy-scan`, `check-docs`, JSON validation. Triggers: push and pull_request. No Pages workflow (D14). | HC-1-7 | `.github/workflows/ci.yml` | `gh run list` for the pushed branch shows the three jobs green (or the failing job named on the board). |
| R1-HC-6 | `keys.json` (`mod.open:vault`, `mod.open:vault-reader` only if useful, keys confirmed free with `herdr-app commands`) and `mods/vault/mod.json` overlay (D6, after CR's board answer). | HC-1-2 | `keys.json`, `mods/vault/mod.json`, `mods/vault-reader/mod.json` | `herdr-app check` passes on both mod folders; `check-repo` validates `keys.json`. |
| R1-HC-7 | `RECIPE.md` (the six community sections: what it does, install, keys, requirements, watch out, credits) containing behaviour and intent only, linking requirements, keys and limits to `docs/` tables instead of copying (DOC-1-13). "Watch out" lists: network fetch of remote images with the off switch, programs that are run, out-of-folder reads, writes only to `data/vault/`, cache limits. Degraded behaviour sentences match R1-CR-6. | HC-1-3, HC-1-6, DOC-1-13 | `RECIPE.md` | Section headers present (checked by `check-repo`); no `TODO` after the final pass. |
| R1-HC-8 | `scripts/PUBLISH.md` and `scripts/PREVIEW.md`: author-only checklist (take `preview.png`, confirm copyright name, enable Pages, make public, add `herdr-mod` topic, wait for herdr.dev listing, update portrait layout's RECIPE link). | HC-1-3, HC-1-12 | `scripts/PUBLISH.md`, `scripts/PREVIEW.md` | `check-repo --release` lists the same steps. |
| R1-HC-9 | Cross-repo notes: post on the portrait-layout board the logo path decision (D1) and the frozen contract; final re-audit of the branch after code-review's last commit (the last HC action of the round). | HC-1-5, HC-1-10 | none (board only) | Board message present. |

### 4.4 documentation tasks

| Id | Title | Audit ids | Files | Acceptance check |
| --- | --- | --- | --- | --- |
| R1-DOC-1 | `README.md`: what, why, install paths (Herdr agent prompt, manual copy of both folders, merging `keys.json`, showing the panel), two-mod dependency, layout snippet from the portrait board, support level, side-effects table, credits (quoting NOTICE), no preview claim until `preview.png` exists. | DOC-1-1, DOC-1-4, DOC-1-12 | `README.md` | `check-docs` passes; README links to RECIPE, NOTICE, docs pages. |
| R1-DOC-2 | Pages site under `docs/`: `.nojekyll`, plain HTML and CSS, light and dark, mobile width, a11y, no external hosts; pages `index`, `install`, `usage`, `requirements`, `configuration`, `privacy`, `troubleshooting`. Requirements page is a per-OS table with "what happens when missing". | DOC-1-2, -3, -5, -6, -7, -8 | `docs/**` (including `docs/llms.txt`, a served copy) | `node scripts/check-docs.mjs` exits 0. |
| R1-DOC-3 | `scripts/check-docs.mjs` (node, no dependencies): relative links and `#ids` resolve, each page has title, h1, description and lang, no external `http(s)` resource loads, no personal paths, colour contrast of the CSS tokens, `llms.txt` equals `docs/llms.txt`, `keys.json` rows equal the docs key table. | DOC-1-7, DOC-1-10 | `scripts/check-docs.mjs` | Exit 0 on the branch; a broken link in a temp copy exits 1. |
| R1-DOC-4 | `AGENTS.md` (install, adapt, test, edit safely, Herdr gotchas, the two test commands, rename procedure that mentions the one mod-name constant), `llms.txt`. | DOC-1-9, DOC-1-10 | `AGENTS.md`, `llms.txt` | `check-docs` copy-equality passes; every command in AGENTS.md exists in `package.json` or `scripts/`. |
| R1-DOC-5 | `CHANGELOG.md` (Keep a Changelog, `[Unreleased]` filled from the board and commit log, `0.1.0` heading per D7), `CONTRIBUTING.md` (Node 22, `node --test tests/`, three scripts, privacy checklist, publish checklist link). | DOC-1-11 | `CHANGELOG.md`, `CONTRIBUTING.md` | Commands in CONTRIBUTING run green on a clean checkout. |
| R1-DOC-6 | **Final sync pass (last doc task):** after code-review's board catalogue (D9) and HC's NOTICE wording, re-read the shipped code and make every requirement row, message, key and limit match it exactly; remove "macOS only" wording where it is no longer true; report any doc claim the code cannot back to code-review on the board. | all DOC | `README.md`, `docs/**`, `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md` | `check-docs` green; a claim-by-claim list posted on the board with each claim's source file and line. |

## 5. Order, dependencies and landing waves

All three roles work in parallel on disjoint files (section 4.1), committing only their own paths
(`git add <paths>`, never `git add -A`) and rebasing on the round branch before each push, so merges are
conflict-free by construction.

Waves (a wave starts for a role when its listed predecessor messages are on the board):

1. **Wave A, independent start.** CR: R1-CR-1 (scaffold), then R1-CR-2 (post overlay answer). HC: R1-HC-1, R1-HC-2, R1-HC-3 (script without D3). DOC: R1-DOC-1 skeleton, R1-DOC-2 pages that do not depend on code facts (install, usage, privacy structure), R1-DOC-3.
2. **Wave B, needs CR-1 and CR-2.** HC: R1-HC-6 (overlay depends on CR-2), R1-HC-4, R1-HC-5 (CI needs `tests/` and `check-docs` to exist). DOC: R1-DOC-4, R1-DOC-5 (CONTRIBUTING needs the `tests/` folder). CR: R1-CR-3 to R1-CR-10, in that order.
3. **Wave C, needs CR-4, CR-5, CR-6, CR-11.** CR posts the tool/message catalogue (D9) and the final asset list per mod. HC enables the D3 rule in `privacy-scan` as an error, writes R1-HC-7 (RECIPE) and R1-HC-8. DOC: R1-DOC-6 final sync.
4. **Wave D, last.** HC re-audits the full branch (R1-HC-9) and posts the result. CR runs the full verification (section 6) and reports.

Hard dependencies:

| Waiting task | Needs | Because |
| --- | --- | --- |
| R1-HC-6 | R1-CR-2 board answer | overlay may be unsafe |
| R1-HC-5 | R1-CR-1 (`tests/`), R1-DOC-3 (`check-docs`) | CI steps must exist or the job fails |
| R1-HC-4 (error mode) | R1-CR-4, R1-CR-11 | OS literals still in code until then |
| R1-HC-7 | R1-CR-6, R1-CR-7 | RECIPE must state real degraded behaviour |
| R1-DOC-5 | R1-CR-1 | CONTRIBUTING names the test folder |
| R1-DOC-6 | R1-HC-1 (NOTICE), R1-CR-4..7, R1-CR-11 | docs quote final strings |
| R1-HC-3 contract list | R1-CR-11 | logo hash rule needs the new png |

## 6. Frozen contract with `herdr-portrait-layout`

Not to be changed this round without a post on that board: mod names `vault` and `vault-reader`; shared keys
`vault.list`, `vault.current`, `vault.open`, `vault.panes` (same shapes); command `vault.add`; reader props
`{ vault, file, ... }` as in the current code; the "obsidian" tab; the path `mods/vault-reader/obsidian.png`
(file kept, content generic, D1). `scripts/check-repo.mjs` enforces the list (R1-HC-3).

## 7. How the round is verified

Run from the repo root, in this order, by code-review at the end (wave D) and by each role for its own part:

```
node --test tests/
node scripts/check-repo.mjs
node scripts/check-repo.mjs --release          # expected: fails only on the missing preview.png and the author-only items
node scripts/privacy-scan.mjs
node scripts/check-docs.mjs
herdr-app check <absolute path>/mods/vault
herdr-app check <absolute path>/mods/vault-reader
git status --short                              # clean (no d.ts / jsconfig leaked by herdr-app check)
gh run list --branch feat/round-1-portable-release --limit 3   # after `export GH_TOKEN=$(gh auth token -u <the repo owner account>)`
```

Pass criteria: the first two, the fourth, fifth and sixth commands exit 0, the `--release` run fails only as
stated, CI shows ubuntu, macos and windows jobs, and the round's board has one closing message per role.
Things nobody can verify this round are written in the closing messages, not assumed: real behaviour of the
mods on Linux and Windows inside the live app, and visual output.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| The Obsidian logo stays in the first commit's history, so a public push exposes it. | Not fixable without a history rewrite, which agents may not do. Listed first in `scripts/PUBLISH.md`: the author squashes or recreates the repo before making it public. |
| Windows and Linux behaviour is proven only by fakes and CI, not by the live app. | Pure modules with injected `exec` and platform; CI matrix; README and docs describe the support level as "implemented, community-tested on request" until verified. |
| `platform.js` duplicated in two mods drifts. | A test asserts that the shared function names and tables are identical in both copies. |
| Both mods are edited by code-review while HC owns their `mod.json`. | Disjoint files; the overlay is sequenced by D6. |
| The ownership map blocks a fix that needs a file of another role. | The owner is asked on the board; the owner makes the change in the same wave. Nobody edits a file they do not own. |
| CI minutes on a private repo. | One workflow, three short jobs, no schedule trigger. |
| Docs overpromise before the code lands. | R1-DOC-6 re-syncs claim by claim with sources; `check-docs` checks keys and links. |
| The 30 s exec limit and Chrome start time on slow machines. | R1-CR-6 caps batch size and kills orphans; timeouts produce a plain message, not a hang. |

## 9. Deferred to round 2

| Item | Reason |
| --- | --- |
| CR-1-12 fetch pipeline cost: parallel image/PDF spawns, cancelling work after navigation, `themeKey` series, bounded `readTextFile` limit | Performance, not correctness or portability; the round is already full. |
| Loading the real Obsidian logo at runtime from the user's install (HC-1-5 step 2) | Optional feature; needs UI and a copy step, not needed for publishing. |
| `preview.png` | Needs the live app; author step. |
| Enabling Pages, topic `herdr-mod`, visibility, verifying the legal owner name of the Obsidian trademark | Author-only actions or unverifiable offline. |
| Real-browser end-to-end render test in CI (Mermaid/MathJax via Chrome on ubuntu) | Needs the Obsidian bundle, which cannot be committed; design a stub bundle in round 2. |
| Anything the round-1 closing audits find in the new code | That is round 2's job (second full pass of the three roles on the merged result). |

## 10. Rules every agent keeps (from the run rules)

Work only in this repo or its worktree under `.wt/`; never write under the live Herdr app config folder; do not
drive the running app (only `herdr-app check`, `commands`, `--skill`, `--help`); no personal data in any file or
commit; `gh` with the repo owner's token only; commit messages end with the two attribution lines; a denied
command is written down and skipped; board messages are append-only heredocs with header
`### [round 1] <role> -> <role|all>: <subject>`; nobody waits for an answer, decide and record why.
