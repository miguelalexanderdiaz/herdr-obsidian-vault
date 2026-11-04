# Contributing

Thanks for helping. This project is two Herdr mods plus the checks and documentation that keep them publishable. Agents should also read [AGENTS.md](AGENTS.md); it has the Herdr-specific rules.

## Setup

- Node.js 22 or newer. The render script uses the global `WebSocket` and `fetch`, and CI uses Node 22. No `npm install` is needed: the tests and scripts have no dependencies.
- The Herdr desktop app, to run `herdr-app check` on a mod folder.
- Optional, only to try the features by hand: ripgrep, a Chromium-family browser, the Obsidian app, Poppler, curl. See the [requirements](docs/requirements.html).

```sh
git clone https://github.com/<owner>/herdr-obsidian-vault.git
cd herdr-obsidian-vault
node --version   # v22 or newer
```

## Layout and ownership

| Path | Holds |
| --- | --- |
| `mods/vault`, `mods/vault-reader` | the mods; every file here may be copied to a person's Herdr home |
| `tests/` | `*.test.mjs` tests for `npm test`, `tests/fixtures/` for edge-case files, `tests/tools/` for helper scripts |
| `examples/sample-vault/` | the test vault; keep it generic and small |
| `scripts/` | repository checks and the publish checklists |
| `docs/` | the Pages site; plain HTML and CSS, no scripts, nothing loaded from other sites |
| `plans/` | each improvement round's plan, role logs and summary |

Mod folders must stay self-contained: do not import from one mod into the other, and do not put a `package.json` inside a mod folder.

## The checks

Run all of them before you open a pull request:

```sh
npm test
node scripts/check-repo.mjs
node scripts/privacy-scan.mjs
node scripts/check-docs.mjs
herdr-app check /absolute/path/to/mods/vault
herdr-app check /absolute/path/to/mods/vault-reader
git status --short   # clean: nothing generated is left behind
```

The CI workflow template (`scripts/ci.workflow.yml`, installed by the owner as `.github/workflows/ci.yml`) runs the first four on Linux, macOS and Windows with Node 22. `herdr-app check` needs the app and runs on your machine only. `herdr-app check` can leave `gpui-kit.d.ts` and `jsconfig.json` in a mod folder; they are git-ignored, do not commit them.

## Testing rules

- `npm test` runs `node --test` over `tests/**/*.test.mjs` (a quoted glob; `node --test tests/` fails because a bare folder is read as a module). Put new tests in that pattern.
- Tests must not need Chrome, Obsidian, ripgrep, Poppler or the network. Pure modules (`parse.js`, `doc.js`, `canvas.js`, `platform.js`, `search-core.js`, `assets-core.js`, `obsidian-config.js`, `watch.js`) take what they need as arguments; tests give them a fake `exec` and a fake platform for darwin, linux and win32.
- To add a case for a bug, put the smallest failing input in `tests/fixtures/` and write the test first.
- To exercise a feature by hand, use `examples/sample-vault`. Add a file there only when a feature has no example at all, and keep it generic.
- Do not drive somebody's running Herdr window to test (no `herdr-app do`, `shot` or `status` against a live screen).

## Privacy checklist

Before every commit, make sure that nothing personal got in. `node scripts/privacy-scan.mjs` catches most of it; you still check by eye.

- [ ] No real names (only the copyright line in `LICENSE`), usernames, e-mail addresses or employer names.
- [ ] No home paths: write `~`, `<Herdr home>`, `<vault>`.
- [ ] No host names, IP addresses or tokens.
- [ ] Examples, fixtures and screenshots use generic content, never your own vault or window.
- [ ] No Obsidian logo or application files; new icons are from Lucide and covered by `NOTICE`.

## Documentation

If you change a requirement, a message, a key, a limit or a setting, change the docs in the same pull request: `README.md` (requirements table), the matching page in `docs/`, `AGENTS.md` and `CHANGELOG.md`. After editing `llms.txt`, copy it: `cp llms.txt docs/llms.txt`. `node scripts/check-docs.mjs` checks links, anchors, contrast, that the README and the site list the same requirements, that the keys table equals `keys.json`, and that every message quoted in the troubleshooting page exists in the code.

Write plainly: short sentences, what happens and what to do. State the real support level; do not promise what the code does not do.

## Commits and pull requests

- Small commits with a clear subject and a body that says why.
- Keep the public contract stable (mod names `vault` and `vault-reader`, shared keys `vault.list`, `vault.current`, `vault.open`, `vault.panes`, command `vault.add`). See [Configuration](docs/configuration.html#contract).
- Add a line under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
- A pull request should say what changed, which of the checks above you ran, and on which operating system.

## Publishing

Publishing to herdr.dev (a screenshot, the Pages setting, the `herdr-mod` topic, making the repository public) is done by the owner. The checklist is `scripts/PUBLISH.md`.

## License

Contributions are accepted under the Apache License 2.0 in [LICENSE](LICENSE).
