# Contributing

Thanks for helping. This project is two Herdr mods plus the checks and documentation that keep them publishable. Agents should also read [AGENTS.md](AGENTS.md); it has the Herdr-specific rules.

## Setup

- Node.js 22.4 or newer (the render script needs the built-in `WebSocket`; the mods check the version before they start it). No `npm install` is needed: the tests and scripts have no dependencies.
- The Herdr desktop app, to run `herdr-app check` on a mod folder.
- Optional, only to try the features by hand: ripgrep, a Chromium-family browser, the Obsidian app, Poppler, curl. See the [requirements](docs/requirements.html). Tests that want one of them skip, with a stated reason, when it is missing.
- Optional, for `node scripts/typecheck.mjs`: TypeScript (`tsc`) and Herdr's own `herdr.d.ts` and `gpui-kit.d.ts` in the Herdr home. Without either it prints `skipped: <reason>` and exits 0.

```sh
git clone https://github.com/<owner>/herdr-obsidian-vault.git
cd herdr-obsidian-vault
node --version   # v22.4 or newer
```

## Layout and ownership

| Path | Holds |
| --- | --- |
| `mods/vault`, `mods/vault-reader` | the mods; every file here may be copied to a person's Herdr home |
| `tests/` | `*.test.mjs` tests for `npm test`, `tests/fixtures/` for edge-case files, `tests/tools/` for helper scripts |
| `examples/sample-vault/` | the test vault; keep it generic and small |
| `scripts/` | repository checks and the publish checklists |
| `docs/` | the Pages site; plain HTML and CSS, no scripts, nothing loaded from other sites |

Mod folders must stay self-contained: do not import from one mod into the other, and do not put a `package.json` inside a mod folder.

## The checks

Run all of the "needs Herdr: no" ones before you open a pull request, and `herdr-app check` too if you changed a mod:

| Command | What it checks | Needs Herdr | In the CI template |
| --- | --- | --- | --- |
| `npm test` | unit tests on the pure modules and the sample vault, strict stubs, the runtime-globals scan, seeded-fault tests of `check-docs`; the end-to-end render test skips without a browser | no | yes |
| `node scripts/syntax-check.mjs` | every `.js` and `.mjs` parses | no | yes |
| `node scripts/check-repo.mjs` | manifests, keys, public contract, licences, the CI template's commands | no | yes |
| `node scripts/check-recipe.mjs` | every claim in `RECIPE.md` has a source in the code | no | yes |
| `node scripts/install-sim.mjs` | each mod copied alone into a temp Herdr home, keys merge, imports stay inside the folder (also runs `herdr-app check` on the copies when `herdr-app` is on the PATH) | no | yes |
| `node scripts/privacy-scan.mjs` | personal data, operating-system literals outside `platform.js`, commit messages | no | yes |
| `node scripts/check-docs.mjs` | links, anchors, contrast, tables, quoted messages as string literals, the claims table, the support sentence, the CI template, a fresh `docs/llms-full.txt` | no | yes |
| `node scripts/build-llms-full.mjs --check` | `docs/llms-full.txt` is what a fresh build gives (`check-docs` runs the same comparison) | no | no |
| `node scripts/typecheck.mjs` | the mods against Herdr's own `.d.ts` files with `tsc` | no, but needs those files | no |
| `herdr-app check /absolute/path/to/mods/vault` and `.../vault-reader` | Herdr loads the mod once and checks its first description | yes | no |
| `node scripts/check-repo.mjs --release` and `node scripts/check-docs.mjs --release` | the publish gate | no | no |

```sh
npm test
node scripts/syntax-check.mjs
node scripts/check-repo.mjs
node scripts/check-recipe.mjs
node scripts/install-sim.mjs
node scripts/privacy-scan.mjs
node scripts/check-docs.mjs
node scripts/build-llms-full.mjs --check
node scripts/typecheck.mjs
herdr-app check /absolute/path/to/mods/vault
herdr-app check /absolute/path/to/mods/vault-reader
git status --short   # clean: nothing generated is left behind
```

<!-- publish: ci. Install the workflow (scripts/PUBLISH.md), wait for a green run, then replace this sentence with the systems that ran. -->
A CI workflow template (`scripts/ci.workflow.yml`) is meant to run the "yes" rows on Linux, macOS and Windows. It has not run yet because the author still has to install it as `.github/workflows/ci.yml` (`node scripts/install-ci.mjs`), so do not rely on it: run the checks yourself. The release gate fails by design until the author's steps in `scripts/PUBLISH.md` are done. `herdr-app check` can leave `gpui-kit.d.ts` and `jsconfig.json` in a mod folder; they are git-ignored, do not commit them.

## Testing rules

- `npm test` runs `node --test` over `tests/**/*.test.mjs` (a quoted glob; `node --test tests/` fails because a bare folder is read as a module). Put new tests in that pattern.
- Test files must pass on Windows by construction: import a file through `pathToFileURL`, clear `PATH` case-insensitively, use `os.tmpdir()`. A test that needs a browser, `rg` or Herdr's `.d.ts` files skips with a stated reason when it is absent.
- Tests must not need Chrome, Obsidian, ripgrep, Poppler or the network to pass. Pure modules (`parse.js`, `doc.js`, `canvas.js`, `platform.js`, `search-core.js`, `assets-core.js`, `obsidian-config.js`, `watch.js`) take what they need as arguments; tests give them a fake `exec` and a fake platform for darwin, linux and win32.
- To add a case for a bug, put the smallest failing input in `tests/fixtures/` and write the test first.
- To exercise a feature by hand, use `examples/sample-vault`. Add a file there only when a feature has no example at all, and keep it generic.
- Do not drive somebody's running Herdr window to test (no `herdr-app do`, `shot` or `status` against a live screen).
- The stand-ins for Herdr's modules are strict: an element allows only method names that exist in `gpui-kit.d.ts` (list in `tests/stubs/gpui-methods.json`, regenerate with `node tests/tools/gen-gpui-methods.mjs` after a Herdr update), and `tests/runtime-globals.test.mjs` fails when mod code uses a global that Herdr lacks.

## Probing what Herdr's runtime has

Node has globals and options that Herdr's JavaScript runtime lacks, which is how code once passed the tests and failed in the app. Do not guess and do not use a live window: ask Herdr itself with a throw-away mod.

1. Make a folder outside the Herdr home (for example in your temp folder) with a `mod.json` and a `main.js`:

   ```json
   { "place": "none", "title": "Probe" }
   ```

   ```js
   import { View, div } from "gpui-kit";
   export default class Probe extends View {
     render() {
       throw new Error("probe -> TextDecoder: " + typeof TextDecoder + ", Intl: " + typeof Intl);
       return div();
     }
   }
   ```

2. Run `herdr-app check /absolute/path/to/that/folder`. The check fails on purpose and prints your message with the answer, for example `TextDecoder: undefined`. It writes `gpui-kit.d.ts` and `jsconfig.json` into that folder; delete the folder afterwards.
3. Never put a probe inside the Herdr home or in this repository: Herdr reloads whatever is in its mods folder on screen.

On macOS with Herdr 0.1.12 this showed `TextDecoder`, `TextEncoder`, `structuredClone` and `Intl` as `undefined`, `localeCompare` ignoring `numeric`, and `setTimeout`, `process`, `Buffer` and `URL` present. That something is present does not make it allowed: Herdr's own notes forbid `setTimeout` and Node APIs, and the runtime-globals test lists what mod code may not use. Update that list and `AGENTS.md` ("Herdr facts behind the rules") when a probe changes an answer, and say which Herdr version it was.

## Reporting a platform result

Linux and Windows have not been seen running in the live Herdr app. If you have either, the most useful contribution is a result: follow [Check your install](docs/verify.html) on `examples/sample-vault` (fifteen steps, each with what to expect) and file it with the "Platform report" issue form, which has the same fields as the report block on that page. Include the exact text of any message. Do not include note text, screenshots of your own vault, or paths that name you. A result that shows a plain message naming a missing program is a pass: that is the designed behaviour.

## Privacy checklist

Before every commit, make sure that nothing personal got in. `node scripts/privacy-scan.mjs` catches most of it; you still check by eye.

- [ ] No real names (only the copyright line in `LICENSE`), usernames, e-mail addresses or employer names.
- [ ] No home paths: write `~`, `<Herdr home>`, `<vault>`.
- [ ] No host names, IP addresses or tokens.
- [ ] Examples, fixtures and screenshots use generic content, never your own vault or window.
- [ ] No Obsidian logo or application files; new icons are from Lucide and covered by `NOTICE`.

## Documentation

If you change a requirement, a message, a key, a limit or a setting, change the docs in the same pull request: `README.md` (requirements table), the matching page in `docs/` (`requirements`, `configuration`, `troubleshooting`, `usage` limits, `verify` steps), `AGENTS.md` and `CHANGELOG.md`. After editing `llms.txt`, copy it (`cp llms.txt docs/llms.txt`) and rebuild the long text (`node scripts/build-llms-full.mjs`). Then run `node scripts/check-docs.mjs`; it checks:

- links, anchors, contrast, that the README and the site list the same requirements, and that the keys table equals `keys.json`;
- that every message quoted in the troubleshooting page (`class="msg"`) is a string literal in the code. A quote found only in a comment fails. A quote shorter than 12 characters must be a whole literal or the whole text between two `${...}` holes of a template;
- the claims table `scripts/doc-claims.json`: each row names a phrase in a doc (`docText`), a code file and a pattern run on that file with comments removed. To add one, copy a row; when you change a constant, change the doc and the row together, and the failure names the row;
- the one support-level sentence (`SUPPORT` in `scripts/check-docs.mjs`), word for word, in the README, both `llms.txt` copies, `docs/index.html` and `docs/requirements.html` (page text and meta description);
- that the CI template runs only commands that exist, that `docs/verify.html` names only files in the sample vault, and that `docs/llms-full.txt` is current.

`tests/check-docs.test.mjs` seeds faults into a temp copy of the repository and expects each to fail; add a case there when you add a check.

Every sentence that changes when the repository is published (the screenshot slot, the CI sentence, the owner placeholder, the herdr.dev form, the tag links) carries a mark: an HTML comment that starts with `publish:`. `rg "publish:"` lists them, and `node scripts/check-docs.mjs --release` fails until they are resolved. Add a mark to any new sentence of that kind; never remove one for the author.

Write plainly: short sentences, what happens and what to do. State the real support level; do not promise what the code does not do.

## Commits and pull requests

- Small commits with a clear subject and a body that says why.
- Keep the public contract stable (mod names `vault` and `vault-reader`, shared keys `vault.list`, `vault.current`, `vault.open`, `vault.panes`, `vault.outside`, commands `vault.add` and `vault.import`, the tab name `obsidian`, the path `mods/vault/icons/book-open.svg`). See [Configuration](docs/configuration.html#contract).
- The pull request title becomes the commit on `main` (pull requests are squash-merged) and the line in the changelog, so write it as a [Conventional Commit](https://github.com/conventional-commits/conventionalcommits.org): `feat: ...` for something new, `fix: ...` for a bug fix, `docs: ...` for documentation (all three are listed in the changelog); `ci:`, `test:`, `refactor:`, `build:`, `chore:` or `style:` for the rest, which the changelog leaves out. An optional scope goes in parentheses (`fix(privacy): ...`) and a `!` before the colon marks a breaking change. The `conventional title` check enforces it.
- Do not edit `CHANGELOG.md` by hand: after each merge, [release-please](https://github.com/googleapis/release-please) (`.github/workflows/release.yml`) updates one release pull request with the next version and its changelog lines. Merging that pull request tags `vX.Y.Z` and publishes the GitHub release.
- A pull request should say what changed, which of the checks above you ran, and on which operating system.

## Publishing

Publishing to herdr.dev (a screenshot, the Pages setting, the `herdr-mod` topic, making the repository public) is done by the owner. The checklist is `scripts/PUBLISH.md`. The docs site is served by GitHub Pages from the `main` branch and the `/docs` folder. Every sentence that changes when the repository is published carries a mark, an HTML comment that starts with the word publish and a colon; `rg "publish:"` lists them and `node scripts/check-docs.mjs --release` fails until they are resolved.

## License

Contributions are accepted under the Apache License 2.0 in [LICENSE](LICENSE).
