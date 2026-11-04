# Changelog

All notable changes to this project are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/). The mods have no version field in `mod.json` (it is not part of the Herdr manifest), so the version is the one in this file and in git tags.

## [Unreleased]

### Added

- Linux and Windows support in the code paths: Obsidian's vault list for macOS, Linux (including Flatpak and Snap) and Windows; tool lookup on PATH and in per-OS folders for `rg`, `pdftoppm`, `pdfinfo`, `curl`, Node.js, a Chromium-family browser and Obsidian's `obsidian.asar`; the system file opener on each OS (`open`, `xdg-open`, `rundll32 url.dll,FileProtocolHandler`; not `cmd /c start`, which would read an `&` in a web address as a second command). All operating-system literals live in one `platform.js` per mod.
- A plain message that names the missing piece and the install hint for the current system, in place of raw renderer output, for ripgrep, Node.js, the browser, the Obsidian app, Poppler and curl.
- Environment variables `HERDR_VAULT_BROWSER`, `CHROME_PATH` and `HERDR_VAULT_ASAR` to point at programs in unusual places.
- The `remoteImages` setting (`data/vault/settings.json`, default on) and a **Web images: on/off** button in the reader bar to stop downloading web images that notes show.
- Pruning of `data/vault/cache`, once per session about 8 seconds after the first reader opens: entries older than 30 days, then the oldest until under 200 MB.
- Tests: `npm test` (Node 22+, no dependencies, no Chrome, Obsidian, ripgrep or Poppler needed); a CI template for Linux, macOS and Windows exists but has not run yet.
- Release material: `LICENSE` (Apache-2.0), `NOTICE`, `RECIPE.md`, `keys.json` (Ctrl+Shift+M opens the panel as a popup, with a 420 by 640 overlay added to `mods/vault/mod.json`), `scripts/ci.workflow.yml` (the CI template, not run yet; the author copies it to `.github/workflows/ci.yml`), `scripts/check-repo.mjs`, `scripts/privacy-scan.mjs`, `scripts/PUBLISH.md`.
- Documentation: `README.md`, a GitHub Pages site in `docs/`, `AGENTS.md`, `llms.txt`, `CONTRIBUTING.md`, and `scripts/check-docs.mjs` to keep them honest.
- Settings keys `browser` and `asar` (absolute paths, in `data/vault/settings.json`) to name a browser or Obsidian's `obsidian.asar` without environment variables, which do not reach a Herdr started from Finder or a launcher. Chrome, Chromium, Brave and Edge are also looked for in the usual Linux folders and, as a last resort, through the login shell. The order is on the requirements page.
- Messages for two cases that used to show a misleading text: a note, canvas or drawing over 1 MiB (`This note is larger than 1 MiB, so the reader can't open it. Open it in Obsidian.`) and Add vault on a folder outside the home folder (`Vault outside your home folder`). The panel stops drawing after 3000 rows with `Only the first 3000 rows are drawn (close a folder, or search)`.
- Documentation: one honest support-level sentence and a per-feature, per-system table; a "Check your install" page with fifteen steps on the sample vault and a "Platform report" issue form for Linux and Windows results; a labelled schematic of the layout; "Limits you may hit"; the Herdr facts behind each editing rule with their sources; `docs/llms-full.txt` for agents; the contract now lists `mods/vault/icons/book-open.svg`.
- Checks: `scripts/check-recipe.mjs` (RECIPE.md against the code), `scripts/install-sim.mjs` (each mod copied alone into a temp Herdr home), `scripts/typecheck.mjs` (local only), strict test stubs and a scan for globals that Herdr's runtime lacks, an end-to-end render test with a stand-in Obsidian bundle and a canary server, a claims table for the docs (`scripts/doc-claims.json`), seeded-fault tests for `check-docs`, and `--release` on `check-docs` and `check-repo` as the publish gate.

### Changed

- The Obsidian logo is no longer distributed. `obsidian.png` keeps its path in `mods/vault-reader` (older copies of the portrait layout load it) but now holds a generic gem icon, and `vault.svg` is added beside it.
- The panel carries its own search icon instead of loading one from Herdr's `workspace-chrome` mod, which Herdr replaces on update.
- Fonts come from the person's Herdr font setting with generic fallbacks, not macOS font names.
- Back in the reader: Alt+Left and Backspace on every system, Cmd+[ on macOS.
- Vaults outside the home folder are listed, dimmed, as `Outside your home folder: Herdr can't read it` (new shared key `vault.outside`) instead of silently missing. A new **Import from Obsidian** menu item (command `vault.import`) reads Obsidian's list again.
- A folder with more than 2000 entries ends with `+N more not listed (search finds them)` instead of cutting off silently.
- "Open in Preview" reads "Open in the default app" on Linux and Windows.
- Search no longer loses results to `.gitignore` files in a vault that is also a git repository, ignores a person's ripgrep config, tolerates ripgrep exit code 2 when it still printed results, and parses paths that contain `:12:`.
- The development scripts `test-parse.mjs` and `make-fixture.mjs` moved from `mods/vault-reader/render/` to `tests/tools/`, so a published mod folder holds only mod files.
- Node.js 22.4 or newer is needed for diagrams, math and drawings (before: 22), because the render script uses the built-in `WebSocket`.
- The tree is in natural, case-insensitive order (`Note 2` before `Note 10`, `apple` before `Zebra`), without `Intl`, which Herdr's runtime does not have.
- PDFs inside a note or a canvas show page 1 through Poppler wherever it is installed; Quick Look is only the macOS fallback.
- A note's pictures are fetched four at a time, an image over 40 MB is refused from its file size before it is read, and the reader walks the vault at most once a second while files change. Cache entries that are still being used are kept past the 30 day prune.
- The popup of the panel has an explicit `kind`, `at` and `offset` in `mods/vault/mod.json`, taken from Herdr's picker mods and official examples; it has not been checked on a small window.
- `obsidian.png` and `vault.svg` are kept for older copies of the portrait layout; its current layout does not use them.
- Docs say what is not verified: Linux and Windows have not been seen in the live Herdr app, and the CI workflow is a template that has not run.

### Fixed

- An empty canvas no longer blanks the reader.
- A failing picture or render job shows a short message in place of that block and never replaces the document.
- Web images are downloaded with `curl`; the earlier code path could not read the response and showed none.
- Excalidraw attributes are escaped before they reach the page.
- Parser bugs: a block id containing `(`, the closing line of a fenced block, inline math in lists, quoted commas in YAML lists, and a shared regular-expression state.
- The live-refresh watcher no longer doubles up after switching vaults, and falls back to a timer (with a visible hint) when Linux refuses to watch a very large tree.
- The renderer finds a vault root on Windows without looping forever, no longer starts through a login shell there, uses a temporary browser profile per run (two readers drawing at once no longer collide), extracts Obsidian's libraries under a lock, and draws at most 6 pictures per browser start so a cold start fits Herdr's 30 second limit.
- SVG images now show: the code used `TextDecoder`, which Herdr's runtime does not have. Failures of that kind are no longer cached.
- Search keeps the text hits of notes with Windows (CRLF) line endings and understands the paths that ripgrep prints on Windows.
- A link to a file whose name has an unbalanced `)`, and a note that starts with a byte order mark, are read correctly.
- The headless browser's profile folder is removed at the end of every run, including runs that were killed.
- The CI template ran `node --test tests/`, which fails; it runs `npm test` and a check proves that every command in it exists.

### Security

- Only `http`, `https` and `mailto` links are opened from notes and canvas cards. `file:`, `obsidian:`, `javascript:` and every other scheme, which could hand a local path or another application a value taken from note content, are dropped.
- Files that start programs (`.exe`, `.bat`, `.sh`, `.app`, `.ps1`, `.jar` and similar) are never opened from a note, a canvas or the tree.
- Every argument that comes from a note (a web address) is passed to `curl` as one argument after `--`, only for `http` and `https` addresses; no shell string is built.
- The render page can no longer reach the network: a diagram label with an `<img>` that pointed at a web address used to make the headless browser fetch it even with Web images off. The page has a content-security policy and the browser resolves no name but `127.0.0.1` and uses no proxy; a canary test proves that such a label makes no request.

## [0.1.0] - Initial import

First version, as imported from a working Herdr setup (macOS only). This baseline has no git tag.

- `vault` mod: vault picker fed by Obsidian's vault list, file tree, full-text search with ripgrep.
- `vault-reader` mod: floating note reader with front matter, callouts, wikilinks, embeds, images, tasks, tags, tables, math, Mermaid, Excalidraw, Canvas and PDFs.
- A sample vault in `examples/sample-vault`.

<!-- publish: tags. Replace <owner>, and create the tag v0.1.0 (or drop the compare links) when you publish. The 0.1.0 baseline has no tag yet. -->
[Unreleased]: https://github.com/<owner>/herdr-obsidian-vault/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/<owner>/herdr-obsidian-vault/releases/tag/v0.1.0
