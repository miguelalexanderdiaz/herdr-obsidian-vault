# Changelog

All notable changes to this project are written here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/). The mods have no version field in `mod.json` (it is not part of the Herdr manifest), so the version is the one in this file and in git tags.

## [Unreleased]

Round 1: make the mods portable and publishable. Entries are filled in by the documentation role from the plan, the board and the commit log, and re-checked against the code at the end of each round.

### Added

- Linux and Windows support in the code paths: Obsidian's vault list for macOS, Linux (including Flatpak and Snap) and Windows; tool lookup on PATH and in per-OS folders for `rg`, `pdftoppm`, `pdfinfo`, `curl`, Node.js, a Chromium-family browser and Obsidian's `obsidian.asar`; the system file opener on each OS (`open`, `xdg-open`, `rundll32 url.dll,FileProtocolHandler`; not `cmd /c start`, which would read an `&` in a web address as a second command). All operating-system literals live in one `platform.js` per mod.
- A plain message that names the missing piece and the install hint for the current system, in place of raw renderer output, for ripgrep, Node.js, the browser, the Obsidian app, Poppler and curl.
- Environment variables `HERDR_VAULT_BROWSER`, `CHROME_PATH` and `HERDR_VAULT_ASAR` to point at programs in unusual places.
- The `remoteImages` setting (`data/vault/settings.json`, default on) and a **Web images: on/off** button in the reader bar to stop downloading web images that notes show.
- Pruning of `data/vault/cache`, once per session about 8 seconds after the first reader opens: entries older than 30 days, then the oldest until under 200 MB.
- Tests: `npm test` (Node 22+, no dependencies, no Chrome, Obsidian, ripgrep or Poppler needed); the CI template runs them on Linux, macOS and Windows.
- Release material: `LICENSE` (Apache-2.0), `NOTICE`, `RECIPE.md`, `keys.json` (Ctrl+Shift+M opens the panel as a popup, with a 420 by 640 overlay added to `mods/vault/mod.json`), `scripts/ci.workflow.yml` (the CI template; the author copies it to `.github/workflows/ci.yml`), `scripts/check-repo.mjs`, `scripts/privacy-scan.mjs`, `scripts/PUBLISH.md`.
- Documentation: `README.md`, a GitHub Pages site in `docs/`, `AGENTS.md`, `llms.txt`, `CONTRIBUTING.md`, and `scripts/check-docs.mjs` to keep them honest.

### Changed

- The Obsidian logo is no longer distributed. `obsidian.png` keeps its path in both mods (the portrait layout loads it) but now holds a generic gem icon, and `vault.svg` is added beside it.
- The panel carries its own search icon instead of loading one from Herdr's `workspace-chrome` mod, which Herdr replaces on update.
- Fonts come from the person's Herdr font setting with generic fallbacks, not macOS font names.
- Back in the reader: Alt+Left and Backspace on every system, Cmd+[ on macOS.
- Vaults outside the home folder are listed, dimmed, as `Outside your home folder: Herdr can't read it` (new shared key `vault.outside`) instead of silently missing. A new **Import from Obsidian** menu item (command `vault.import`) reads Obsidian's list again.
- A folder with more than 2000 entries ends with `+N more not listed (search finds them)` instead of cutting off silently.
- "Open in Preview" reads "Open in the default app" on Linux and Windows.
- Search no longer loses results to `.gitignore` files in a vault that is also a git repository, ignores a person's ripgrep config, tolerates ripgrep exit code 2 when it still printed results, and parses paths that contain `:12:`.
- The development scripts `test-parse.mjs` and `make-fixture.mjs` moved from `mods/vault-reader/render/` to `tests/tools/`, so a published mod folder holds only mod files.

### Fixed

- An empty canvas no longer blanks the reader.
- A failing picture or render job shows a short message in place of that block and never replaces the document.
- Web images are downloaded with `curl`; the earlier code path could not read the response and showed none.
- Excalidraw attributes are escaped before they reach the page.
- Parser bugs: a block id containing `(`, the closing line of a fenced block, inline math in lists, quoted commas in YAML lists, and a shared regular-expression state.
- The live-refresh watcher no longer doubles up after switching vaults, and falls back to a timer (with a visible hint) when Linux refuses to watch a very large tree.
- The renderer finds a vault root on Windows without looping forever, no longer starts through a login shell there, uses a temporary browser profile per run (two readers drawing at once no longer collide), extracts Obsidian's libraries under a lock, and draws at most 6 pictures per browser start so a cold start fits Herdr's 30 second limit.

### Security

- Only `http`, `https` and `mailto` links are opened from notes and canvas cards. `file:`, `obsidian:`, `javascript:` and every other scheme, which could hand a local path or another application a value taken from note content, are dropped.
- Files that start programs (`.exe`, `.bat`, `.sh`, `.app`, `.ps1`, `.jar` and similar) are never opened from a note, a canvas or the tree.
- Every argument that comes from a note (a web address) is passed to `curl` as one argument after `--`, only for `http` and `https` addresses; no shell string is built.

## [0.1.0] - Initial import

First version, as imported from a working Herdr setup (macOS only).

- `vault` mod: vault picker fed by Obsidian's vault list, file tree, full-text search with ripgrep.
- `vault-reader` mod: floating note reader with front matter, callouts, wikilinks, embeds, images, tasks, tags, tables, math, Mermaid, Excalidraw, Canvas and PDFs.
- A sample vault in `examples/sample-vault`.

[Unreleased]: https://github.com/<owner>/herdr-obsidian-vault/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/<owner>/herdr-obsidian-vault/releases/tag/v0.1.0
