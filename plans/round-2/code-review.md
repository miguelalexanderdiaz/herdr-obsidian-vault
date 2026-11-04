# Round 2 / code-review: audit

Role: code-review. Base: `feat/round-1-portable-release` (all earlier work). Scope read: every file under `mods/`, `tests/`, the
round-1 plans, `herdr.d.ts`, `gpui-kit.d.ts`, Herdr's `AGENTS.md`. No repo file was changed except this one.

## Summary

Round 1 delivered a lot and the unit suite is green (154 pass), but three things in this audit changed the picture:

1. **I ran things round 1 could not.** `herdr-app check` accepts a throw-away mod outside the Herdr home, so I probed Herdr's
   real JS runtime with two probe mods (scratchpad, not the repo). Result: `TextDecoder`, `TextEncoder`, `structuredClone` and
   `Intl` do not exist there, and `localeCompare` ignores its `numeric` and `sensitivity` options. The suite runs under Node,
   which has all of them, so it passed while two shipped features are broken in Herdr (CR-2-1, CR-2-6). I also ran the real
   `render/render.mjs` on this macOS machine against the installed Obsidian bundle and Chrome (appHome in a scratch folder):
   Mermaid (flowchart, sequence, class, mind map, pie), inline and display math and the sample Excalidraw all draw, 0.6 to 1.5 s
   cold. So the renderer works end to end; what it does around the edges is the problem (CR-2-3, CR-2-12).
2. **Cross-platform paths that were only exercised by fakes are wrong in places a fake cannot see**: embedded PDFs never use
   Poppler (CR-2-2), search loses every hit in CRLF notes and mishandles `rg`'s Windows paths (CR-2-4), a test file will fail the
   whole Windows CI leg (CR-2-5).
3. **A claim the code does not back**: the renderer header, `RECIPE.md` and `docs/privacy.html` say the render page makes no
   network request. A Mermaid label with `<img src="http://...">` in a note makes headless Chrome fetch that URL, even with
   "Web images: off" (CR-2-3, reproduced).

I checked every method name the two `main.js` files call on gpui-kit elements against `gpui-kit.d.ts` (3,440 names): **no
misspelling and no missing method**. fs usage (`readFile`, `writeFile`, `readdir`, `exists`, `unlink`, `rmdir`, `mkdir`) matches
the declared `fs/promises` surface. `herdr` imports all exist in `herdr.d.ts`. Nothing in the mods uses `setTimeout`,
`process`, `require` or DOM.

Ordered by impact. Ownership: CR = code-review (`.js`/`.mjs`, mod assets, tests), DOC = documentation, HC = herdr-completeness.

| id | severity | one line | touches |
| --- | --- | --- | --- |
| CR-2-1 | high | `TextDecoder` is undefined in Herdr: SVG images (vault and web) never show, and the failure is cached | CR |
| CR-2-2 | high | embedded and canvas PDFs never use Poppler (Linux/Windows always say "Poppler isn't installed") | CR |
| CR-2-3 | high | the render page phones home through Mermaid `<img>` labels; docs say it does not | CR, DOC text |
| CR-2-4 | high | search drops every text hit of CRLF notes; Windows `rg` paths keep `\` and `.\` | CR |
| CR-2-5 | high (CI) | Windows CI leg fails on `import(path)`; `PATH` not cleared on Windows | CR, tests |
| CR-2-6 | medium | folder sort is not natural or case-insensitive in Herdr (`localeCompare` options ignored) | CR |
| CR-2-7 | medium | test stubs accept anything (any element method, all of node's fs, node-only globals) | CR |
| CR-2-8 | medium | no end-to-end render test; a stub-Obsidian design that runs on every CI OS | CR, HC (CI) |
| CR-2-9 | medium | browser and asar discovery is weaker than tool discovery; no settings override; Node gate off by 22.0-22.3 | CR, DOC |
| CR-2-10 | medium | unreadable files get the wrong message (note over 1 MiB, vault outside home) | CR, DOC |
| CR-2-11 | medium | fetch pipeline cost (sequential assets, whole-file reads, per-load stat) | CR |
| CR-2-12 | medium | live reload re-walks the vault on every directory event; panel renders every row | CR |
| CR-2-13 | low | leftover browser profile folders; claim "removed when the run ends" is not true | CR, DOC |
| CR-2-14 | low | link URLs with `)` and notes with a BOM | CR |
| CR-2-15 | low | cache hygiene: unexpected errors cached for good, no refresh on use, stray job files | CR |

---

## CR-2-1 (high) `TextDecoder` does not exist in Herdr: SVG images never show, and the failure is cached

**Evidence.** `mods/vault-reader/assets-core.js:153` (`sizeOf`, every `.svg` in the vault) and `:62` (`extFromBytes`, a web image
that is not a raster) call `new TextDecoder()`. Probe: a mod whose `render()` prints `typeof TextDecoder` and `typeof TextEncoder`
gave `undefined` for both under `herdr-app check`. Node has them, so `tests/assets.test.mjs:142` ("svg is sized from its text")
passes. In Herdr the call throws `ReferenceError`; `vaultImage` catches it and `fail(key, e)` (`:127`) writes
`{ error: "TextDecoder is not defined" }` into `<key>.json`, so that SVG shows the message from then on (until its stamp
changes). A web SVG gets the same, cached as "not a picture" (`remoteImage` catch, `:282`). `Buffer` from `"buffer"` does work
(`Buffer.from(bytes).toString("utf8")` returned `<svg` in the probe), and `fs.readFile(path, "utf8")` returns a string.

**Change.**
- Add to `mods/vault-reader/platform.js` a tiny `asciiText(bytes, n)` (a `String.fromCharCode` loop over the first `n` bytes). The
  header sniffing needs only ASCII markers (`<svg`, `width=`, `viewBox=`); do not use `TextDecoder`/`Buffer`. Use it at `:62` and
  `:153`.
- In `vaultImage` and `remoteImage`, cache a failure only when it is the file's fault (a deliberate `new FileProblem("Not an
  image this reader can show")`), never for an unexpected exception: add a `cache` flag to `fail` (it already has the parameter)
  and pass `false` from the generic `catch`.
- Bump the image key prefix (`img:` to `img2:`, `url:` to `url2:`) so the poisoned `{ error }` entries that round 1 may already
  have written next to someone's Herdr home are ignored.
- Tests: in `tests/assets.test.mjs` run the svg cases with `globalThis.TextDecoder`/`TextEncoder` deleted for the duration of
  the test (restore in `finally`), and a case where `sizeOf` throws an unexpected error and nothing is written to `<key>.json`.

**Owner.** CR. **Verify.** `npm test`; manually: a vault with a `.svg` shown by `![[logo.svg]]` draws (author, one look).
Probe again with a throw-away mod to confirm nothing else new is missing (see CR-2-7).

## CR-2-2 (high) Embedded and canvas PDFs never use Poppler

**Evidence.** `assets-core.js:205-212` `pdfPage` (the first page of a PDF that sits inside a note or a canvas) is Quick Look
only: `if (platform !== "macos") return { error: missingMessage(platform, "poppler") ... missing: "poppler" }`. `main.js:217`
and `:266` send every PDF that is not the opened document through it. Effect: on Linux and Windows `![[spec.pdf]]` always says
"Poppler isn't installed ..." even when it is installed (the opened-document path uses `pdftoppm`, so the person sees one PDF
work and the next one fail); on macOS Poppler is ignored in favour of Quick Look's lower-quality thumbnail.
`tests/assets.test.mjs:150-172` only asserts the *no Poppler* branch, so this passes.

**Change.** `pdfPage(file, stamp)`: if `tool("pdftoppm")` is found, return `pdfPageAt(file, stamp, 1)`; otherwise on macOS fall
back to Quick Look, otherwise the missing message. Same cache key family so a PDF drawn as page 1 is reused. Keep the
"Until then PDFs open in your default app." suffix only for the missing case.

**Owner.** CR. **Verify.** New test next to the existing one: platform `linux` and `windows` with a fake `pdftoppm` in exec,
`pdfPage` returns `{ path, w, h }` and the exec log shows `pdftoppm -f 1 -l 1`; platform `macos` with both Poppler and
`qlmanage` available prefers `pdftoppm`; without Poppler on macOS `qlmanage` is still used.

## CR-2-3 (high) The render page makes network requests for a note's content

**Evidence (reproduced).** I ran `render/render.mjs` for real (scratch appHome, installed Obsidian bundle, Chrome) with a
Mermaid job `graph TD; A["hello <img src='http://127.0.0.1:PORT/track'>"] --> B[ok]` while a loopback listener recorded
requests. The job drew normally and the listener received the request (twice). With `securityLevel: "strict"` Mermaid's
sanitiser still allows `<img>`. A note from someone else's vault can therefore make the user's machine fetch an arbitrary URL
(IP address, timing) when the note is opened, *even with "Web images: off"*, which the setting and `docs/privacy.html` imply
cannot happen. `render.mjs:4` says "Nothing leaves the machine"; `RECIPE.md:128` and `docs/privacy.html:61` rest on it.

**Change (tested on a copy in the scratchpad: all seven test jobs gave identical sizes, tracker hits went to zero).**
- `render/page.html`: add as the first element of `<head>`
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'none'">`.
- `render/render.mjs` `launch()`: also pass `--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1` so that nothing outside the
  loopback resolves even if the CSP is ever loosened (belt and braces; costs nothing).
- Fix the header comment ("Nothing leaves the machine") so it states the mechanism.
- Test: part of CR-2-8 (stub Mermaid whose `render` returns an `<img>` pointing at a loopback listener; assert zero hits). Until
  that exists, a static test that `page.html` contains the CSP meta and no `http://`/`https://` source.

**Owner.** CR (page.html, render.mjs). DOC: after this lands, `docs/privacy.html` and `RECIPE.md:128` become true as written;
add "the page also has a content-security policy that allows no outside address". **Verify.** The scratch run described above
(`node run.mjs` style: listener plus `spawn`, not `spawnSync`, which blocks the listener); `npm test`.

## CR-2-4 (high) Search: CRLF notes lose every text hit, Windows `rg` paths are not normalized

**Evidence.** `mods/vault/search-core.js:41`: `raw.slice(nul + 1).match(/^(\d+):(.*)$/)`. `ripgrep` prints a CRLF file's lines
with the `\r` kept; `.` does not match `\r`, so the whole line fails to match. Run in this audit:
`parseHits("a.md\0" + "12:hello\r\n")` returns `[]` (with `\n` it returns the hit). Notes written on Windows (and many synced
vaults) are CRLF: search then finds them by file name only, never by text, and nothing says so.
Second: on Windows `rg --files` and `rg -n` print `sub\note.md` (and with the `.` path argument `.\sub\note.md`).
`parseFiles` (`:33`) and `parseHits` only strip `./`, so `rel` keeps backslashes: `main.js:278` splits on `/` (the file name
becomes the whole path, no folder column), `vault.open.file` and the reader's `fileSet`/resolver (all `/`) do not match, so the
open-in-reader highlight and link resolution of that note break. No test covers either (`tests/search.test.mjs` has no
backslash or `\r` case).

**Change.** Strip a trailing `\r` from each record before matching (or use `[\s\S]*`). Pass a `windows` flag (from `deps.platform`,
already available in `searchWith`) into `parseFiles`/`parseHits` and, only then, turn `\` into `/` and strip a leading `./` or
`.\`. (POSIX file names may contain a backslash; do not rewrite them there.) Also strip the `\r` from `text` before `snippet`.

**Owner.** CR. **Verify.** Tests: CRLF hit; a Windows-shaped stdout (`.\sub\note.md\0` and `.\sub\note.md\x0012:x\n`) with
`platform: "windows"` gives `sub/note.md`; the same bytes on `linux` are left alone.

## CR-2-5 (high for CI) Windows CI leg would fail before it tests anything

**Evidence (from HC-2-3, confirmed by reading).** `tests/excalidraw.test.mjs:8`: `await import(path.join(...))` is a raw drive
path on Windows and Node throws `ERR_UNSUPPORTED_ESM_URL_SCHEME`, failing the file. `tests/render-lib.test.mjs:113` sets
`PATH: ""` in a copy of `process.env`; on Windows the variable is `Path`, so the runner's real PATH survives and "no browser
anywhere" would find the runner's Edge/Chrome. `tests/stubs/herdr.mjs:5` default `appHome: "/tmp/herdr-test-app"` is a POSIX path.
Other `import(` calls in `tests/` use relative specifiers (fine); no `import(` in `scripts/` joins a path (HC owns those).

**Change.** `await import(pathToFileURL(path.join(...)).href)`. In `runRender`, delete every key of the cloned env whose
lower-case form is `path` before setting it. `appHome: path.join(os.tmpdir(), "herdr-test-app")`. Also give
`tests/assets.test.mjs` fake `appHome`/`home` constants no drive-less assumption (they are strings only; fine as is).

**Owner.** CR. **Verify.** `npm test` on macOS here; the Windows result needs the author's CI run (HC installs the workflow).
Add a tiny test that lists `tests/*.mjs` and fails on `import(path.` without `pathToFileURL`, so it cannot come back unseen.

## CR-2-6 (medium) Folder sort is not natural or case-insensitive in Herdr

**Evidence.** `mods/vault/tree.js:27` sorts with `localeCompare(b, undefined, { numeric: true, sensitivity: "base" })`. Probe in
Herdr's runtime: `["a10","a2"]` sorted that way gives `a10,a2`; `["b","A","a","B","é","e","z"]` gives `ABabezé` (code-unit
order; `Intl` is `undefined`). So the tree shows `Zebra` before `apple` and `Note 10` before `Note 2`. The docs promise the
opposite (`docs/usage.html:37` "note 2 before note 10", `RECIPE.md:25` "natural sort order"). The unit test passes only because
Node has ICU. (Other `localeCompare` uses are tie-breaks and are deterministic either way.)

**Change.** A pure `naturalCompare(a, b)` in `tree.js`: fold with `toLowerCase()` (works in Herdr, probe: `ÉÀ` to `éà`), compare
runs of digits as numbers and the rest by code unit, final tie-break on the unfolded names. Use it in `folderEntries`. Do not
use `Intl`. The docs then stay true.

**Owner.** CR. **Verify.** Tests that do not depend on ICU (assert the order for `Note 2`, `note 10`, `Zebra`, `apple`, `é`,
`10`, `9`, `a1b10`, `a1b9`, equal names differing in case); run with `NODE_ICU_DATA` unset is not needed because the function
never calls `localeCompare`.

## CR-2-7 (medium) The test stubs accept anything, so "passes" proves less than it says

**Evidence.**
- `tests/stubs/element.mjs`: the Proxy returns a function for *every* property name, so `render-smoke.test.mjs` ("catches a
  misspelled name or a wrong property", its own header and the round-1 log) cannot catch a misspelled method. I did the check
  the stub claims to do, by diffing every `.name(` in both `main.js` files against the 3,440 method names in `gpui-kit.d.ts`:
  clean today, but the test would pass with a typo.
- `tests/stubs/fs-promises.mjs` re-exports all of `node:fs/promises`; Herdr offers seven functions (`readFile`, `writeFile`,
  `readdir`, `exists`, `unlink`, `rmdir`, `mkdir`). `fs.stat`, `fs.rename`, `fs.rm`, `fs.copyFile` would pass tests and fail in Herdr.
- Node-only globals (`TextDecoder`, `Intl`, `structuredClone`) are present in tests and absent in Herdr (CR-2-1, CR-2-6 were
  both invisible for that reason).

**Change.**
1. `tests/stubs/fs-promises.mjs`: export only the seven names (plus the Herdr `exists`).
2. `tests/stubs/element.mjs`: throw on a property that is not in an allow-list. Allow-list source: `tests/stubs/gpui-methods.json`
   (names only), regenerated by `tests/tools/gen-gpui-methods.mjs`, which reads `gpui-kit.d.ts` from `$HERDR_APP_HOME` or
   `~/.config/herdr-app` and lists the names in `Element`/`Div`/`Styled`-like interfaces. When the d.ts is present the stub
   reads it directly (so a typo fails on a developer's machine); otherwise it uses the committed JSON (CI).
3. New `tests/runtime-globals.test.mjs`: scan the non-`render/` mod sources (strip comments) and fail on `TextDecoder`,
   `TextEncoder`, `structuredClone`, `Intl.`, `setTimeout`, `setInterval`, `process.`, `require(`, `fs.stat`, `fs.rename`,
   `fs.rm`, `fs.copyFile`, and on `localeCompare(` with three arguments. A fix-it message names the Herdr probe result.
4. Type check (round-1 priority 3, HC-2-11): HC adds `scripts/typecheck.mjs` against Herdr's own `.d.ts`; type errors it reports
   come to CR. Until then items 2 and 3 are the cheap substitute.
5. Re-probe procedure, to write into `CONTRIBUTING.md` (DOC): a throw-away mod outside the Herdr home that throws a message from
   `render()`, run with `herdr-app check <abs folder>`; this is how CR-2-1 and CR-2-6 were found and it needs no live window.

**Owner.** CR (tests, stubs, tools); DOC for the CONTRIBUTING paragraph. **Verify.** Seed a misspelling (`.flex_onee()`) and a
`TextDecoder` use in a scratch copy: both tests fail; revert; `npm test` green.

## CR-2-8 (medium) End-to-end render test, designed to run on every CI OS

**Evidence.** Round-1 priority 3. `render.mjs` is covered only by its failure paths (`render-lib.test.mjs:101-127`) and by
`assets.test.mjs` with a fake exec; the real path (asar extraction, lock, server, CDP, screenshot, results JSON) has no test,
which is how CR-2-3 and CR-2-13 went unseen. I proved the path works with the real bundle (summary), so a test is worth writing.

**Change.** `tests/render-e2e.test.mjs`:
- Build a minimal fake Obsidian bundle in a temp dir: an asar (8-byte pickle header, JSON `{ files: { lib: { files: { "mermaid.min.js": ..., mathjax: { files: { "tex-chtml-full.js": ... } } } } } }`, file bodies after it; `extract()` in `render.mjs` is the exact reader to match) whose `mermaid.min.js` defines `window.mermaid = { initialize() {}, render: async (id, src) => ({ svg: ... }) }` (the svg can embed an `<img>` to a loopback listener for CR-2-3) and whose MathJax stub implements what `page.html`/`page.js` use (`startup.defaultReady`, `startup.promise`, `tex2chtml`, `chtmlStylesheet`, `startup.document.clear/updateDocument`).
- Point `HERDR_VAULT_ASAR` at it and use `findBrowser`'s own search; **skip** (`t.skip`) when no Chromium-family browser is found
  (GitHub's ubuntu runner has Chrome, windows-latest has Edge, macos-latest has Chrome, so the test runs there; locally it runs
  where a browser exists).
- Assertions: results JSON ok with w/h > 0 and a PNG header in `<out>.png`; second run reuses `data/vault/lib` (stamp file, no
  re-extraction); no `chrome-*` folder left behind (CR-2-13); the `<img>` listener got zero requests (CR-2-3); a job that never
  finishes ends with `timeout` inside `DEADLINE_MS + 5 s`.
- Use `spawn` (async), never `spawnSync`, for the render process while a listener runs in the same test (found the hard way:
  `spawnSync` starves the listener and makes the Mermaid job time out).

**Owner.** CR (test). HC: nothing to change in the workflow template beyond the existing `npm test` step. **Verify.**
`npm test` locally and, once the author installs the workflow, the three OS legs.

## CR-2-9 (medium) Browser and asar discovery is weaker than tool discovery

**Evidence (DOC-2-3, DOC-2-4, confirmed).** `platform.js:342`: `browserCandidates("linux")` is `[]`; discovery on Linux is the
bare names in `browserNames` on whatever `PATH` node inherits from Herdr's `exec`. Tools (`rg`, `node`, `pdftoppm`, `curl`) get
install folders plus a login-shell `command -v`; the browser and the Obsidian asar do not. `HERDR_VAULT_BROWSER`/`HERDR_VAULT_ASAR`
set "before starting Herdr" do not reach an app started from Finder or a desktop launcher (Herdr's AGENTS.md: such launches load
the login shell's PATH only). Separately `nodeOk` (`platform.js:279`) accepts any Node 22, but `render.mjs:30` needs the
`WebSocket` global, unflagged only from 22.4: on 22.0 to 22.3 the person has Node 22 and is told "needs Node.js 22 or newer".

**Change.**
- Resolve the browser in the mod with the existing `findTool` over `browserNames(platform)` (login-shell lookup included) and pass
  the absolute path in the job spec as `discover.browserPath`; `render.mjs` tries it first. Add Linux candidates
  (`/usr/bin/google-chrome*`, `/usr/bin/chromium*`, `/opt/google/chrome/chrome`, `/snap/bin/chromium`,
  `/var/lib/flatpak/exports/bin/org.chromium.Chromium` is a wrapper script that does not accept `--remote-debugging-port=0` the
  same way: leave Flatpak browsers out and say so).
- `data/vault/settings.json` accepts `browser` and `asar` (absolute paths, strings only, validated in `parseSettings`);
  they win over discovery and are passed in the spec. This is the only override that works for a Finder-launched Herdr.
- `nodeOk` requires 22.4 (parse the minor), the message says "Node.js 22.4 or newer"; `render.mjs` keeps the `WebSocket` check
  as the authority.
- Tests: `parseSettings` with the two keys (bad types ignored); `renderProblem` text; `nodeOk("v22.3.0")` false,
  `("v22.4.0")` true.

**Owner.** CR. DOC: requirements, configuration (two new keys), troubleshooting wording "22.4". HC: RECIPE requirement table.
**Verify.** Unit tests; a scratch run of `render.mjs` with `discover.browserPath` only.

## CR-2-10 (medium) Unreadable files get the wrong message

**Evidence.**
- Note or canvas over 1 MiB (round-1 CR-1-12, DOC-2-6): `main.js:187` `read: (f) => readTextFile(...)`; `herdr.d.ts` documents
  "up to 1 MiB, or null if absent". What happens beyond that (null, reject, truncate) is not documented and I could not test it
  from a one-shot `check`; `doc.js:27` turns `null` into "This file is no longer in the vault", and a reject surfaces its raw
  text via `load()`'s catch (`:154`).
- `vault/main.js:304`: `addVault` accepts any picked folder that has `.obsidian`; `fs.exists` outside the home folder either
  returns false or throws (caught as false), so a vault on another drive gets "has no .obsidian folder", which is wrong and
  contradicts the `vault.outside` messaging used by the import.

**Change.**
- `read` wrapper in `main.js`: `readTextFile`; on `null`, `fs.exists`; if the file exists, read it with `fs.readFile(path,
  "utf8")` up to 8 MB (reject larger by length) and otherwise return a typed result so `doc.js` says "This note is larger than
  N MB: open it in Obsidian" instead of "no longer in the vault". Two strings, both unique, posted on the board for DOC.
- `addVault`: before `fs.exists`, `insideHome(path, home())` (already in `obsidian-config.js`, pure); if outside, notify
  "Herdr mods can only read inside your home folder, so <name> can't be added. Open it from a symlink inside your home folder."
  and add it to `vault.outside`. (Symlinks inside home pointing out probably fail the same way: say "probably", not "will".)
- Tests: fake `read` returning null with `exists` true and a long body; `addVault` with `pickFolder` returning a path outside home.

**Owner.** CR. DOC: troubleshooting (both messages), install ("Add vault" on an outside folder). **Verify.** Unit tests; the
author tries a >1 MiB note once (the only way to learn what `readTextFile` does there) and reports on the board.

## CR-2-11 (medium) Fetch pipeline cost

**Evidence (round-1 priority 2).** `main.js:261-280` awaits every image, PDF and web image one after another; each
`vaultImage` reads the *whole* file before checking `IMAGE_MAX_BYTES` (`assets-core.js:176-177`, up to any size into memory),
writes a second copy to the cache, and every `load()` first runs `stamps()` (one `stat` process on macOS/Linux, one
PowerShell start of several hundred ms on Windows) even when everything is cached. A note with 40 images does 40 sequential
round trips; a hot reload while editing in Obsidian repeats it.

**Change.**
- Use the size already in the stamp (`"mtime:size"`, `parseStamp`) to refuse an oversized image before reading it.
- Run vault images and web images through a small pool (4 at a time, results committed as each finishes; stop starting new work
  when `gen` changed). Render jobs stay serialized (one browser at a time, by design).
- Copy by reference when the file is already in the cache under that key (no rewrite), and skip `stamps()` for a reload where
  the watcher reported only the note itself (reuse the previous map for the unchanged dependencies).
- Cap `pdfPages` to draw page 1 first, then the rest in the background, so a 30-page PDF shows its first page after one exec.

**Owner.** CR. **Verify.** Unit tests with a fake `exec` counting calls and a fake fs recording reads (a 50 MB stamp never
reads); timing is the author's judgement on the sample vault's `Feature tour`.

## CR-2-12 (medium) Live reload re-walks the vault; the panel draws every row

**Evidence.**
- `main.js:326`: `relist = all || rels.some((r) => !this.fileSet.has(r))`. `fileSet` holds files only, so any change event for a
  *folder* path (Windows reports the parent directory on every save; watchers coalesce directories too) is "not a known file"
  and triggers `relist()` (whether the OS watchers report folders is unverified here; the code should not depend on it), a sequential `readdir` over the whole vault (up to 30,000 files) each time Obsidian autosaves.
- `vault/main.js:386-409`: `rows()` builds an element for every entry of every open folder, up to 2,000 per folder, on every
  render (and the panel re-renders on any shared-state change). `gpui-kit.d.ts` has `uniform_list`/`v_virtual_list`
  (`:20359`, `:21276`), but their row renderer takes no handlers and `on_item_click` is the only click path: a larger change
  than one round should risk without seeing it live.

**Change.**
- Reader: keep `this.dirSet` (all parent folders of `files`, built in `relist`) and ignore rels in it; coalesce bursts (one
  relist per 1 s, using `cx.timer.after`, not `setTimeout`).
- Panel (cheap, safe step): render at most 300 rows per open folder with the existing "+N more not listed (search finds them)"
  row, and total rows bounded; leave `v_virtual_list` as a documented future step (needs the author's eyes).
- Tests: `changed()` with a folder path does not call `listVault`; five events in a burst call it once.

**Owner.** CR. **Verify.** Unit tests (count `readdir` calls); `render-smoke` with a 5,000-entry folder stub.

## CR-2-13 (low) Browser profile folders are left behind

**Evidence.** Running `render.mjs` here left `data/vault/chrome-<pid>-<time>-<rand>/Default/...` in place after exit 0.
`killBrowser()` (`render.mjs:134`) sends `SIGKILL` to the main browser process only; its helper processes then recreate files in
the profile after `rmSync` ran, so the folder survives until the next run's `sweepOldProfiles` (older than one hour). The docs
say "removed when the run ends (leftovers older than an hour are swept)" (`docs/configuration.html:98`); the first half is not
true on macOS.

**Change.** Ask the browser to close first (`Browser.close` over the same DevTools socket), wait for the `exit` event for up to
2 s, then kill; on POSIX start the browser with `detached: true` and kill the group (`process.kill(-pid)`), on Windows keep
`taskkill /T /F`; then `rmSync(profile)` with `maxRetries: 3, retryDelay: 100`. Keep the sweep.

**Owner.** CR. DOC: nothing to change if the fix works (the sentence becomes true). **Verify.** CR-2-8 asserts no `chrome-*` is
left; manual: `ls data/vault` after a run.

## CR-2-14 (low) Links with `)` and notes with a BOM

**Evidence (run in this audit).** `inline("see [[a)b]]", ctx)` produces `[a)b](vault:a)b.md)`: `encodeURIComponent` leaves `(`
and `)` alone, so a file name with an unbalanced `)` ends the link early (balanced parentheses survive). Also
`splitFrontmatter("﻿---\ntitle: x\n---\nbody").props` is `[]`: a note saved by a Windows editor with a byte-order mark shows
its properties as body text.

**Change.** `linkUrl`: after `encodeURIComponent`, replace `(` with `%28` and `)` with `%29` (`parseLinkUrl` already decodes).
`splitFrontmatter`: drop a leading `﻿` first. Tests for both in `tests/parse.test.mjs`.

**Owner.** CR. **Verify.** The two examples above.

## CR-2-15 (low) Cache hygiene

**Evidence.** `assets-core.js`: `fail()` caches *any* exception, not just the file's own problems (see CR-2-1); a cache hit does
not touch the entry, so the 30-day prune (`pruneList`) removes pictures of notes read every day after a month and the reader
redraws them (a cold browser start for each diagram); `jobs-*.json` files are removed only on the success path of
`renderNow` (a crash between write and unlink leaves them; `pruneCache` does remove them by age) and `ql-<key>/` folders are not
removed when Quick Look fails (`quickLook` has no `finally`).

**Change.** Cache only deliberate failures (with CR-2-1). On a cache hit older than 7 days, rewrite its `.json` (same content) to
refresh its mtime, at most once per entry per session. Put the Quick Look temp folder removal and the jobs file unlink in
`finally`. Test each with the fake fs.

**Owner.** CR. **Verify.** Unit tests on `createAssets` with a fake clock.

---

## Housekeeping from other roles (accepted, no separate finding)

- HC-2-6: add `// SPDX-License-Identifier: Apache-2.0` and the copyright line as the first lines of both `main.js` (comment-only) and
  point the first comment of `render/lzstring.js` at `render/LICENSE-lz-string.txt` once HC adds it. I will do this in the
  implement step.
- HC-2-5/popup: `vault/main.js` does not assume a pointer-anchored popup for the *panel*. The only popup it opens is the vault
  selector menu, which computes its own `at` from the button bounds and only falls back to `"pointer"` when the event has no
  bounds (`main.js:352-354`). The mod.json `overlay` (420x640) is used when the panel itself is opened as an overlay
  (`ctrl-shift-m`); the mod uses `props().menu` to tell the two apart. An explicit `kind` and `at` in `mod.json` is safe.
- DOC-2-12/`vault.adding`: it is persisted in shared state on purpose (the only channel between the docked copy and a popup
  copy) and expires after 2 minutes, so a crash cannot block adding vaults. Document as internal.
- DOC-2-6 strings: see CR-2-10; exact strings will be posted when written.
- Login-shell lookup (`platform.js:257`) stays; it is the documented last resort and the quoting is the fixed `command -v <tool>`
  with a tool name from our own list, never from a note.

## What I checked and found sound (no action)

- Every gpui-kit method used by `vault/main.js` and `vault-reader/main.js` exists in `gpui-kit.d.ts`; `herdr` imports exist.
- No `setTimeout`/`setInterval` in mod code (only in `render/`, which is Node and browser code); all timers are `cx.timer` and
  cancelled in `close()`; polling is 10 s and only after a refused watch.
- `Watcher` token loop, restart, A to B to A switching; one picker at a time; error-surviving command loops.
- `imageInfo` (PNG, JPEG incl. progressive, GIF, WebP VP8/VP8X/VP8L, BMP) against the byte layouts; `parseStamp` for ticks.
- `safeUrl`, `PROGRAM_EXT`, vault-link-must-be-a-vault-file, `safeJoin` traversal, Excalidraw value validation.
- `extract()` of the asar (offsets, `unpacked` skipped, path escape check) and the lock/rename sequence; the real bundle on macOS.

## Probe log (for repeatability)

Two throw-away mods in the session scratchpad (not in the repo, not in the Herdr home), each `render()` throws a message that
lists results; run with `herdr-app check <abs folder>`:
- Missing: `TextDecoder`, `TextEncoder`, `structuredClone`, `Intl`. Present and working: lookbehind, `\p{L}` with `u`, `Object.hasOwn`,
  `Array.prototype.at/findLast/toSorted/flatMap`, `matchAll`, `??=`, named groups, `s` flag, `URL`, `Buffer` (import from
  `"buffer"`), `atob`, `setTimeout` (exists, but Herdr's rules forbid it).
- `localeCompare`: plain code-unit order; `numeric` and `sensitivity` options ignored.
End-to-end render probe: `node render.mjs <scratch appHome> <jobs.json>` with `discover` pointing at the installed Obsidian
bundle and Chrome (7 jobs ok; with a Mermaid `<img>` label the loopback listener was hit; with the CSP meta added to a copy of
`page.html` it was not, and all sizes were identical).
