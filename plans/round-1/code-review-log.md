# Round 1 / code-review: implementation log

Branch `feat/round-1-portable-release--code-review` (from `feat/round-1-portable-release`). Role: code-review.
Owned files only: `mods/**` (except `mod.json` and `icons/LICENSE-lucide.txt`), `tests/**`, `package.json`.

## What was done, by task

| Task | Result |
| --- | --- |
| R1-CR-1 scaffold | Root `package.json` (`private`, `type: module`, `engines.node >= 22`, `npm test`). `tests/` with helpers (hand-built image bytes, fake exec, in-memory fs), Herdr stubs (`tests/stubs/`) so a mod's real `main.js` loads under node, fixtures, 154 tests. Dev tools moved to `tests/tools/` (`parse-sweep.mjs`, `make-fixture.mjs`; renamed because `test-parse.mjs` matches node's test-file patterns). Pure logic split out of Herdr-importing files: `assets-core.js`, `search-core.js`, `vault-files.js`, `obsidian-config.js`, `tree.js`, `watch.js`, `render/lib.mjs`. |
| R1-CR-2 overlay | Answer posted on the board before HC edited `mod.json`: safe as an overlay. Added: one folder picker at a time across docked + popup copies (shared key `vault.adding`, 2-minute expiry), `nextCommand` loop survives errors, `close()` stops loops. |
| R1-CR-3 crashes | Empty canvas: zero box, `edgesSvg` returns `null`; default card sizes; asset/renderer failures become a per-asset message or a line above the note (`this.notes`), never `this.doc = { error }`. `load()` keeps its catch for reading/parsing only. Tests: `canvas.test.mjs`, `reader-main.test.mjs` (real `main.js`: broken image, unwritable cache, no node). |
| R1-CR-4 platform.js | `mods/vault-reader/platform.js` and `mods/vault/platform.js` (shared parts copied verbatim, a test compares them). Opener, stat variants + parser, JS image-header reader (PNG, JPEG, GIF, WebP, BMP, SVG), tool lookup with install hints, `canOpen` (no programs). `stat -f`, `sips`, `cp`, `mv`, `qlmanage`, `open` are gone from the other files (`qlmanage`/`sips` command builders live in platform.js, macOS-only fallbacks). |
| R1-CR-5 vault list + search | Vault list per OS (macOS, Linux, Flatpak, Snap, Windows), Windows paths normalized, outside-home vaults kept in new shared key `vault.outside` and shown dimmed, "Import from Obsidian" (`vault.import`). Search: `--null` parsing, `--no-ignore`, `--no-config`, exit 2 with output is a result, longest word as needle, snippet guard, cached file list per vault, dead code removed, rg install hint per OS. |
| R1-CR-6 renderer | Candidate lists from platform.js passed in the job spec + env overrides; Node 22 check; library extraction under a lock into a temp folder then renamed; profile per run (removed on exit, stale ones swept); `findNear` ends at the drive root; no login-shell wrapper (Windows runs `node.exe` directly; macOS/Linux use the login shell only as a last resort for lookup); 24 s deadline + watchdog + SIGTERM cleanup; batch 6; `safeJoin`; structured errors mapped to one sentence. |
| R1-CR-7 remote images + cache | curl through `exec` (20 s, 20 MB, http/https, `--` before the URL), extension from magic bytes, failures not stored on disk (5-minute in-memory retry window), `remoteImages` setting (button in the reader bar), cache prune at session start (30 days then oldest first to 200 MB, whole entries). |
| R1-CR-8 hardening | Excalidraw: numbers, colors, enums, arrowheads, data URLs validated; all text escaped (also `'`). `safeUrl` (http, https, mailto) for notes and canvas cards; `vault:` links must name a file of the vault; programs never opened. |
| R1-CR-9 parse.js | `section()` on `^a(b`, `fenced()` closer rule, list/heading lines with inline math, quoted commas in YAML lists, no shared global regex. Each has a named regression test. |
| R1-CR-10 watchers | `Watcher` (token loop): A to B to A leaves one live loop; refused watch gives a 10 s timer plus a visible hint (panel and reader); loops survive errors; reader uses `Set` lookups and re-lists on new or deleted files; `closed` flag. |
| R1-CR-11 cleanups | `icons/search.svg` vendored (Lucide); `obsidian.png` replaced by the generic gem at the same path/size, `vault.svg` drawn by the code; UI font inherited (no Helvetica Neue / Menlo), code in the terminal font; back keys; "Open in Preview" only on macOS; `vault.panes` entry removed on close; unused import/param removed; tilde without RegExp; "+N more" for truncated folders; mod name constants in `mod-name.js`. |

## Decisions made without asking (and why)

- **`node --test tests/` does not work** on Node 22.14 or 26 (bare directory is treated as a module path). The script is `node --test --test-timeout=60000 "tests/**/*.test.mjs"`. Told HC on the board (CI template and docs say the other form).
- **Windows opener is `rundll32 url.dll,FileProtocolHandler`**, not `cmd /c start`: cmd reads `&` in a URL as another command (note content is untrusted).
- **Programs are never opened** from notes or the tree (extension deny-list `PROGRAM_EXT`): `open x.command` or `xdg-open x.desktop` would run it. Not in the plan; justified by the same threat as CR-1-7.
- **`vault.outside`** is a new additive shared key instead of widening `vault.list` entries (frozen contract).
- **No mod-to-mod import**: `platform.js` and `watch.js` are copies; tests enforce they do not drift.
- **Tool lookup last resort** on macOS/Linux is `"$SHELL" -lc 'command -v <tool>'` with no positional-parameter trick (works in fish) and only after every known folder missed; a miss is forgotten after 30 s.
- **Fonts**: no `font_family` on the reader root (it inherits the layout's UI font, which Herdr ships), `settings().ui_font` passed to the diagram page as a first choice with generic fallbacks.
- **Failed-download retry window** (5 minutes, memory only) added so a note with many web images does not spend 20 s per image on every reload while offline.
- **`RENDER_VERSION` 2 to 3**: diagram fonts changed, cached pictures are redrawn once.

## Checks run (all in this worktree)

| Check | Result |
| --- | --- |
| `npm test` (Node 26.5.0, macOS) | 154 tests, 0 failed |
| `npm test` (Node 22.14.0, macOS) | 154 tests, 0 failed |
| `herdr-app check <abs>/mods/vault`, `.../mods/vault-reader` | both "check passed" |
| `rg -n "/Applications\|/opt/homebrew\|Library/Application Support\|stat -f\|sips\|qlmanage\|workspace-chrome" mods --glob '!platform.js'` | no matches |
| HC's `check-repo.mjs` and `privacy-scan.mjs` copied in temporarily (not committed) | code-review files clean; remaining findings are HC's (sample PDFs' /Producer, RECIPE link to `docs/requirements.html` on another branch, `.gitattributes`) |
| `git ls-files mods \| grep -E "test-parse\|make-fixture"` | empty |
| sha256 of both `obsidian.png` | `470af8ac...` (the original logo was `df532907...`) |

Not checked (nobody can this round): the mods inside the live Herdr app on any OS, the headless-browser path end to end
(needs Obsidian's bundle), `herdr-app check` does NOT type-check (it passed a deliberately misspelled `cx.timer.evry`), so API
use was verified by reading `herdr.d.ts` / `gpui-kit.d.ts` plus the element-stub smoke tests (`tests/render-smoke.test.mjs`).
There is no `tsc` on this machine.

## Deferred (and why)

| Item | Why |
| --- | --- |
| CR-1-12 fetch pipeline cost (parallel image/PDF jobs, cancel work after navigation, `themeKey` series, bounded `readTextFile`) | Plan section 9: performance only. Note: `readTextFile` is documented as 1 MiB; a larger note/canvas still shows "This file is no longer in the vault". |
| Runtime loading of the real Obsidian logo | Plan section 9. |
| Real-browser render test in CI | Needs the Obsidian bundle; round 2 (stub bundle). |
| `vault-reader` kept-pane Keep menu has no Web images switch | The bar button appears in kept panes only when the note has web images (bar is shown for them). |
| Type-checking the mods | No `tsc` available offline; propose a dev-only `tsc` step in round 2. |
| `stem()` duplicated in `main.js` and `parse.js` | They differ (`.excalidraw.md` handling); left. |
| The Windows `findTool` ordering was never run on Windows | Fake-platform tests only. CI (when the author installs the workflow) will run the suite on Windows. |

## Handoffs for round 2

1. **HC**: `scripts/ci.workflow.yml` and any doc using `node --test tests/` must use `npm test`. RECIPE: button label is "Open in Preview" (macOS) / "Open in the default app", not "Open externally"; the browser profile is `data/vault/chrome-<pid>-<time>-<rand>` removed after each run; `sips`/`qlmanage` are macOS-only fallbacks (check-repo warns they are not named in RECIPE).
2. **Documentation**: the catalogue on the board (messages, discovery order, constants, env overrides, `vault.outside`, `vault.import`) is final for this round; Windows opener is rundll32. A correction to my board post: `data/vault/render` does not exist; the folders are `cache/` (pictures + json), `lib/` (Obsidian's Mermaid/MathJax), temporary `chrome-*` profiles, and `settings.json`.
3. **Round-2 code-review audit targets**: the new files (`assets-core.js`, `platform.js` x2, `render.mjs`, `watch.js`); lock-file behaviour of `ensureLib` on Windows (`mkdirSync` as the lock); `taskkill` path; whether Herdr's `exec` kills the process tree on its 30 s limit (then the watchdog may be redundant); `readTextFile` 1 MiB limit (CR-1-12); parallel image jobs; `TextView` link events for `vault:` URLs with odd characters; a `tsc` pass.
4. **Round-2 test ideas**: a stub Obsidian bundle (a tiny asar with a fake `mermaid.min.js`) to run `render.mjs` end to end with a fake browser script; Windows CI results.
