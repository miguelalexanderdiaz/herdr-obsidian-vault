# Round 2 plan: runtime truth

Branch: `feat/round-2-runtime-truth`, based on `feat/round-1-portable-release` (5f96349). Written by the round-lead from
the three role audits in this folder (`code-review.md`, `documentation.md`, `herdr-completeness.md`), the board and
`plans/round-1/SUMMARY.md`. Nobody answers questions during the run: every decision below is final for this round and
has its reason. Round 1 stays untouched; this plan builds on it.

## 1. Goal

Round 1 made the mods portable on paper and green under Node. Round 2 makes the repo true: what the tests, the docs
and RECIPE say must be what Herdr's real runtime does.

1. **Fix what Herdr's runtime breaks and Node hid.** Herdr has no `TextDecoder`, `TextEncoder`, `structuredClone`
   or `Intl`, and `localeCompare` ignores its options (probed by code-review with throw-away mods). SVG images never
   show (CR-2-1), the tree is not in natural order (CR-2-6). The suite must be able to see this class of bug
   (strict stubs, runtime-globals scan: CR-2-7).
2. **Fix the confirmed functional bugs**: PDFs ignoring Poppler (CR-2-2), the render page reaching the network
   through Mermaid `<img>` labels (CR-2-3), CRLF notes and Windows `rg` paths in search (CR-2-4), browser/asar
   discovery weaker than tool discovery (CR-2-9), wrong messages (CR-2-10), plus cost and hygiene items.
3. **Make every claim backed**: a CI template whose commands run (HC-2-1/DOC-2-1), RECIPE checked against code
   (HC-2-2/-4), docs claims checked by a stricter `check-docs` (DOC-2-12), one honest support-level sentence and
   matrix (DOC-2-2), a tester checklist for Linux and Windows (DOC-2-8).
4. **Close the round-1 deferred list** that agents can close: end-to-end render test with a stub Obsidian bundle,
   type-check step, install simulation.

## 2. Scope and non-goals

In scope: section 4, tiers Must and Should. Tier Stretch lands only if its owner has time after Must and Should and
is otherwise listed in section 8.

Non-goals, with reasons:

- Driving the live Herdr app (run rule 2). Linux and Windows stay unverified in the live app; the new tester
  checklist (`docs/verify.html`) is how that evidence will arrive.
- A real `preview.png`. Only the author can capture one. We do **not** generate a stand-in `preview.png` (see D2).
- Installing the CI workflow, enabling Pages, visibility, topics, history rewrite, replacing `<owner>` (author-only,
  `scripts/PUBLISH.md`). No file is committed under `.github/workflows/`.
- Changing the portrait layout repo. Contract stays: mods `vault` / `vault-reader`; shared keys `vault.open`,
  `vault.panes` (and `vault.list`, `vault.current`, additive `vault.outside`); commands `vault.add`, `vault.import`;
  tab name `obsidian`; path `mods/vault/icons/book-open.svg` (drawn by the portrait bar-strip). Nothing in this
  plan renames any of them.
- Virtual list for the panel and runtime loading of the real Obsidian logo (section 8).

## 3. Decisions on disagreements and open questions

| # | Question | Decision | Reason |
| --- | --- | --- | --- |
| D1 | CI test step | `scripts/ci.workflow.yml` runs `npm test`, the same command everywhere (HC fixes it, first task). Until the author reports a green run, every public sentence says "CI template, not run yet" (DOC wording). `check-repo` fails if the template runs a command that is not in `package.json` scripts or `scripts/`. | Reproduced failing by two audits; round 1 asked and nobody applied it. |
| D2 | HC-2-8 labelled `preview.png` vs DOC-2-9 schematic SVG | Only DOC's `docs/assets/layout.svg` (a schematic labelled "not a screenshot") ships. HC does **not** create `preview.png`. README and RECIPE image lines for `preview.png` become a block marked `<!-- publish: preview -->` that the author flips on after capturing the real screenshot; the `--release` gate keeps requiring the file. | A stand-in `preview.png` would satisfy the gate without the real screenshot, and the portrait repo's illustration was a different situation (its layout is the thing shown). |
| D3 | Where publish-time wording is gated (DOC-2-10) | `check-repo --release` is the single release gate. It also runs `node scripts/check-docs.mjs --release` (DOC implements the flag: fails while `<owner>`, "not published yet", "still has to install" or an open `<!-- publish: -->` mark with unreplaced text remains in docs). HC adds `<owner>` anywhere outside `scripts/` and `plans/`. | Documentation knows its own wording, HC owns the gate; each edits only its own script. |
| D4 | Scanning `plans/` (HC-2-7) | `privacy-scan` scans `plans/` for emails, the private word list and `/Users/<real name>`-style paths; it exempts the documented placeholders (`/Users/x`, `<home>`, `~`) and lines carrying the marker `privacy-scan: example`. Plans keep quoting patterns with a placeholder, never a real path. | Round 1 skipped all of `plans/`; a real leak there would reach a public repo. |
| D5 | Extra files DOC needs outside its globs | DOC owns `scripts/doc-claims.json`, `scripts/build-llms-full.mjs`, `docs/llms-full.txt` and `tests/check-docs.test.mjs`. | They only exist to serve `check-docs.mjs`/`llms.txt`; the test file is carved out of code-review's `tests/**` because it must change in the same commit as the script. `npm test` already globs it. |
| D6 | Licence text and headers (HC-2-6) | HC adds `mods/vault-reader/render/LICENSE-lz-string.txt` (and a `check-repo` rule) first. CR then adds `// SPDX-License-Identifier: Apache-2.0` plus the copyright line to both `main.js` and points the first comment of `render/lzstring.js` at that file. | Licence text files stay HC (as with Lucide in round 1); source comments stay CR. |
| D7 | Browser and asar discovery (CR-2-9, DOC-2-3, DOC-2-4) | The mod resolves them (`findTool`-style, with install folders per OS and the login-shell lookup) and passes absolute paths in the job spec. Precedence: `data/vault/settings.json` keys `browser` and `asar` (absolute paths) > env vars `HERDR_VAULT_BROWSER`, `CHROME_PATH`, `HERDR_VAULT_ASAR` > per-OS candidates > PATH/login shell. `render.mjs` keeps its own env lookup for use without the mod. Node gate becomes 22.4 (unflagged `WebSocket`). CR posts the exact final wording on the board; DOC documents only that. | Env vars do not reach Finder or launcher starts; a settings key does. |
| D8 | Node minimum | 22.4 in `render.mjs` check, `package.json` `engines` and every doc/CI mention. | CR-2-9; CI already uses a newer Node. |
| D9 | Overlay `kind` in `mods/vault/mod.json` (HC-2-5) | Conditional. HC adds `kind` and an `at` only if `herdr-app check` accepts them **and** HC can cite where Herdr documents them (the official example folder or `AGENTS.md`). Herdr's own `AGENTS.md` documents only `overlay.width`/`height` for `mod.json`; if nothing documents more, HC leaves the file as it is and records "not verified" in RECIPE. Code-review confirmed `vault/main.js` assumes no pointer anchor. | Do not ship a placement field that a live Herdr may ignore or reject, unattended. |
| D10 | Support-level sentence (DOC-2-2) | One sentence, quoted verbatim in README, both `llms.txt`, site index, requirements and the two meta descriptions: macOS is the only OS the author uses; Linux and Windows code paths are implemented and covered by fake-platform unit tests but not run in the live app. A per-feature, per-OS matrix ("works as designed / degrades with a named message / not available") backs it, built from the final code in the last doc task. | Audits agree it is overclaimed; one sentence cannot drift. |
| D11 | Shared-key/contract changes | `vault.adding` is internal and not contract (persisted on purpose, expires after 2 min). `mods/vault/icons/book-open.svg` becomes a frozen contract path (HC adds it to `CONTRACT` in `check-repo` and RECIPE; DOC lists it). `obsidian.png` and `vault.svg` stay "kept for older copies" until the portrait board confirms it can drop them. | DOC-2-5; the portrait repo draws book-open.svg today. |
| D12 | Messages for the two wrong cases (CR-2-10) | A note or canvas over 1 MiB gets its own message; Add vault on a folder outside the home folder gets its own notification. CR posts both exact strings on the board; DOC quotes them in `troubleshooting.html`; `check-docs` matches them as string literals. | Today both show a misleading text. |
| D13 | Issue template (DOC-2-8) | `.github/ISSUE_TEMPLATE/platform-report.yml` is allowed (only `.github/workflows/` is blocked by the token). HC adds it in a commit of its own so it can be dropped if the push is refused; fallback location is `scripts/ISSUE_TEMPLATE-platform-report.yml` with a PUBLISH step. DOC sends the field list. | Smallest risk to the branch. |
| D14 | CR-2-3 fix and privacy claim | Fix: a Content-Security-Policy `<meta>` in the render page that allows only the page's own loopback origin and `data:`/`blob:`, plus `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1` (or equivalent) on the browser command line. The claim "the render page makes no outside request" is kept only because the e2e test (R2-CR-10) proves it with a canary server; otherwise DOC weakens the sentence. | The claim was false (reproduced); the fix was tested on a copy by code-review. |
| D15 | Disclosure items (HC-2-2) | RECIPE and `docs/privacy.html` / `AGENTS.md` also state: loopback-only DevTools port for one render run, `stat`, `powershell`, `where`, the login-shell lookup via `sh -c`, vault-list reads on Import, `shared.json` leftovers after uninstall, node reading Excalidraw embeds. HC owns RECIPE, DOC owns the others; text is the same facts, checked by `check-recipe` and `check-docs`. | HC-2-2 and DOC-2-7 overlap; one fact list, two owners. |
| D16 | Type check (HC-2-11) | `scripts/typecheck.mjs` is local-only: it needs `tsc` and Herdr's `herdr.d.ts`/`gpui-kit.d.ts` (read from the app home or `$HERDR_APP_HOME`); without either it prints "skipped: <reason>" and exits 0. The CI-capable half is code-review's committed method allow-list (`tests/stubs/gpui-methods.json` generated by `tests/tools/gen-gpui-methods.mjs`). `tsc` is not on this machine, so HC can only prove the skip path. | No new dependencies; avoid a gate no agent can run. |
| D17 | Round 1 plan said "all tests run on every OS" | Test files must pass on Windows by construction (CR-2-5 / HC-2-3). New tests that need a browser, `rg` or the Herdr d.ts skip with a stated reason when absent. | CI legs have never run; they must not fail for harness reasons. |

## 4. Ownership map (exclusive, this round)

| Role | Owns |
| --- | --- |
| code-review (CR) | `mods/**` **except** `mods/*/mod.json` and the licence text files below; `tests/**` **except** `tests/check-docs.test.mjs`; `package.json` |
| documentation (DOC) | `README.md`, `AGENTS.md`, `llms.txt`, `CHANGELOG.md`, `CONTRIBUTING.md`, `docs/**` (including `docs/llms.txt`, new `docs/llms-full.txt`, `docs/verify.html`, `docs/assets/**`), `scripts/check-docs.mjs`, `scripts/doc-claims.json`, `scripts/build-llms-full.mjs`, `tests/check-docs.test.mjs` |
| herdr-completeness (HC) | `LICENSE`, `NOTICE`, `RECIPE.md`, `keys.json`, `.gitignore`, `.gitattributes`, `.github/**` (never `workflows/`), `scripts/**` except DOC's files above, `mods/*/mod.json`, `mods/*/icons/LICENSE-lucide.txt`, `mods/vault-reader/render/LICENSE-lz-string.txt`, `examples/**` (metadata and stubs only), `preview.png` (not created this round) |
| round-lead | `plans/**` (this plan, `SUMMARY.md`, board copy, role logs) |

Role logs: each role writes its own `plans/round-2/<role>-log.md` at the end; the round-lead commits them during
integration (they are the one exception to "plans/** is round-lead's": roles create the file, never edit others).

Working method (as in round 1): each role works in `.wt/obsidian-vault-r2-<role>` on branch
`feat/round-2-runtime-truth--<role>`, created from this branch; commits only its own paths (`git add <paths>`,
never `git add -A`); rebases on the round branch before pushing; the round-lead merges with `--no-ff`. Each task
commit subject ends with the task id and finding id. No PR merges, no branch or worktree deletion.

Tiers: **M** must, **S** should, **T** stretch.

## 5. Tasks

### 5.1 code-review

| Id | Tier | Title | Findings | Files | Acceptance check |
| --- | --- | --- | --- | --- | --- |
| R2-CR-1 | M | Windows-safe tests: `import()` through `pathToFileURL`, case-insensitive PATH clearing, `os.tmpdir()` default appHome; grep tests and scripts-facing tests for other raw-path imports | CR-2-5, HC-2-3 | `tests/excalidraw.test.mjs`, `tests/render-lib.test.mjs`, `tests/stubs/herdr.mjs`, other `tests/**` hits | `npm test` green; `rg -P "import\\((?!.*pathToFileURL)" tests` shows no joined-path import; a test sets `Path` on a fake win32 env and still gets "no browser". |
| R2-CR-2 | M | Strict stubs and runtime guard: element stub allows only method names listed in `tests/stubs/gpui-methods.json` (generated by `tests/tools/gen-gpui-methods.mjs` from `gpui-kit.d.ts`); fs stub allows only the declared `fs/promises` surface; a test fails if mod source uses `TextDecoder`, `TextEncoder`, `structuredClone`, `Intl`, `setTimeout`, `process`, `require`, `Buffer`, DOM globals, or `localeCompare` with options (render page files and `render.mjs`/`lib.mjs`, which run in Node/Chrome, are exempt); the Node-only globals are removed from the test sandbox for mod modules. Land before the fixes below so they are tested strictly. | CR-2-7 | `tests/stubs/element.mjs`, `tests/stubs/fs-promises.mjs`, `tests/stubs/gpui-methods.json`, `tests/runtime-globals.test.mjs`, `tests/tools/gen-gpui-methods.mjs` | Seeding a misspelt method or a `TextDecoder` use into a temp copy makes the suite fail (two seeded-fault tests); with no d.ts present the committed JSON is used (test passes on CI). |
| R2-CR-3 | M | No `TextDecoder`: decode SVG bytes with a small UTF-8 function; failures of this kind are not cached; vault and web SVG paths | CR-2-1 | `mods/vault-reader/assets-core.js`, `mods/vault-reader/platform.js`, `tests/assets.test.mjs` | Test runs the decode with the sandbox where `TextDecoder` is undefined and returns text for a multi-byte SVG; failing decode is not written to the cache. |
| R2-CR-4 | M | Natural, case-insensitive folder order without `Intl`/`localeCompare` options (own comparator); same for every other sort touched by the scan | CR-2-6 | `mods/vault/tree.js`, other `mods/**` sort sites, `tests/**` | Tests: `Zebra` after `apple`, `Note 2` before `Note 10`, equal-letter-case tie-break stable; guard from R2-CR-2 passes. |
| R2-CR-5 | M | Embedded and canvas PDFs go through the Poppler path (`pdftoppm`/`pdfinfo` lookup); macOS keeps `qlmanage` only as the documented fallback | CR-2-2 | `mods/vault-reader/assets-core.js`, `mods/vault-reader/main.js`, `tests/assets.test.mjs` | Fake-exec tests per fake OS: linux and win32 with tools present run `pdftoppm`; without tools they return the install hint, not "isn't installed" when it is; darwin without Poppler uses the fallback. |
| R2-CR-6 | M | Render page cannot fetch note-driven URLs: CSP `<meta>` plus browser host-resolver rule (D14); keep per-run profile | CR-2-3 | `mods/vault-reader/render/page.html`, `mods/vault-reader/render/render.mjs`, `tests/**` | Unit test asserts the meta and the flag in the launch args; the proof is R2-CR-10's canary test. |
| R2-CR-7 | M | Search: CRLF notes keep text hits; Windows `rg` paths normalised (`\` to `/`, strip `.\`); tests with a CRLF fixture and a win32 path | CR-2-4 | `mods/vault/search-core.js`, `tests/search.test.mjs`, `tests/fixtures/` | A fixture note with CRLF returns its hit with correct snippet and line; `.\a\b.md` becomes `a/b.md`. |
| R2-CR-8 | M | Browser and asar discovery per D7: Linux candidates, login-shell fallback, settings keys `browser` and `asar`, passed in the job spec; Node gate 22.4; engines updated | CR-2-9, DOC-2-3, DOC-2-4 | `mods/vault-reader/platform.js`, `mods/vault-reader/render/lib.mjs`, `mods/vault-reader/render/render.mjs`, `mods/vault-reader/assets-core.js`, `mods/vault-reader/main.js`, `package.json`, `tests/**` | Table tests for linux, win32, darwin candidates; precedence test (settings > env > candidates); Node 22.3 fake version rejected with a plain sentence. Post the final wording on the board. |
| R2-CR-9 | M | Right messages: note or canvas over 1 MiB, vault outside the home folder in Add vault (and on opening); post the exact strings (D12) and the full current message catalogue as a changed-lines list | CR-2-10 | `mods/vault-reader/main.js`, `mods/vault-reader/doc.js`, `mods/vault/main.js`, `tests/**` | Tests drive a fake fs that throws for a 1.2 MiB file and for an outside-home path and assert the new strings; board message posted. |
| R2-CR-10 | M | End-to-end render test on a stub Obsidian bundle: real `render.mjs`, a tiny fake `obsidian.asar` built in the test (fake Mermaid and MathJax), skips with a reason when no Chromium-family browser exists; includes the canary test for D14 (a Mermaid `<img src>` pointing at a local counting server gets zero hits) and checks the profile folder is gone afterwards | CR-2-8 | `tests/render-e2e.test.mjs`, `tests/fixtures/` (stub bundle builder), `mods/vault-reader/render/render.mjs` (only if the test needs a hook) | Passes on this macOS machine with Chrome; with `HERDR_VAULT_BROWSER` pointing nowhere it reports "skipped: no browser"; canary count 0. Depends on R2-CR-6, R2-CR-8, R2-CR-13. |
| R2-CR-11 | S | Fetch pipeline: images and PDFs fetched with bounded parallelism (not sequential), size check before reading the whole file, no stat on every load | CR-2-11 | `mods/vault-reader/main.js`, `mods/vault-reader/assets-core.js`, `tests/**` | Fake-fs test shows a 20 MB file is rejected without a full read; test with 6 images shows at most N concurrent fetches (N documented as a constant). |
| R2-CR-12 | S | Reader no longer re-walks the vault on every folder event (debounce plus changed-path check); panel caps rendered rows with a visible "N more" row | CR-2-12 | `mods/vault-reader/main.js`, `mods/vault/main.js`, `tests/**` | Test counts walks over 50 fake events (at most 1); row-cap test on 5,000 files renders at most the cap plus the more-row. Virtual list is deferred (section 8). |
| R2-CR-13 | S | Browser profile folders removed at the end of every run (including kill paths where possible); sweep of leftovers older than an hour kept | CR-2-13 | `mods/vault-reader/render/render.mjs`, `tests/**` | Fake-spawn test: profile dir absent after success, after error and after timeout. |
| R2-CR-14 | S | `parse.js`: link URLs containing `)`, notes with a BOM keep their properties | CR-2-14 | `mods/vault-reader/parse.js`, `tests/parse.test.mjs` | Two regression tests fail before and pass after. |
| R2-CR-15 | S | Licence headers: SPDX line and copyright on both `main.js`, pointer to `render/LICENSE-lz-string.txt` in `render/lzstring.js` (comment-only) | HC-2-6 | `mods/vault/main.js`, `mods/vault-reader/main.js`, `mods/vault-reader/render/lzstring.js` | `check-repo` header rule passes (R2-HC-4); `herdr-app check` still passes. Depends on R2-HC-4. |
| R2-CR-16 | T | Cache hygiene: unexpected errors cached only briefly, mtime refreshed on use, stray job and quicklook files removed | CR-2-15 | `mods/vault-reader/assets-core.js`, `tests/**` | Tests with fake clock; no `job-*` file survives a run. |

Order inside code-review: 1, 2, then 7 and 14 (independent), 3, 4, 5, 6, 8, 13, 9, 10, 11, 12, 15, 16. R2-CR-10 waits
for 6, 8 and 13. CR's last action is the full verification (section 7), run after DOC and HC post their final syncs,
and a final board message with every wording that changed since the first catalogue.

### 5.2 herdr-completeness

| Id | Tier | Title | Findings | Files | Acceptance check |
| --- | --- | --- | --- | --- | --- |
| R2-HC-1 | M | CI template fixed: `npm test`, steps pinned to concrete action majors, steps not skippable (no `continue-on-error`), Node 22.x on three OSes, optional private-word-list step guarded by a repo secret; `check-repo` verifies each `run:` command resolves to a `package.json` script or a file in `scripts/`; PUBLISH.md install step and "after the first green run, tell the maintainers" line | HC-2-1, DOC-2-1, HC-2-10 | `scripts/ci.workflow.yml`, `scripts/check-repo.mjs`, `scripts/PUBLISH.md` | `check-repo` exits 0 and the one warning about the uninstalled workflow is the only one; changing the template's test line back to `node --test tests/` in a temp copy makes `check-repo` exit 1. |
| R2-HC-2 | M | RECIPE corrections against code: Windows opener (`rundll32`), button labels (`Open in Preview` / `Open in the default app`, `Web images: on/off`), the login-shell `sh -c` lookup, profile folders `chrome-<pid>-<time>-<rand>`, exec list (stat, powershell, where, login shell, loopback DevTools port), shared keys incl. `vault.outside`, `book-open.svg` contract path, `<!-- publish: preview -->` block (D2, D11, D15). **Two passes**: first from today's code, second after the CR catalogue (waves C/D) | HC-2-2, DOC-2-5 | `RECIPE.md` | Passes `check-recipe` (R2-HC-3); second pass diff reviewed against the CR board post. |
| R2-HC-3 | M | `scripts/check-recipe.mjs`: claim ledger mapping each RECIPE statement (opener per OS, labels, exec list, keys, contract, paths, limits, constants) to a source line or constant in the mods; fails when a claim has no source; wired into `check-repo`; seeded-fault self-test | HC-2-4 | `scripts/check-recipe.mjs`, `scripts/check-repo.mjs`, `scripts/lib/repo.mjs` | Exit 0 on the branch; a temp copy with `cmd /c start` or "Open externally" put back exits 1. |
| R2-HC-4 | M | Licence travel: `mods/vault-reader/render/LICENSE-lz-string.txt`; `check-repo` rules: SPDX header in each mod `main.js`, lzstring pointer, NOTICE names it. Land the file first (CR-15 waits) | HC-2-6 | `mods/vault-reader/render/LICENSE-lz-string.txt`, `scripts/check-repo.mjs`, `NOTICE` | File exists; rule is a warning until R2-CR-15 lands, an error after (HC flips it in the final pass). |
| R2-HC-5 | M | Release gate and scan hygiene: `--release` fails on `<owner>` outside `scripts/` and `plans/`, runs `check-docs --release` (D3), checks `preview.png` and the copyright placeholder as before; `privacy-scan` scans `plans/` per D4; list the git-author/email exposure in PUBLISH (author decision) | HC-2-7, DOC-2-10 | `scripts/check-repo.mjs`, `scripts/privacy-scan.mjs`, `scripts/PUBLISH.md` | `check-repo --release` lists exactly the author-only blockers (preview, `<owner>`, copyright, publish marks); a seeded real-looking path in `plans/` makes `privacy-scan` exit 1; placeholders do not. |
| R2-HC-6 | S | `mods/vault/mod.json` kind/placement per D9 (conditional); contract list gains `book-open.svg`; `keys.json` untouched unless a conflict is found | HC-2-5, DOC-2-5 | `mods/vault/mod.json`, `scripts/check-repo.mjs`, `RECIPE.md` | `herdr-app check` on both mods passes; if D9 declines, RECIPE says "placement not verified" and no mod.json change. |
| R2-HC-7 | S | `scripts/install-sim.mjs`: copies each `mods/<name>/` alone into a temp Herdr-home layout, merges `keys.json` into a temp keys file, asserts each mod's imports resolve inside its folder, no cross-mod reference, no file outside the folder needed, merge is idempotent | HC-2-9 | `scripts/install-sim.mjs` | Exit 0 on the branch; deleting a needed file in a temp copy exits 1. Wired into `check-repo`'s optional list and CONTRIBUTING (DOC). |
| R2-HC-8 | S | `scripts/typecheck.mjs` per D16; `.gitignore` narrowed (`*.d.ts` only where generated; `.error` files; keep examples' `.obsidian`) | HC-2-11 | `scripts/typecheck.mjs`, `.gitignore` | `node scripts/typecheck.mjs` prints "skipped: ..." and exits 0 here; `git status` is clean after `herdr-app check` on both mods. |
| R2-HC-9 | S | PUBLISH.md and PREVIEW.md updated: `rg "publish:"` list, copy `preview.png` to `docs/assets/` and flip the marked blocks (DOC-2-9), herdr.dev one-folder-per-example check with fallback (two repos or a monorepo note), issue template step | HC-2-12, DOC-2-9, DOC-2-10 | `scripts/PUBLISH.md`, `scripts/PREVIEW.md` | `check-repo --release` step list equals the PUBLISH.md list (existing check extended). |
| R2-HC-10 | S | `.github/ISSUE_TEMPLATE/platform-report.yml` from DOC's field list (D13), separate commit | DOC-2-8 | `.github/ISSUE_TEMPLATE/platform-report.yml` | YAML parses (node-less check by `check-repo` JSON/YAML rule or a simple parse); push accepted, else fallback location. |
| R2-HC-11 | T | Default-chord snapshot in `check-repo` compares with `herdr-app commands` when the binary is on the machine and reports the Herdr version it was taken from | HC-2-13 | `scripts/check-repo.mjs`, `keys.json` (only if a conflict appears) | Passes here; prints "snapshot only" when `herdr-app` is absent. |
| R2-HC-12 | M | **Last HC task.** Final RECIPE pass, flip HC-4 rule to error, re-audit the merged branch against the CR board post, post result; `plans/round-2/herdr-completeness-log.md` | all HC | `RECIPE.md`, `scripts/**`, board | Verification (section 7) green except the documented author-only gate items. |

### 5.3 documentation

| Id | Tier | Title | Findings | Files | Acceptance check |
| --- | --- | --- | --- | --- | --- |
| R2-DOC-1 | M | Publish-time marks and the schematic: `<!-- publish: ... -->` on every publish-time sentence (CHANGELOG process sentence, "For the author", "still has to install", screenshot slot, `<owner>`); `docs/assets/layout.svg` labelled "schematic, not a screenshot", used in README and `docs/index.html`; `--release` flag in `check-docs` (D3) | DOC-2-9, DOC-2-10 | `README.md`, `CHANGELOG.md`, `docs/index.html`, `docs/install.html`, `docs/assets/layout.svg`, `scripts/check-docs.mjs` | `check-docs` exits 0; `check-docs --release` exits 1 and lists each open mark; SVG contrast/labels pass the existing checks. |
| R2-DOC-2 | M | CI wording: "template, not run yet" in README, CONTRIBUTING, CHANGELOG, site until the author confirms a run (D1); update when HC lands the fixed template and ask `check-docs` to verify the template's commands (R2-DOC-4) | DOC-2-1 | `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/index.html` | No page claims CI runs; wording is a `publish:` mark so the author flips it. |
| R2-DOC-3 | M | Tester kit: `docs/verify.html` (checklist on `examples/sample-vault`, per OS, with a report template), CONTRIBUTING "Reporting a platform result", troubleshooting index and `docs/404.html` CSS at depth, favicon, per-OS install block and `$HERDR_HOME` definition in the Windows snippet | DOC-2-8, DOC-2-11 | `docs/verify.html`, `docs/troubleshooting.html`, `docs/404.html`, `docs/install.html`, `docs/assets/**`, `CONTRIBUTING.md`, `README.md` | `check-docs` links/anchors pass; each checklist item names a file in the sample vault that exists (checked). Send HC the issue-template field list on the board first. |
| R2-DOC-4 | M | `check-docs` stricter: claims table `scripts/doc-claims.json` (numbers, env names, key names, contract names, message strings) matched against code **string literals** and constants, not comments; CI template check; seeded-fault test | DOC-2-12 | `scripts/check-docs.mjs`, `scripts/doc-claims.json`, `tests/check-docs.test.mjs` | A temp copy with a reworded message, a changed constant or a doc number off by one exits 1 (three seeded cases in the test); exit 0 on the branch. |
| R2-DOC-5 | M | Docs follow the code once CR posts (waves B/C): requirements page (what is really searched, per-OS env methods, settings keys `browser`/`asar`, Node 22.4), configuration (settings, `vault.adding` internal, `book-open.svg` contract), troubleshooting (the two new messages, Linux ignored folders and the 4096 rule, Add vault outside home), privacy (DevTools port, vault-list reads, `shared.json` leftovers, node reading Excalidraw embeds, CSP statement per D14) | DOC-2-3..7 | `docs/requirements.html`, `docs/configuration.html`, `docs/troubleshooting.html`, `docs/privacy.html`, `docs/usage.html`, `README.md`, `AGENTS.md` | `check-docs` green with the new claims in `doc-claims.json`; every quoted message has a code literal. |
| R2-DOC-6 | S | Agent docs: AGENTS.md "Herdr facts behind the rules" and a "not verified" list (no TextDecoder/Intl, localeCompare options, Linux/Windows live use), `scripts/build-llms-full.mjs` and `docs/llms-full.txt` (freshness checked by `check-docs`), `llms.txt` == `docs/llms.txt` as before | DOC-2-13 | `AGENTS.md`, `llms.txt`, `docs/llms.txt`, `docs/llms-full.txt`, `scripts/build-llms-full.mjs` | `node scripts/build-llms-full.mjs --check` exits 0; `check-docs` equality passes. |
| R2-DOC-7 | M | Support level (D10): the single sentence plus the per-feature, per-OS matrix, built **after** CR's final catalogue; replaces the wording in `llms.txt`, `docs/llms.txt` and the two meta descriptions | DOC-2-2 | `README.md`, `llms.txt`, `docs/llms.txt`, `docs/index.html`, `docs/requirements.html` | `check-docs` verifies the sentence appears verbatim in each listed file. |
| R2-DOC-8 | M | **Last DOC task.** CONTRIBUTING (checks table with needs-Herdr and CI coverage, probe-mod procedure, `install-sim`, `check-recipe`, `typecheck`), CHANGELOG entries for this round, final sync pass; claim-by-claim list posted on the board; `documentation-log.md` | DOC-2-14 | `CONTRIBUTING.md`, `CHANGELOG.md`, `AGENTS.md`, `plans/round-2/documentation-log.md` | Every command in CONTRIBUTING runs green on a clean checkout of the merged branch. |
| R2-DOC-9 | S | Ask the portrait board which Obsidian files it still uses (already posted); record the answer in README/docs contract wording when it comes | DOC-2-5 | `docs/configuration.html`, `README.md` | Answer on a board or the "kept" wording stays. |

Documentation also posts to the portrait board only for the file-use question above; no other cross-repo post.

## 6. Order, dependencies and landing waves

Roles commit only their own files, so merges are conflict-free by construction.

1. **Wave A, independent start.**
   CR: R2-CR-1, R2-CR-2, then R2-CR-7, R2-CR-14.
   HC: R2-HC-1, R2-HC-4 (file first), R2-HC-5, R2-HC-2 first pass.
   DOC: R2-DOC-1, R2-DOC-2, R2-DOC-3, R2-DOC-4, R2-DOC-6 (parts independent of CR).
2. **Wave B, needs CR-2 (strict stubs) for CR's own fixes; HC-4 for CR-15.**
   CR: R2-CR-3, 4, 5, 6, 8, 13, 9 (post the exact strings and wording as each lands).
   HC: R2-HC-3 (ledger grows as CR lands), R2-HC-6, R2-HC-7, R2-HC-8, R2-HC-10 (needs DOC-3's field list).
3. **Wave C, needs CR-6/8/9/13.**
   CR: R2-CR-10, 11, 12, 15, 16.
   DOC: R2-DOC-5 (waits for the R2-CR-8 and R2-CR-9 board posts), R2-DOC-7 matrix (waits for the CR catalogue).
   HC: R2-HC-9, R2-HC-2 second pass, R2-HC-11.
4. **Wave D, last.** DOC: R2-DOC-8. HC: R2-HC-12 (flip rules, re-audit). CR: full verification and final wording post.
   Round-lead: integration merge and `SUMMARY.md`.

Hard dependencies:

| Waiting task | Needs | Because |
| --- | --- | --- |
| R2-CR-3..16 (code fixes) | R2-CR-2 | fixes must run under strict stubs |
| R2-CR-10 | R2-CR-6, R2-CR-8, R2-CR-13 | the e2e test proves the CSP, discovery and profile cleanup |
| R2-CR-15 | R2-HC-4 | the licence file and rule must exist first |
| R2-DOC-5, R2-DOC-7 | board posts from R2-CR-8, R2-CR-9 and the final CR catalogue | docs quote exact strings and discovery order |
| R2-DOC-4 | R2-HC-1 | `check-docs` reads the fixed CI template |
| R2-HC-10 | R2-DOC-3 field list | template fields come from the verify page |
| R2-HC-3 second pass, R2-HC-12 | all CR tasks landed | claims checked against final code |
| R2-HC-5 | R2-DOC-1 (`--release` flag) | the gate runs it |
| R2-DOC-8 | all other tasks | final sync |

Board contract: CR posts, after each of R2-CR-3, 5, 8, 9 and 10, a message `### [round 2] code-review -> all:` with
exact strings, the discovery order and changed claims. DOC and HC only quote those.

## 7. How the round is verified

Run from the repo root on the merged branch (round-lead and each role on its own branch before pushing):

```
npm test
node scripts/check-docs.mjs
node scripts/check-repo.mjs
node scripts/check-recipe.mjs
node scripts/privacy-scan.mjs
node scripts/syntax-check.mjs
node scripts/install-sim.mjs
node scripts/typecheck.mjs
node scripts/build-llms-full.mjs --check
herdr-app check <abs path>/mods/vault
herdr-app check <abs path>/mods/vault-reader
```

Expected: `npm test` green with the previous 154 tests plus the new ones (e2e skipped with a reason where no browser
exists, never silently); `check-repo --release` red only for the author-only items (preview.png, `<owner>`,
copyright placeholder, publish marks); `typecheck` prints "skipped" here; no `/Users/`, home path, email or
hostname in any tracked file or commit message (`privacy-scan`, including `plans/`).

Additional round-2 evidence the roles must produce:

- Probe evidence for runtime claims: a throw-away mod folder outside the Herdr home run with `herdr-app check`
  (procedure goes into CONTRIBUTING). No other `herdr-app` command.
- The e2e canary test result (zero requests) and a run of the real renderer on this machine, recorded in
  `code-review-log.md`.
- Seeded-fault evidence for each new checker (`check-docs`, `check-recipe`, `install-sim`, strict stubs):
  one temp-copy failure per checker, recorded in the role log.

## 8. Deferred to round 3, with reasons

| Item | Reason |
| --- | --- |
| Linux and Windows live verification, real CI evidence on three OSes | Needs the author to install the workflow and testers on those OSes; the round delivers the checklist (`docs/verify.html`), issue template and CI template for it. |
| Virtual list in the panel (second half of CR-2-12) | Needs a UI design (options and a schematic first, per the author's preferences) and live scrolling checks; round 2 only caps rows. |
| Runtime loading of the real Obsidian logo from the user's install | Trademark-sensitive, needs asar icon lookup, and no one needs it; may be dropped. |
| `preview.png` and the release gate going green | Author capture; D2 keeps the gate honest. |
| Publishing steps (workflow install, Pages, topics, visibility, history squash, git author privacy settings) | Author-only by run rules; listed in `scripts/PUBLISH.md`. |
| R2-CR-16 cache hygiene, R2-HC-11 default-chord snapshot | Tier T: land only if time remains; otherwise logged here as open. |
| Obsidian file list answer from the portrait board | Waiting on another repo; wording stays "kept" until then. |
| Full tsc type check in CI | Needs `tsc` and Herdr's d.ts files on the runner; not shippable in the repo. Local-only script and the method allow-list cover most of it. |

## 9. Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Strict stubs (R2-CR-2) turn many existing tests red | Medium | Land first; fix stubs/tests in the same task; the allow-list is generated from the real d.ts so legitimate methods pass. |
| CSP plus host-resolver rule breaks a legitimate render (Mermaid fonts, MathJax assets) | Medium | The page loads its libraries from its own loopback server; R2-CR-10 renders Mermaid and math in the stub bundle and the real bundle was rendered by code-review in the audit. Run the real bundle once more on this machine after the change. |
| E2E test flaky on CI (browser start time) | Medium | Single job, 24 s deadline already in `render.mjs`, skip with a stated reason when no browser; no retries that hide failure. |
| Windows and Linux paths still unproven | High | Fake-platform tests, PATH/`Path` handling, checklist for testers; every public statement uses the D10 sentence. |
| Docs drift from last-minute CR wording changes | Medium | Board catalogue protocol; `doc-claims.json` plus string-literal matching fails the build on drift; DOC-8 is last. |
| `.github/ISSUE_TEMPLATE` push refused | Low | Separate commit, fallback location (D13). |
| Role editing a file owned by another (copy-paste of section 4 globs) | Low | Section 4 is exclusive; any needed change goes to the board with the owner named. |
| Git author or merge-commit email exposure when going public | Known | Listed in PUBLISH (R2-HC-5); author decision; no PR is merged by an agent. |
| Herdr changes its runtime between rounds | Low | Runtime-globals test lists what was probed and when; CONTRIBUTING says how to re-probe. |
| Too much for one round | Medium | Tiers; Must items are CR-1..10 except 10 depends on others, HC-1..5 and HC-12, DOC-1..5, 7, 8; Stretch is allowed to slip into section 8. |

## 10. Round-lead integration

After the roles finish: merge the three role branches with `--no-ff` into `feat/round-2-runtime-truth`, run section 7,
copy the board to `plans/round-2/board.md`, write `plans/round-2/SUMMARY.md` (what changed, check results, deferred,
round 3 priorities), push, and open the PR against `feat/round-1-portable-release` (never merged by an agent).
