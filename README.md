# Herdr Obsidian Vault

<a href="https://miguelalexanderdiaz.github.io/herdr-obsidian-vault/"><img src="docs/assets/docs-button.svg" alt="Read the documentation" width="196" height="44"></a>

Browse an [Obsidian](https://obsidian.md) vault from a side panel in the [Herdr](https://herdr.dev) desktop app, and read its notes in a floating window that draws them the way Obsidian does. Read-only: it never writes into your vault.

![Schematic of the Vault panel on the left and the floating Vault reader on the right. A drawing, not a screenshot.](docs/assets/layout.svg)

*The picture above is a schematic of the layout, not a screenshot.*

<!-- publish: preview. Take preview.png (scripts/PREVIEW.md), copy it to docs/assets/, then delete this comment's first and last lines so the picture below shows, and delete the schematic caption above.
![Screenshot of the Vault panel next to the Vault reader, showing the sample vault](docs/assets/preview.png)
-->

Two Herdr mods live in this repository:

| Mod | Folder | What it is |
| --- | --- | --- |
| `vault` | `mods/vault` | The panel: a vault picker fed by Obsidian's own vault list, a file tree, and full-text search with ripgrep. |
| `vault-reader` | `mods/vault-reader` | The floating reader: front matter, callouts, wikilinks, embeds, images, tasks, tags, tables, math, Mermaid, Excalidraw, Canvas and PDFs. |

Install both, under these exact names. A sample vault to try them on is in `examples/sample-vault`.

Documentation for people and agents: [docs site](docs/index.html) (GitHub Pages from `/docs`), [AGENTS.md](AGENTS.md), [llms.txt](llms.txt), [RECIPE.md](RECIPE.md), [CHANGELOG.md](CHANGELOG.md), [CONTRIBUTING.md](CONTRIBUTING.md).

## Support level

macOS is the only OS the author uses; Linux and Windows code paths are implemented and covered by fake-platform unit tests but not run in the live app.

The mods look for every external program in the places used by macOS, Linux and Windows, and say in the panel which one is missing. Reports from Linux and Windows are welcome: the [Platform report](https://github.com/miguelalexanderdiaz/herdr-obsidian-vault/issues/new?template=platform-report.yml) issue form has a short checklist on the sample vault.

CI (`.github/workflows/ci.yml`) runs the checks and unit tests on Linux, macOS and Windows with Node 22. That covers the code, not the mods running inside Herdr.

## Install

macOS / Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/miguelalexanderdiaz/herdr-obsidian-vault/main/install/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/miguelalexanderdiaz/herdr-obsidian-vault/main/install/install.ps1 | iex
```

It shows what the mods reach and asks before writing anything, backs up anything it replaces, copies both mods (`vault` and `vault-reader`), adds one key to `keys.json` and checks each mod. Running it again updates. Then press Ctrl+Shift+M in any layout to open the Vault panel as a popup.

Remove it: the same command with the uninstall flag. It leaves `data/vault` (cache and settings); your vaults are never touched.

```sh
curl -fsSL https://raw.githubusercontent.com/miguelalexanderdiaz/herdr-obsidian-vault/main/install/install.sh | sh -s -- --uninstall
```

```powershell
$env:HERDR_UNINSTALL = 1; irm https://raw.githubusercontent.com/miguelalexanderdiaz/herdr-obsidian-vault/main/install/install.ps1 | iex
```

With an agent, by hand, options and docking the panel: the [Install page](docs/install.html) and [Usage](docs/usage.html#show).

## Use

- Click a note, canvas, drawing, image or PDF in the tree to open it in the reader. Other files open with your system.
- Type two letters or more in the search box. Up and Down move, Enter opens, Esc clears.
- In the reader: Esc closes, Alt+Left or Backspace (and Cmd+[ on macOS) goes back, links open notes in place, **Web images: on/off** controls downloads, and **Keep** pins a note into a tab named `obsidian`.

Details are on the [usage page](docs/usage.html). Notes over 1 MiB cannot be opened in the reader, an opened PDF shows its first 30 pages, and nothing is editable; the [limits](docs/usage.html#limits) list the rest.

## Requirements

Only Herdr is required. Each program below adds a feature; without it you get a plain message, not a failure. Programs are found on PATH and then in the usual install folders of each system. Vaults must be inside your home folder.

<!-- requirements:start -->
| Program | Adds | Install |
| --- | --- | --- |
| Herdr desktop app | Runs both mods (required). | herdr.dev |
| ripgrep (`rg`) | Search in the panel. | macOS `brew install ripgrep`, Linux `apt install ripgrep`, Windows `winget install BurntSushi.ripgrep.MSVC` |
| Node.js 22.4 or newer | Math, Mermaid and Excalidraw, with the next two. | macOS `brew install node`, Linux nodejs.org or your package manager, Windows `winget install OpenJS.NodeJS` |
| Chrome, Chromium, Edge or Brave | Draws those pictures, headless. | Any one; Edge is built into Windows. |
| Obsidian desktop app | Its own Mermaid and MathJax. | Its installer; an AppImage needs the `asar` setting. |
| Poppler | Every PDF page (the first 30); without it macOS shows page 1. | macOS `brew install poppler`, Linux `apt install poppler-utils`, Windows `scoop install poppler` |
| curl | Web images in notes. | Built into macOS and Windows 10 or newer; Linux `apt install curl` |
| System file opener | Opens other files, links and PDFs in your viewer. | Built in (`open`, `rundll32 url.dll,FileProtocolHandler`); Linux `xdg-open` from `xdg-utils` |
<!-- requirements:end -->

To install the optional programs in one go (the same commands as the table; a missing one is only a feature lost):

```sh
# macOS (Homebrew)
brew install ripgrep node poppler
# Linux (Debian and Ubuntu names; use your package manager's)
sudo apt install ripgrep poppler-utils curl
```

```powershell
# Windows
winget install BurntSushi.ripgrep.MSVC OpenJS.NodeJS
scoop install poppler
```

A browser or Obsidian in an unusual place: add `"browser"` and `"asar"` (absolute paths) to `data/vault/settings.json` in the Herdr home, no restart needed. The environment variables `HERDR_VAULT_BROWSER` (or `CHROME_PATH`) and `HERDR_VAULT_ASAR` also work, but only if Herdr itself was started with them. The search order and where Obsidian keeps its vault list on each system are on the [configuration page](docs/configuration.html#lookup).

## Privacy

| | |
| --- | --- |
| Reads | the selected vault folder (the render script also reads the pictures that an Excalidraw drawing embeds), Obsidian's vault list (on first run and on Import), and Obsidian's `obsidian.asar` (only Mermaid and MathJax) |
| Runs | `rg`, `node`, a headless Chromium-family browser (with a loopback-only debugging port for one render run), `pdfinfo`, `pdftoppm`, `curl`, the system opener (`open`, `xdg-open`, `rundll32`), `stat` or PowerShell for file timestamps, your login shell or `where` to find a program, and on macOS `qlmanage` and `sips` as fallbacks |
| Downloads | web images that a note shows, with `curl`; switch off with the **Web images** button (setting `remoteImages`) |
| Writes | only `data/vault` in the Herdr home: picture cache, Mermaid and MathJax copies, a temporary browser profile per render, settings. Herdr's own `shared.json` keeps vault paths after uninstall ([how to clear them](docs/privacy.html#writes)) |
| Never | writes into the vault, sends note text anywhere, runs Dataview or other plugin code, opens `file:` or `obsidian:` links, launches programs from a note |

The full list is on the [privacy page](docs/privacy.html).

## Troubleshooting

- **Search says `ripgrep (rg) isn't installed`**: install `rg` (table above).
- **Diagrams or formulas show their source**: Node.js 22.4+, a Chromium-family browser or the Obsidian app is missing; one line above the note names it.
- **A PDF shows one page or an install hint**: install Poppler.
- **The vault is listed dimmed, or not at all**: it must be inside your home folder; use Add vault or Import from Obsidian.
- **A web image is missing**: check the Web images button and that `curl` exists.
- **Wipe the cache**: delete `data/vault/cache` in the Herdr home.

The [troubleshooting page](docs/troubleshooting.html) has every message with its fix.

## Uninstall

```sh
curl -fsSL https://raw.githubusercontent.com/miguelalexanderdiaz/herdr-obsidian-vault/main/install/install.sh | sh -s -- --uninstall
```

Windows and by hand: see [Install](docs/install.html#uninstall).

## Repository map

| Path | Holds |
| --- | --- |
| `mods/vault`, `mods/vault-reader` | the two mods |
| `examples/sample-vault` | a vault that exercises every feature |
| `docs/` | the documentation site (GitHub Pages: branch `main`, folder `/docs`) |
| `tests/` | the `npm test` suite, fixtures and helper tools |
| `scripts/` | repository checks (`check-docs.mjs`, `check-repo.mjs`, `check-recipe.mjs`, `install-sim.mjs`, `privacy-scan.mjs`, `typecheck.mjs`), the CI workflow template and the publish checklists |
| `AGENTS.md`, `llms.txt` | instructions for AI agents |

## Credits, license and trademarks

Apache-2.0, see [LICENSE](LICENSE). Obsidian is a trademark of its owner. This project is not affiliated with, endorsed by, or sponsored by Obsidian, and the Obsidian logo is not distributed. Icons are from [Lucide](https://lucide.dev) (ISC); the drawing decompressor is lz-string (MIT). Mermaid and MathJax are not in this repository: the reader uses the copies inside your own Obsidian installation at run time. Everything is listed in [NOTICE](NOTICE).
