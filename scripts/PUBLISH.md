# Publish checklist (author only)

Agents may not do these: they change visibility, settings, topics or need the live app. Work top to bottom.
`node scripts/check-repo.mjs --release` fails while any scripted part of this list is open and prints the rest.

1. **Squash or recreate the repo history.** The first commit contains the Obsidian logo (a trademark that must
   not be redistributed). Content is now generic, but the old blob is still reachable. Create a fresh single
   commit (for example a new orphan branch, or a new repository with the current tree) before going public.
   `check-repo --release` fails while the blob is in history.
2. **Take `preview.png`** at the repo root. Follow `scripts/PREVIEW.md` (sample vault only, never a real one).
3. **Replace the `<owner>` placeholder** that README, CHANGELOG, CONTRIBUTING, `llms.txt` and `docs/` use for the
   GitHub owner (agents may not write usernames), then rerun `node scripts/check-docs.mjs`.
   **Confirm the copyright name** in `LICENSE` and `NOTICE` (currently the git author name) and that you want
   that name public. It is the only place a real name appears.
4. **Check Obsidian's trademark text** (https://obsidian.md/brand) once more and that `NOTICE` still says
   "not affiliated". Keep the generic icon; do not add the real logo to the repo.
5. **Install the CI workflow.** Pushing a workflow file needs a token with the `workflow` scope, which the
   unattended run did not have. Run `gh auth refresh -s workflow`, then copy `scripts/ci.workflow.yml`
   (without its two header comment lines) to `.github/workflows/ci.yml`, commit and push. Check that the
   ubuntu, windows and macos jobs are green.
6. **Run everything locally once on your machine:**
   ```
   node --test tests/
   node scripts/check-repo.mjs --release
   node scripts/privacy-scan.mjs        # add your real names, employer and project names to scripts/.privacy-words first
   node scripts/check-docs.mjs
   herdr-app check <path to this repo>/mods/vault
   herdr-app check <path to this repo>/mods/vault-reader
   ```
7. **Try a clean install** into a scratch Herdr home (`HERDR_APP_HOME=<empty folder>`), as a user would:
   copy `mods/vault` and `mods/vault-reader`, merge `keys.json`, press the key, add `examples/sample-vault`.
8. **Enable GitHub Pages** (Settings, Pages, branch `main`, folder `/docs`). Private repositories need a paid
   plan; public ones do not. There is no Pages workflow on purpose.
9. **Make the repository public.**
10. **Add the topic `herdr-mod`** (never `herdr-layout`: this repo has no layout). herdr.dev/mods lists it
    within the hour. If the listing wants a `RECIPE.md` and `preview.png` inside each mod folder, add short
    copies there (they sit beside `main.js` and are left out by installers, but do change the folder, which
    reloads the mod, so do it before publishing, not after). The community repos keep one of each at the root.
11. **Tell the portrait layout repo** (board `herdr-portrait-layout`) that this repo is public so its RECIPE
    can link here, and that `mods/vault-reader/obsidian.png` now holds a generic icon (`vault.svg` is the
    vector version it should switch to).
12. After publishing, a second pair of eyes on the herdr.dev page: description, preview, RECIPE text.
