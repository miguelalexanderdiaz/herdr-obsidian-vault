# Publish checklist (author only)

Agents may not do these: they change visibility, settings, topics or need the live app, or they need a GitHub token
scope the unattended runs do not have. Work top to bottom. `node scripts/check-repo.mjs --release` fails while any
scripted part of this list is open, prints the open items, and prints the title of every step below (it reads this file,
so the list it prints is this list). `rg "publish:"` lists the sentences in the docs that change when you publish.

1. **Squash or recreate the repo history.** The first commit contains the Obsidian logo (a trademark that must
   not be redistributed). Content is now generic, but the old blob is still reachable. Create a fresh single
   commit (for example a new orphan branch, or a new repository with the current tree) before going public.
   `check-repo --release` fails while the blob is in history. The git author name and the noreply address of the new
   commit become public with it: decide that is what you want (`git config user.name`, `git config user.email`
   before you commit).
2. **Decide whether `plans/` ships.** It holds the agents' plans, audits, logs and board copies (about 200 KB). It is
   scanned by `privacy-scan`, but it is working notes, not part of a mod. Default: leave it out of the first public
   commit and keep it on a private branch (`git rm -r --cached plans`, then add `/plans/` to `.gitignore`).
3. **Take `preview.png`** at the repo root. Follow `scripts/PREVIEW.md` (sample vault only, never a real one), then
   copy it to `docs/assets/preview.png` and open the `<!-- publish: preview -->` blocks (`rg "publish: preview"`:
   RECIPE.md, README.md, docs/index.html) by deleting the comment's first and last lines.
4. **Replace the `<owner>` placeholder** that README, CHANGELOG, CONTRIBUTING, AGENTS.md, `llms.txt` and `docs/` use
   for the GitHub owner (agents may not write usernames), then rerun `node scripts/check-docs.mjs --release`.
   **Confirm the copyright name** in `LICENSE` and `NOTICE` (currently the git author name) and that you want
   that name public. It is the only place a real name appears.
5. **Check Obsidian's trademark text** (https://obsidian.md/brand) once more and that `NOTICE` still says
   "not affiliated". Keep the generic icon; do not add the real logo to the repo.
6. **Install the CI workflow.** Pushing a workflow file needs a token with the `workflow` scope, which the
   unattended runs did not have. Run `gh auth refresh -s workflow`, then `node scripts/install-ci.mjs` (copies
   `scripts/ci.workflow.yml` to `.github/workflows/ci.yml` without its header comment; it refuses to overwrite a
   different file), commit and push. Optional: add a repository secret `PRIVACY_WORDS` (one real name, employer or
   project name per line) so the privacy scan also catches them in CI. **Confirm that the ubuntu, windows and macos
   jobs are all green before you publish**: the Windows and Linux legs have never run. Then replace the sentences
   marked `<!-- publish: ci -->` (`rg "publish: ci"`) with the systems that ran, and tell the maintainers (board
   `herdr-obsidian-vault`) that the first run is green.
7. **Run everything locally once on your machine:**
   ```
   npm test
   node scripts/check-repo.mjs --release
   node scripts/check-recipe.mjs
   node scripts/install-sim.mjs
   node scripts/privacy-scan.mjs        # add your real names, employer and project names to scripts/.privacy-words first
   node scripts/check-docs.mjs --release
   node scripts/typecheck.mjs           # needs tsc and Herdr's own .d.ts files, otherwise it says "skipped"
   herdr-app check <path to this repo>/mods/vault
   herdr-app check <path to this repo>/mods/vault-reader
   ```
8. **Try a clean install** into an empty Herdr home (`HERDR_APP_HOME=<empty folder>`), as a user would:
   copy `mods/vault` and `mods/vault-reader`, merge `keys.json`, press the key, add `examples/sample-vault`.
   (`node scripts/install-sim.mjs` already rehearses the file part; this is the part that needs the app.) On a small
   window, also check that the 640 px popup (placed at the top with `kind`, `at`, `offset`) is not clipped.
9. **Enable GitHub Pages** (Settings, Pages, branch `main`, folder `/docs`). Private repositories need a paid
   plan; public ones do not. There is no Pages workflow on purpose.
10. **Make the repository public.**
11. **Add the topic `herdr-mod`** (never `herdr-layout`: this repo has no layout). herdr.dev/mods lists it
    within the hour. Herdr's text says "one folder each if there are several", and the official example repo keeps
    one folder per example, each with its own `RECIPE.md`, `preview.png` and `mods/`. This repo is one example with
    two mods and keeps those at the root. Check herdr.dev/mods for a card with preview and recipe text. If there is
    none, the fallback is either two repositories (one per mod) or one folder `vault/` in this repo holding the
    `RECIPE.md`, `preview.png`, `keys.json` and both mod folders; moving the files does not change any path the
    mods use (they look for `mods/<name>/` inside the Herdr home, not in this repo).
12. **Create the issue label `platform-report`** (Issues, Labels). The form in `.github/ISSUE_TEMPLATE/platform-report.yml`
    applies it, and `docs/verify.html` asks testers on Linux and Windows to file one.
13. **Tell the portrait layout repo** (board `herdr-portrait-layout`) that this repo is public so its RECIPE
    can link here, and that `mods/vault-reader/obsidian.png` now holds a generic icon (`vault.svg` is the
    vector version it should switch to).
14. **Look at the herdr.dev page.** After publishing, a second pair of eyes on description, preview and RECIPE text.
