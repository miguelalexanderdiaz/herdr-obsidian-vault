# Round 1 summary: portable release

Branch: `feat/round-1-portable-release`. Three role branches (code-review, documentation, herdr-completeness) merged with `--no-ff`, no conflicts.

## What changed

**Code review**
- Root `package.json` (`npm test`), `tests/` with helpers, Herdr stubs and fixtures: 154 tests. Dev tools moved to `tests/tools/`. Pure logic split out of Herdr-importing files so Node can load it.
- `platform.js` in both mods: system opener per OS, stat variants, JS image-header reader instead of `sips`, tool lookup with install hints. `qlmanage` and `sips` remain only as macOS fallbacks.
- Obsidian vault list for macOS, Linux (incl. Flatpak, Snap) and Windows. Vaults outside the home folder go in a new additive shared key `vault.outside` (shown dimmed). "Import from Obsidian" (`vault.import`). Search fixes.
- Renderer: asar and browser discovery per OS with env overrides, Node 22 check, locked atomic lib extraction, per-run browser profile, 24 s deadline, structured errors mapped to one plain sentence.
- Remote images via curl behind a "Web images" setting, cache pruning (30 days, then oldest first to 200 MB).
- Safety: Excalidraw values validated or escaped, only http/https/mailto links opened, vault links must name a vault file.
- Fixes: parse.js regressions, empty canvas, restartable watcher with timer fallback, one-picker guard, error-surviving command loops.
- Generic gem icon replaces the Obsidian logo (`obsidian.png` path kept), `search.svg` vendored.

**Documentation**
- `README.md`, `AGENTS.md`, `llms.txt`, `CHANGELOG.md`, `CONTRIBUTING.md`.
- `docs/` GitHub Pages site (10 pages, no scripts, no external hosts, light and dark) and `docs/llms.txt`.
- `scripts/check-docs.mjs` (links, anchors, contrast, claims vs code, personal data).

**Herdr completeness**
- Apache-2.0 `LICENSE`, `NOTICE` (Lucide, lz-string, Obsidian not affiliated), `LICENSE-lucide.txt`, `.gitignore`, `.gitattributes`, sample PDFs stripped of metadata.
- `keys.json` (ctrl-shift-m opens the vault mod), `mods/vault/mod.json` overlay 420x640.
- `RECIPE.md`, `scripts/check-repo.mjs`, `scripts/privacy-scan.mjs`, `scripts/syntax-check.mjs`, `scripts/PUBLISH.md`, `scripts/PREVIEW.md`, CI workflow kept as `scripts/ci.workflow.yml`.

**Integration fixes (round-lead)**: RECIPE now names `qlmanage` and `sips` and says `npm test` (not `node --test tests/`, which fails); same correction in `docs/for-agents.html` and `scripts/PUBLISH.md`; board copied to `plans/round-1/board.md`.

## Check results (merged tree)
- `herdr-app check` on `mods/vault` and `mods/vault-reader`: passed.
- `npm test`: 154 pass, 0 fail.
- `scripts/privacy-scan.mjs`: 0 errors, 0 warnings. `scripts/syntax-check.mjs`: 51 files, ok.
- `scripts/check-docs.mjs`: ok (10 pages, 9 text files).
- `scripts/check-repo.mjs`: 0 errors, 1 warning (CI workflow not installed yet). Every `.json` and `.canvas` parses.
- No `/Users/`, home paths or personal emails outside `plans/` history, LICENSE and NOTICE.

## Deferred
- Linux and Windows behaviour in the live Herdr app is unverified (fake-platform tests only).
- `preview.png` is missing (agents may not drive the app); README references it and docs show a labelled placeholder. Needed before `check-repo --release`.
- CI workflow could not be pushed (token lacks `workflow` scope): author installs `scripts/ci.workflow.yml` as `.github/workflows/ci.yml`; no CI run exists yet.
- Author-only steps: replace `<owner>` placeholder, enable Pages, visibility, `herdr-mod` topic, squash history to remove the original Obsidian logo blob (see `scripts/PUBLISH.md`).
- Fetch pipeline cost (parallel image and PDF jobs, cancel after navigation, bounded reads, notes over 1 MiB show a misleading message).
- Real-browser end-to-end render test (needs a stub Obsidian bundle); type-check pass; runtime loading of the real Obsidian logo.

## Round 2 priorities
1. Re-run the documentation claim ledger against the final code; install the CI workflow (the one remaining check-repo warning).
2. Fetch pipeline performance and the >1 MiB note message.
3. End-to-end render test with a stub bundle; add a type-check step (tsc against herdr.d.ts).
4. Preview screenshot by the author, then the release gate (`check-repo --release`).
5. Real CI evidence on ubuntu, windows and macos once the workflow is installed.
6. Any Linux/Windows reports from live use; coordinate `vault.outside` consumers with herdr-portrait-layout via the board.
