# Round 1 - documentation log

Role: documentation. Branch: `feat/round-1-portable-release--documentation`. Files owned: `README.md`, `AGENTS.md`,
`llms.txt`, `CHANGELOG.md`, `CONTRIBUTING.md`, `docs/**`, `scripts/check-docs.mjs`.

## Done

| Task | Result |
| --- | --- |
| R1-DOC-1 | `README.md`: what and why, support level, install by Herdr agent and by hand, showing the panel (layout block, `pane.split`, key), usage, per-OS requirements table (between `requirements:start/end` markers), privacy table, troubleshooting list, uninstall, repository map, credits quoting NOTICE. No preview image is claimed (a comment marks the slot). |
| R1-DOC-2 | `docs/`: `.nojekyll`, `assets/style.css` (tokens on `:root`, dark by `prefers-color-scheme`, system fonts, 320 px safe, skip link, focus rings), 10 pages: `index`, `install`, `usage`, `requirements`, `configuration`, `privacy`, `troubleshooting`, `how-it-works` (inline SVG data-flow figure), `for-agents`, `404`, plus `docs/llms.txt`. No scripts, no external hosts. |
| R1-DOC-3 | `scripts/check-docs.mjs` (Node 22, no dependencies, `--root DIR`): page metadata, links and anchors in HTML and Markdown, no external resources or scripts, personal paths and e-mails, a real GitHub owner in a repo URL, WCAG AA contrast of the CSS tokens in light and dark, llms.txt copies and links, README versus site requirements table, `keys.json` versus the keys table, messages quoted in the troubleshooting page versus the code (including messages built by `missingMessage()`), commands in AGENTS.md and CONTRIBUTING.md. Mutation test on a temp copy: 11 seeded faults, 11 reported, exit 1. |
| R1-DOC-4 | `AGENTS.md` (file map, "tell the person" list, install checklist, editing rules, testing, adapting, rename procedure using `mod-name.js`, privacy rules, commits, doc upkeep) and `llms.txt` (llmstxt.org shape; project URLs use `<owner>`). |
| R1-DOC-5 | `CHANGELOG.md` (Keep a Changelog; `[Unreleased]` from the plan, board and landed code; `0.1.0` initial import per D7) and `CONTRIBUTING.md` (Node 22, `npm test`, the checks, testing rules, privacy checklist, docs upkeep, publishing pointer). |
| R1-DOC-6 | Final sync pass done against code-review's commit `4ebc106` (merged in a scratch clone, not in this branch): requirements cells, messages, hints, discovery order, openers, constants, key `ctrl-shift-m`, Web images button, `vault.outside`, `vault.import`, program-file rule, `npm test`. Claim ledger below. |

## Decisions made without asking

- GitHub owner is written `<owner>` in every doc (hard rule: no usernames). `check-docs` fails on a real owner in a repo URL. The author replaces it at publish time (`scripts/PUBLISH.md` has the step).
- `llms.txt` uses absolute project URLs with `<owner>` because the root file and `docs/llms.txt` must be identical; `check-docs` maps those URLs to repo files to prove they exist.
- The Windows Herdr home folder is not stated: the docs say "`herdr-app --help` prints the path on your machine" instead of guessing.
- The pane-split install route names the command and its arguments (`pane.split`, `direction`, `mod`) without a `herdr-app do` invocation, because the exact CLI form was not verified and the app may not be driven.
- The requirements table and the keys table are generated once from one source (scratch generator, not committed) and checked by `check-docs` for equality, so later edits are cell edits in two places that the script keeps honest.
- `preview.png` is the only link target allowed to be missing (the author adds it); everything else must resolve.

## Deferred, and why

- Screenshot (`preview.png`, `docs/assets/preview.png`): agents may not drive the app; docs show a labelled placeholder.
- Enabling Pages, repository visibility, topic, absolute links: author-only (see `scripts/PUBLISH.md`).
- Real-app verification of Linux and Windows behaviour: nobody can this round; README, site and CHANGELOG say so ("implemented, covered by fake-OS tests, not yet watched in the live app").
- Real owner URLs in `llms.txt`/CHANGELOG compare links: after publishing (round 2 or the author).
- A docs build script is not committed (pages are hand-editable HTML); if the pages grow, round 2 may add `scripts/build-docs.mjs`.

## Checks run

Run in a scratch clone with the three branches merged (code-review `4ebc106`, herdr-completeness `35d4046`, this branch):

- `node scripts/check-docs.mjs`: ok (10 pages, 9 text files). On this branch alone it reports only links to files the other roles own (`LICENSE`, `NOTICE`, `RECIPE.md`, `scripts/check-repo.mjs`, `scripts/privacy-scan.mjs`, `tests/`), which exist after the merge.
- `npm test`: 148 pass, 0 fail.
- `node scripts/privacy-scan.mjs`: 0 errors, 0 warnings (docs included).
- `node scripts/check-repo.mjs`: 0 errors, 3 warnings (RECIPE.md does not name `qlmanage` and `sips`; see handoffs).
- Headless Chrome screenshots of the static site at 390 px and 1100 px, light and dark: layout, tables (scroll inside a bordered region), SVG figure and nav read correctly. (Static files only; the Herdr app was not driven.)
- `herdr-app check` was not run: no mod file is touched by this role.

## Claim ledger (R1-DOC-6)

Source line numbers are in code-review's tree at `4ebc106`.

| Claim in docs | Source |
| --- | --- |
| Reader window 78% x 86%, key `vault-reader` | `mods/vault/main.js:43` |
| 2000 entries per folder, "+N more not listed (search finds them)" | `mods/vault/main.js:26`, `:407`, `mods/vault/tree.js` `folderEntries` |
| Search needs 2 characters, 160 ms | `mods/vault/main.js:228`, `:232` |
| 200 results, 20 lines per file, ripgrep config ignored, `.gitignore` not applied | `mods/vault/search-core.js:8`, `:16`, `:10` |
| 30 PDF pages; column 1040; text 15; `RENDER_VERSION` 3 | `mods/vault-reader/main.js:36`, `:34`, `:38` |
| `BATCH` 6; cache 30 days / 200 MB; web image cap 20 MB; image cap 40 MB; retry 5 min | `mods/vault-reader/assets-core.js:17-22` |
| curl: http/https only, 20 s, 5 redirects, `--` before the address | `mods/vault-reader/assets-core.js:55` |
| `remoteImages` default true in `data/vault/settings.json`; Web images on/off button | `assets-core.js:43`, `mods/vault-reader/main.js:439` |
| Cache pruned once per session, about 8 s after the first reader | `mods/vault-reader/main.js:101` |
| Live refresh falls back to 10 s timer with the LIVE_OFF line | `mods/vault/watch.js:9-10` |
| Missing tool looked up again after 30 s | `mods/vault-reader/platform.js:267` |
| Back keys; Esc closes floating reader | `platform.js:74`, `mods/vault-reader/main.js:415` |
| Only http, https, mailto opened; programs never opened | `parse.js:446`, `platform.js:61` |
| Openers `open` / `xdg-open` / `rundll32 url.dll,FileProtocolHandler` | `platform.js:51` |
| Env `HERDR_VAULT_ASAR`, `HERDR_VAULT_BROWSER`, `CHROME_PATH` | `mods/vault-reader/render/lib.mjs:44`, `:52` |
| Headless flags without background networking and sync; page on 127.0.0.1; Mermaid strict | `render/render.mjs:154`, `:4`, `render/page.js:20` |
| Embeds two levels deep | `mods/vault-reader/doc.js:32` |
| Obsidian vault list candidates per OS; outside-home label; `vault.import` | `mods/vault/platform.js:200`, `mods/vault/main.js:435`, `:443` |
| Install hints and messages | `mods/vault-reader/platform.js:286` (`HINTS`, `missingMessage`, `renderProblem`) |
| Tree walks at most 30000 files | `mods/vault-reader/vault-files.js:5` |

## Handoffs

For round 2 (documentation):
1. Re-run the ledger after every code change (`git log` since `4ebc106`); the table cells in README and `docs/requirements.html` change together.
2. When the author takes `preview.png`: copy it to `docs/assets/`, replace the two placeholders (`README.md` comment, `docs/index.html`), and update the screenshot sentence in CHANGELOG.
3. After the repository is public: replace `<owner>` everywhere (README, CHANGELOG, CONTRIBUTING, AGENTS-adjacent text, `llms.txt`, `docs/llms.txt`, `docs/install.html`), copy `llms.txt` to `docs/llms.txt`, run `check-docs`.
4. Add a CI step `node scripts/check-docs.mjs` once the author installs the workflow (`scripts/ci.workflow.yml` already runs it if the file exists).

For code-review:
- `docs/troubleshooting.html` quotes 40 messages; `check-docs` greps each in `mods/` or in `missingMessage()` output. If you reword a message, the check fails until the page follows.
- The panel's "Open in Preview" tooltip and labels are documented as "Open in Preview" (macOS) and "Open in the default app" (elsewhere).

For herdr-completeness:
- `scripts/check-repo.mjs` warns that RECIPE.md does not name `qlmanage` and `sips` (macOS-only fallbacks). The docs name both (privacy page and README).
- RECIPE.md says "Open externally"; the code says "Open in Preview" on macOS and "Open in the default app" elsewhere.
- CI: `check-docs` is ready as a step.
