# Round 2 - documentation log (implement step)

Role: documentation. Branch `feat/round-2-runtime-truth--documentation`, based on `feat/round-2-runtime-truth`.
Files touched: `README.md`, `AGENTS.md`, `llms.txt`, `CHANGELOG.md`, `CONTRIBUTING.md`, `docs/**`,
`scripts/check-docs.mjs`, `scripts/doc-claims.json`, `scripts/build-llms-full.mjs`, `tests/check-docs.test.mjs`
and this log. Nothing under `mods/`, `RECIPE.md`, other `scripts/` files, `.github/` or the Herdr home was edited.

## What was done, by task

| Task | Result |
| --- | --- |
| R2-DOC-1 | Every publish-time sentence carries an HTML comment starting `publish:` (marks: `preview` in README and `docs/index.html`; `ci` in README, CONTRIBUTING and `docs/index.html`; `owner` and `herdr.dev` in `docs/install.html`; `tags` in CHANGELOG). The "For the author" block left `install.html`; the CHANGELOG lost its process sentence and round label. `docs/assets/layout.svg` is a labelled schematic ("Schematic, not a screenshot", `role="img"`, title and desc, light and dark through its own tokens) used in README and the site index. `check-docs --release` lists every open mark, `<owner>`, "not published yet" and "still has to install", and switches off the real-owner rule (the author has replaced the placeholder by then). |
| R2-DOC-2 | CI wording: every page says "template, not run yet" inside a `publish: ci` mark; no "three-OS" or "runs on macOS, Linux and Windows" remains (checked by `check-docs`). |
| R2-DOC-3 | `docs/verify.html` ("Check your install": fifteen steps on the sample vault, each naming files that exist, a report template whose fields match the `platform-report` issue form), CONTRIBUTING "Reporting a platform result", jump list in troubleshooting, `docs/404.html` with inline CSS and site-root links (rendered at a nested path through a plain static server: styled), favicon on every page, per-OS install block, `$HERDR_HOME` defined (the Windows default is the quoted `herdr-app --help` line and marked unverified), uninstall explains what stays in `shared.json`. The verify table stacks on a phone (checked at 360 px, light and dark, in a plain headless browser, not the Herdr app). Issue-template field list sent to herdr-completeness before they wrote it; their template matches. |
| R2-DOC-4 | `check-docs` stricter: claims table (`scripts/doc-claims.json`, 55 rows, doc phrase against a pattern on comment-free code), quoted messages must be string literals or template segments (a small scanner strips comments and reads templates; it round-trips all 29 JS files of `mods/` and `scripts/` through `node --check`), short quotes must be a whole literal, support sentence verbatim, SVG labels and contrast, verify page names real files, CI template commands exist, `docs/llms-full.txt` current, favicon links. `tests/check-docs.test.mjs` seeds 15 faults (see Checks). |
| R2-DOC-5 | Docs follow code-review's wave B and C posts and quote only them: Node.js 22.4, Linux browser folders, search order for browser and asar, settings keys `browser` and `asar` (requirements, configuration, README, troubleshooting), environment variables that count only if Herdr itself was started with them, the three 1 MiB messages with the caveat that `readTextFile` beyond 1 MiB is undocumented and unchecked live, the Add vault outside-home notification and the in-tree message, the row-cap message, the new constants, the DevTools port, vault-list reads on Import, node reading Excalidraw embeds, `shared.json` leftovers, `vault.adding` as internal, the CSP and resolver statement now backed by the canary test, "Limits you may hit" on the usage page. |
| R2-DOC-6 | AGENTS.md: "Herdr facts behind the rules" (each with its source, and which were only probed), "Not verified", new file map rows, Testing section with the strict stubs, documentation upkeep for the new checks. `scripts/build-llms-full.mjs` and `docs/llms-full.txt` (README, AGENTS.md and the site pages as plain text); `llms.txt` equals `docs/llms.txt` and links the long text; `docs/for-agents.html` points at it and at the verify page. |
| R2-DOC-7 | The one support sentence (verbatim in README, both llms.txt, index and requirements, page text and meta description) and the per-feature, per-system matrix on `docs/requirements.html#matrix`. "Used by the author" only for features that existed in the imported macOS version; Import, curl downloads and every Linux or Windows cell are "fake-OS tests". |
| R2-DOC-8 | CONTRIBUTING: checks table (command, needs Herdr, in the CI template), probe procedure (verified by running such a probe with `herdr-app check`), platform results, docs upkeep, publish marks. CHANGELOG entries for this round. Claim-by-claim list posted on the board. This log. |
| R2-DOC-9 | Portrait board answered: `book-open.svg` stays a contract path; `obsidian.png` and `vault.svg` are unused by the layout (docs say "kept for older copies, may go in a later cleanup"); the layout reads `vault.panes` only. Wording in `docs/configuration.html` and AGENTS.md. |

## Checks run (all on a throw-away merge of the three role branches, never pushed; my branch alone is red on `check-docs` only for the CI template and scripts that the other branches add)

| Command | Result |
| --- | --- |
| `npm test` | 232 tests, 232 pass, 0 fail, 0 skipped |
| `node scripts/check-docs.mjs` | ok: 11 pages, 55 claims, 18 publish-time items open |
| `node scripts/check-docs.mjs --release` | fails on purpose and lists each open item (marks, `<owner>`, "still has to install") |
| `node scripts/build-llms-full.mjs --check` | current |
| `node scripts/check-repo.mjs` | 0 errors, 1 warning (workflow not installed) |
| `node scripts/check-recipe.mjs`, `install-sim.mjs`, `syntax-check.mjs`, `privacy-scan.mjs` | ok (privacy-scan includes `plans/`) |
| `node scripts/typecheck.mjs` | `skipped: TypeScript's tsc was not found` |
| `herdr-app check` on both mods | passed |
| Probe mod (`herdr-app check` on a throw-away folder outside the Herdr home) | `TextDecoder`, `TextEncoder`, `structuredClone`, `Intl` undefined; `setTimeout`, `process`, `Buffer`, `URL` present; `localeCompare` ignores `numeric` (Herdr 0.1.12) |
| Rendering in a plain headless browser | index and verify at 360 and 1100 px, light and dark; 404 served at a nested path |

Seeded-fault evidence for `check-docs` (tests/check-docs.test.mjs, each on a temp copy, expects exit 1 and the right
message): reworded message in the code; message only in a comment; short quote that is a substring only; changed
constant; constant only in a comment; documented number off by one; reworded support sentence; unconditional support
claim; CI template with `node --test tests/`; CI template with a script that does not exist; stale `llms-full.txt`;
verify step naming a missing sample-vault file; missing anchor; `--release` lists open items; `--release` passes once
marks and placeholders are resolved. The unmodified copy passes.

## Deferred, with reasons

- A real `preview.png` and flipping the `publish: preview` blocks: author capture (plan D2). The schematic is labelled.
- Any "seen live" cell for Linux or Windows: no one has run the mods there; `docs/verify.html` and the issue form are how it will arrive.
- Flipping `publish:` marks, replacing `<owner>`, installing the workflow, enabling Pages: author-only (`scripts/PUBLISH.md`).
- herdr.dev's own install form in the agent prompt: waits for the listing (mark `publish: herdr.dev`).
- Row-cap options for the panel (virtual list): round 3 (plan section 8); the docs state the 3000-row cap.

## Handoffs and findings for the next round

- After the author replaces `<owner>`, `docs/llms-full.txt` is stale (it contains README and AGENTS.md text): rebuild with `node scripts/build-llms-full.mjs` (asked herdr-completeness to add it to PUBLISH.md step 4).
- Items I could not verify and the docs say so: what `readTextFile` returns beyond 1 MiB, the popup placement on a small window, whether a symlink inside the home folder lets Add vault accept an outside vault, the Windows Herdr home default, which feature works live on Linux or Windows.
- The word the private-word scan flags in ordinary prose was removed from the docs; `scripts/PUBLISH.md` of the herdr-completeness branch had one use of it at the time of my first merge and was told.
- `PER_FOLDER` stays 2000 (code-review's reasoning: date-named notes sort oldest first); the docs say 2000. If the author changes it, the claim rows `per-folder` and `per-folder-usage` and two doc sentences change with it.
- When a Herdr update changes the runtime, re-run the probe (CONTRIBUTING) and update the list in `tests/runtime-globals.test.mjs`, AGENTS.md "Herdr facts behind the rules" and the Herdr version named there.
- Round 3 candidates for documentation: screenshots once the author takes them; real Linux and Windows results from the platform-report form feeding the matrix; a short "write a mod for Herdr from this one" guide only if a reader asks.
