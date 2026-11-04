# Round 1 audit: herdr-completeness

## Summary

The repo is one commit ("Import from a working Herdr setup") holding two mods (`mods/vault`, `mods/vault-reader`),
`examples/sample-vault` and a `.gitignore`. Both `herdr-app check` runs pass, the sample vault parses with
`render/test-parse.mjs`, and a grep for `/Users/`, usernames and emails finds nothing in tracked files
(git author is the GitHub noreply address).

Against Herdr's sharing format it is far from publishable:

- Missing: `RECIPE.md`, `preview.png`, `keys.json`, `LICENSE`, `NOTICE`, `.github/`, `scripts/`, `.gitattributes`.
- `mods/vault` has `place: "none"` and no `overlay`, so a user who installs only these mods never sees the panel.
- The code is macOS-only (see HC-1-4).
- `obsidian.png` is the Obsidian trademark, which Obsidian's brand page does not allow to be redistributed or edited,
  and another repo (herdr-portrait-layout) loads it by path (HC-1-5).
- The mods run programs, fetch URLs and write outside their folder. None of that is disclosed anywhere yet (HC-1-6).

References used: AGENTS.md "Layouts and mods other people made" and "Mods: `mods/<name>/`"; herdr.dev/mods
(a repo holds `mods/<name>/`, no `layouts/` folder, topic `herdr-mod`, `RECIPE.md`, `preview.png`, optional `keys.json`);
the community repos `atuinsh/herdr-atuin-threads` (root `RECIPE.md`, `preview.png`, `keys.json`, `LICENSE`),
`rabeeh-ta/herdr-git-graph` (`.github/workflows/test.yml`, `icons/LICENSE-lucide.txt`) and `jankeesvw/herdr-issues`.
All use Apache-2.0 or MIT, and a repo-root `RECIPE.md` + `preview.png`, even when the repo holds a layout plus a mod.

Decisions taken without asking (nobody can answer):

- One repo-level `RECIPE.md` and `preview.png` at the root, covering both mods. This is what the community repos do.
  herdr.dev/mods says "in each mod folder", so round 2 also checks how the site indexes a two-mod repo. If it needs one per
  folder, a short `mods/<name>/RECIPE.md` pointing at the root one is added.
- No `layouts/` folder here. The portrait layout is its own repo.
- Topic `herdr-mod` is added by the author at publish time, not by an agent.

## Findings (ordered by impact)

### HC-1-1  No licence files (high)
- Evidence: `git ls-files` has no LICENSE or NOTICE. `gh repo view` shows `licenseInfo: null`.
- Change: add `LICENSE` (Apache-2.0 text, `Copyright 2026 <author legal name, see PLAN.md>`, the same licence as herdrdev/herdr and herdr-app).
  Add `NOTICE` with the Apache NOTICE line, the third-party list from HC-1-5 and the trademark disclaimer
  ("not affiliated with or endorsed by Obsidian"). Add `mods/vault/icons/LICENSE-lucide.txt` and
  `mods/vault-reader/icons/LICENSE-lucide.txt` (ISC, as `herdr-git-graph` does). The svgs carry lucide class names or
  lucide path data, and the Lucide licence also covers its Feather-derived parts under MIT.
  `render/lzstring.js` has an MIT header (pieroxy), so list lz-string in NOTICE with its MIT text.
  `render/excalidraw.js` and `canvas.js` are original code. Callout colours follow Obsidian's default theme (colour values only), so mention it.
- Owner: herdr-completeness (all of it).
- Verify: `scripts/check-repo.mjs` (HC-1-8) asserts the files exist and `LICENSE` contains "Apache License". Every svg directory has its licence file.

### HC-1-2  Standalone install shows nothing: mod.json and keys.json (high)
- Evidence: `mods/vault/mod.json` is `{ "place": "none", "title": "Vault" }`, so no layout docks it. Only the author's layout does.
  `mods/vault-reader/mod.json` is `{"place": "none", ...}`, which is right: only the vault panel opens it with `openOverlay`.
  There is no `keys.json`.
- Change:
  - `mods/vault/mod.json`: `{ "place": "none", "title": "Vault", "overlay": { "width": 420, "height": 640 } }`, so `mod.open {name: "vault"}`
    shows the panel as a popup in any layout. In the portrait layout it is still docked by its layout block (the layout decides after first sight).
    The size is a guess. Code-review must confirm the panel's selector menu and `nextCommand("add")` still work as an overlay.
  - `keys.json` at the root: `{ "global": { "ctrl-shift-e": "mod.open:vault" } }`. One key for every OS (ctrl-shift also works on macOS, no cmd-).
    AGENTS.md says to ask before replacing a key the user already uses, so RECIPE "Watch out" says to check `herdr-app commands` and the user's own `keys.json`.
    Do not bind plain ctrl+letters. Per-OS defaults can be added later.
  - Keep `vault-reader` without a key (it is opened from the panel).
  - Keep `"focusable": true` on `vault-reader` (the reader handles keys, see `main.js` around line 317).
- Owner: herdr-completeness (mod.json, keys.json). Code-review checks the overlay behaviour in `mods/vault/main.js`.
- Verify: `herdr-app check` on both mods; `scripts/check-repo.mjs` validates the mod.json keys against `place` in {right,left,top,bottom,none}, numeric `size`, `overlay.width/height` and boolean `focusable`; keys.json parses and every action is `name[:value]` or `<mod>.<command>`.

### HC-1-3  RECIPE.md and preview.png missing (high)
- Evidence: neither exists.
- Change: `RECIPE.md` at the repo root with the six sections of AGENTS.md, written from the real files:
  1. `# Obsidian Vault`, one paragraph, `![...](preview.png)`.
  2. What you see: the vault panel (selector row, search input, tree, 2000 entries per folder cap, icons from `mods/vault/icons`), and the reader window (78% x 86% float, 1040px column, 15px text, properties, callouts with the 13 types and their colours from `CALLOUT` in `main.js`, Keep menu, PDF pages capped at `PDF_PAGES = 30`).
  3. How it behaves: click a note, folder, canvas, drawing, image, PDF or other file; search starts at 2 letters; rg order is name matches first, then text; `watchFolder` refresh; back with `[`+cmd or alt-left (see HC-1-4); the Keep menu (New tab "obsidian", Add to obsidian); `vault.open` / `vault.panes` shared keys.
  4. Built from: both mod.json files, the shared keys `vault.list`, `vault.current`, `vault.open`, `vault.panes`, the `herdr` imports used, the programs (rg, node, Chrome-family browser, pdftoppm/pdfinfo, OS opener), and the icon art.
  5. Watch out: a table of every external dependency per OS (HC-1-4, HC-1-6) and the stable-contract paragraph.
  6. Done when: checks that really run: `herdr-app check` on both mods; `node mods/vault-reader/render/test-parse.mjs examples/sample-vault` finishes with `errors: 0`; opening `examples/sample-vault` shows N notes. Fill in the numbers from a real run.
- `preview.png`: agents may not drive the app (rule 2), so a screenshot cannot be produced unattended. Decision: do not fake one (nothing the build doesn't do).
  Ship `scripts/PREVIEW.md` hand-off notes: use the `examples/sample-vault` (never a real vault), pick the default theme, and capture the panel next to the reader window at about 1600x1000.
  `scripts/check-repo.mjs` takes `--release`, which fails while `preview.png` is missing or smaller than 800x500. CI runs it without `--release` and only warns.
  The author takes the shot once, at publish time. Listed in the publish checklist.
- Owner: herdr-completeness. The facts come from the code: documentation may reuse the same text for the human docs.
- Verify: `scripts/check-repo.mjs` checks the six headings in order, the image link and that every mentioned path exists. Reviewer reads RECIPE against the code.

### HC-1-4  Not cross-platform: hardcoded macOS paths and tools (high)
Evidence (all in code-review's files):
- `mods/vault/main.js:42` reads `${home()}/Library/Application Support/obsidian/obsidian.json`.
- `mods/vault/search.js:13` tries only `rg`, `/opt/homebrew/bin/rg`, `/usr/local/bin/rg`, and the error says "brew install".
- `mods/vault/main.js:174` (`exec("open", ...)`) and `mods/vault-reader/main.js:64,66` (`open`, `open -a Preview`).
- `mods/vault-reader/assets.js:27` (`viaShell` runs `$SHELL -lc`), `:80` (`stat -f`, BSD only), `:98` (`sips`), `:115` (`cp`), `:136` (`qlmanage`), `:139` (`mv`), `:157` (Homebrew paths for pdftoppm).
- `mods/vault-reader/render/render.mjs:22-28`: `ASAR` and `BROWSERS` are macOS `/Applications` paths, and the error says "in /Applications".
- Fonts: `FONT = "Helvetica Neue"` (`main.js:23`), `Menlo` fallback (`main.js:501`), `page.html` and `excalidraw.js` font lists (Chalkboard SE, Menlo, SF Mono) are macOS-only. Use `settings().font_family` and generic families (`system-ui`, `ui-monospace`).
- Key: `main.js:317` goes back with `[` plus `m.platform`. gpui-kit.d.ts says `platform` is Command on macOS and the Windows/Super key elsewhere, so on Linux and Windows the `[` shortcut needs the Windows key. Do not switch it to ctrl-[ (that is Escape for programs). alt-left and backspace already work on every OS: docs and RECIPE should name those as the portable keys, and code-review may add `ctrl-alt`-free alternatives.
Change proposed (hand-off to code-review; I supply the lookup data, they write the code):
- Obsidian config: macOS `~/Library/Application Support/obsidian/obsidian.json`; Linux `~/.config/obsidian/obsidian.json` and Flatpak `~/.var/app/md.obsidian.Obsidian/config/obsidian/obsidian.json`; Windows `~/AppData/Roaming/obsidian/obsidian.json`. All are under the home folder, so mod fs may read them. The Windows home comes from `home()`, no env vars needed. A missing file means "no Obsidian list found: use Add vault" in the UI.
- Obsidian bundle (`obsidian.asar`): macOS `/Applications/Obsidian.app/Contents/Resources/`; Linux `/opt/Obsidian/resources/`, `/usr/lib/obsidian/`, `/usr/share/obsidian/`, `/var/lib/flatpak/app/md.obsidian.Obsidian/**/resources/`, `/snap/obsidian/current/resources/`; Windows `%LOCALAPPDATA%\Programs\Obsidian\resources\` (also `%ProgramFiles%\Obsidian\resources\`). Plus an override: env var `HERDR_VAULT_OBSIDIAN` or a `props`/shared key. Note: render.mjs runs under node, so it can read env vars and `process.platform`; the mod itself cannot touch paths outside home, and node can.
- Browser: Chrome, Chromium, Brave, Edge by name through `PATH` (`google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser`, `brave-browser`, `microsoft-edge`) and the standard install dirs on macOS (`/Applications/*.app/Contents/MacOS/*`) and Windows (`%ProgramFiles%` and `%ProgramFiles(x86)%` and `%LOCALAPPDATA%` `\Google\Chrome\Application\chrome.exe`, `\BraveSoftware\Brave-Browser\Application\brave.exe`, `\Microsoft\Edge\Application\msedge.exe`). Edge ships with every Windows 10/11, so the Windows case works without installing anything.
- Openers: macOS `open`, Linux `xdg-open`, Windows `cmd /c start "" <target>` (or `explorer.exe`). Pick by a platform check in node or by trying in order, and show a notice when nothing worked.
- Image size and thumbnails: replace `sips` and `qlmanage` with reading PNG/JPEG/GIF/WebP headers in JS (no program), or `magick identify` when present. PDF pages already use Poppler (`pdftoppm` / `pdfinfo`): Windows via scoop/choco/winget `poppler`, Linux `poppler-utils`, macOS `brew install poppler`. Say so in the UI message.
- Replace `stat -f`, `cp`, `mv` with `fs` calls. `sh -c` with `$SHELL -lc` does not exist on Windows: find `node` through `PATH` first, and use the login shell only on macOS and Linux.
- Every missing tool shows one line in the UI that names the tool and how to install it on this OS (no stack traces, no "brew" on Linux).
- Owner: code-review (all .js/.mjs). Data above is mine.
- Verify: unit tests for the pure lookup functions with a fake `exec` and a fake platform; CI matrix on ubuntu, windows and macos; grep rule in the privacy scan that fails on a literal `/Applications`, `/opt/homebrew` or `Library/Application Support` outside a single `platform.js` (or whichever module holds the table).

### HC-1-5  Third-party assets and the Obsidian trademark (high)
- Evidence: `mods/vault/obsidian.png` and `mods/vault-reader/obsidian.png` are the same 64x65 file (`cmp` identical). obsidian.md/brand: "The Obsidian name, logo and app icon are trademarks", "do not edit, change, distort, recolor, or reconfigure the Obsidian logo", commercial use needs permission, and the page gives no plugin/community permission. The icon is used for the kept-pane header via `image("mods/vault-reader/obsidian.png")` (herdr-portrait-layout `mods/portrait-pane/main.js:53`, `mods/portrait-tree/main.js:313`).
- Change (decision): stop distributing the Obsidian logo.
  1. Replace it with a neutral lucide `gem` svg (ISC) in both mods, and keep the file name stable for the portrait layout via a compatibility rule: portrait-layout should switch to `svg("mods/vault-reader/vault.svg")`. Until the portrait repo changes, keep the png path alive with the generic icon rendered at the same size (a 64x65 png of the new icon), so nothing breaks. Post on the portrait board.
  2. If the author still wants the real logo, it must be loaded at runtime from the user's own Obsidian install (copied into `data/vault/` on first run), never committed. That is a feature for round 2 and optional.
  3. NOTICE says: "Obsidian is a trademark of Dynalist Inc.; this project is not affiliated with it" (verify the legal owner name before publishing, I could not confirm it offline).
  4. The mods copy Mermaid, MathJax and lib files out of the user's installed Obsidian bundle at runtime into `data/vault/lib`. Nothing of it is in the repo. NOTICE states that, and README should say Obsidian must be installed (documentation).
- Owner: herdr-completeness (NOTICE, new svg/png assets live in mod folders, so code-review swaps the `image()` calls in `main.js` and the delete). Coordinated through the board.
- Verify: `scripts/check-repo.mjs` fails if any tracked file is named `obsidian.png`/`obsidian.svg` or has the logo's sha256 (add the hash of the current png to the script). Grep for `obsidian.png` in `.js` files finds no references except the compatibility copy.

### HC-1-6  Undisclosed network, exec and out-of-folder access (high)
Herdr installers warn about exactly these, so RECIPE "Watch out" and README must list them. Found in the code:
- Network: `assets.js:210` `fetch(url)` downloads any `http(s)` image in a note (`main.js:197`), so opening a note leaks the user's IP and a request to the note author's host. Obsidian does the same, but disclose it and let code-review add a setting to turn remote images off. Headless Chrome runs with `--disable-background-networking` and loads only from a loopback HTTP server on a random port (`render.mjs:67,180`). Disclose the loopback server.
- Programs (`exec`): `rg`, `node` (through the login shell), Chrome-family browser, `pdftoppm`, `pdfinfo`, `open`/`xdg-open`/`start`, `sips`, `qlmanage`, `stat`, `cp`, `mv` (the last four go away with HC-1-4). No `hc`.
- Opening links: `main.js:282` passes any `https?:`, `mailto:`, `obsidian:` or `file:` link in a note to the opener. A `file:` link in an untrusted note can open any local file with its default app. Code-review: drop `file:` or ask first, and check no argv is built by string concatenation.
- Reads outside the mod folder: Obsidian's `obsidian.json` list (HC-1-4), every vault folder the user picks (`readdir`, `readTextFile`, `watchFolder`), and `obsidian.asar` (render.mjs, read by node).
- Writes outside the mod folder: `~/.config/herdr-app/data/vault/{cache,lib,chrome}` (pictures, extracted Obsidian libs, the headless Chrome profile). Never inside a mod folder, which is correct because Herdr reloads a mod whose folder changes. Add a size cap or a "clear cache" note (code-review).
- Shared state keys written: `vault.list`, `vault.current`, `vault.open`, `vault.panes`. `localStorage` keys `open:<vault path>` hold folder lists, and that path is a local one, which is fine (it never leaves the machine).
- Change: a "Permissions and side effects" subsection in RECIPE "Watch out" with the above as a table, kept in sync by a checklist in `scripts/check-repo.mjs` (greps `fetch(`, `exec(`, `readTextFile(`, `watchFolder(` and warns when the count changes without a RECIPE edit).
- Owner: herdr-completeness (RECIPE), code-review (the settings and `file:` handling).
- Verify: RECIPE section present (check script); a unit test that a `file:` link is not passed to the opener.

### HC-1-7  CI: tests, JSON validation, privacy scan on 3 OS (high)
- Evidence: no `.github/`, no tests (`render/test-parse.mjs` is a manual dev tool that needs the vault as an argument).
- Change: `.github/workflows/ci.yml`, `on: [push, pull_request]`, `permissions: contents: read`, matrix `ubuntu-latest, windows-latest, macos-latest`, `actions/checkout@v4`, `actions/setup-node@v4` with Node 22 (the version the community repos use; the mods' node scripts use global `WebSocket`, which needs Node 22+). Steps:
  1. `node scripts/check-repo.mjs` (structure, JSON validity of mod.json / keys.json / `.canvas` files in the sample vault, RECIPE headings, licence files, svg licence files, the logo ban of HC-1-5).
  2. `node scripts/privacy-scan.mjs` (HC-1-8).
  3. `node --check` over every `.js` and `.mjs`, then `node --test tests/` when the folder exists (code-review writes the tests on `examples/sample-vault`, see the task's note that the original harness was not imported). The step is written so it passes before tests exist and cannot silently skip afterwards (fail if `tests/` exists and no test ran).
  4. `node mods/vault-reader/render/test-parse.mjs examples/sample-vault` as a smoke check until real tests replace it (requires "errors: 0" in the output).
  - No step needs Chrome, Obsidian or Herdr. `herdr-app check` stays a documented local step in CONTRIBUTING (documentation) because the runners have no Herdr app.
- Also add `.gitattributes`: `* text=auto eol=lf` plus `*.png *.pdf binary`, so Windows checkouts do not turn the sample PDFs and PNGs into CRLF-corrupted files and the `.md` fixtures hash the same on every OS.
- Owner: herdr-completeness (`.github/**`, `scripts/**`, `.gitattributes`).
- Verify: run both scripts locally on macOS (`node scripts/...`), then `gh run list` after the first push of the PR. Windows-specific traps handled in the scripts: `path.join`, no shell globbing, `process.exitCode` instead of `exit` in async code, files read as UTF-8.

### HC-1-8  Privacy scan as a script, not just a grep (medium)
- Evidence: the manual grep was clean today; nothing keeps it so, and the repo is about to receive three agents' changes.
- Change: `scripts/privacy-scan.mjs` walks `git ls-files` (so it matches what is published) and fails on: `/Users/<x>`, `/home/<x>` (except a short allow-list of generic placeholders such as `/home/user`), `C:\Users\<x>`, e-mail addresses (except `noreply@anthropic.com` in the trailer text and `*@users.noreply.github.com`), the author's account name and any extra word in a local, untracked `scripts/.privacy-words` file (gitignored, so the author's real names and employer never enter the repo to be scanned for), private hostnames (`*.local`, `*.lan`), and absolute `~/.config/herdr-app` writes in docs. It also scans the commit range with `git log --format=%B` for the same patterns when `.git` is present, and prints file:line without echoing the matched secret in full.
  It does not scan binary files. A second check lists binaries (png/pdf) so a human looks at them once: the sample PDFs and `photo.png` could carry metadata (Author, Creator, GPS). Round 2 checks this with `exiftool` or a small node PDF-info read, and strips it if found.
- Owner: herdr-completeness.
- Verify: a self-test mode (`--self-test`) feeds known-bad strings and expects failures; CI runs it.

### HC-1-9  Sample vault is not a valid vault after cloning (medium)
- Evidence: `ls -a examples/sample-vault/.obsidian` shows an empty folder, which git does not store. The mod refuses to add a folder without `.obsidian` (`main.js:104` "Not an Obsidian vault"). `.gitignore` is not the cause, git never tracks empty folders.
- Change: track `examples/sample-vault/.obsidian/app.json` containing `{}` (a harmless Obsidian config file), so "Add vault" works on a fresh clone and the RECIPE "Done when" step is real. Keep `.gitignore` free of a rule that hides `.obsidian` inside `examples/`. Check the sample files for personal metadata (HC-1-8).
- Owner: herdr-completeness (a new config file in `examples/`, which nobody else owns; code-review owns the vault's notes and tests). I will add it in round 2 unless code-review objects on the board.
- Verify: the check script asserts the file exists; the tests (code-review) load the vault through the same vault-detection function as the mod.

### HC-1-10  Stable contract with the portrait layout (medium)
- Evidence: herdr-portrait-layout reads `shared("vault.panes")` and the mod names `vault-reader` / `vault`, and loads `mods/vault-reader/obsidian.png` (see HC-1-5). Its layouts reference `"mod": "vault"` (author's live layouts `portrait-top.json:140`, `portrait-bottom.json:156`).
- Change: write the contract once in RECIPE "Watch out" and keep it in a short `CONTRACT` list inside `scripts/check-repo.mjs`: mod folder names `vault`, `vault-reader`; shared keys `vault.list`, `vault.current`, `vault.open` (`{vault, file, token}`), `vault.panes` (pane id -> `{vault, file, id}`); the tab name `obsidian`; `props` of the reader (`vault`, `file`, `anchor`, `kept`, `id`, `overlay`). The script greps the source for each shared key and fails if one disappears. Post on the portrait-layout board that the png path will change (HC-1-5) so it can switch to a vector icon of its own.
- Owner: herdr-completeness (RECIPE and script). Code-review must not rename any of these.
- Verify: check script; board thread acknowledged by the portrait repo's agents.

### HC-1-11  .gitignore and repo hygiene (low)
- Evidence: the file has `.DS_Store`, `node_modules/` and, oddly, nothing for Windows/Linux or editors; it does ignore `gpui-kit.d.ts` and `jsconfig.json` (good: Herdr writes them into mod folders, and `herdr.d.ts` is the same case).
- Change: add `herdr.d.ts`, `*.d.ts` (as `herdr-issues` does), `Thumbs.db`, `Desktop.ini`, `*.log`, `.vscode/`, `.idea/`, `scripts/.privacy-words`, `*.tmp`, `/data/` (never commit a cache), `/plans/**/*.private`. Do not ignore `examples/**/.obsidian`.
- Owner: herdr-completeness.
- Verify: `git status` clean after a `herdr-app check` run, which can write `jsconfig.json` and `gpui-kit.d.ts` into mod folders (the check was run during this audit; confirm they were ignored).

### HC-1-12  Publish checklist (low; process)
- Change: `scripts/PUBLISH.md` (not published as docs; the documentation role may link it) listing the author-only steps: take `preview.png` (HC-1-3); verify the legal name in NOTICE (HC-1-5); run `node scripts/check-repo.mjs --release`; make the repo public; add topic `herdr-mod` (never by an agent); wait up to an hour for herdr.dev/mods; check the listing; update the portrait layout's RECIPE to link here.
- Owner: herdr-completeness.
- Verify: the `--release` flag fails while a step is open (preview missing, `TODO` strings left in RECIPE/NOTICE).

## Hand-offs

| To | What |
| --- | --- |
| code-review | HC-1-4 (platform lookup, openers, fonts, no BSD tools), HC-1-5 (swap logo `image()` calls and delete the png), HC-1-6 (remote images setting, `file:` links, cache cap), HC-1-2 (overlay behaviour of `vault`), tests on the sample vault for CI |
| documentation | README must list requirements per OS (HC-1-4) and the side effects table (HC-1-6), mention `keys.json` and the install steps from AGENTS.md "Layouts and mods other people made", link RECIPE and NOTICE, and say Obsidian must be installed for diagrams |
| herdr-portrait-layout agents | HC-1-5 and HC-1-10: the png path, the shared-key contract |

## Order of work for round 2 (herdr-completeness)

HC-1-1, HC-1-3 (RECIPE text), HC-1-7 + HC-1-8 (CI and scripts), HC-1-2, HC-1-9, HC-1-10, HC-1-11, HC-1-12, then re-audit after code-review's cross-platform work lands and bring RECIPE in line with the real code.
