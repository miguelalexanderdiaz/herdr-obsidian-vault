# Round 1 log: herdr-completeness (implement step)

Branch `feat/round-1-portable-release--herdr-completeness`, pushed to origin. Nothing merged.

## Done (task ids)

| Task | Result | Commit subject |
| --- | --- | --- |
| R1-HC-1 | `LICENSE` (Apache-2.0, holder = git user.name per D12), `NOTICE` (Lucide, lz-string, Obsidian trademark / not affiliated, Mermaid + MathJax read at run time and not redistributed, programs not bundled), `LICENSE-lucide.txt` in both `icons/` folders. NOTICE wording posted on the board for documentation. | Add Apache-2.0 LICENSE, NOTICE and Lucide license texts |
| R1-HC-2 | `.gitignore` extended, `.gitattributes` (LF, binary markers), `examples/sample-vault/.obsidian/app.json` (`{}`), sample PDFs: OS version and timestamps stripped from the info dictionary (same length, still render with Poppler). PNG has no text chunks. | Repo hygiene |
| R1-HC-3 | `scripts/check-repo.mjs` (+ `scripts/lib/repo.mjs`): required files, JSON validity, mod.json fields, keys.json (sections, mods exist, no cmd-/super-, no plain ctrl+letter, no chord Herdr binds by default), frozen contract, logo ban by sha256 and by git history in `--release`, NOTICE coverage, RECIPE headings / paths / disclosure, `--release` gate. | Add check-repo and privacy-scan scripts |
| R1-HC-4 | `scripts/privacy-scan.mjs`: home paths (mac, linux, windows), e-mails, private hosts, OS user name, untracked word list (`scripts/.privacy-words` or `HERDR_PRIVACY_WORDS`), author name outside LICENSE/NOTICE, PNG/JPEG/PDF metadata, commit messages, D3 literals outside `platform.js` (auto-switches from warning to error once both `platform.js` exist), skips `plans/`. `--self-test` and `--root DIR`. Seeded fake path in a temp copy exits 1 (verified). | same |
| R1-HC-5 | CI as `scripts/ci.workflow.yml` plus `scripts/syntax-check.mjs`. See Denied. | Add syntax-check script and CI workflow template |
| R1-HC-6 | `keys.json` (`ctrl-shift-m` -> `mod.open:vault`), `mods/vault/mod.json` overlay 420x640 after code-review's yes. | Show the Vault panel as an overlay |
| R1-HC-7 | `RECIPE.md` written from the real files (six sections, preview link, disclosure table). It is a draft against the code as it was at the start of the round plus the plan's commitments: see handoffs. | Add RECIPE.md |
| R1-HC-8 | `scripts/PUBLISH.md`, `scripts/PREVIEW.md`. | Add PUBLISH.md and PREVIEW.md |
| R1-HC-9 | Posted on the portrait-layout board (frozen contract, logo path). The final re-audit after code-review's last commit is NOT done (see Deferred). | board only |

## Findings made while working

- `ctrl-shift-e`, my first key choice, is a Herdr default on Linux and Windows (found in the portrait repo's snapshot of the defaults). Changed to `ctrl-shift-m`; check-repo now rejects taken chords. Board correction posted.
- herdr.dev/mods does not say whether `RECIPE.md` / `preview.png` go per mod folder or at the root for a repo with two mods. Decision: root (as the community repos do); PUBLISH.md step 10 says what to do if the listing wants per-folder copies.
- `examples/sample-vault` is the only content outside `mods/` that needs metadata care; the PDFs carried the macOS version and creation times (stripped).

## Denied / not done because of permissions

- `git push` of `.github/workflows/ci.yml` was rejected by GitHub: "refusing to allow an OAuth App to create or update workflow ... without `workflow` scope". Not worked around. The workflow lives in `scripts/ci.workflow.yml`; check-repo warns (error in `--release`) until the author copies it to `.github/workflows/ci.yml` (PUBLISH.md step 5, needs `gh auth refresh -s workflow`). Consequence: no CI run exists for this branch; the three OS jobs have not been seen green. Scripts were run locally on macOS only.

## Checks run (macOS, Node 26 locally; CI targets Node 22)

| Command | Result |
| --- | --- |
| `node scripts/privacy-scan.mjs --self-test` | 21 ok, exit 0 |
| `node scripts/privacy-scan.mjs` | exit 0, 0 errors, D3 warnings only (11, in files code-review owns, until their `platform.js` lands) |
| privacy-scan on a temp copy with a seeded home path | exit 1 |
| `node scripts/syntax-check.mjs` | 17 files parsed, exit 0 |
| `node scripts/check-repo.mjs` | fails on: both `obsidian.png` still have the Obsidian logo bytes (code-review R1-CR-11), `docs/requirements.html` mentioned in RECIPE does not exist yet (documentation R1-DOC-2). Everything else ok. |
| `herdr-app check <abs>/mods/vault` and `.../mods/vault-reader` | `check passed` for both |
| JSON parse of mod.json, keys.json, Board.canvas, app.json | ok |
| `git status` after `herdr-app check` | clean (generated d.ts / jsconfig are ignored) |

## Deferred and why

- Final re-audit of RECIPE.md, NOTICE and the scripts against code-review's finished code (R1-HC-9, wave D): code-review had no commit yet when this step ended, so claims below could not be verified against the final code.
- `node --test tests/` wiring in `check-repo` (only the workflow template runs it).
- Real CI evidence (needs the workflow scope).
- `preview.png` (author), Pages, topic, visibility, history rewrite (author, PUBLISH.md).

## Handoffs for the next step / round 2

RECIPE.md statements that depend on code-review tasks and must be verified against the merged code (a wrong one is an overclaim):
1. Platform tools: rg, node 22, Chromium-family browser, Poppler, curl, opener per OS, and "one plain sentence naming what is missing" (R1-CR-4/5/6).
2. Setting `remoteImages` in `data/vault/settings.json`, default on (R1-CR-7); if only the constant shipped, edit the Network row.
3. Cache pruning 30 days / 200 MB at reader start (R1-CR-7).
4. Only http, https, mailto links opened (R1-CR-8).
5. Back keys Alt+Left, Backspace, Cmd+[ on macOS; button label "Open externally" (text is "Open in Preview" until R1-CR-11); generic `vault.svg` icon and replaced `obsidian.png`.
6. Vault outside home listed as "not readable"; hint when `watchFolder` is refused (R1-CR-5, R1-CR-10).
7. Limits: 2000 per folder, 200 results, 30 PDF pages, 30000 files (re-read constants after the cleanups).
8. Done-when item 6 (all PDF pages) and 7 (source + one line) need the final message strings from the code-review catalogue (D9).
9. `docs/requirements.html` is linked from RECIPE; documentation must create it (check-repo fails until it exists).

Other: NOTICE item 3 names `vault.svg` (Lucide gem) and the compat pngs; confirm the PNG really is a render of that icon. The OAuth workflow scope is needed once. check-repo's `TAKEN_CHORDS` is a copy of the portrait repo's snapshot (Herdr 0.1.12); refresh it when Herdr's defaults change. `privacy-scan` treats the git user.name as private outside LICENSE and NOTICE; GitHub owner names in repo URLs inside docs are not flagged (unavoidable), say if you want them flagged.
