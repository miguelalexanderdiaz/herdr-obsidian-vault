# Round 2 log: herdr-completeness

Branch `feat/round-2-runtime-truth--herdr-completeness` (from `feat/round-2-runtime-truth`). Plan: `plans/round-2/PLAN.md`
section 5.2. Audit: `plans/round-2/herdr-completeness.md` (HC-2-1..13). Nothing was merged, no branch or worktree
deleted, nothing under `.github/workflows/` committed (the template stays `scripts/ci.workflow.yml`). Nothing under the
author's live Herdr home was written; `herdr-app check`, `herdr-app --help`, `herdr-app commands` and `herdr-app --version`
were the only calls to the app, and the official example repo was cloned into a temp folder to compare formats.

## What was done (task ids)

| Task | Result | Commit subject starts with |
| --- | --- | --- |
| R2-HC-4 | `mods/vault-reader/render/LICENSE-lz-string.txt` (MIT text, travels with the mod folder); NOTICE names it. `check-repo` rules: licence file next to every vendored lz-string file, SPDX line + copyright in each mod's `main.js`, pointer in `lzstring.js`. The last two are warnings until code-review's R2-CR-15 lands (constant `HEADERS_ERROR` in `scripts/check-repo.mjs`, flip to `true`). | `R2-HC-4` |
| R2-HC-1 | `scripts/ci.workflow.yml` runs `npm test` (the old `node --test tests/` failed on all three OS, reproduced), actions pinned to full commits with the tag in a comment (`actions/checkout` v7.0.1, `actions/setup-node` v7.1.0, SHAs looked up with `gh api` at implement time), `timeout-minutes: 15`, no `hashFiles()` guard, no `continue-on-error` step, Node 22.x on ubuntu/windows/macos, optional `PRIVACY_WORDS` secret step, check-recipe, install-sim and the three self-tests as steps. `check-repo` parses every `run:` line and fails unless it is `npm test`, `npm run <existing script>` or `node scripts/<existing file>.mjs`; it also rejects `continue-on-error`, `hashFiles(`, unpinned `uses:`, a missing timeout, a missing OS or Node 22 leg. `scripts/install-ci.mjs` (author step: copies the template to `.github/workflows/ci.yml`, refuses to overwrite a different file). `check-repo --self-test` seeds nine faults into temp copies and expects exit 1 for the right reason. `--root DIR` works for every script (`scripts/lib/repo.mjs`). | `R2-HC-1` |
| R2-HC-2 | RECIPE.md corrected against the code (first pass from the base code, second pass from code-review's wave B): Windows opener `rundll32 url.dll,FileProtocolHandler`, button labels `Open in Preview` / `Open in the default app`, `Web images: on/off`, "Import from Obsidian", the `sh -c` login-shell lookup (no more "never through a shell string"), `stat`/`powershell`/`where`, the loopback DevTools port, profile folders `chrome-<pid>-<time>-<rand>/` (removed at the end of a run), `lib.tmp-<pid>/` and `lib.lock/`, shared keys incl. additive `vault.outside` and internal `vault.adding`, commands `vault.add`/`vault.import`, `book-open.svg` contract path, per-OS requirements, Node.js 22.4, browser/asar discovery order and the `browser`/`asar` settings keys, the new messages, the CSP + host-resolver statement with "checked by hand, not yet by an automated test", the vault-list locations per OS, env names, render limits (6 jobs, 24 s). The brief line from the official recipe format. The preview image sits inside a `<!-- publish: preview. ... -->` block (D2). | `R2-HC-2` |
| R2-HC-3 | `scripts/check-recipe.mjs`: claim ledger, RECIPE vs code in both directions: programs (collected from the platform tables and `exec(` literals), opener and preview label per OS (computed by `openCommand`/`previewLabel`), `hc(`, shell claim, 11 numeric constants, mod.json quotes, 13 callout colours and 14 aliases, shared keys (frozen four vs additive), commands, `herdr`/gpui function lists, keys.json both ways, data folders, settings keys, env vars, vault-list locations, network code, DevTools port, CSP/host-resolver, Node gate, quoted degraded-behaviour messages as string literals, discovery order. `--self-test` puts 14 wrong sentences back and expects each to add a finding. Wired into `check-repo` and CI. | `R2-HC-2 R2-HC-3` |
| R2-HC-5 | `privacy-scan` scans `plans/` (home paths, e-mail, hosts, private words); author-name and D3 rules off there; placeholders (`/Users/x`, `<home>`, `~`) and a line with `privacy-scan: example` are exempt; a name ending a sentence (`/home/x.`) no longer counts the full stop (this was a false positive in `plans/round-1/board.md`). `check-repo --release`: `<owner>` outside `scripts/`, `plans/`, `tests/`; RECIPE image still inside its publish mark; runs `check-docs --release` and prints its lines; prints the PUBLISH.md step titles (read from the file, checked to be numbered 1..N). PUBLISH.md: git author exposure, whether `plans/` ships. | `R2-HC-5` |
| R2-HC-6 | D9 applied: `mods/vault/mod.json` overlay `{ "kind": "popup", "at": "top", "offset": 40, "width": 420, "height": 640 }`. Evidence: Herdr's own shipped `picker`/`new-space-picker` mods and the official `tmux-prefix` example use exactly these fields; `herdr.d.ts` documents `kind` and `at` for `openOverlay`. Not documented for mod.json: `offset` and `at: "top"` (AGENTS.md documents only width/height) and `herdr-app check` accepts any value (tested with a bogus `kind`). RECIPE says so ("Traps"). code-review confirmed `vault/main.js` assumes no pointer anchor. Contract list: `mods/vault/icons/book-open.svg` is a frozen path in `check-repo` and RECIPE. keys.json untouched. | `R2-HC-6` |
| R2-HC-7 | `scripts/install-sim.mjs`: copies each `mods/<name>/` alone into a temp home; checks imports resolve inside the copy (or are Herdr/Node modules), icons built from `${ICON}`/`${ICONS}`/`${MOD_DIR}` and the icon tables exist, the render page's `<script src>` files exist, no mod refers to the other's folder, `main.js` + `mod.json` exist; merges `keys.json` with Herdr's documented rule (add, never overwrite, second run is a no-op, a taken key is reported); runs `herdr-app check` on each copy when the binary is present. `--self-test` deletes needed files / adds a bad import and expects detection. | `R2-HC-7` |
| R2-HC-8 | `scripts/typecheck.mjs` per D16 (local only; skips with a stated reason when tsc or Herdr's `.d.ts` are missing; `--self-test` covers config, parsing, home lookup and the skip path). `.gitignore` narrowed to `/mods/**` for the generated `.d.ts`, `jsconfig.json`, `*.error`; added `.env*`, `*.orig`, `.claude/`. | `R2-HC-8` |
| R2-HC-9 | PUBLISH.md (14 steps) and PREVIEW.md updated: `rg "publish:"`, copy `preview.png` to `docs/assets/` and open the marked blocks, `install-ci`, `PRIVACY_WORDS` secret, "confirm a green Windows job before publishing", the herdr.dev one-folder-per-example check with a fallback, the `platform-report` label, a note to check the 640 px popup on a small window. | `R2-HC-5 R2-HC-9` |
| R2-HC-10 | `.github/ISSUE_TEMPLATE/platform-report.yml` from documentation's field list; `check-repo` validates issue forms structurally (no YAML parser available). | `R2-HC-10` |
| R2-HC-11 | `scripts/herdr-default-keys.json` (with the Herdr version); `check-repo` warns when the installed `herdr-app --version` differs, fails when `keys.json` uses a command that `herdr-app commands` does not list, prints "snapshot only" without the binary. Note: `herdr-app commands` lists commands, not default key bindings, so the chord list itself stays a snapshot. | `R2-HC-11` |
| R2-HC-12 | See "Final pass" below. | |

Also: NOTICE lists every program the mods start (curl, stat, PowerShell, where, sh, qlmanage, sips).

## Final pass

(filled in at the end of the run; see the bottom of this file)

## Deferred, and why

- **`preview.png`**: not created, by D2 (a stand-in would satisfy the gate without the real screenshot). The author captures it
  (`scripts/PREVIEW.md`); `check-repo --release` keeps failing until then, and the RECIPE image line stays inside its publish mark.
- **`LICENSE` copies inside each mod folder** (HC-2-6 first proposal): the plan limited this to the lz-string text; the
  Apache-2.0 text for an installed mod folder is left to the SPDX line in each `main.js` (R2-CR-15) pointing at the repo.
- **Running the CI template**: cannot be done from here (no `workflow` scope, no runner). Statically checked only. Every
  public sentence must keep saying "template, not run yet" until the author reports a green run on all three systems.
- **`typecheck.mjs` run path**: `tsc` is not installed on this machine, so only the skip path, the config builder and the
  output parser were exercised. The first real run is on a machine with `tsc` and Herdr; diagnostics go to code-review.
- **mod.json overlay placement on screen**: the one thing no agent may do (drive the app). Marked "not verified" in RECIPE and
  PUBLISH.md step 8.
- **Default chord list**: a snapshot of Herdr 0.1.12; Herdr offers no command that prints default key bindings.

## Checks run (on this branch alone, then in a throw-away merge of the three role branches)

See "Final pass".

## Handoffs for round 3

- Author: install the workflow (`gh auth refresh -s workflow`, `node scripts/install-ci.mjs`), watch the first run on windows and
  linux; report on the board; flip the `<!-- publish: ci -->` sentences. Take `preview.png`. Decide whether `plans/` ships.
- code-review: run `node scripts/typecheck.mjs` on a machine with `tsc` and fix what it reports; keep posting changed strings
  and constants (check-recipe and check-docs both depend on them).
- Ideas not done: a Windows-path variant of `install-sim` run in CI with a faked platform; a `npm pack`-style dry run of the folder
  Herdr's installer would copy (today `install-sim` copies the tracked files only); a machine-readable `RECIPE` claims table so
  the docs can reuse it.
