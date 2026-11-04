# AGENTS.md

Instructions for AI agents that install, adapt, test or edit this repository. People should read [README.md](README.md) first. A short machine-readable map is in [llms.txt](llms.txt).

## What this repository is

Two Herdr desktop-app mods that let a person browse and read an Obsidian vault:

- `mods/vault`: the panel. Vault picker, file tree, ripgrep search. Opens notes in the reader.
- `mods/vault-reader`: the floating reader. Draws a note: properties, callouts, wikilinks, embeds, images, PDFs, math, Mermaid, Excalidraw, Canvas.

Both are read-only toward the vault. They are installed together, under exactly these folder names.

Herdr mods are JavaScript that describes native GPUI elements (gpui-kit). There is no DOM and no Node API inside a mod. The truth about the API is in the Herdr home folder: `AGENTS.md`, `herdr.d.ts` and `gpui-kit.d.ts` (Herdr rewrites the type files on every start). The home is `~/.config/herdr-app` unless `HERDR_APP_HOME` says otherwise; `herdr-app --help` prints it.

## File map

| Path | What | Runs in |
| --- | --- | --- |
| `mods/vault/main.js` | panel view, vault list, tree, add vault, picker menu | Herdr (mod) |
| `mods/vault/search.js`, `search-core.js` | ripgrep search glue, and the pure logic (arguments, parsing, ranking, snippet) | Herdr / plain Node |
| `mods/vault/obsidian-config.js`, `tree.js` | Obsidian's vault list parser, tree rules | Herdr and plain Node |
| `mods/vault-reader/main.js` | reader view, loading, links, Keep menu, keys | Herdr (mod) |
| `mods/vault-reader/parse.js`, `doc.js`, `canvas.js` | pure functions: Markdown to blocks, file to document, canvas to cards | Herdr and plain Node |
| `mods/vault-reader/assets.js`, `assets-core.js`, `vault-files.js` | pictures (images, PDF pages, web images, render jobs, cache) and the vault file walk: glue in Herdr, logic without Herdr imports | Herdr / plain Node |
| `mods/*/watch.js`, `mods/*/mod-name.js` | restartable folder watcher with timer fallback (identical in both mods); the mod folder name constants | Herdr and plain Node |
| `mods/*/platform.js` | every operating-system specific literal: tool lookup, install hints, openers, config paths, file stamps, image headers | Herdr and plain Node |
| `mods/vault-reader/render/` | `render.mjs`, `lib.mjs` and `browser.mjs` (plain Node: the script, its helpers, and the browser process of one run), `page.html`, `page.js`, `excalidraw.js`, `lzstring.js` (browser) | Node and the headless browser |
| `mods/*/mod.json`, `mods/*/icons/` | mod manifest, Lucide icons | Herdr |
| `examples/sample-vault/` | test vault: one file per feature | tests and manual checks |
| `tests/` | `npm test` suite, `fixtures/`, `stubs/` (strict stand-ins for Herdr's modules), `tools/` | plain Node |
| `docs/` | the GitHub Pages site (plain HTML and CSS) | browsers |
| `scripts/` | `check-docs.mjs`, `check-repo.mjs`, `check-recipe.mjs`, `privacy-scan.mjs`, `syntax-check.mjs`, `install-sim.mjs`, `typecheck.mjs`, `build-llms-full.mjs`, `doc-claims.json`, `ci.workflow.yml` (CI template), publish checklists | plain Node |
| `RECIPE.md`, `NOTICE`, `LICENSE`, `keys.json` | brief to rebuild, third-party credits, license, optional keys | |

## Tell the person before you install

Herdr's rule is to tell the person first when a mod reaches the network, runs programs or reads outside its own folder. This one does all three. Say, in your own words:

- **Reads**: the folder of the selected vault (recursively, with a watcher), Obsidian's vault list (`obsidian.json` in Obsidian's config folder; on first run and again on every **Import from Obsidian**), and, for diagrams and math, Obsidian's `obsidian.asar` (only its Mermaid and MathJax files). The render script (`node`) also reads, with Node's own file access, the picture files that an Excalidraw drawing embeds by reference from the vault.
- **Runs** (none bundled): `rg`, `node`, a headless Chrome, Chromium, Edge or Brave (with a loopback-only DevTools port for the length of one render run, and a page served from `127.0.0.1`), `pdfinfo` and `pdftoppm`, `curl`, the system opener (`open`, `xdg-open`, `rundll32 url.dll,FileProtocolHandler`), `stat` (macOS, Linux) or `powershell` (Windows) for file timestamps, the person's login shell (`command -v`) or `where` to find a program, and, on macOS only as fallbacks, `qlmanage` (page 1 of a PDF without Poppler) and `sips` (the size of AVIF and TIFF images).
- **Downloads**: web images that a note shows, with `curl`, as soon as the note opens (the host sees the IP address; 20 seconds, 20 MB, `http` and `https` only). The **Web images** button in the reader bar, or `remoteImages` set to `false` in `data/vault/settings.json`, stops it.
- **Writes**: only under `data/vault` in the Herdr home (cache, Mermaid and MathJax copies, a temporary browser profile per render run, settings). Never into the vault. The cache is pruned once per session at 30 days and 200 MB; deleting it is always safe. Herdr's shared state (`shared.json`) keeps `vault.*` keys, with vault paths and the open note's file, after uninstall; `docs/install.html` says how to clear them.
- **Opens**: only `http`, `https` and `mailto` links from notes and canvas cards; every other scheme is dropped. Files that start programs (`.exe`, `.bat`, `.sh`, `.app`, `.ps1`, `.jar` and the like, list `PROGRAM_EXT` in `platform.js`) are never opened from a note or from the tree.

The reference version of this list is `docs/privacy.html`. Keep the two in step.

## Install checklist (for an agent)

1. Read `README.md`, `RECIPE.md`, `NOTICE`, `keys.json` and every file under `mods/vault` and `mods/vault-reader` before writing anything.
2. Tell the person the list above.
3. Copy the folders `mods/vault` and `mods/vault-reader` into `<Herdr home>/mods/`. Leave `RECIPE.md` and previews out. **Never overwrite.** If either name is taken, follow [Renaming a mod](#renaming-a-mod).
4. Merge `keys.json` into the person's `keys.json`: add its sections and keys, ask before replacing a key they already use. Run `herdr-app commands` to see what is free.
5. Run `herdr-app check <absolute path of each mod folder in the Herdr home>`. Both must pass.
6. Put the panel where the person wants it. In a layout, add a stack or column child `{ "id": "vault", "type": "block", "content": { "mod": "vault" } }`. In `herdr-portrait-layout`, append it to the children of the node with id `panel-body`. The mods have `"place": "none"`, so they show nowhere until placed.
7. Check the programs the person has (table in `README.md`). Missing ones are not a reason to stop: the UI says what is missing. Offer the install command for their system.
8. Do not drive their live window to "test" it (see Testing).
9. To uninstall: delete the two mod folders, the layout block and the merged keys; `data/vault` in the Herdr home is optional to delete.

## Rules for editing a Herdr mod

These come from Herdr and from mistakes already made here.

- **Never write inside a mod folder at run time.** Herdr reloads a mod whenever any file in its folder changes. Caches live in `<Herdr home>/data/vault`.
- **No DOM and no Node APIs inside mod code** (`main.js`, `search.js`, `assets.js`). Use `exec`, `fetch`, `readTextFile`, `watchFolder` and `import * as fs from "fs/promises"` from Herdr. Mods may read under the home folder and write only under the Herdr home.
- **Plain Node files are the exception**: `render/render.mjs` and anything under `tests/` and `scripts/` run under Node 22 and may use Node APIs. Mod code must never import them.
- **Keep every pure module free of `herdr` imports** (`parse.js`, `doc.js`, `canvas.js`, `platform.js`, `search-core.js`, `assets-core.js`, `tree.js`, `obsidian-config.js`, `watch.js`, `vault-files.js`), so `node --test` can load them. Anything that needs `exec`, `fs` or the clock takes it as an argument; the Herdr-facing files (`main.js`, `search.js`, `assets.js`) are thin glue. Two files are copies by design and a test compares them: the shared parts of the two `platform.js`, and `watch.js`.
- **All operating-system literals live in `platform.js`** (one per mod, with identical tables; a test compares them). Do not write `/Applications`, `/opt/homebrew`, `Library/Application Support`, `stat -f` or similar anywhere else. `scripts/privacy-scan.mjs` fails on it.
- **No top-level side effects, no `setTimeout`/`setInterval`** (use `cx.timer`), no top-level `await` (use `cx.spawn` in `init`). Never keep a `cx` and use it later; every callback gets its own.
- **Slow work goes through `exec` or `fetch`**, not a loop in `render`. `exec` has a 30 second limit and 8 MiB of output per call (`herdr.d.ts`); the renderer batches stay under it.
- **Images and SVGs** passed to `image()` and `svg()` load only from the Herdr home folder. That is why vault images are copied into `data/vault/cache`.
- **`mod.json` has `"place": "none"`**; the only fields are those Herdr documents (`place`, `size`, `overlay`, `title`, `focusable`). Do not add a `version` field. The panel's `overlay` carries `width` and `height` and also `kind`, `at` and `offset`, which come from Herdr's shipped picker mods and official examples (see `RECIPE.md`); do not add more placement fields without a source.
- **Keep the contract stable**: mod names `vault` and `vault-reader`; shared keys `vault.list`, `vault.current`, `vault.open`, `vault.panes` (same shapes; `vault.outside` was added beside them); commands `vault.add` and `vault.import`; reader props `{ vault, file, anchor?, kept?, id?, overlay? }`; the tab name `obsidian`; the path `mods/vault/icons/book-open.svg`, which the portrait layout's bar draws. `mods/vault-reader/obsidian.png` and `vault.svg` stay for older copies of the portrait layout (its board confirmed its current layout does not use them, so a later cleanup may remove them). `vault.adding` is internal (a two-minute picker lock), not contract. The portrait layout depends on the rest. To change one, post on that repository's board first. `scripts/check-repo.mjs` enforces the list.
- **Herdr's runtime is smaller than Node's.** `TextDecoder`, `TextEncoder`, `structuredClone` and `Intl` do not exist in a mod, and `localeCompare` ignores its options (so no `numeric` or `sensitivity`). Node has all of them, which is how code passed the tests and failed in the app. The tests replace those globals for mod code, check method names against `gpui-kit.d.ts`, and scan mod source for these names (`tests/runtime-globals.test.mjs`). See "Herdr facts behind the rules" below.
- **Do not edit** `herdr.d.ts`, `gpui-kit.d.ts` or `jsconfig.json`; Herdr writes them and `.gitignore` hides them.
- **Escape hatch**: `ctrl-alt-shift-escape` sets the person's layout and `keys.json` aside. Mention it if you change keys.
- If an edit leaves a mod invalid, Herdr keeps the last good version and writes `<name>.error` next to it. Read that file.

## Herdr facts behind the rules

Each rule above has a reason. The reasons, with where they come from, so you can tell what is documented from what was probed.

| Fact | Why it matters here | Source |
| --- | --- | --- |
| `exec` has a 30 second limit and 8 MiB of output | the renderer draws at most `BATCH` pictures per browser start | `herdr.d.ts` (`exec`) |
| `readTextFile` reads at most 1 MiB, and gives null for a missing file | a note or canvas over 1 MiB cannot be opened; in round 1 it showed the same text as a missing file | `herdr.d.ts` (`readTextFile`) |
| `watchFolder` on Linux skips git-ignored folders and rejects above 4096 non-ignored ones; macOS and Windows watch everything | the timer fallback (`POLL_MS`) and the `LIVE_OFF` hint; no live refresh in ignored folders on Linux | `herdr.d.ts` (`watchFolder`) |
| Mods read under the home folder and write only under the Herdr home; images and SVGs load only from the Herdr home | vault images are copied into `data/vault/cache`; a vault outside the home folder cannot be read | Herdr `AGENTS.md`, `herdr.d.ts` |
| A Finder launch loads the login shell's PATH, with the usual install folders as a fallback; other environment variables are not carried over | a variable set in a shell profile may not reach the mods, so programs are found by folder and login-shell lookup, and the settings file can name the browser and Obsidian | Herdr `AGENTS.md` (macOS section) |
| No `setTimeout`/`setInterval`, no top-level `await`; callbacks get their own `cx` | `cx.timer`, `cx.spawn` in `init` | Herdr `AGENTS.md` |
| A mod reloads when any file in its folder changes | caches live in `data/vault`, never in the mod folder | Herdr `AGENTS.md` |
| `TextDecoder`, `TextEncoder`, `structuredClone`, `Intl` are missing; `localeCompare` ignores options | own UTF-8 decoder for SVG text, own natural-order comparator for the tree | **Probed, not documented by Herdr**: throw-away mods run with `herdr-app check` in round 2 (procedure in `CONTRIBUTING.md`); re-probe after a Herdr update |

## Not verified

State these plainly; do not write "works on Linux" or "works on Windows" anywhere.

- Linux and Windows have never been seen running in the live Herdr app. The code paths are covered by tests with a fake operating system. The one-sentence support level is in `README.md`, and the per-feature table is on `docs/requirements.html`.
- The Windows Herdr home folder is the documented default `.config/herdr-app` under the user folder. Nobody has checked it on Windows.
- The CI workflow in `scripts/ci.workflow.yml` is a template that has not run: the unattended runs had no token scope to install it. No page may say that CI ran.
- `herdr-app check` loads a mod once and checks its first description. It does not run later states, layout or async work.
- The popup's placement (`kind`, `at` and `offset` in the `overlay` of `mods/vault/mod.json`) was taken from Herdr's picker mods and official examples and has not been checked on a small window; the popup is 640 pixels tall.

## Testing

Run from the repository root. Node 22.4 or newer; no dependencies. The suite needs no Chrome, Obsidian, ripgrep or Poppler: a test that wants one of them (the end-to-end render test needs a Chromium-family browser) skips with a stated reason when it is absent, never silently. `npm test` is `node --test` with a quoted glob (`tests/**/*.test.mjs`); a bare directory argument (`node --test tests/`) is read as a module path and fails, so use `npm test` or plain `node --test`.

```sh
npm test                                                 # unit tests on the pure modules and the sample vault, strict stubs, seeded-fault tests of the checkers
node scripts/syntax-check.mjs                            # every .js and .mjs parses
node scripts/check-repo.mjs                              # manifests, keys, contract, third-party notices
node scripts/check-recipe.mjs                            # RECIPE.md against the code
node scripts/install-sim.mjs                             # each mod copied alone into a temp Herdr home
node scripts/privacy-scan.mjs                            # personal data and operating-system literals
node scripts/check-docs.mjs                              # links, anchors, contrast, tables, messages, claims
node scripts/build-llms-full.mjs --check                 # docs/llms-full.txt is current
node scripts/typecheck.mjs                               # local only: needs tsc and Herdr's .d.ts files, else prints "skipped"
herdr-app check /absolute/path/to/mods/vault             # Herdr loads the mod once
herdr-app check /absolute/path/to/mods/vault-reader
```

The CI template (`scripts/ci.workflow.yml`, not run yet) lists the first seven and the privacy and checker self-tests; `typecheck` and `herdr-app check` are local only. `node scripts/check-repo.mjs --release` and `node scripts/check-docs.mjs --release` are the publish gate: they fail by design until the author's steps in `scripts/PUBLISH.md` are done, so do not try to make them pass.

Strict stubs: the test stand-ins for gpui-kit elements allow only method names that exist in `gpui-kit.d.ts` (read from the Herdr home when present, else from `tests/stubs/gpui-methods.json`; regenerate it with `node tests/tools/gen-gpui-methods.mjs`), and the `fs/promises` stand-in only the surface Herdr declares. A misspelt method or a `TextDecoder` in mod code fails a test. To find out whether Herdr itself has some global or method, use the throw-away probe mod procedure in `CONTRIBUTING.md`, not a live window.

`herdr-app check` loads a mod once and checks its first description. It does not run later states, layout or async work.
- The popup's placement (`kind`, `at` and `offset` in the `overlay` of `mods/vault/mod.json`) was taken from Herdr's picker mods and official examples and has not been checked on a small window; the popup is 640 pixels tall.

## Testing

Run from the repository root. Node 22 or newer; no dependencies; nothing needs Chrome, Obsidian, ripgrep or Poppler. `npm test` is `node --test` with a quoted glob (`tests/**/*.test.mjs`); a bare directory argument (`node --test tests/`) is read as a module path and fails, so use `npm test` or plain `node --test`.

```sh
npm test                                                 # unit tests on the pure modules and the sample vault
node scripts/check-repo.mjs                              # manifests, keys, contract, third-party notices
node scripts/privacy-scan.mjs                            # personal data and operating-system literals
node scripts/check-docs.mjs                              # links, anchors, contrast, tables, messages
herdr-app check /absolute/path/to/mods/vault             # Herdr loads the mod once
herdr-app check /absolute/path/to/mods/vault-reader
```

`herdr-app check` loads a mod once and checks its first description. It does not lay out the mod or run later async states. Never call a mod done on that alone, and never use `herdr-app do`, `shot` or `status` against a window you do not own: it is somebody's live screen.

The test vault is `examples/sample-vault`. Open `Feature tour` in the reader to see most features; `Board.canvas`, `Flow sketch.excalidraw.md` and the two PDFs cover the rest. Edge-case fixtures belong in `tests/fixtures/`, not in the sample vault.

## Adapting for a different setup

- A different mod name: [Renaming a mod](#renaming-a-mod).
- A browser or Obsidian in an unusual place: the `HERDR_VAULT_BROWSER` / `CHROME_PATH` and `HERDR_VAULT_ASAR` environment variables, or add the path to the candidate lists in `platform.js` and its test. Other tools: put them on the person's login-shell PATH or add them to `toolCandidates` in both `platform.js` files.
- No network wanted: set `remoteImages` to `false` in `data/vault/settings.json` (or press **Web images** in the reader bar).
- Bigger or smaller limits: the constants listed on `docs/configuration.html`.
- Another operating system's quirk: add it to `platform.js` in both mods, with a test that uses a fake platform and a fake `exec`.

## Renaming a mod

Only when a name is taken. Rename the folder, then search the whole repository for the old name and change each hit:

1. The folder name, and the constants in `mod-name.js` of that mod: `MOD` and `MOD_DIR` in both, plus `READER` in `mods/vault/mod-name.js` (the name the panel opens the reader as). All paths of the mod's own icons, scripts and cache are built from `MOD_DIR`, and the overlay, `tab.new` and `pane.split` calls use `MOD` or `READER`, so nothing else spells the name in code.
2. If you rename `vault-reader`, also its name in `plans/`, `RECIPE.md` and `docs/` text, and in the portrait layout if it uses it.
3. The `mod` name in the layout block and in `keys.json` (`mod:<name>` sections, `mod.open:<name>`).
4. The shared keys (`vault.*`) and the command `vault.add`: change them only if the person wants the two copies kept apart, and then everywhere, including the other layouts that read them.
5. The data folder `data/vault`: keep it shared unless the two copies must not share a cache.

Run `herdr-app check` on both folders afterwards, then search the repository for the old name: the hits left are text, not code.

## Privacy rules for contributors and agents

- No personal data in any file or commit: no real names (except the copyright line in `LICENSE`), usernames, e-mail addresses, home paths, host names or employer names. Write `~`, `<Herdr home>`, `<vault>`, `<owner>`.
- Examples use generic text. Never copy content from a real vault or window into tests, docs or the sample vault.
- Do not add the Obsidian logo, name artwork or application files. Icons come from Lucide with its license text.
- Do not commit generated data: `data/`, caches, screenshots of real windows.

## Commits

Small, logical commits with a clear subject and a body that says why. Commit only the files your task owns. End the message with the attribution lines the owner's workflow asks for (a `Co-Authored-By` line and a session link). Never force-push `main`; never change repository visibility, settings or topics.

## Documentation upkeep

Docs must match the code. When you change a requirement, a message, a key, a limit or a setting, update in the same change: `README.md` (requirements table), `docs/requirements.html`, `docs/configuration.html`, `docs/troubleshooting.html`, `docs/usage.html` (the limits), `docs/verify.html` (the check steps), this file and `CHANGELOG.md`. Then copy `llms.txt` to `docs/llms.txt`, run `node scripts/build-llms-full.mjs` and `node scripts/check-docs.mjs`.

The script compares the requirements tables, the keys table, the two `llms.txt` copies, a freshly built `docs/llms-full.txt`, the one support-level sentence, and the messages quoted in the troubleshooting page, which must be string literals in the code (a quote only found in a comment fails; a short one must be a whole literal). `scripts/doc-claims.json` ties each number, name and phrase in the docs to the constant or string that backs it. When you rename or change one in the code, change the doc and the claim row together; `node scripts/check-docs.mjs` names the row that broke.

Every sentence that changes when the repository is published carries an HTML comment starting with `publish:`; `rg "publish:"` lists them and `node scripts/check-docs.mjs --release` fails until they are resolved. Do not remove a mark yourself: it is the author's step.
