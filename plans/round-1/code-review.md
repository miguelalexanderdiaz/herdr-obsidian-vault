# Round 1 / code-review: audit

Scope: every `.js` / `.mjs` file of `mods/vault` and `mods/vault-reader` (2368 lines),
checked against `herdr.d.ts`, `gpui-kit.d.ts` (fs/promises, fetch, TextView, timers) and
AGENTS.md. Several findings were reproduced with node against the pure modules
(`parse.js`, `canvas.js`); the rest are read from the code and the typings, and say so.

## Summary

The mod code is tidy and mostly well structured: no polling timers (only `cx.timer.after`
for a debounce and the pane-claim retries), asset work goes through `exec`, and the
pure parts (`parse.js`, `doc.js`, `canvas.js`) really are pure. The weaknesses are:

1. **Everything outside the pure modules is macOS-only** (`stat -f`, `sips`, `qlmanage`,
   `cp`, `mv`, `open`, `/Applications/...`, `/opt/homebrew`, `sh -lc "$SHELL"`, the
   obsidian.json path). On Linux and Windows nothing degrades gracefully: images get
   no cache invalidation, no size, no open action.
2. **Two real crashes**: opening a note that holds an empty canvas blanks the whole
   reader (reproduced), and remote `![](https://...)` images use `res.arrayBuffer()`,
   which `fetch` in Herdr does not have (typings).
3. **Concurrency**: several readers (floating + kept panes) share one Chrome profile,
   one lib extraction and one 30 s `exec` budget per batch of 12 jobs.
4. **Untrusted-vault hardening**: Excalidraw attributes are interpolated unescaped into
   `innerHTML`; canvas link cards and `file:` links hand any string to `open`.
5. **No tests**: only two dev scripts that need a vault path and assert nothing.
   `assets.js` and `search.js` import `herdr`, so their pure logic cannot run in node.

Proposed order of work for this round: CR-1-1, CR-1-2, CR-1-3, CR-1-4 (portability
core, one new pure module `platform.js` per mod, with tests), CR-1-5 and CR-1-6 (render
pipeline), CR-1-7, CR-1-8, CR-1-9, CR-1-10, CR-1-11 (tests are written alongside each
fix, CR-1-11 is the scaffold). CR-1-12 and CR-1-13 are small cleanups.

Ownership key: code-review (CR) = `.js/.mjs`, mod assets except mod.json, `tests/**`;
documentation (DOC); herdr-completeness (HC).

---

## CR-1-1  Remote images always fail: `fetch` has no `arrayBuffer()`   [high]

Evidence: `mods/vault-reader/assets.js:210-212` calls `await fetch(url)` then
`res.arrayBuffer()`. In `gpui-kit.d.ts:22181` (`ShellFetchResponse`) only `status`,
`ok`, `url`, `text()` and `json()` exist, and `body` options cannot return bytes. If the
runtime matches the typings this throws a TypeError for every `![](https://...)` image
and the error is then written to the cache (`:219`), so the image never retries, even
after the problem is gone or the network comes back. (Runtime behaviour not checked: I
may not drive the app. The typings are the contract.)

Change:
- Download with `exec("curl", ["-fsSL", "--max-time", "20", "--max-filesize", "20000000",
  "-o", dest, url])` (curl ships with macOS, Windows 10+, nearly all Linux). Missing
  curl returns a readable error, not an exception.
- Do not cache failures of kind network/HTTP/timeout (write `{error}` only for
  "not an image"); or cache them with a TTL of ~10 minutes (`ts` in the json).
- Pick the extension from the file's magic bytes (see CR-1-3 `imageInfo`), not from the
  URL, and reject non-images (an HTML error page saved as `.png`).

Owner: CR (`assets.js`). DOC should mention that remote images are fetched when a note
is opened (network use, privacy) and that curl is required for them.
Verify: unit test `curlArgs(url, dest)` and `extFromMagic()`; manual: a note with an
https image, then offline, then online again (picture appears without a restart).

---

## CR-1-2  An empty canvas blanks the reader; asset errors replace the whole document   [high]

Evidence (reproduced): `parseCanvas('{"nodes":[]}')` returns `{ empty: true, nodes: [], edges: [] }`
without `box`. `main.js:229-232` still runs `edgesSvg(d.canvas, ...)` for every canvas,
and `canvas.js:52` destructures `box.w` -> `TypeError: Cannot read properties of undefined
(reading 'w')`. `fetchAssets` is awaited inside `load()`'s try (`main.js:136`), so the
catch (`:137-141`) replaces the already-drawn document with `{ error }`. The same happens
to any other throw in `fetchAssets` (fs write failure in `renderJobs`, etc.).
Related: nodes without `width`/`height` give `box.w = NaN` (reproduced: `box.w` is `null`
after JSON), so a hand-edited canvas draws nothing.

Change:
- `canvas.js`: `parseCanvas` defaults `width` 250 / `height` 60 for text, 400x300 for
  others, drops non-finite values; `edgesSvg` returns `null` for `canvas.empty`;
  `canvasColor` accepts only `#rgb/#rrggbb/#rrggbbaa` (already) and `edgesSvg` escapes
  every interpolated attribute with `esc()`.
- `main.js` (`fetchAssets`): skip canvases that are `empty`; wrap each phase (images,
  pdf, remote, canvas edges, render jobs) so a failure sets a per-asset `{ error }` or a
  single `this.assetNotice` string shown under the bar, never `this.doc = { error }`.
  `load()` keeps its catch only for `build()` failures.

Owner: CR. Verify: `tests/canvas.test.mjs` (empty canvas, missing sizes, label with
`<&>`, edge to a missing node); manual: open an empty `.canvas` (add one to
`examples/sample-vault`, HC/DOC do not own that folder, so CR adds `Empty.canvas`).

---

## CR-1-3  Portable file primitives instead of `stat -f`, `sips`, `cp`, `qlmanage`, `mv`, `open`   [high]

Evidence:
- `assets.js:80` `stat -f "%m:%z %N"` is BSD; on Linux GNU `stat -f` prints filesystem
  info, so the regex matches nothing, every stamp is `undefined`, and cached pictures
  and PDF pages never invalidate when the file changes. No `stat` on Windows.
- `assets.js:98` `sips` (macOS) is the only way to learn an image's size; `:115` `cp`;
  `:136,139` `qlmanage` + `mv`; `main.js:64-66`, `vault/main.js:136` `open`, `open -a Preview`.
- `fs/promises` in Herdr (`gpui-kit.d.ts:22126`) offers `readFile` (bytes, home only),
  `writeFile`, `readdir`, `exists`, `unlink`, `rmdir`, `mkdir`; no `stat`, `copyFile`,
  `rename`.

Change (new pure module `mods/vault-reader/platform.js`, plus a copy of the tiny
`openCommand` in `mods/vault/` because mods must stay self-contained):
- `platformOf()` = `window().platform` from `herdr` (`"macos" | "linux" | "windows"`),
  injectable for tests.
- `openCommand(platform, target)` -> `["open", t]` / `["xdg-open", t]` /
  `["cmd", "/c", "start", "", t]`; `openInPreview` becomes "Open in the default app"
  (label is "Open in Preview" on macOS only; keeps `open -a Preview` there).
- `statCommand(platform, paths)` + `parseStat(platform, stdout)`: macOS/BSD
  `stat -f '%m:%z %N'`, Linux `stat -c '%Y:%s %n'`, Windows PowerShell one-liner
  (`Get-Item -LiteralPath ... | % { "$($_.LastWriteTimeUtc.Ticks):$($_.Length) $($_.FullName)" }`);
  if the call fails return an empty map and fall back to the size taken from the file
  header (CR-1-3 below), so caches still invalidate on size changes.
- `imageInfo(bytes)` -> `{ type, w, h }` for PNG (IHDR), JPEG (SOF0-15), GIF, WebP
  (VP8/VP8L/VP8X) and BMP, in JS from `fs.readFile`. `size()` uses it first, `sips`
  stays only as fallback for AVIF/TIFF on macOS; SVG keeps the current header scan.
  Vault images are copied with `readFile`/`writeFile` (no `cp`).
- First-page PDF fallback: `qlmanage` only on macOS; elsewhere the picture slot shows
  "Install Poppler (pdftoppm) to see PDF pages" with the platform's install hint
  (`brew install poppler`, `apt install poppler-utils`, `scoop install poppler`), plus the
  open-in-default-app link. No raw `Failed to spawn qlmanage`.
- `tool(name)`: candidates = bare name, then per platform (`/opt/homebrew/bin`,
  `/usr/local/bin`, `/usr/bin`, `~/.nix-profile/bin`, `~/scoop/shims`,
  `C:/Program Files/poppler*/Library/bin`); do not cache a miss for more than ~30 s so
  installing Poppler while Herdr runs works (the comment at `:172` promises it, the
  `tools` Map at `:161` makes it false until restart).

Owner: CR for all code. DOC: requirements table per OS. HC: portability checklist item.
Verify: `tests/platform.test.mjs` for `openCommand`, `statCommand`, `parseStat` (golden
outputs for the three OSes), `imageInfo` on tiny hand-built PNG/JPEG/GIF/WebP buffers
(generated in the test, no binary fixtures needed), and
`herdr-app check <abs>/mods/vault-reader`.

---

## CR-1-4  Vault discovery and paths are macOS- and POSIX-only   [high]

Evidence: `vault/main.js:42` reads only `~/Library/Application Support/obsidian/obsidian.json`.
Linux (`~/.config/obsidian/obsidian.json`; Flatpak `~/.var/app/md.obsidian.Obsidian/config/obsidian/`;
Snap `~/snap/obsidian/current/.config/obsidian/`) and Windows (`~/AppData/Roaming/obsidian/`,
inside the home folder so `readTextFile` can reach it) give an empty list, and the panel
says "No vault yet" with no hint why. Paths in that json on Windows use backslashes:
`nameOf` (`:23`) splits on `/` only, so the vault is named with its whole path; `tilde`
(`:24`) builds a RegExp from `home()`; `search.js:35` splits `rel` on `/`.
`pickFolder`'s result and `watchFolder`'s results on Windows will carry backslashes too, and
`main.js:250,253` (`p.includes("/.obsidian/")`, `p.slice(vault.length + 1)`) assume `/`.

Change (new pure `mods/vault/obsidian-config.js`, tested):
- `configCandidates(platform, home)` returns the ordered list above; the first that
  parses with at least one vault wins; the panel's empty state names the file(s) it
  looked for ("Obsidian's vault list wasn't found. Add a vault with the button below").
- `parseVaults(text)` keeps today's sort (open first, then `ts`) and normalizes `\` to `/`,
  strips trailing separators, drops non-string paths and entries whose path is not under
  the home folder (fs cannot read them; show them dimmed with "outside your home folder,
  can't be read" instead of hiding silently, or skip and say how many).
- `normPath(p)`, `nameOf(p)`, `tilde(p, home)` (plain `startsWith`, no RegExp) shared by
  both mods (copy; keep identical).
- `main.js` watch filters in the reader use one `relOf(vault, p)` helper that
  normalizes separators first.
- `search.js` `rgPath()`: bare `rg`, then platform candidates (as CR-1-3), error text per
  platform (`brew install ripgrep` / `apt install ripgrep` / `winget install BurntSushi.ripgrep.MSVC`),
  and the Vault panel shows that message in the search area (it already shows
  `searchError`), not a generic failure.
- Keep `vault.list`, `vault.current`, `vault.open`, `vault.panes` shapes unchanged
  (portrait-layout depends on them).

Owner: CR. DOC: per-OS paths in the docs. Verify: `tests/obsidian-config.test.mjs`
(macOS/Linux/Windows sample json, backslash paths, missing keys, garbage text).

---

## CR-1-5  Renderer discovery, shell wrapper and error reporting (render.mjs + assets.js)   [high]

Evidence:
- `render.mjs:22-27,82` Obsidian asar and browsers are `/Applications/...` only. Needed
  per OS: Obsidian `obsidian.asar` at `/opt/Obsidian/resources/`, `/usr/lib/obsidian/`,
  `~/.local/share/...` (varies), Flatpak `/var/lib/flatpak/app/md.obsidian.Obsidian/current/active/files/...`,
  Windows `%LOCALAPPDATA%/Programs/Obsidian/resources/obsidian.asar`; browsers
  `google-chrome`, `chromium`, `chromium-browser`, `microsoft-edge`, `brave-browser` on
  PATH, Windows `Program Files (x86)/Microsoft/Edge/Application/msedge.exe` (always there),
  `Program Files/Google/Chrome/Application/chrome.exe`.
- `render.mjs:150-151` `findNear`: `while (dir !== "/" ...)` never ends on Windows
  (`path.dirname("C:\\")` is `"C:\\"`); use `path.parse(dir).root`.
- `render.mjs:105,118` uses the global `WebSocket`, Node >= 22 only (stable global);
  Node 20 gives `ReferenceError` surfaced as a raw JSON blob.
- `assets.js:27` `viaShell`: `exec "${SHELL:-sh}" -lc '...' "$@"` with `"$0"` breaks
  for fish/nushell users (`$0` is not a positional there), does not exist on Windows,
  and starts a login shell (nvm/pyenv in zsh startup = 0.5-3 s) for every batch of 12.
- `assets.js:64` shows `r.stdout.slice(0,400)`, i.e. the raw string
  `[{"error":"ENOENT: no such file ... Obsidian.app/..."}]` as the user-facing error, and
  it exposes the install path.

Change:
- New pure `render/discover.mjs` (testable): `obsidianAsar(platform, env, exists)`,
  `browserPath(platform, env, exists, which)`, honoring `HERDR_VAULT_ASAR`,
  `HERDR_VAULT_BROWSER`, `CHROME_PATH` first. render.mjs imports it.
- render.mjs checks `typeof WebSocket === "function"` and `process.versions.node` up
  front and returns a structured `{ error: "needs-node-22" | "no-browser" | "no-obsidian" ... }`.
- `assets.js`: resolve node once per session (`tool("node")` with the same candidates as
  CR-1-3 + `nvm`/`fnm`/`volta` known dirs; last resort one `sh -lc 'command -v node'`
  call, only on macOS/Linux, cached) and run `exec(node, [render.mjs, appHome, jobs])`
  directly; Windows runs `node.exe` the same way.
- Map renderer errors to short, actionable strings per kind
  ("Math and diagrams need Node 22+ and Chrome, Edge, Chromium or Brave. Missing: browser.")
  shown once as a notice above the note rather than in every diagram; the diagram's
  source stays visible as code (already done for Mermaid, `main.js:449`, do the same for
  display math and Excalidraw: link to the file).
- Never show absolute install paths in the UI.

Owner: CR. DOC: "optional features" matrix (what you lose without Node 22 / a browser /
Obsidian installed). HC: the same matrix in RECIPE.md. Verify: `tests/discover.test.mjs`
with fake `exists`/`which`; manual: `HERDR_VAULT_BROWSER=/nonexistent` shows the notice.

---

## CR-1-6  Renderer concurrency, timeouts and orphaned Chrome   [medium-high]

Evidence:
- Every Reader (the floating one plus each kept pane in an "obsidian" tab) runs
  `render.mjs` independently. All share `data/vault/chrome` as `--user-data-dir`
  (`render.mjs:83`). A second headless Chrome on the same profile either hands off to
  the first and exits (`"Chrome exited"` is the observed failure mode of this pattern)
  or corrupts the profile. `ensureLib()` (`:33-62`) also writes the same lib files from
  two processes; the server can serve a half-written `mermaid.min.js`.
  `jobs-${batch[0].key}.json` (`assets.js:59`) collides when two readers want the same job.
- `exec` has a 30 s limit (`herdr.d.ts`); a batch is 12 jobs (`BATCH`) after a cold
  Chrome start and, on first run, the asar extraction. When exec times out, node is
  killed but headless Chrome (a grandchild; only `finally` kills it, `render.mjs:212`)
  keeps running.
- `render.mjs:186-189` waits 10 s for the libs, then continues anyway; the first job
  then fails with "window.renderJob is not a function".
- `serve()` (`:67-70`): `decodeURIComponent` can throw on a malformed `%` request (no
  try/catch -> uncaught exception kills the whole run); the prefix check
  `file.startsWith(HERE)` also allows a sibling folder like `render-x/`.

Change:
- Profile dir per run: `data/vault/chrome-<pid>` (or `mkdtemp`-style with `Date.now()`),
  removed in `finally`; lib extraction into `lib.tmp-<pid>` then `renameSync` to `lib`
  (atomic), skipped when `stamp` matches.
- Serialize `renderJobs` per module instance with a promise queue, and use a lock file
  `data/vault/render.lock` (create-exclusive via render.mjs, 60 s stale) across
  instances; or simply let render.mjs hold the lock and return `busy`, retried by the
  reader after 500 ms (max 5).
- `BATCH` 12 -> 6 and a hard deadline in render.mjs (`Date.now() - start > 24_000` ->
  remaining jobs written as `{ error: "timeout" }` NOT cached, Chrome killed, exit 0).
  `process.on("SIGTERM"/"SIGINT", cleanup)` kills Chrome too. `proc` spawned with
  `detached: false`, and on POSIX kill the process group.
- Libs not ready after 10 s -> every job gets a clear `Mermaid/MathJax did not load`.
- `serve()`: try/catch around decode, `path.resolve` + `rel.startsWith(root + path.sep)`.

Owner: CR. Verify: manual with two readers opening notes with diagrams at once (before:
one fails; after: both draw); `tests/discover.test.mjs` also covers `safeJoin()`.

---

## CR-1-7  Untrusted vault content must not run code or launch programs   [medium]

Evidence:
- `render/excalidraw.js:82-137` interpolates `strokeColor`, `backgroundColor`, `fontFamily`
  keys, numeric fields (`e.width`, `e.x`, `e.angle`, `e.opacity`) and `f.dataURL`
  unescaped into an SVG string, which `page.js:90` assigns with `innerHTML`. A drawing
  in a shared/cloned vault with `"strokeColor": "red\"/><img src=x onerror=...>"`
  breaks out of the SVG into HTML and the handler runs in the headless page (loopback
  origin, network allowed). Impact is bounded (no cookies, no profile data, 127.0.0.1
  serves only the render folder and the extracted libs), but opening a note should be
  inert. Mermaid is `securityLevel: "strict"` (good).
- `main.js:566` canvas link cards call `openExternal(n.url)` with any string; `follow()`
  (`:282`) also allows `file:` and `obsidian:` URLs. `open` on a path, a `.command`, an
  `.app` or `file:///...` launches it; `-` prefixed strings become options. Obsidian itself
  opens only web links from cards.

Change:
- `excalidraw.js`: `const num = (v, d = 0) => Number.isFinite(+v) ? +v : d`; `const col =
  (c, d) => /^(#[0-9a-f]{3,8}|transparent|[a-z]+|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(c) ? c : d`;
  every attribute value passes through `num`/`col`/`esc`; `dataURL` only if it matches
  `^data:image/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$`. Extract into
  `excalidraw-svg.js` (UMD-ish, usable from node tests) so a test can feed it hostile
  scenes and assert the output has no unescaped `"` or `<` outside tags.
- `main.js`: `safeUrl(u)` allows only `http:`, `https:`, `mailto:`; used by `follow()`
  (drop `file:`; keep `obsidian:` out too, it can open other vaults but is harmless:
  decision: drop it, state why in CHANGELOG via DOC) and canvas link cards. Paths passed
  to `open`/`xdg-open` are always absolute (they are: `this.abs()`), keep it so.

Owner: CR. Verify: `tests/excalidraw.test.mjs` (hostile scene), `tests/url.test.mjs`
(`file:`, `javascript:`, `-a`, `HTTP://x`, `mailto:`); DOC: security note ("what a vault
can make the reader do").

---

## CR-1-8  parse.js correctness bugs (all reproduced)   [medium]

1. `section(body, "^a(b")` throws `SyntaxError: Invalid regular expression` (`parse.js:77`
   builds a RegExp from the link anchor, only `-` is escaped). A wikilink `[[note#^a(b]]`
   turns the whole embed/reader into an error document. Fix: escape with the same
   `esc` used elsewhere, or compare with `endsWith(" ^" + id)` without RegExp.
2. `fenced()` (`parse.js:58-66`) treats ```` ```js ```` inside an open fence as a closing
   fence (closers may not carry an info string). Reproduced: `"# A\n```md\n```js\n# fake\n```\n# B\nb"`
   then `section(..., "B")` returns `null`, although B exists. `parseBlocks` already
   uses `/^\s*(`{3,}|~{3,})\s*$/` for closers; make `fenced` do the same.
3. A paragraph with inline math flattens line breaks: `parseBlocks("- item $x^2$\n- other")`
   gives ONE `flow` block of 3 tokens (`"• item "`, math, `" • other"`): the second list
   item continues on the first one's line (`parse.js:304`, `.join(" ")`). Fix: when a
   paragraph has more than one line and any line is a list item, heading or blockquote
   marker, emit one flow block per line (keep the md path for the lines without math);
   plain wrapped prose still joins.
4. `parseYaml` splits `list: ["a, b", c]` into `"a`, `b"`, `c` (`parse.js:47`): split on
   commas outside quotes. Also `key: val # note` keeps the comment (Obsidian shows it);
   leave as is but add a test that documents it.
5. `hasInlineMath` shares one global-flag RegExp with `flowTokens` (`INLINE_MATH.lastIndex`
   reset by hand twice): replace by two non-global uses or create the RegExp per call
   (cheap) so a future early return cannot leave `lastIndex` set.

Owner: CR. Verify: new `tests/parse.test.mjs` with each case above as a named test, plus
the existing sample-vault sweep (see CR-1-11).

---

## CR-1-9  Watchers and command loops: duplicates, silent death, O(n^2)   [medium]

Evidence:
- `vault/main.js:131-143` `watch(root)` loops while `this.root === root`. Switching
  A -> B leaves A's loop parked in `await watchFolder(A)`; switching back B -> A makes
  `this.root === A` true again, so the old loop resumes AND `sync` starts a new one. Each
  A/B round trip adds a live watcher on A; every file change then calls `reload()` and
  `search()` N times. Use a token (`const id = ++this.watchId`; loop `while (id === this.watchId)`).
- Both `catch { return; }` (`vault/main.js:135`, `reader main.js:248`) end watching
  forever on any rejection. Per `herdr.d.ts` on Linux trees above 4096 non-ignored
  directories reject the watch, with the instruction "use a timer fallback". Add:
  on rejection, `cx.timer.every(10_000, ...)` polling that re-lists only the visible
  folders (vault panel) / re-checks `deps` stamps (reader), and a one-line status
  ("Live updates off: folder too big, refreshing every 10 s") in the panel.
  Note: a timer only when the watch failed, never both.
- `vault/main.js:77-82` the `nextCommand` loop dies on the first `addVault()` rejection
  (`pickFolder` can reject): wrap in try/catch; same for the reader's loop (`:87`).
- Reader `watch` (`:253`): `this.files?.includes(...)` per changed path is O(files) with
  up to 30 000 files (`O(changed x files)` on a bulk sync). Keep a `Set`. Also a deleted
  file is in the list so no re-list happens: the resolver keeps resolving links to a
  note that is gone until some new file appears. Re-list when a changed path no longer
  exists (`fs.exists`) as well.
- A reader whose floating window was closed keeps its `for(;;)` watcher parked (AGENTS.md:
  unfinished tasks are cancelled with the view, but verify with `herdr-app status` is not
  allowed here). Add a `this.closed` flag in `close()` and check it in the loop.

Owner: CR. Verify: unit-test the extracted `makeTokenLoop`/`relOf` helper; manual:
switch vaults 5 times and edit a note, `reload` count (temporary `console.log`) stays 1.

---

## CR-1-10  Search: wrong exclusions, fragile parsing, avoidable work   [medium]

Evidence (`vault/search.js`):
- `rg --files` and the text search respect `.gitignore`/`.ignore`/global ignores
  (`:35`, `:42`). A vault that is a git repo with an ignored folder (e.g. `private/`) or
  a global ignore for `*.md` backups silently loses results, while the tree shows the
  files. Add `--no-ignore` (hidden files stay excluded by default; `GLOBS` stays).
- Line format `^(?:\.\/)?(.+?):(\d+):(.*)$` (`:49`, `:62`) mis-parses a path that
  contains `:<digits>:` (`Notes 10:30:15.md:3:text`): wrong `rel`, the click then fails.
  Use `--null` (path, NUL, `line:text`) and split on `\0`.
- `hits.code > 1` (`:44`) throws for exit 2, which rg also returns when ONE file was
  unreadable even though stdout is complete: the whole search shows "Search failed".
  Add `--no-messages`; treat code 2 with non-empty stdout as success.
- Needle is `words[0]` with `--max-count 20` per file: for "the plan" it greps every line
  holding "the" (up to 20 per file), so the "plan" lines can fall beyond the 20 cap and
  the note is missed. Use the longest word as needle.
- `rg --files` runs on every search (and lists the whole vault, bounded only by the 8 MiB
  stdout limit and 30 s); cache the name list per vault until the next watch event.
- `snippet()` (`:24-30`): `Math.min(...[])` is `Infinity` when no word is found, so
  `start = Infinity` and the snippet is empty; guard with `at = idx.length ? ... : 0`.
- `pattern` and `esc` (`:69,21`) are dead code; remove. `rgPath()` per CR-1-4.

Owner: CR. Verify: split into `search-core.js` (pure: `parseHits`, `snippet`,
`pickNeedle`, `rank`), `tests/search.test.mjs`; manual with `examples/sample-vault` and a
`.gitignore` containing `projects/`.

---

## CR-1-11  Test scaffold on the sample vault (replaces the lost check harness)   [medium]

Evidence: `render/test-parse.mjs` and `render/make-fixture.mjs` live inside the shipped mod
folder (a change there makes Herdr reload the mod), need a vault argument, and assert
nothing. `assets.js` and `search.js` cannot be imported by node (`import "herdr"` ->
`ERR_MODULE_NOT_FOUND`, reproduced), so `hash`, `snippet`, stamp/size logic are untested.

Change:
- `tests/` with `node --test` (no dependencies): `parse.test.mjs` (frontmatter, yaml,
  section/headings, resolver ties/folders/case, inline links/tags/comments/tasks, math
  tokens, blocks: callouts nested, fences, embeds, images sizes), `doc.test.mjs`
  (`buildDoc` with in-memory `env`: embed depth cap, missing anchor, self-embed, canvas
  file cards, excalidraw detection), `canvas.test.mjs`, `platform.test.mjs`,
  `obsidian-config.test.mjs`, `search.test.mjs`, `discover.test.mjs`,
  `excalidraw.test.mjs`, and `sample-vault.test.mjs` (walk `examples/sample-vault`: every
  note parses, expected block counts from the current output: notes 5, callout 5, flow 1,
  math 1, mermaid 2, embed 6, code 1, query 1, one intentional unresolved link).
- Pure helpers move out of herdr-importing files: `assets.js` keeps exec/fs glue, new
  `assets-core.js` (hash, themeKey, cache-key builders, stat parsing); `search.js` keeps
  `exec`, new `search-core.js`; `listVault` moves from `main.js` into `vault-files.js`
  (parameterised on `readdir`) so it is testable.
- `git mv` the two dev scripts to `tests/tools/` (out of the mod folder; update their
  relative imports). Root `package.json`: `{ "private": true, "type": "module",
  "scripts": { "test": "node --test tests/" } }` so `.js` files load as ESM on Node 20/22
  without syntax detection. HC owns CI: ask them to run `node --test tests/` on
  ubuntu/macos/windows (Node 22) and to add a "no personal paths" grep step (see board).
- Test helper `tests/helpers.mjs` builds tiny PNG/JPEG/GIF/WebP buffers; no binary
  fixtures except the existing sample vault.

Owner: CR (tests, code); HC (package.json is root-level tooling: CR creates it, HC owns
CI use). Verify: `node --test tests/` green on macOS here; windows/linux in CI.

---

## CR-1-12  Fetch pipeline cost: sequential spawns, work after navigation, unbounded cache   [medium-low]

Evidence:
- `main.js:218-224` loads each image with an `await` in a loop (`sips` + `cp` spawn per
  file; ~60-120 ms each): a note with 20 images shows them one after another. PDF pages
  (`:162`) are drawn one process per page, 30 pages sequentially. Run image/pdf-first-page
  jobs with a small pool (4), keep PDF pages in order but start page n+1 while drawing n.
- `fetchAssets` checks `gen` only inside `commit`, so after the user navigates it
  still renders every pending picture and Mermaid batch of the old note. Check
  `gen !== this.gen` before each job and between render batches.
- `themeKey` (`assets.js:41`) omits `series`/ansi colors and `settings().dark`, so a change
  of only the ansi palette keeps pie/mind-map pictures in the old colours; include
  `palette.dark` and `palette.series`.
- `data/vault/cache` never shrinks: every edit of a PDF/image/diagram makes new files
  (PDF pages are PNG at 144 dpi). Add `gcCache(maxAgeDays = 30, maxMB = 500)` run once
  per session after the first load: `readdir` + names only carry no mtime in Herdr's fs,
  so record `last-used` in `cache/index.json` (key -> ms, updated in `meta()` hits,
  flushed once per load) and delete entries unused for 30 days.
- Large files: `readTextFile` is documented as up to 1 MiB (`herdr.d.ts`). A note, canvas
  or `.excalidraw.md` above that (drawings with embedded images are often several MB) may
  come back truncated or empty and show a misleading "This file is no longer in the vault".
  `doc.js` `env.read` should use `fs.readFile(abs, "utf8")` (not limited as far as the
  typings say) and show a distinct "too large" notice above a cap (say 8 MB).

Owner: CR. Verify: manual timings with a 20-image note (add `examples/sample-vault/Many images.md`
referencing the two existing images repeatedly), `tests/assets-core.test.mjs` for
`themeKey`/key builders.

---

## CR-1-13  Small cleanups and consistency   [low]

- `vault/main.js:92` loads `mods/workspace-chrome/search.svg`, an asset of another mod
  (shipped by Herdr today, but not part of this repo). Vendor `mods/vault/icons/search.svg`
  (Lucide, ISC: HC adds it to NOTICE) and point to it.
- `main.js:317` back shortcut is `m.platform` + `[` and the tooltip says "⌘["; on
  Linux/Windows `platform` is the Super/Windows key. Accept `m.control` as well and show
  the right label from `window().platform`.
- "Open in Preview" label (`:339`, `:479`, `:406`, `:532`) is macOS wording; use the
  platform's name via `platform.js` (CR-1-3).
- Reader `close()` (`:119`) does nothing for kept panes: remove its entry from
  `vault.panes` (key and shape unchanged) so portrait-tree/pane do not show a closed
  note; today stale entries survive until another pane announces.
- Unused import `parseCanvas` (`main.js:25`); `chip(text, i)` unused param (`:423`); `stem`
  is defined in both `main.js` and `parse.js`; `listVault` is exported from the mod entry
  file (see CR-1-11).
- `vault/main.js:42` first-run import never runs again; add "Import from Obsidian" to the
  selector menu so a new Obsidian install is picked up (and vaults Obsidian removed can
  be dropped by the existing X).
- `tilde()` builds a RegExp on every call (called per menu row per render): use `startsWith`.
- Nested virtualization: folder rows (up to 2000 per folder, `PER_FOLDER`) and 200 search
  rows are plain children; `v_virtual_list` exists in gpui-kit if a real vault feels slow.
  Not for this round; measure first. `PER_FOLDER` truncation is silent: show "+N more".

Owner: CR (HC for NOTICE). Verify: `herdr-app check <abs>/mods/vault`, `.../vault-reader`
after each batch of edits (in the worktree only).

---

## Handed to other roles (also posted on the board)

- DOC: requirements matrix per OS (Node >= 22, a Chromium-family browser, Obsidian app,
  ripgrep, Poppler, curl) with "what you lose without it"; network use (remote images
  via curl); privacy note (nothing leaves the machine except remote images the note
  itself references); security note (CR-1-7); the three OS vault-list locations.
- HC: CI matrix running `node --test tests/` on Linux/macOS/Windows, Node 22; a grep step
  for `/Users/`, `/home/<name>`, `@`-emails, `C:\Users`; NOTICE entry for Lucide icons
  (the 25 svg files and the new search.svg) and the Obsidian logo (trademark) decision;
  confirm mod.json cannot declare external requirements (we say them in the UI instead);
  RECIPE.md must describe the same degraded behaviour as CR-1-3/CR-1-5; `package.json`
  at the root (created by CR) must not be shipped into a mod folder.

## Not done / decisions made without asking

- No source file changed in this step (audit only), as instructed.
- I did not run the app, so every runtime claim marked "typings" or "read from code" is
  unverified at runtime; the reproduced ones were run in node 26 against the pure modules.
- `git pull --ff-only` printed "Cannot fast-forward to multiple branches" (the repo has
  more than one upstream ref); the branch was already `main` and up to date, nothing pulled.
