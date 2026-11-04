# Obsidian Vault

Two Herdr mods that put an Obsidian vault next to your terminals. The **Vault** panel is a file list of the
selected vault with a vault picker and a search box. Clicking a note, canvas, drawing, image or PDF opens it,
rendered, in a floating **reader** window: properties, callouts, wikilinks, embeds, tags, tasks, tables, code,
Mermaid, math, Excalidraw drawings and Canvas boards. Notes are read only; nothing is ever written to your vault.

<!-- publish: preview. Take preview.png (scripts/PREVIEW.md), then delete this comment's first and last lines so the picture below shows.
![Obsidian Vault](preview.png)
-->

This file is the brief: enough to build Obsidian Vault from an empty folder. The files next to it are one build of
it, for macOS, Linux and Windows. If they don't work on your Herdr, or you want it different, build it again from
here. Obsidian itself is optional (see Watch out). The project is not affiliated with Obsidian; it reads the same
open folder format.

## What you see

**Vault panel** (mod `vault`, a rounded 10px card with a 1px `border` line, `background` fill, 13px text). It is
shown as a popup of 420 x 640 px near the top of the window with the key below, or docked wherever a layout puts a block
`{ "type": "block", "content": { "mod": "vault" } }`. Top to bottom:

1. A 42px header: a vault selector pill (the generic vault icon, the current vault's name, a chevron; the
   tooltip shows the vault's folder) and an "Add vault" button with a plus. The pill opens a 300px-wide menu
   listing every vault with the current one checked, its folder in dim text and a remove X (the folder stays),
   vaults of Obsidian's list that are outside the home folder greyed out ("Outside your home folder: Herdr can't
   read it"), then "Add vault…" and "Import from Obsidian" (reads Obsidian's own list again and adds what is
   missing).
2. A 30px search box (7px radius, 1px border that turns `accent` while there is text) with a search icon, the
   placeholder "Search notes…" and a clear button.
3. The tree: folders first, then files, natural sort order, notes and canvases shown without their extension,
   dot folders hidden. Each row has a 14px icon by kind: note (file-text), drawing (pen-tool), canvas, image,
   pdf, other file. At most 2000 entries are listed per folder, and at most 3000 rows are drawn in all open folders together (a last row says
   "Only the first 3000 rows are drawn (close a folder, or search)"). The note shown in the reader is highlighted
   with the `selected` colour.
4. While searching, the tree is replaced by a result list: icon, name, folder, and for text matches the matching
   line in 11.5px muted text, then a status line made of the count ("12 notes", "1 note", "200+ notes") and "· ↑↓ Enter · Esc clears".

If no vault is known, an empty state says "No vault yet" and offers an "Add vault" button.

**Reader window** (mod `vault-reader`): a floating window 78% wide and 86% high of the Herdr window, with a 40px
bar and a scrolling column at most 1040px wide with 30px side padding, 15px text, in Herdr's own font settings
(a generic fallback if none is set). Bar, left to right: the vault icon (a generic gem, 15px), a back arrow when
there is history, the note name in 13.5px semibold, a "› heading" crumb with a "Whole note" button when a
heading or block was linked, the folder path (dim, truncated at the start), a "Web images: on" or "Web images: off"
button when the note has pictures from the web, an "Open in Preview" (macOS) or "Open in the default app" (Linux,
Windows) button for PDFs and images, a "Keep ▾" button and a close X.

Inside the column, in order: a properties (frontmatter) table, then the note body. Callouts are rounded boxes
with a tinted background, an icon and a title, in these 13 types and colours: note `#027aff`, abstract `#53dfdd`,
info `#027aff`, todo `#027aff`, tip `#53dfdd`, success `#44cf6e`, question `#e9973f`, warning `#e9973f`,
failure `#fb464c`, danger `#fb464c`, bug `#fb464c`, example `#a882ff`, quote `#9e9e9e`. Aliases map onto them
(summary and tldr to abstract, hint and important to tip, check and done to success, help and faq to question,
caution and attention to warning, fail and missing to failure, error to danger, cite to quote); an unknown type
is drawn as a note. Foldable callouts (`[!tip]-`) can be collapsed.

## How it behaves

- **Opening:** click a note, canvas, drawing, image or PDF in the panel or in search results: the reader opens
  for it. Any other file type is opened with the operating system's default program. Enter opens the
  highlighted search result.
- **Search:** starts at 2 letters. Results are notes whose name matches first, then notes whose text matches
  (ripgrep, case-insensitive, vault dot folders and ignored folders left out), at most 200 results. Up and Down
  move the highlight, Enter opens, Esc clears the search.
- **Vaults:** on first run the list is taken from Obsidian's own vault list, most recently opened first, when
  Obsidian is installed and its list is inside the home folder. "Add vault" opens a folder picker; the folder
  must contain a `.obsidian` folder, otherwise a warning notification says so. Removing a vault from the menu
  only forgets it. Which folders you expanded is remembered per vault.
- **Live refresh:** the tree and the open note refresh when files change on disk; if the system refuses to watch
  a very large vault the panel shows a hint instead of silently going stale.
- **Links:** a wikilink or Markdown link to a note, canvas, drawing, image or PDF opens it in the same reader
  (heading `#` and block `^` anchors scroll to or show just that part, "Whole note" restores the rest). Only
  `http`, `https` and `mailto` links go to the operating system; `file:` and `obsidian:` links are dropped.
- **Back:** Alt+Left and Backspace on every OS; Cmd+[ also on macOS.
- **Keys in the reader:** Esc closes the floating window (not a kept pane).
- **Embeds:** `![[note]]`, `![[note#heading]]`, `![[image.png|300]]`, `![[file.pdf]]` and `![[x.canvas]]` embed
  the target. PDFs are drawn page by page (each page appears as it is ready), up to 30 pages, then a row says
  how many are left and offers to open the file in Preview (macOS) or the default app (Linux, Windows).
- **Diagrams and maths:** Mermaid blocks, `$...$` and `$$...$$` maths and Excalidraw drawings are drawn as
  pictures by a headless Chromium-family browser with Obsidian's own Mermaid and MathJax, cached by content.
  When something needed for that is missing (Node.js 22.4, a browser or the Obsidian app), the source is shown
  instead with one plain sentence naming what is missing and how to get it for this operating system.
- **Keep ▾:** "New tab" creates a Herdr tab named `obsidian` holding the note as a pane; "Add to obsidian"
  splits one more note below the others in that tab. A kept pane has no close X and no Esc; it can take the
  keyboard through `pane.go`.
- **Key:** `ctrl-shift-m` toggles the Vault panel popup (`keys.json`, `mod.open:vault`).
- **Shared state** other mods may read: `vault.list`, `vault.current`, `vault.open` (the stable three, see
  Built from).

Degraded behaviour, always a visible one-line message, never a stack trace or raw JSON: no ripgrep, search says
so and how to install it; no Poppler, a PDF shows what the system can draw or an install hint; no browser, no
Node.js 22.4 or no Obsidian app, diagrams, maths and drawings show their source; Obsidian's vault list not found,
the panel asks you to use "Add vault". Specific messages: a note, canvas or drawing over 1 MiB shows "This note is
larger than 1 MiB, so the reader can't open it. Open it in Obsidian." ("canvas" or "drawing" in place of "note");
a file that was deleted or moved shows "This file is no longer in the vault"; "Add vault" on a folder outside the
home folder posts the warning "Vault outside your home folder" ("Herdr mods can only read inside your home folder,
so <name> can't be added. A link to it from inside your home folder may work.") and lists the folder dimmed in the
selector; a vault already in the list that is outside the home folder shows "This vault is outside your home
folder, which Herdr mods can't read" in place of the tree. What Herdr's `readTextFile` returns beyond 1 MiB is not
documented, so the large-note message is not verified in the live app.

## Built from

Files: `mods/vault/` (`main.js`, `search.js`, `platform.js`, `mod.json`, `icons/`, `vault.svg`),
`mods/vault-reader/` (`main.js`, `parse.js`, `doc.js`, `canvas.js`, `assets.js`, `platform.js`, `mod.json`,
`icons/`, `vault.svg`, `render/` with `render.mjs`, `page.html`, `page.js`, `excalidraw.js`,
`lzstring.js`), `keys.json`, `examples/sample-vault/`.

`mods/vault/mod.json`: `{ "place": "none", "title": "Vault", "overlay": { "kind": "popup", "at": "top", "offset": 40, "width": 420, "height": 640 } }`
(a popup placed at the top of the window, 40 px down, so it does not depend on where the pointer was when
the key was pressed; `kind`, `at` and `offset` are the fields Herdr's own picker mods and its official examples use,
and the placement has not been checked on a small window, see Watch out).
`mods/vault-reader/mod.json`: `{ "place": "none", "title": "Vault reader", "focusable": true }`. Neither docks by
itself; the reader is opened by the panel with `openOverlay({ mod: "vault-reader", kind: "window",
key: "vault-reader", width: 0.78, height: 0.86, props: { vault, file } })`.

Reader props: `{ vault: absolute folder, file: vault-relative path, anchor?: heading or ^block, kept?: true
(a pane of an "obsidian" tab), overlay? }`; `{ menu: true, window, vault, file, anchor, overlay }` draws the
Keep menu as a popup.

Shared keys (persisted, the stable contract, frozen): `vault.list` `[{ path, name }]`, `vault.current` (path),
`vault.open` `{ vault, file, token }` (what the floating reader shows). Additive keys, not part of the frozen three:
`vault.outside` (the
vaults of Obsidian's list that are outside the home folder) and `vault.adding` (internal: set while a folder picker
is open, so the docked and the popup copy of the panel agree; it expires after 2 minutes). Commands, delivered to
the panel's `nextCommand()`: `vault.add` (the selector menu's "Add vault…") and `vault.import` ("Import from
Obsidian"); the reader gets `focus`. Local storage: `open:<vault path>` keeps expanded folders.

`herdr` functions used: `theme`, `props`, `shared`, `setShared`, `pickFolder`, `readTextFile`, `watchFolder`,
`exec`, `home`, `appHome`, `window`, `notify`, `openOverlay`, `closeOverlay`, `settings`, `nextCommand`, `run`,
`spaces`, `panes`. Commands run: `tab.new`, `tab.select`, `pane.split`, `vault.add`, `vault.import`.
gpui-kit and gpui-base: `View`, `div`, `svg`, `image`, `v_flex`, `h_flex`, `InputState`, `Input`, `TextView`.

Programs run through `exec` (none are bundled; each is optional and its absence is reported in the UI): `rg`
(ripgrep, search), `node` 22.4 or newer (runs `render/render.mjs`), a Chromium-family browser (Chrome, Chromium,
Edge or Brave, headless) for diagrams, maths and drawings, Poppler `pdftoppm` and `pdfinfo` (PDF pages), `curl`
(remote images), the system opener (`open` on macOS, `xdg-open` on Linux, `rundll32 url.dll,FileProtocolHandler` on
Windows; Windows does not use `cmd /c start`, which would read an `&` in a link as another command), `stat`
(macOS, Linux) or `powershell` (Windows) for file stamps, `where` (Windows) or `sh` (macOS, Linux) to find a program
that is not on Herdr's PATH, and on macOS only, as fallbacks, `qlmanage` and `sips`. Every operating-system-specific
path, name and command lives in one `platform.js` per mod.

Art: Lucide icons (`icons/*.svg`, ISC) and a generic gem for the vault icon (`vault.svg`). The Obsidian logo is not
included.

## Watch out

**Permissions and side effects.** Herdr asks you to know these before adding a mod:

| What | Where | Detail |
| --- | --- | --- |
| Network | `mods/vault-reader/assets.js` | A remote image (`![](https://...)`) in a note is downloaded with `curl` when the note opens (http and https only, at most 5 redirects, 20 seconds and 20 MB per picture, at most four pictures at a time), so the image host sees your IP address. A reader setting `remoteImages` (stored in `data/vault/settings.json`, default on, as in Obsidian) turns it off. Nothing else is sent anywhere. |
| Local server and DevTools port | `render/render.mjs` | The headless browser loads a render page from an HTTP server on `127.0.0.1` and a random port, with background networking disabled, and is started with `--remote-debugging-port=0`: a DevTools port on loopback only, random, open only for the length of one render run. Neither is reachable from other machines. The render page carries a content-security policy that allows only its own origin, `data:` and `blob:`, and the browser runs with `--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1` and `--no-proxy-server`, so a diagram that names a web address (a Mermaid label with an `<img>`, say) does not fetch it; this was checked by hand against the real Obsidian bundle and a real browser, and an automated end-to-end test with a stub Obsidian bundle and a counting server asserts zero outside requests (it needs a Chromium-family browser and skips, saying so, without one). |
| Programs (`exec`) | see Built from | `rg`, `node`, browser, `pdftoppm`, `pdfinfo`, `curl`, the system opener (`open`, `xdg-open` or `rundll32`), `stat` or `powershell` (file stamps), `where` (Windows), and on macOS only, as fallbacks, `qlmanage` (page 1 of a PDF without Poppler) and `sips` (size of AVIF and TIFF images). Arguments are passed as an array, with one exception: to find a program that is not on Herdr's PATH, macOS and Linux run `sh -c 'exec "${SHELL:-sh}" -lc "command -v <tool>"'` (for the browser, `command -v` with the list of browser names), which starts your login shell (and so your shell profile scripts); the names there come from fixed lists, never from a note. No `hc`. |
| Reads outside the mod folder | home folder only | Obsidian's `obsidian.json` vault list (macOS `~/Library/Application Support/obsidian/obsidian.json`; Linux `~/.config/obsidian/obsidian.json`, the Flatpak copy `~/.var/app/md.obsidian.Obsidian/config/obsidian/obsidian.json` and the Snap copy `~/snap/obsidian/current/.config/obsidian/obsidian.json`; Windows `~/AppData/Roaming/obsidian/obsidian.json`), every vault folder you pick (`readdir`, `readTextFile`, `watchFolder`), and, by Node, Obsidian's `obsidian.asar` to take Mermaid and MathJax from. Herdr mods cannot read outside the home folder, so a vault elsewhere is listed as not readable. |
| Writes outside the mod folder | `<Herdr home>/data/vault/` | `cache/` (rendered pictures and copied images), `lib/` (libraries extracted from your Obsidian install; `lib.tmp-<pid>/` and `lib.lock/` exist only while that runs), `chrome-<pid>-<time>-<rand>/` (a temporary browser profile for one render run, removed when the run ends; leftovers older than an hour are swept at the next run), `settings.json` (written by the "Web images" button as `remoteImages`; you may add `browser` and `asar`, absolute paths, by hand). Never inside a mod folder, because Herdr reloads a mod when its folder changes. The cache is pruned at reader start: entries older than 30 days, then oldest first until under 200 MB. Deleting `data/vault/` is always safe. |
| Links | notes and canvas cards | Only `http`, `https` and `mailto` links are handed to the system opener. |
| Vault content | read only | Nothing is ever written to a vault. |

**Assumptions about your setup.** None about theme, fonts or keys: colours come from Herdr's theme, the font from
Herdr's settings with generic fallbacks, and the one binding is `ctrl-shift-m` (no `cmd-`, no plain ctrl+letter).
It is a global key: check `herdr-app commands` and your own `keys.json`, and when asked to merge, keep your key
if `ctrl-shift-m` is already used (open the panel with `mod.open` from the palette instead).

**Requirements, their install commands and the exact messages** are in the docs (`docs/requirements.html`,
`docs/troubleshooting.html`); this recipe only states the behaviour. In short: ripgrep gives search; Node.js 22.4 or newer
plus a Chromium-family browser plus the Obsidian app give diagrams, maths and drawings (Mermaid and MathJax are not
in this repo: they are read at run time from your own Obsidian install, see `NOTICE`); Poppler gives all PDF
pages. Per operating system: macOS has none of them by default (`brew install ripgrep poppler node`, plus a
browser and the Obsidian app); Linux needs `ripgrep`, `poppler-utils`, Node.js 22.4 or newer, a Chromium-family
browser and the Obsidian app from its package manager; Windows has Edge built in, which draws diagrams, but still
needs ripgrep (search), Poppler (PDF pages), Node.js 22.4 or newer and the Obsidian app. Notes, the file tree and
images need none of them.

**Finding the browser and Obsidian's bundle.** The first file that exists wins. Browser: the `browser` key of
`data/vault/settings.json` (an absolute path), then `HERDR_VAULT_BROWSER`, then `CHROME_PATH`, then the install
folders of the operating system (macOS `/Applications` and `~/Applications`; Windows Program Files, Edge, Chrome,
Brave, Chromium; Linux `/usr/bin`, `/opt`, `/usr/lib`, `/usr/local/bin`, `/snap/bin`), then the names on the PATH of
the `node` process, then the login shell (one `command -v` for all browser names, or `where` on Windows, asked once
per session and only when everything before failed). Obsidian's `obsidian.asar`: the `asar` key of the same file,
then `HERDR_VAULT_ASAR`, then the install folders. The settings are read at every render run; the environment
variables reach `node` only if Herdr itself was started with them, so on a desktop launcher use the settings keys.
Flatpak browsers and AppImage installs of Obsidian are not searched: name them in the settings file.

**Limits.** 2000 entries per folder in the tree; 200 search results; 30 PDF pages; at most 30000 files walked when
indexing a vault; column 1040px; reader window 78% x 86%; popup 420 x 640 px; 3000 rows drawn in the tree; pictures in a vault over 40 MB are refused with "This image is too large to show here"; at most 6 render jobs per `node` run, and the renderer stops starting
jobs after 24 seconds so a batch stays under Herdr's 30 second `exec` limit and times out with a plain message.

**Traps a fresh build falls into.**
- The popup's `kind`, `at: "top"` and `offset` come from the shipped picker mods and the official examples, not from
  a documented `mod.json` schema (Herdr's `AGENTS.md` documents only the overlay `width` and `height` there), and
  `herdr-app check` does not validate them. If a small window clips the 640 px height, lower `height` (a value up to
  1 is a share of the window) or open the panel docked instead.
- Never write under a mod folder at run time (cache, profile, extracted libraries go to `data/vault/`): Herdr
  reloads the mod and throws away its state.
- The reader must stay `"focusable": true` or `pane.go` cannot give a kept pane the keyboard.
- Herdr's `exec` has a 30 second limit; slow renders are split into batches.
- `watchFolder` can be refused for very large trees on Linux; do not assume it works, show a hint.
- Back must not use `[` with the platform modifier alone: off macOS that is the Windows key. Use Alt+Left and
  Backspace everywhere, Cmd+[ on macOS only.
- Stable contract, for the layouts and keys a person writes: mod names `vault` and `vault-reader`, the three
  shared keys, the commands `vault.add` and `vault.import`, the tab name `obsidian` and the reader props.
  `node scripts/check-repo.mjs` fails if one disappears.
- `examples/sample-vault` is the only vault in this repo and contains no real data; use it for screenshots.

**Controls that do nothing yet.** None. The real Obsidian logo is deliberately not shown (trademark); loading it
from the user's own install is not built.

## Done when

Each line is something a build really does, and the commands run on all three operating systems:

1. `herdr-app check <path>/mods/vault` and `herdr-app check <path>/mods/vault-reader` both print `check passed`.
2. `npm test` passes with Node.js 22.4 or newer, with no Chrome, Obsidian, ripgrep or Poppler installed.
3. `node scripts/check-repo.mjs`, `node scripts/check-recipe.mjs` (this recipe against the code) and
   `node scripts/privacy-scan.mjs` all exit 0.
4. Pressing `ctrl-shift-m` opens the 420 x 640 panel, whose selector lists the vaults of Obsidian's own list,
   or, with none, an empty state with an "Add vault" button; adding `examples/sample-vault` selects it and the
   tree shows the folders `attachments` and `projects` first, then `Board`, `Feature tour`, `Flow sketch` and
   `Other note`.
5. Typing `tour` in the search box lists "Feature tour"; Enter opens the reader at 78% x 86% with a properties
   table, callouts in the colours above, and the back arrow after following a wikilink; Backspace goes back.
6. Opening `attachments/manual.pdf` shows all of its pages one after another (Poppler installed), and without
   Poppler a visible line saying what to install.
7. With the headless-render prerequisites missing, a Mermaid block shows its source and one line naming the
   missing piece; with them present it shows a picture.
8. "Keep ▾ then New tab" creates a tab named `obsidian` with the note as its pane.
9. No file in the repo contains a home path, an e-mail address or a real name outside `LICENSE` and `NOTICE`.
