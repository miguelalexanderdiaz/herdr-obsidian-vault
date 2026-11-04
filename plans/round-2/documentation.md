# Round 2 - documentation audit

Role: documentation. Base: `feat/round-1-portable-release` at `5f96349`. Scope: README, AGENTS.md, llms.txt,
CHANGELOG, CONTRIBUTING, `docs/**`, and every claim in them checked against the code (`mods/`, `scripts/`, Herdr's
own `AGENTS.md`, `herdr.d.ts`, `herdr-app --help`) and against the portrait-layout repo.

## Summary

Round 1's docs are mostly true: on this tree `check-docs` (ok), `check-repo` (0 errors, 1 warning), `privacy-scan`
(0/0) and `npm test` (154 pass) are green, and I re-read the numbers (2000 entries, 200 results, 160 ms, 78x86 %,
30 PDF pages, 6 per batch, 30 days / 200 MB, 20 MB / 40 MB, 5 redirects, 8 s prune, 13 callouts, `RENDER_VERSION` 3,
key `ctrl-shift-m`) and the message catalogue against the source: they match.

What is wrong or missing is mostly about claims that the code does not carry, or that only look true because the
checker is weak:

- **The CI claim is false as shipped.** `scripts/ci.workflow.yml:50` still runs `node --test tests/`, which fails
  (reproduced: `test at tests:1:1 ... failed`). README, CONTRIBUTING, CHANGELOG and the site all say CI runs the checks
  on three systems. The RECIPE button name ("Open externally", `RECIPE.md:38`) also still contradicts the code and docs.
- **Support level is stated three different ways**, and `llms.txt:3` and two meta descriptions say "runs on macOS,
  Linux and Windows" with no caveat. Linux and Windows have never run in the live app.
- **Two install claims overreach the code**: the browser and Obsidian lookup does not use the install folders or the
  login shell the requirements page promises (Linux has no browser folders at all), and the "set an environment
  variable before starting Herdr" advice does not hold for apps started from Finder or a desktop launcher.
- **The contract is out of date** against the portrait layout: it no longer loads `obsidian.png`, but it does draw
  `mods/vault/icons/book-open.svg`, which no contract list names. `vault.adding` is a shared key nobody documents.
- **Documented limits are missing**: notes over 1 MiB, Linux git-ignored folders, the DevTools port, what stays in
  Herdr's shared state after uninstall.
- **Publish-time text sits in public pages** (process sentence in CHANGELOG, "For the author" section, "the author still
  has to install"), and nothing lists them for the flip at publish time.
- `check-docs` has blind spots (substring match against all source including comments; no numbers, env names or CI
  content checked), so "green" proves less than it seems.

Findings are ordered by impact. Ownership uses the round rules: code-review (CR) owns code, assets and tests;
documentation (DOC) owns README, docs/, AGENTS.md, llms.txt, CHANGELOG, CONTRIBUTING; herdr-completeness (HC) owns
RECIPE, preview.png, mod.json, layouts, keys.json, LICENSE, NOTICE, .gitignore, .github, scripts. `scripts/check-docs.mjs`
was written by DOC in round 1 with HC's approval; changes to it are posted to HC first.

---

## DOC-2-1 (high) The CI claim is not backed: the template's test step fails and has never run

- Evidence: `scripts/ci.workflow.yml:50` `run: node --test tests/`; `node --test tests/` fails on Node 22 and 26 (a bare
  folder is read as a module). Claims: `README.md:20` ("a three-OS CI workflow"), `CONTRIBUTING.md:44`, `CHANGELOG.md:16`,
  `docs/index.html:49`. `SUMMARY.md` says the integration fixed this in RECIPE, docs and PUBLISH.md, but not in the template.
  No `.github/` exists, so no CI run exists.
- Change: (HC) set that step to `npm test`. (DOC) reword each claim to what is true: "a CI template that has not run yet;
  the checks pass locally on macOS" until the author installs it and a run is green; then say which OSes ran. Drop "three-OS CI"
  from the support-level paragraphs. (DOC + HC) `check-docs` fails when `scripts/ci.workflow.yml` contains `node --test tests/`
  or lacks `npm test` and `check-docs.mjs`.
- Owner: HC (workflow), DOC (claims, check).
- Verify: `rg -n "node --test tests/" scripts/ci.workflow.yml` is empty; `node scripts/check-docs.mjs` fails on a temp copy
  with the old line; the wording grep `rg -n "three-OS|three OS" README.md docs CHANGELOG.md CONTRIBUTING.md` shows only conditional text.

## DOC-2-2 (high) One honest support statement, with a matrix, everywhere

- Evidence: `llms.txt:3` and `docs/llms.txt:3` ("runs on macOS, Linux and Windows"), `docs/index.html:7` and
  `docs/requirements.html:7` (meta descriptions), versus `README.md:20` and `docs/index.html:49` ("watched only on macOS").
  Nothing says which feature was seen where. Round 1 `SUMMARY.md` "Deferred": Linux and Windows behaviour is unverified (fake-platform tests only).
- Change: add a support table to README and `docs/requirements.html` (rows: panel and tree, search, reader text, images,
  PDF pages, math/Mermaid/Excalidraw, web images, Import from Obsidian; columns macOS / Linux / Windows; cell values
  "seen live", "unit-tested with a fake OS", "not tested"). Seen-live cells need the author: DOC fills "unit-tested" and leaves
  "seen live" for macOS only where the round-1 log says the author runs it, marked "author-reported". Reword `llms.txt` and the
  two meta descriptions to "built for macOS, Linux and Windows; verified on macOS". One sentence, reused verbatim.
- Owner: DOC. (check-docs: the sentence must appear identically in README, index and llms.txt.)
- Verify: `rg -n "runs on macOS, Linux and Windows" .` is empty; check-docs compares the three copies.

## DOC-2-3 (medium) The browser and Obsidian lookup is described as more capable than it is

- Evidence: `docs/requirements.html:35` ("For each one the mods try the bare name on your PATH, then the usual install
  folders ... and last your login shell"). That is `makeToolFinder` (`mods/*/platform.js`) and holds for rg, node, pdftoppm,
  pdfinfo and curl. The browser and the asar are found by `render.mjs` through `findBrowser`/`findAsar`
  (`mods/vault-reader/render/lib.mjs`): env vars, then fixed paths, then the `PATH` of node's own environment, no login
  shell. On Linux `browserCandidates` returns `[]` (`mods/vault-reader/platform.js:342-352`), so `/usr/bin/google-chrome`,
  `/opt/google/chrome/chrome`, `/snap/bin/chromium` and Flatpak exports work only if that directory is on the PATH that
  Herdr's `exec` gives node. A desktop-launched app often has a short PATH.
- Change (DOC, now): scope the sentence to the five tools and add a paragraph for "the browser and Obsidian", saying exactly
  what is searched per OS (list taken from `platform.js`) and that on Linux the browser must be on PATH or named in
  `HERDR_VAULT_BROWSER`. Table cell for Linux browser stays "on PATH". (CR, proposal): add Linux install folders
  (`/usr/bin`, `/opt/google/chrome`, `/snap/bin`, Flatpak `exports/bin`) to `browserCandidates` and a login-shell
  `command -v` fallback (or let the mod resolve the browser with `findTool` and pass the path in the job spec). DOC updates the
  text again when that lands.
- Owner: DOC (text), CR (code).
- Verify: `tests/platform.test.mjs` case for the Linux candidates; the paragraph quotes the same list as `platform.js`
  (check-docs claim, see DOC-2-12).

## DOC-2-4 (medium) "Set the variable before starting Herdr" does not work for most launches

- Evidence: `docs/requirements.html:65` and `docs/configuration.html:46-49` tell people to set `HERDR_VAULT_BROWSER`,
  `CHROME_PATH`, `HERDR_VAULT_ASAR` "before starting Herdr". Herdr's own notes: macOS Finder launches load the login shell's
  `PATH`, not other variables (`~/.config/herdr-app/AGENTS.md`, "Finder launches load the login shell's PATH"); `exec`
  runs "with the user's real environment (HOME, PATH, auth)" (`herdr.d.ts:10`). A variable exported in `.zshrc` and a
  Dock launch will not meet.
- Change (DOC): say how, per OS: start `herdr-app` from a terminal that has the variable; macOS `launchctl setenv NAME value`
  then restart Herdr; Windows user environment variable (System Properties or `setx`), then restart; Linux the desktop
  entry or systemd user environment. State plainly that this is documented from Herdr's behaviour and not tested here.
  (CR, proposal): also read `browser` and `asar` from `data/vault/settings.json` (the file already exists, `loadSettings`),
  so a person can fix an odd install without environment variables; DOC documents the keys when they land.
- Owner: DOC (text), CR (settings keys).
- Verify: `tests/assets.test.mjs` for the new keys; docs and `configuration.html` settings table list the same keys.

## DOC-2-5 (medium) The public contract lists stale and missing items

- Evidence: `docs/configuration.html:75`, `AGENTS.md:73`, `CHANGELOG.md:22` say the portrait layout loads
  `mods/vault-reader/obsidian.png`. In the portrait repo no mod references it any more (`rg obsidian.png mods` is empty;
  its board post says the same), while `herdr-portrait-layout/mods/bar-strip/main.js:116` draws
  `mods/vault/icons/book-open.svg`, and its `tests/repo.test.mjs:22` allow-lists that path. Neither this repo's contract table,
  AGENTS.md list, nor `scripts/check-repo.mjs` `CONTRACT` knows that file. Also `mods/vault/main.js:297-311` uses a shared key
  `vault.adding` (a two-minute picker lock) that no page mentions, though `configuration.html` "What is stored" claims to list the
  shared state.
- Change (DOC): contract table gets a row `mods/vault/icons/book-open.svg` ("drawn by the portrait layout's bar when the
  vault mod is installed; keep the path"); `obsidian.png` row says "kept for older copies of the portrait layout; may go once
  that repo confirms on its board"; `vault.adding` listed as internal, not contract. AGENTS.md list and `docs/for-agents.html` follow.
  (HC) add the svg to `check-repo.mjs` `CONTRACT`. (DOC) post on the portrait board to confirm which of the two files it still needs.
- Owner: DOC (docs), HC (check-repo, RECIPE contract sentence at `RECIPE.md:160`).
- Verify: `rg -n "book-open.svg" README.md AGENTS.md docs scripts/check-repo.mjs`; `node scripts/check-repo.mjs`; board reply.

## DOC-2-6 (medium) Known limits are not written down, and one message is documented wrongly

- Evidence:
  - `docs/troubleshooting.html:86` says "This file is no longer in the vault" means the note was deleted or moved. Round 1 log
    (`plans/round-1/code-review-log.md`, CR-1-12) records that `readTextFile` is limited to 1 MiB (`herdr.d.ts:23`) and a larger
    note or canvas shows that same message (`mods/vault-reader/doc.js:25`). The sentence is wrong for big notes.
  - `docs/troubleshooting.html:56` says Herdr refuses to watch "a tree with more than 4096 folders"; Herdr says "4096
    non-ignored directories" and that on Linux git-ignored directories are not watched at all (`herdr.d.ts:404-413`), while
    search uses `--no-ignore` (`mods/vault/search-core.js:12`). So a vault that is a git repository gets no live refresh inside
    its ignored folders on Linux.
  - `mods/vault/main.js:296-311` accepts any picked folder that has `.obsidian`; there is no inside-home check, so what a person sees
    for a vault outside the home folder added by hand is unknown (`docs/install.html` tells them to "use Add vault" in that case).
- Change (DOC): new "Limits you may hit" section on `usage.html` (and a two-line pointer in README): notes over 1 MiB,
  PDF 30 pages, folders over 2000 entries, Linux ignored folders and 4096, Excalidraw is this project's approximation,
  no editing, no other plugins, vaults outside home. Fix the troubleshooting entry to name both causes. (CR) tell DOC what
  `fs.exists`/`readdir` give outside the home folder and, if cheap, show "Outside your home folder" on Add vault; and decide the
  1 MiB message. DOC rewrites the two entries to the final text.
- Owner: DOC (docs), CR (behaviour).
- Verify: a scratch vault (copy of the sample vault) with a 1.2 MB note, read by a unit test with a stub that returns null for
  big files; docs quote the final message; check-docs message check passes against a real string (see DOC-2-12).

## DOC-2-7 (medium) The privacy page leaves out four facts

- Evidence: (a) `mods/vault-reader/render/render.mjs:155` starts the browser with `--remote-debugging-port=0`: a DevTools
  WebSocket on loopback with a random port, which node connects to; `docs/privacy.html:61` mentions only the page server
  on 127.0.0.1. (b) `docs/privacy.html:50` says Obsidian's vault list is "read once, on first run"; it is also read on
  every **Import from Obsidian** (`mods/vault/main.js:98`). (c) Herdr's `shared.json` keeps `vault.list`, `vault.current`,
  `vault.open` (a note name) and `vault.panes` after uninstall; `docs/install.html` ("Uninstall") says it is harmless but not
  that it holds paths and a note name. (d) `render.mjs` itself reads Excalidraw's embedded images from the vault with Node's
  `fs` (`scene()`), which is a read by `node`, not by the mod.
- Change (DOC): add the four to privacy.html (Runs/Reads/Writes rows), the README privacy table (one line for the debugging
  port), `AGENTS.md` "Tell the person" list, and the uninstall steps ("to forget vault paths, remove the `vault.*` keys from
  `shared.json` while Herdr is closed" - check the exact file name in Herdr's table: `shared.json`).
- Owner: DOC.
- Verify: each fact has a file:line in the ledger (DOC-2-12); check-docs ledger passes; `rg -n "remote-debugging" docs README.md AGENTS.md`.

## DOC-2-8 (medium) No way to report or compare a Linux or Windows result

- Evidence: the support level is "reports welcome" (`README.md:20`) but there is no checklist and no report template;
  `troubleshooting.html` ends with a four-item "Still stuck" list. The sample vault already covers every feature
  (`examples/sample-vault/Feature tour.md`).
- Change (DOC): `docs/verify.html` ("Check your install", linked from install and troubleshooting): steps on the sample vault
  with the expected result for each (vault list or Add vault; tree; search "tour"; open Feature tour; callouts fold; task marks;
  Mermaid and math drawn or the one-line message; photo; spec.pdf pages; Board.canvas; Flow sketch; Keep; Back keys; Web
  images button), a table to copy back ("OS and version, Herdr version, node/rg/browser/Obsidian/Poppler present, each step
  pass/fail/message"), and a note not to paste note content or paths. CONTRIBUTING gets "Reporting a result". (HC) an issue
  template with the same fields if `.github/ISSUE_TEMPLATE/` can be pushed with the current token (workflows cannot).
- Owner: DOC (page, CONTRIBUTING), HC (issue template).
- Verify: check-docs (links, headings); every step names a thing that exists in the sample vault (`rg` each name).

## DOC-2-9 (medium) No picture at all: add an honest schematic now, a clean flip for the screenshot later

- Evidence: `README.md:5` is a comment; `docs/index.html:36-38` shows a dashed "Screenshot not published yet" box;
  `scripts/check-docs.mjs:86-87` lets only `preview.png` be a missing link target. Round 1 `SUMMARY.md` priority 4 waits for the author.
- Change (DOC): `docs/assets/layout.svg`, an inline-able, labelled **schematic** (not a screenshot; light and dark through
  `currentColor`/CSS tokens, `role="img"` with text alternative) of the panel beside the floating reader, shown on index and in
  the README via the SVG file. Prepare the screenshot slot as a single `<picture>` block marked `<!-- publish: preview -->` that
  the author uncomments (README and index) after copying `preview.png` to `docs/assets/`; `PREVIEW.md` (HC) gets that line.
- Owner: DOC (svg, pages), HC (PREVIEW.md, preview.png).
- Verify: check-docs (svg alt, no external hosts); a 320 px and a 1100 px render, light and dark, in a plain headless browser
  (no Herdr app involved); contrast of the svg text against both backgrounds.

## DOC-2-10 (medium) Publish-time text is in the public pages, with no list of what flips

- Evidence: `CHANGELOG.md:7` ("Entries are filled in by the documentation role ..."), `CHANGELOG.md:5-7` "Round 1" in the
  public file; `docs/install.html:84` ("For the author: publishing"); "the author still has to install" in `README.md:20`,
  `docs/index.html:49`; `<owner>` in README, CHANGELOG (compare links to a tag `v0.1.0` that does not exist), CONTRIBUTING,
  llms.txt, docs. `scripts/PUBLISH.md:15-17` covers `<owner>` only.
- Change (DOC): CHANGELOG: drop the process sentence and the round label; heading `## [Unreleased]`; keep `[0.1.0]` as the
  imported baseline and say it has no tag. Move the "For the author" block out of `install.html` into one sentence on
  CONTRIBUTING (Pages is enabled from `main` and `/docs`). Mark every sentence that changes at publish time with
  `<!-- publish: ... -->` (HTML/Markdown) so one `rg "publish:"` finds the list. (HC) PUBLISH.md gets that command and the list.
  (HC + DOC) `check-docs --release`: fails while `<owner>`, "not published yet" or "still has to install" remain; plain
  `check-docs` stays green.
- Owner: DOC (marks, CHANGELOG, pages), HC (PUBLISH.md, a `--release` flag in a script they own or approve).
- Verify: `node scripts/check-docs.mjs` ok; `node scripts/check-docs.mjs --release` fails now and lists each item.

## DOC-2-11 (low) Site and README polish that real readers hit

- Evidence and change:
  - `docs/404.html:9` uses a relative stylesheet; GitHub Pages serves a 404 at any depth, so `/<repo>/a/b` loses its CSS.
    Inline the small CSS needed (no external host) and use plain links.
  - `docs/troubleshooting.html` has about 25 entries and no index: add a jump list at the top (the ids exist).
  - No per-OS "install every optional program in one go" block: from `HINTS` in `platform.js` (macOS `brew install ripgrep node
    poppler`; Windows `winget install BurntSushi.ripgrep.MSVC OpenJS.NodeJS` and `scoop install poppler`; Linux package manager
    names). Add to `install.html` and README (a second table-free list, kept equal by check-docs).
  - No favicon (`<link rel="icon">` missing: a 404 request per page); use `docs/assets/favicon.svg` (Lucide gem, ISC, notice already in NOTICE).
  - `docs/install.html:55` uses `$HERDR_HOME`, which is never defined; and "`herdr-app --help` prints the path" (it prints
    `Home: ~/.config/herdr-app (HERDR_APP_HOME picks another)`, not a resolved Windows path). Ask the author for the real
    Windows home, else write "`~` is your user folder; the default home is `.config/herdr-app` inside it, unless
    `HERDR_APP_HOME` is set (unverified on Windows)".
  - Add herdr.dev's own install form (`herdr.dev/mods/<owner>/<name>`) to the agent prompt once the repo is listed.
- Owner: DOC.
- Verify: check-docs; open `404.html` served from a nested path with a one-line `node` static server (no Herdr involved).

## DOC-2-12 (medium) `check-docs` passes more often than it should

- Evidence (`scripts/check-docs.mjs`): the message check (`:334-339`) is `code.includes(msg)` against all `mods/**/*.js|html`
  joined, comments included, so short quotes ("No file", "in the vault", "Mermaid:", "Math:", "Not opened") match
  anywhere. Nothing checks the numbers in the Limits table or usage page (2000, 200, 20, 30, 6, 1040/15, 3, 10000, 160 ms,
  78 %/86 %, 20/40 MB, 5 min, 30 days/200 MB), the environment variable names, the contract names and command names, the key
  in README/install prose, or the CI template. No mutation test is committed (round 1 ran 11 seeded faults by hand).
- Change: (DOC, with HC's approval of the file) add a claims table `scripts/doc-claims.json`: `{ doc, text, file, pattern }`
  rows (for example `configuration.html` "PER_FOLDER ... 2000" against `mods/vault/main.js` `/PER_FOLDER = 2000/`), checked by a
  new section of check-docs; run each message check against **string literals and template literals only** (strip `//` and
  `/* */` comments first) and require a minimum length of 12 characters or a quoted-whole-literal match; add the CI-template
  check from DOC-2-1; add `tests/check-docs.test.mjs` that copies the repo to a temp folder, seeds each fault and expects exit 1.
- Owner: DOC (check-docs and claims file; scripts/ is HC's, post and agree), CR (the test runs under `npm test`).
- Verify: the seeded-fault test passes in `npm test`; changing `PER_FOLDER` to 2001 in a temp copy makes check-docs fail.

## DOC-2-13 (low) AGENTS.md and llms.txt: gotchas that cost time in round 1, and a full text for agents

- Evidence: `AGENTS.md` has the rules but not the Herdr facts behind them, and says nothing about Finder PATH, the 1 MiB
  `readTextFile` limit, Linux watcher ignoring git-ignored folders, or `fs` writes allowed only under the Herdr home; nor a
  list of what is **not** verified (Linux, Windows), so an agent may repeat "works on Linux". `llms.txt` is served at
  `/<repo>/llms.txt`, not the domain root, so crawlers will not find it by convention.
- Change (DOC): AGENTS.md section "Herdr facts that bite" (five to eight bullets, each with its source in Herdr's
  `AGENTS.md`/`herdr.d.ts`) and "Not verified" (link to the support matrix, DOC-2-2); `docs/llms-full.txt` (README + AGENTS +
  the site's text pages as plain text, generated by `scripts/build-llms-full.mjs`, byte-checked by check-docs); `llms.txt` links it.
  Keep `llms.txt` equal to `docs/llms.txt`.
- Owner: DOC (text), HC (script placement).
- Verify: check-docs compares the generated file with a fresh build.

## DOC-2-14 (low) CONTRIBUTING and the log of what changed

- Evidence: `CONTRIBUTING.md:44` implies one set of checks everywhere; `herdr-app check` (needs the app) is mixed with the pure-Node
  ones; no mention of the `check-docs --release` / `publish:` marks; `CHANGELOG.md` has no entry type for "documented limits".
- Change (DOC): after the other findings land: update CONTRIBUTING (checks table: command, needs Herdr yes/no, which OS CI
  covers once real), the CHANGELOG `[Unreleased]` with this round's entries (CI claim wording, privacy additions, limits section,
  verify page, schematic, check-docs claims), and the AGENTS.md "Documentation upkeep" list (add `usage.html` limits and
  `verify.html`).
- Owner: DOC.
- Verify: `node scripts/check-docs.mjs`.

---

## Items for other roles (posted on the board)

- HC: DOC-2-1 workflow step; `RECIPE.md:38` "Open externally" vs "Open in Preview" / "Open in the default app"; DOC-2-5 CONTRACT; DOC-2-8
  issue template; DOC-2-9 PREVIEW.md; DOC-2-10 PUBLISH.md list and `--release`; DOC-2-12 approval to extend check-docs.
- CR: DOC-2-3 Linux browser candidates and login-shell fallback; DOC-2-4 settings keys for browser and asar; DOC-2-6 1 MiB message and
  Add vault outside the home folder; DOC-2-12 seeded-fault test location.

## Order of work for the implement step

1. DOC-2-1, DOC-2-2, DOC-2-5, DOC-2-3 (docs text), DOC-2-4 (docs text), DOC-2-6, DOC-2-7 (all text-only, no dependency on code).
2. DOC-2-10, DOC-2-11, DOC-2-9, DOC-2-8 (new page and svg).
3. DOC-2-12 (needs HC's yes), DOC-2-13, DOC-2-14.
4. Re-run the claim ledger against the final code of the other two roles' commits and update the docs for whatever landed.
