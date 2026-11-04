# How to take `preview.png`

Agents may not drive the running Herdr app, so the screenshot is a one-time author step. Save it as
`preview.png` at the repo root, copy it to `docs/assets/preview.png`, and open the blocks marked
`<!-- publish: preview -->` (`rg "publish: preview"`: RECIPE.md, README.md, docs/index.html) by deleting the first and
last line of each comment. Until then the repository shows a labelled drawing (`docs/assets/layout.svg`), not a
screenshot, and `check-repo --release` keeps failing on the missing file.

The drawings beside it (`docs/assets/layout.svg` and `docs/assets/feature-*.svg`, one per feature in the docs and the
README) are generated, not taken: `node scripts/make-pictures.mjs` draws them from the mods' layout code, their icons,
Herdr's default graphite theme and the sample vault, and `--check` says when one is out of date. Run it after a change
to the panel's or the reader's look. The screenshot step above stays as it is.

- **Content:** only `examples/sample-vault`. Never a real vault, a real window title, a real space or agent name,
  or a terminal with your prompt. Add the sample vault with the panel's "Add vault" item (it has a
  `.obsidian` folder), then open "Feature tour".
- **Show:** the Vault panel (selector row, search box, tree with a few folders open) next to the floating reader
  with a rendered note (properties, a callout, a Mermaid diagram or math block, an image).
- **Theme and fonts:** the Herdr default theme and default font, so the picture matches what a new user gets.
- **Size:** about 1600x1000, PNG, at least 800x500 (`check-repo --release` enforces the minimum). Keep it
  under about 1 MB.
- **Clean:** no notifications, no menu bar clock, no other apps. Crop to the Herdr window.
- **Metadata:** `node scripts/privacy-scan.mjs` reports text chunks and EXIF in PNG files. Capture with the
  system screenshot tool or `herdr-app shot` on your own machine, and re-export if it reports metadata.
