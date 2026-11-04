# Herdr Obsidian Vault

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

The mods look for every external program in the places used by macOS, Linux and Windows, and say in the panel which one is missing. Reports from Linux and Windows are welcome: [docs/verify.html](docs/verify.html) is a short checklist on the sample vault with a report template.

<!-- publish: ci. Install the workflow (scripts/PUBLISH.md), wait for a green run, then replace this sentence with the systems that ran. -->
A CI workflow template is in `scripts/ci.workflow.yml`. It has not run yet because the author still has to install it, so no system is claimed to be checked by it.

## Install

Both ways need the Herdr desktop app. Read [what the mods read, run and download](#privacy) first.

### With a Herdr agent

Paste this to an agent running in Herdr, with the repository address filled in:

```text
Install the Herdr mods from https://github.com/<owner>/herdr-obsidian-vault .
It has two mods, mods/vault and mods/vault-reader, and a keys.json.
Read every file first, tell me what they run and fetch, copy both
folders into my mods folder without overwriting anything, merge
keys.json after asking me about clashes, run herdr-app check on both
mods, then add the Vault panel to my layout.
```

### By hand

1. Clone or download this repository.
2. Find your Herdr home: `herdr-app --help` ends with a line `Home: ~/.config/herdr-app (HERDR_APP_HOME picks another)`. Here `~` is your user folder; the default is `.config/herdr-app` inside it, unless `HERDR_APP_HOME` is set. This default is quoted from Herdr's help and has not been checked on Windows. Copy `mods/vault` and `mods/vault-reader` into the `mods` folder of that home. Do not overwrite a mod of the same name; rename instead (see [AGENTS.md](AGENTS.md#renaming-a-mod)).

   ```sh
   # macOS and Linux
   cp -R mods/vault mods/vault-reader ~/.config/herdr-app/mods/
   ```

   ```powershell
   # Windows PowerShell: $env:HERDR_APP_HOME if set, else the default under your user folder
   $h = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } else { "$HOME\.config\herdr-app" }
   Copy-Item -Recurse mods\vault, mods\vault-reader "$h\mods"
   ```

3. Merge the optional key of `keys.json` (Ctrl+Shift+M opens the panel as a popup) into your own `keys.json`.
4. Check both mods. Both must pass; Herdr reloads mods on its own, there is no restart.

   ```sh
   herdr-app check ~/.config/herdr-app/mods/vault
   herdr-app check ~/.config/herdr-app/mods/vault-reader
   ```

### Show the panel

The mods are installed with `"place": "none"`, so nothing shows until you place the panel. Add a block to a column or stack in a layout file:

```json
{ "id": "vault", "type": "block", "content": { "mod": "vault" } }
```

For the portrait layout (`herdr-portrait-layout`), append it to the children of the node with id `panel-body`; its bar then shows a Vault button by itself. You can also split a pane with the app command `pane.split` and `mod` set to `vault`, or skip the layout: the optional key Ctrl+Shift+M in `keys.json` opens the panel as a 420 by 640 popup. See the [install page](docs/install.html) for more.

On first run the panel lists the vaults Obsidian already knows. Otherwise use **Add vault** and pick a folder that contains `.obsidian`.

## Use

- Click a note, canvas, drawing, image or PDF in the tree to open it in the reader. Other files open with your system.
- Type two letters or more in the search box. Up and Down move, Enter opens, Esc clears.
- In the reader: Esc closes, Alt+Left or Backspace (and Cmd+[ on macOS) goes back, links open notes in place, **Web images: on/off** controls downloads, and **Keep** pins a note into a tab named `obsidian`.

Details are on the [usage page](docs/usage.html). Notes over 1 MiB cannot be opened in the reader, an opened PDF shows its first 30 pages, and nothing is editable; the [limits](docs/usage.html#limits) list the rest.

## Requirements

Only Herdr is required. Each program below adds a feature; without it you get a plain message, not a failure. Programs are found on PATH and then in the usual install folders of each system. Vaults must be inside your home folder.

<!-- requirements:start -->
| Program | Used for | Without it | macOS | Linux | Windows |
| --- | --- | --- | --- | --- | --- |
| Herdr desktop app | Runs both mods. | Nothing works. | Install Herdr. | Install Herdr. | Install Herdr. |
| ripgrep (`rg`) | The search box in the Vault panel. | Search shows `ripgrep (rg) isn't installed:` and the install hint for your system. Browsing and reading still work. | `brew install ripgrep` | install ripgrep with your package manager (for example: `apt install ripgrep`) | `winget install BurntSushi.ripgrep.MSVC` |
| Node.js 22 or newer (`node`) | Drawing math, Mermaid diagrams and Excalidraw drawings (the render script). | One line above the note names what is missing; the source of each diagram, formula or drawing stays visible. | `brew install node` | install Node.js 22 or newer (nodejs.org, or your package manager) | `winget install OpenJS.NodeJS` |
| A Chromium-family browser (Chrome, Chromium, Edge or Brave) | Runs headless to take a picture of each diagram, formula and drawing. | Same: one line above the note, `A Chromium-based browser wasn't found`, and the source stays visible. | Chrome, Chromium, Brave or Edge in `/Applications` (or `~/Applications`) | `google-chrome`, `chromium`, `brave-browser` or `microsoft-edge` on PATH | Edge, Chrome or Brave in Program Files or Local AppData (Edge is built into Windows) |
| Obsidian desktop app | Supplies its own Mermaid and MathJax, read at run time from `obsidian.asar`. | Same: one line above the note, `The Obsidian app wasn't found`, and the source stays visible. Notes, canvases and images still open. | Obsidian in `/Applications` (or `~/Applications`) | Obsidian from `/opt`, `/usr/lib`, `/usr/share`, Snap or Flatpak | Obsidian in `%LOCALAPPDATA%` or Program Files |
| Poppler (`pdftoppm`, `pdfinfo`) | Every page of a PDF (the first 30). | macOS draws page 1 through Quick Look. Linux and Windows show `Poppler (pdftoppm, pdfinfo) isn't installed:` with the hint, and the PDF opens in your default app. | `brew install poppler` | install poppler-utils with your package manager (for example: `apt install poppler-utils`) | `scoop install poppler` |
| curl | Downloading web images that a note shows with `![](https://...)`. | Those images show `curl isn't installed:` with the hint. Turn web images off on purpose with the Web images button. | Ships with macOS | install curl with your package manager (for example: `apt install curl`) | Ships with Windows 10 and newer |
| System file opener | Opening files the reader cannot show, web links, and PDFs in your viewer. | The click does nothing. | `open` (built in) | `xdg-open` (package `xdg-utils`) | `rundll32 url.dll,FileProtocolHandler` (built in) |
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

Environment variables `HERDR_VAULT_BROWSER` (or `CHROME_PATH`) and `HERDR_VAULT_ASAR` point the mods at a browser and at Obsidian's `obsidian.asar` installed in an unusual place. Where Obsidian keeps its vault list on each system is on the [requirements page](docs/requirements.html).

## Privacy

| | |
| --- | --- |
| Reads | the selected vault folder, Obsidian's vault list, and Obsidian's `obsidian.asar` (only Mermaid and MathJax) |
| Runs | `rg`, `node`, a headless Chromium-family browser, `pdfinfo`, `pdftoppm`, `curl`, the system opener (`open`, `xdg-open`, `rundll32`), `stat` or PowerShell for file timestamps, your login shell or `where` to find a program, and on macOS `qlmanage` and `sips` as fallbacks |
| Downloads | web images that a note shows, with `curl`; switch off with the **Web images** button (setting `remoteImages`) |
| Writes | only `data/vault` in the Herdr home: picture cache, Mermaid and MathJax copies, a temporary browser profile per render, settings |
| Never | writes into the vault, sends note text anywhere, runs Dataview or other plugin code, opens `file:` or `obsidian:` links, launches programs from a note |

The full list is on the [privacy page](docs/privacy.html).

## Troubleshooting

- **Search says `ripgrep (rg) isn't installed`**: install `rg` (table above).
- **Diagrams or formulas show their source**: Node.js 22+, a Chromium-family browser or the Obsidian app is missing; one line above the note names it.
- **A PDF shows one page or an install hint**: install Poppler.
- **The vault is listed dimmed, or not at all**: it must be inside your home folder; use Add vault or Import from Obsidian.
- **A web image is missing**: check the Web images button and that `curl` exists.
- **Wipe the cache**: delete `data/vault/cache` in the Herdr home.

The [troubleshooting page](docs/troubleshooting.html) has every message with its fix.

## Uninstall

Remove the block from your layout and the keys you merged, delete `mods/vault` and `mods/vault-reader` from your Herdr home, and optionally delete `data/vault` there. Your vaults are never touched.

## Repository map

| Path | Holds |
| --- | --- |
| `mods/vault`, `mods/vault-reader` | the two mods |
| `examples/sample-vault` | a vault that exercises every feature |
| `docs/` | the documentation site (GitHub Pages: branch `main`, folder `/docs`) |
| `tests/` | the `npm test` suite, fixtures and helper tools |
| `scripts/` | repository checks (`check-docs.mjs`, `check-repo.mjs`, `privacy-scan.mjs`), the CI workflow template and the publish checklists |
| `AGENTS.md`, `llms.txt` | instructions for AI agents |
| `plans/` | the plans and logs of each improvement round |

## Credits, license and trademarks

Apache-2.0, see [LICENSE](LICENSE). Obsidian is a trademark of its owner. This project is not affiliated with, endorsed by, or sponsored by Obsidian, and the Obsidian logo is not distributed. Icons are from [Lucide](https://lucide.dev) (ISC); the drawing decompressor is lz-string (MIT). Mermaid and MathJax are not in this repository: the reader uses the copies inside your own Obsidian installation at run time. Everything is listed in [NOTICE](NOTICE).
