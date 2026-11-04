# Herdr Obsidian Vault

Browse an [Obsidian](https://obsidian.md) vault from a side panel in the [Herdr](https://herdr.dev) desktop app, and read its notes in a floating window that draws them the way Obsidian does. Read-only: it never writes into your vault.

<!-- preview: the author adds preview.png before the first release; until then no screenshot is claimed -->

Two Herdr mods live in this repository:

| Mod | Folder | What it is |
| --- | --- | --- |
| `vault` | `mods/vault` | The panel: a vault picker fed by Obsidian's own vault list, a file tree, and full-text search with ripgrep. |
| `vault-reader` | `mods/vault-reader` | The floating reader: front matter, callouts, wikilinks, embeds, images, tasks, tags, tables, math, Mermaid, Excalidraw, Canvas and PDFs. |

Install both, under these exact names. A sample vault to try them on is in `examples/sample-vault`.

Documentation for people and agents: [docs site](docs/index.html) (GitHub Pages from `/docs`), [AGENTS.md](AGENTS.md), [llms.txt](llms.txt), [RECIPE.md](RECIPE.md), [CHANGELOG.md](CHANGELOG.md), [CONTRIBUTING.md](CONTRIBUTING.md).

## Support level

The mods look for every external program in the places used by macOS, Linux and Windows, and say in the panel which one is missing. The author runs them on macOS. Linux and Windows are implemented and covered by unit tests with a fake operating system and by a three-OS CI workflow (a template in `scripts/ci.workflow.yml` that the author still has to install), but have not been watched inside the live Herdr app yet. Reports are welcome.

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
2. Copy `mods/vault` and `mods/vault-reader` into the `mods` folder of your Herdr home. The home is `~/.config/herdr-app` on macOS and Linux unless `HERDR_APP_HOME` says otherwise; `herdr-app --help` prints the path on your machine, which is the one to use on Windows. Do not overwrite a mod of the same name; rename instead (see [AGENTS.md](AGENTS.md#renaming-a-mod)).

   ```sh
   cp -R mods/vault mods/vault-reader ~/.config/herdr-app/mods/
   ```

3. Merge the optional key of `keys.json` (Ctrl+Shift+E opens the panel as a popup) into your own `keys.json`.
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

For the portrait layout (`herdr-portrait-layout`), append it to the children of the node with id `panel-body`; its bar then shows a Vault button by itself. You can also split a pane with the app command `pane.split` and `mod` set to `vault`, or skip the layout: the optional key Ctrl+Shift+E in `keys.json` opens the panel as a 420 by 640 popup. See the [install page](docs/install.html) for more.

On first run the panel lists the vaults Obsidian already knows. Otherwise use **Add vault** and pick a folder that contains `.obsidian`.

## Use

- Click a note, canvas, drawing, image or PDF in the tree to open it in the reader. Other files open with your system.
- Type two letters or more in the search box. Up and Down move, Enter opens, Esc clears.
- In the reader: Esc closes, Alt+Left or Backspace (and Cmd+[ on macOS) goes back, links open notes in place, and **Keep** pins a note into a tab named `obsidian`.

Details are on the [usage page](docs/usage.html).

## Requirements

Only Herdr is required. Each program below adds a feature; without it you get a plain message, not a failure. Programs are found on PATH and then in the usual install folders of each system. Vaults must be inside your home folder.

<!-- requirements:start -->
| Program | Used for | Without it | macOS | Linux | Windows |
| --- | --- | --- | --- | --- | --- |
| Herdr desktop app | Runs both mods. | Nothing works. | Install Herdr. | Install Herdr. | Install Herdr. |
| ripgrep (`rg`) | The search box in the Vault panel. | Search says ripgrep is missing and names the install command. Browsing and reading still work. | `brew install ripgrep` | `sudo apt install ripgrep`, `sudo dnf install ripgrep` or `sudo pacman -S ripgrep` | `winget install BurntSushi.ripgrep.MSVC` or `scoop install ripgrep` |
| Node.js 22 or newer (`node`) | Drawing math, Mermaid diagrams and Excalidraw drawings (the render script). | Those blocks show their source text with a one-line notice. | `brew install node` | Your package manager or nodejs.org (check `node --version` is 22 or newer) | `winget install OpenJS.NodeJS` |
| A Chromium-family browser (Chrome, Chromium, Edge or Brave) | Runs headless to take a picture of each diagram, formula and drawing. | Same as without Node: source text and a notice. | Chrome, Chromium, Brave or Edge in `/Applications` | `google-chrome`, `chromium`, `brave-browser` or `microsoft-edge` on PATH | Chrome, Edge or Brave in Program Files (Edge ships with Windows) |
| Obsidian desktop app | Supplies its own Mermaid and MathJax, read at run time from `obsidian.asar`. | Same as without Node: source text and a notice. Notes, canvases and images still open. | Obsidian in `/Applications` | Obsidian from its AppImage, deb, Flatpak or Snap install | Obsidian under your user Programs folder |
| Poppler (`pdftoppm`, `pdfinfo`) | Every page of a PDF (the first 30). | macOS shows page 1 through Quick Look. Linux and Windows show an install hint instead of a page. | `brew install poppler` | `sudo apt install poppler-utils`, `sudo dnf install poppler-utils` or `sudo pacman -S poppler` | `scoop install poppler` or `choco install poppler` |
| curl | Downloading web images that a note shows with `![](https://...)`. | Those images show a one-line error. Turn them off on purpose with the remote images setting. | Ships with macOS | Usually installed; else `sudo apt install curl` | Ships with Windows 10 and 11 |
| System file opener | Opening files the reader cannot show, web links, and PDFs in your viewer. | The click does nothing. | `open` (built in) | `xdg-open` (package `xdg-utils`) | `cmd /c start` (built in) |
<!-- requirements:end -->

Environment variables `HERDR_VAULT_BROWSER` (or `CHROME_PATH`) and `HERDR_VAULT_ASAR` point the mods at a browser and at Obsidian's `obsidian.asar` installed in an unusual place. Where Obsidian keeps its vault list on each system is on the [requirements page](docs/requirements.html).

## Privacy

| | |
| --- | --- |
| Reads | the selected vault folder, Obsidian's vault list, and Obsidian's `obsidian.asar` (only Mermaid and MathJax) |
| Runs | `rg`, `node`, a headless Chromium-family browser, `pdfinfo`, `pdftoppm`, `curl`, the system opener, and on macOS `qlmanage` |
| Downloads | web images that a note shows, with `curl`; switch off with the `remoteImages` setting |
| Writes | only `data/vault` in the Herdr home: picture cache, Mermaid and MathJax copies, browser profile, settings |
| Never | writes into the vault, sends note text anywhere, runs Dataview or other plugin code, opens `file:` or `obsidian:` links |

The full list is on the [privacy page](docs/privacy.html).

## Troubleshooting

- **Search says ripgrep isn't installed**: install `rg` (table above).
- **Diagrams or formulas show their source**: Node.js 22+, a Chromium-family browser or the Obsidian app is missing; the notice names it.
- **A PDF shows one page**: install Poppler.
- **The vault is not listed**: it must be inside your home folder; use Add vault.
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
| `tests/` | `node --test tests/` |
| `scripts/` | repository checks (`check-docs.mjs`, `check-repo.mjs`, `privacy-scan.mjs`), the CI workflow template and the publish checklists |
| `AGENTS.md`, `llms.txt` | instructions for AI agents |
| `plans/` | the plans and logs of each improvement round |

## Credits, license and trademarks

Apache-2.0, see [LICENSE](LICENSE). Obsidian is a trademark of its owner. This project is not affiliated with, endorsed by, or sponsored by Obsidian, and the Obsidian logo is not distributed. Icons are from [Lucide](https://lucide.dev) (ISC); the drawing decompressor is lz-string (MIT). Mermaid and MathJax are not in this repository: the reader uses the copies inside your own Obsidian installation at run time. Everything is listed in [NOTICE](NOTICE).
