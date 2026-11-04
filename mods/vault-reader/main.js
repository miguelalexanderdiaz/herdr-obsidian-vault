// A read-only Obsidian note, rendered as Obsidian shows it: properties,
// callouts, links, embeds, images, PDFs, tags, tasks, Mermaid, math,
// Excalidraw and Canvas. Opened by the Vault panel (mods/vault) as a floating
// window; later kept as a pane in an "obsidian" tab (props.kept).
//
// Props: { vault: absolute folder, file: vault-relative path, anchor?: heading | ^block,
//          kept?: true, id? (a pane of an "obsidian" tab), overlay? }
//        { menu: true, window, vault, file, anchor, overlay }: the Keep ▾ menu (a popup).
//
// Keep ▾ → New tab: a tab named "obsidian" whose pane is this note.
// Keep ▾ → Add to obsidian: one more pane, below the notes of that tab.
// A kept pane records which note it shows in shared "vault.panes" (pane id →
// { vault, file, id }), so the space tree (portrait-tree) and the pane header
// (portrait-pane) show the Obsidian logo and the note's name.
//
// Mermaid, math and Excalidraw are drawn by render/render.mjs (headless Chrome
// with Obsidian's own Mermaid and MathJax); pictures are cached in data/vault/cache.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { props, theme, exec, readTextFile, watchFolder, closeOverlay, notify, run, shared, setShared, openOverlay, settings, spaces, panes, focused, nextCommand } from "herdr";
import * as fs from "fs/promises";
import { makeResolver, parseSize, parseLinkUrl, safeUrl } from "./parse.js";
import { buildDoc, kindOf } from "./doc.js";
import { edgesSvg, canvasColor } from "./canvas.js";
import { hash, themeKey, renderJobs, stamps, vaultImage, pdfPage, pdfInfo, pdfPageAt, remoteImage, svgFile, pruneCache, loadSettings, saveSettings, platform } from "./assets.js";
import { openCommand, previewCommand, previewLabel, previewName, backHint, isBackKey, canOpen, relOf, normPath } from "./platform.js";
import { listVault, isHidden } from "./vault-files.js";
import { Watcher, POLL_MS, LIVE_OFF } from "./watch.js";
import { MOD, MOD_DIR } from "./mod-name.js";

const ICONS = `${MOD_DIR}/icons`;
const TEXT = 15;
const COLUMN = 1040;
const MENU_W = 300;
const PDF_PAGES = 30; // pages drawn for an opened PDF; Preview has the rest
// Bump when the renderer's output changes, so cached pictures are drawn again.
const RENDER_VERSION = 3;

const CALLOUT_ALIAS = { summary: "abstract", tldr: "abstract", hint: "tip", important: "tip", check: "success", done: "success",
  help: "question", faq: "question", caution: "warning", attention: "warning", fail: "failure", missing: "failure", error: "danger", cite: "quote" };
const CALLOUT = { note: ["pencil", "#027aff"], abstract: ["clipboard-list", "#53dfdd"], info: ["info", "#027aff"], todo: ["check-circle", "#027aff"],
  tip: ["flame", "#53dfdd"], success: ["check-circle", "#44cf6e"], question: ["help-circle", "#e9973f"], warning: ["alert-triangle", "#e9973f"],
  failure: ["x", "#fb464c"], danger: ["zap", "#fb464c"], bug: ["bug", "#fb464c"], example: ["list", "#a882ff"], quote: ["quote", "#9e9e9e"] };

const stem = (p) => (p ?? "").split("/").pop().replace(/\.(excalidraw\.md|md|canvas)$/i, "");
const folderOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const stop = (_e, cx) => cx.stop_propagation();


// Programs are never launched from a note: only documents and web links are handed to the system.
const openExternal = (target) => {
  const [cmd, args] = openCommand(platform(), target);
  return exec(cmd, args).catch(() => {});
};
// PDFs and pictures: in Preview on macOS (as the button says), in the default app elsewhere.
const openInPreview = (file) => {
  const [cmd, args] = previewCommand(platform(), file);
  return exec(cmd, args).catch(() => openExternal(file));
};
let pruned = false; // the picture cache is trimmed once per session

export default class Reader extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.vault = p.vault ? normPath(p.vault) : p.vault;
    this.file = p.file;
    this.anchor = p.anchor ?? null;
    this.kept = Boolean(p.kept);
    this.history = [];
    this.gen = 0;
    this.doc = null;
    this.assets = new Map();
    this.folds = new Map();
    this.notes = []; // one line each: what could not be drawn and why (shown above the note)
    this.colW = COLUMN;
    this.closed = false;
    this.fileSet = new Set();
    this.watcher = new Watcher(watchFolder);
    this.token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    this.handle = cx.focus_handle();
    if (p.menu || !this.vault || !this.file) return;
    if (!this.kept) { this.handle.focus(); cx.timer.after(80, () => this.handle.focus()); }
    else {
      // A kept pane can take the keyboard (pane.go onto it sends "focus").
      cx.spawn(async (cx) => {
        while (!this.closed) {
          try { if ((await nextCommand()) === "focus") this.handle.focus(); } catch { /* keep listening */ }
          cx.notify();
        }
      });
      // Which pane is mine: known from an earlier run, else the vault-reader pane that
      // has the focus right after tab.new / pane.split made it.
      if (!this.claim()) for (const ms of [60, 200, 500, 1000, 2000]) cx.timer.after(ms, (cx) => { if (!this.pane && this.claim()) cx.notify(); });
    }
    this.announce();
    loadSettings().then((st) => { this.remoteImages = st.remoteImages; cx.notify(); }).catch(() => {});
    this.load(cx);
    this.watch(cx);
    // The picture cache is trimmed once per session, a little after the first note is up.
    if (!pruned) { pruned = true; cx.timer.after(8000, (cx) => cx.spawn(async () => { await pruneCache().catch(() => {}); })); }
  }

  // Which note the floating reader shows (the Vault list marks it); a kept
  // pane records its note for the space tree (mods/portrait-tree).
  announce() {
    if (!this.kept) { setShared("vault.open", { vault: this.vault, file: this.file, token: this.token }); return; }
    if (!this.pane) return;
    const live = new Set(panes().map((x) => x.pane));
    const all = Object.fromEntries(Object.entries(shared("vault.panes") ?? {}).filter(([pane]) => live.has(pane) || pane.includes("/")));
    all[this.pane] = { vault: this.vault, file: this.file, id: (props() ?? {}).id ?? null };
    setShared("vault.panes", all);
  }

  claim() {
    const id = (props() ?? {}).id;
    const map = shared("vault.panes") ?? {};
    const known = id && Object.entries(map).find(([, v]) => v.id === id);
    if (known && panes().some((x) => x.pane === known[0])) { this.pane = known[0]; this.announce(); return true; }
    const f = focused();
    const mine = f?.pane && panes().find((x) => x.pane === f.pane && x.mod === MOD);
    if (mine && !(map[mine.pane] && map[mine.pane].id !== id)) { this.pane = mine.pane; this.announce(); return true; }
    return false;
  }

  async close() {
    this.closed = true;
    this.watcher?.stop();
    this.pollTask?.cancel();
    if (!this.kept && shared("vault.open")?.token === this.token) setShared("vault.open", null);
    // A kept pane that goes leaves no stale entry for the space tree (same keys and shape).
    if (this.kept && this.pane) {
      const map = shared("vault.panes");
      if (map && this.pane in map) { const { [this.pane]: _gone, ...rest } = map; setShared("vault.panes", rest); }
    }
  }

  // ---- loading ----------------------------------------------------------------

  load(cx) {
    const gen = ++this.gen;
    this.doc = this.doc && this.doc.file === this.file ? { ...this.doc, reloading: true } : { loading: true, file: this.file };
    this.notes = [];
    this.hasRemote = false;
    cx.spawn(async (cx) => {
      // Reading and parsing the note: a failure here is the note's (shown instead of it).
      let doc;
      try {
        if (!this.files) await this.relist();
        this.deps = new Set();
        doc = await this.build(this.file, this.anchor, 0);
      } catch (e) {
        if (gen !== this.gen) return;
        this.doc = { error: String(e?.message ?? e), file: this.file };
        cx.notify();
        return;
      }
      if (gen !== this.gen) return;
      this.doc = doc;
      cx.notify();
      // Pictures, diagrams and PDFs: a failure here is shown beside the note, never in its place.
      try {
        await this.fetchAssets(doc, gen, cx);
        if (this.polling && gen === this.gen) this.snapshot = await this.depStamps();
      } catch (e) {
        if (gen !== this.gen) return;
        this.note(`Some pictures could not be drawn: ${String(e?.message ?? e).split("\n")[0].slice(0, 160)}`);
        cx.notify();
      }
    });
  }

  note(text) {
    if (text && !this.notes.includes(text)) this.notes.push(text);
  }

  async relist() {
    this.files = await listVault(this.vault, fs.readdir);
    this.fileSet = new Set(this.files);
    this.resolve = makeResolver(this.files);
  }

  abs(rel) { return `${this.vault}/${rel}`; }

  build(file, anchor, depth) {
    return buildDoc(file, anchor, depth, {
      read: (f) => readTextFile(this.abs(f)), resolve: (t, from) => this.resolve(t, from), deps: this.deps, abs: (f) => this.abs(f) });
  }

  // A PDF's pages one at a time (each shows as it's drawn), up to PDF_PAGES;
  // without Poppler (pdftoppm), Quick Look's first page on macOS, else an install hint.
  async pdfPages(f, stamp, gen, commit) {
    const key = (f.d.key = hash(`file:${f.abs}:${stamp}`));
    const info = await pdfInfo(f.abs, stamp);
    if (info.error) {
      commit(new Map([[key, { pages: [await pdfPage(f.abs, stamp)], total: null, done: true }]]));
      return;
    }
    const pages = [], upto = Math.min(info.pages, PDF_PAGES);
    for (let n = 1; n <= upto && gen === this.gen; n++) {
      pages.push(await pdfPageAt(f.abs, stamp, n));
      commit(new Map([[key, { pages: [...pages], total: info.pages, done: n === upto }]]));
    }
  }

  // Mermaid, math, Excalidraw, images and PDFs of the shown note (and its embeds). Each phase
  // fails on its own: what went wrong becomes a line in this.notes.
  async fetchAssets(doc, gen, cx) {
    const t = theme(), tk = themeKey(t);
    const jobs = [], files = [], remote = [], canvases = [];
    const job = (j) => { j.key = hash(`${RENDER_VERSION}:${j.kind}:${j.display ? 1 : 0}:${j.src ?? j.file}:${j.stamp ?? ""}:${tk}:${TEXT}`); jobs.push(j); return j.key; };
    const visit = (d) => {
      if (!d) return;
      if (d.kind === "excalidraw") { files.push({ d, abs: this.abs(d.file), as: "excalidraw" }); return; }
      if (d.kind === "image") { files.push({ d, abs: this.abs(d.file), as: "image" }); return; }
      // The PDF you opened shows every page; one inside a note or a canvas, its first.
      if (d.kind === "pdf") { files.push({ d, abs: this.abs(d.file), as: d === doc ? "pdfdoc" : "pdf" }); return; }
      if (d.canvas && !d.canvas.empty) canvases.push(d);
      if (d.canvas) for (const n of d.canvas.nodes) {
        if (n.type === "file" && n.target) {
          if (n.fileKind === "image") files.push({ d: n, abs: this.abs(n.target), as: "image" });
          else if (n.fileKind === "excalidraw" || n.doc?.kind === "excalidraw") files.push({ d: n, abs: this.abs(n.target), as: "excalidraw" });
          else if (n.doc) visit(n.doc);
        }
      }
      const walk = (bs) => bs?.forEach((b) => {
        if (b.type === "mermaid") b.key = job({ kind: "mermaid", src: b.src });
        else if (b.type === "math") b.key = job({ kind: "math", src: b.src, display: true });
        else if (b.type === "flow") b.tokens.forEach((tok) => { if (tok.kind === "math") tok.key = job({ kind: "math", src: tok.src, display: false }); });
        else if (b.type === "embed" && b.resolved) {
          if (b.kind === "image") files.push({ d: b, abs: this.abs(b.resolved), as: "image" });
          else if (b.kind === "pdf") files.push({ d: b, abs: this.abs(b.resolved), as: "pdf" });
          else if (b.kind === "excalidraw") files.push({ d: b, abs: this.abs(b.resolved), as: "excalidraw" });
          else visit(b.doc);
        } else if (b.type === "image") {
          if (/^https?:/i.test(b.src)) remote.push(b);
          else {
            let src = b.src;
            try { src = decodeURI(src); } catch { /* keep as written */ }
            const target = this.resolve(src, doc.file);
            if (target) { b.resolved = target; files.push({ d: b, abs: this.abs(target), as: "image" }); }
            else b.error = `No file ${src} in the vault`;
          }
        }
        if (b.body) walk(b.body);
      });
      walk(d.blocks);
    };
    visit(doc);
    this.hasRemote = remote.length > 0;
    const commit = (map) => { if (gen === this.gen) { for (const [k, v] of map) this.assets.set(k, v); cx.notify(); } };
    const phase = async (what, fn) => {
      try { await fn(); } catch (e) { if (gen === this.gen) { this.note(`${what}: ${String(e?.message ?? e).split("\n")[0].slice(0, 160)}`); cx.notify(); } }
    };
    const st = await stamps(files.map((f) => f.abs)).catch(() => new Map());
    for (const f of files) {
      this.deps.add(f.abs);
      if (f.as === "excalidraw") f.d.key = job({ kind: "excalidraw", file: f.abs, stamp: st.get(f.abs) });
    }
    // Pictures first (fast), then whatever needs the renderer. One failing file shows its own message.
    for (const f of files) {
      if (gen !== this.gen) return;
      if (f.as === "excalidraw") continue;
      await phase(`${f.abs.split("/").pop()}`, async () => {
        if (f.as === "pdfdoc") { await this.pdfPages(f, st.get(f.abs) ?? "", gen, commit); return; }
        const res = f.as === "pdf" ? await pdfPage(f.abs, st.get(f.abs) ?? "") : await vaultImage(f.abs, st.get(f.abs) ?? "");
        f.d.key = hash(`file:${f.abs}:${st.get(f.abs)}`);
        if (res.missing) this.note(res.error);
        commit(new Map([[f.d.key, res]]));
      });
    }
    for (const b of remote) {
      if (gen !== this.gen) return;
      b.key = hash(`url:${b.src}`);
      await phase("Web image", async () => {
        const res = await remoteImage(b.src);
        if (res.missing) this.note(res.error);
        commit(new Map([[b.key, res]]));
      });
    }
    await phase("Canvas", async () => {
      for (const d of canvases) {
        const svgText = edgesSvg(d.canvas, { line: t.muted, text: t.foreground, bg: t.background, font: "sans-serif" });
        if (svgText) d.edges = await svgFile(svgText);
        commit(new Map());
      }
    });
    const missing = jobs.filter((j) => !this.assets.has(j.key));
    if (missing.length && gen === this.gen) {
      const palette = { fg: t.foreground, bg: t.background, muted: t.muted, accent: t.accent, border: t.border,
        surface: t.surface, raised: t.raised, dark: settings().dark !== false, size: TEXT, font: settings().ui_font,
        // Pie slices and mind-map branches: bright enough to carry dark labels.
        series: [t.accent, t.ansi12 ?? t.ansi4, t.ansi10 ?? t.ansi2, t.ansi13 ?? t.ansi5, t.ansi14 ?? t.ansi6, t.ansi11 ?? t.ansi3, t.ansi9 ?? t.ansi1, t.muted] };
      await phase("Diagrams and math", async () => {
        const res = await renderJobs(missing, palette, commit);
        // A problem with the machine (no browser ...) is the same for every job: say it once.
        for (const r of res.values()) if (r.transient && r.error) { this.note(r.error); break; }
        commit(new Map());
      });
    }
  }

  // ---- watching the vault ------------------------------------------------------------------

  watch(cx) {
    const vault = this.vault;
    this.watcher.start(vault, {
      onBatch: (changed) => this.changed(vault, changed, cx),
      onFail: () => this.poll(cx),
    });
  }

  // A batch of changed paths from watchFolder: re-list the vault when its set of files changed
  // (new or deleted notes change what links resolve to), reload when the shown note or one of
  // its pictures changed.
  async changed(vault, changed, cx) {
    const rels = [];
    let all = false;
    for (const p of changed) {
      const rel = relOf(vault, p);
      if (rel === null) continue;
      if (rel === "") all = true;
      else if (!isHidden(rel)) rels.push(rel);
    }
    if (!all && !rels.length) return;
    let relist = all || rels.some((r) => !this.fileSet.has(r));
    if (!relist) for (const r of rels.slice(0, 50)) if (!(await fs.exists(this.abs(r)).catch(() => true))) { relist = true; break; }
    if (relist) await this.relist();
    if (all || rels.some((r) => this.deps?.has(this.abs(r)))) this.load(cx);
    else if (relist) cx.notify();
  }

  // The watch was refused (a very large tree on Linux): look at the open note's files every
  // POLL_MS instead, and say so.
  poll(cx) {
    if (this.polling || this.closed) return;
    this.polling = true;
    this.hint = LIVE_OFF;
    this.pollTask = cx.timer.every(POLL_MS, (cx) => cx.spawn(async (cx) => {
      if (this.closed || !this.deps) return;
      const now = await this.depStamps();
      const before = this.snapshot;
      this.snapshot = now;
      if (before && before !== now) { await this.relist().catch(() => {}); this.load(cx); }
    }));
    cx.notify();
  }

  async depStamps() {
    const st = await stamps([...(this.deps ?? [])]).catch(() => new Map());
    return JSON.stringify([...st].sort());
  }

  // ---- navigation ---------------------------------------------------------------

  go(file, anchor, cx, push = true) {
    if (push) this.history.push({ file: this.file, anchor: this.anchor });
    this.file = file;
    this.anchor = anchor || null;
    this.folds = new Map();
    this.announce();
    this.load(cx);
    cx.notify();
  }

  back(cx) {
    const prev = this.history.pop();
    if (prev) this.go(prev.file, prev.anchor, cx, false);
  }

  follow(url, cx) {
    const target = parseLinkUrl(url);
    if (target == null) {
      // Web links and mail only: no file:, obsidian: or anything else a note could name.
      const safe = safeUrl(url);
      if (safe) openExternal(safe);
      return;
    }
    const hashAt = target.indexOf("#");
    const file = hashAt >= 0 ? target.slice(0, hashAt) : target;
    const anchor = hashAt >= 0 ? target.slice(hashAt + 1) : null;
    // Only files of this vault (a hand-written vault: link could name any path).
    if (file && !this.fileSet.has(file)) return;
    const kind = kindOf(file);
    if (kind === "other") {
      if (canOpen(file)) openExternal(this.abs(file));
      else { this.note(`${file.split("/").pop()} is a program: the reader doesn't launch programs from notes`); cx.notify(); }
      return;
    }
    this.go(file || this.file, anchor, cx);
  }

  closeWindow() {
    const p = props() ?? {};
    if (p.overlay) closeOverlay(p.overlay);
  }

  // ---- drawing --------------------------------------------------------------------

  render(cx) {
    const t = theme();
    const p = props() ?? {};
    if (p.menu) return this.menu(p);
    if (!this.vault || !this.file) {
      return div().size_full().bg(t.background).p(16).text_color(t.dim).child("Pick a note in the Vault panel");
    }
    const width = Math.min(COLUMN, this.colW);
    const body = v_flex().id("vr-scroll").flex_1().min_h(0).overflow_y_scrollbar().on_mouse_down("left", stop)
      .child(v_flex().id("vr-column").w_full().max_w(COLUMN).mx_auto().px(this.kept ? 18 : 30).pt(18).pb(40).gap(12)
        .on_size_change((size, cx) => { const w = Math.round(size.width) - (this.kept ? 36 : 60); if (Math.abs(w - this.colW) > 2) { this.colW = w; cx.notify(); } })
        .children(this.content(t, width)));
    return v_flex().id("vault-reader").track_focus(this.handle).size_full().min_h(0).bg(t.background)
      .text_size(TEXT).text_color(t.foreground)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && !this.kept) { cx.stop_propagation(); this.closeWindow(); }
        else if (isBackKey(platform(), e)) { cx.stop_propagation(); this.back(cx); }
      })
      .when(!this.kept || this.history.length > 0 || Boolean(this.anchor) || this.hasRemote, (el) => el.child(this.bar(t, p)))
      .child(body);
  }

  bar(t, p) {
    const button = (id, child, action, tip) => h_flex().id(id).h(24).px(7).gap(5).flex_none().items_center().rounded(5)
      .cursor_pointer().text_color(t.muted).hover((el) => el.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).when(Boolean(tip), (el) => el.tooltip(tip)).child(child);
    const folder = folderOf(this.file);
    return h_flex().id("vr-bar").h(this.kept ? 34 : 40).flex_none().px(12).gap(8).items_center()
      .bg(t.chrome).border_b(1).border_color(t.border).text_size(12.5)
      .child(svg(`${MOD_DIR}/vault.svg`).size(15).flex_none().text_color(t.muted))
      .when(this.history.length > 0, (el) => el.child(button("vr-back", svg(`${ICONS}/arrow-left.svg`).size(14), (_e, cx) => this.back(cx), backHint(platform()))))
      .child(div().flex_none().max_w(360).truncate().font_semibold().text_size(13.5).text_color(t.foreground).child(stem(this.file)))
      .when(Boolean(this.anchor), (el) => el.child(h_flex().flex_none().gap(6).items_center().text_color(t.muted)
        .child(div().max_w(220).truncate().child("› " + this.anchor.replace(/^\^/, "")))
        .child(button("vr-whole", "Whole note", (_e, cx) => this.go(this.file, null, cx), "Show the whole note"))))
      .child(div().flex_1().min_w(0).overflow_hidden().whitespace_nowrap().text_ellipsis_start().text_size(11.5).text_color(t.dim).child(folder))
      .when(kindOf(this.file) === "pdf" || kindOf(this.file) === "image", (el) => el.child(button("vr-preview",
        h_flex().gap(5).items_center().child(svg(`${ICONS}/external-link.svg`).size(13)).child(previewLabel(platform())),
        () => openInPreview(this.abs(this.file)), `Open this file in ${previewName(platform())}`)))
      .when(this.hasRemote, (el) => el.child(button("vr-web", this.remoteImages === false ? "Web images: off" : "Web images: on",
        (_e, cx) => this.toggleRemote(cx), "Pictures from the web are downloaded when a note is opened. Click to turn them " + (this.remoteImages === false ? "on" : "off"))))
      .when(!this.kept && Boolean(p.overlay), (el) => el
        .child(this.keepButton(t, p, button))
        .child(button("vr-close", svg(`${ICONS}/x.svg`).size(14), () => this.closeWindow(), "Close (Esc)")));
  }

  toggleRemote(cx) {
    const next = this.remoteImages === false;
    this.remoteImages = next;
    saveSettings({ remoteImages: next }).then(() => this.load(cx)).catch(() => {});
    cx.notify();
  }

  // Keep ▾: the menu opens under the button, right edges lined up. Event positions
  // are window px; overlay positions are at zoom 1, hence the division.
  keepButton(t, p, button) {
    return button("vr-keep", h_flex().gap(4).items_center().child("Keep").child(svg(`${ICONS}/chevron-down.svg`).size(11)), () => {
      const z = Number(settings().zoom) || 1, b = this.keepAt;
      const at = b ? { x: Math.max(0, (b.x + b.width) / z - MENU_W), y: (b.y + b.height) / z + 4 } : "pointer";
      openOverlay({ mod: MOD, kind: "popup", width: MENU_W, at,
        props: { menu: true, window: p.overlay, vault: this.vault, file: this.file, anchor: this.anchor } });
    }, "Keep this note in the space").on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.keepAt = e.bounds ?? (e.position ? { ...e.position, width: 0, height: 0 } : null); });
  }

  // The "obsidian" tabs of the shown space.
  static obsidianTabs() {
    const space = spaces().find((s) => s.active);
    return (space?.tabs ?? []).filter((tab) => tab.name.toLowerCase() === "obsidian");
  }

  menu(p) {
    const t = theme();
    const note = { vault: p.vault, file: p.file, anchor: p.anchor ?? null, kept: true };
    const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const done = () => { if (p.window) closeOverlay(p.window); closeOverlay(p.overlay); };
    const tabs = Reader.obsidianTabs();
    const item = (id, label, hint, action) => v_flex().id(id).px(10).py(6).rounded(6).cursor_pointer()
      .hover((el) => el.bg(t.hover)).on_click(action)
      .child(div().text_size(12.5).text_color(t.foreground).child(label))
      .child(div().text_size(11).text_color(t.dim).child(hint));
    return v_flex().id("vr-menu").w_full().p(4).gap(1).bg(t.raised)
      .child(item("keep-tab", "New tab", "A tab named obsidian, with this note", () => {
        run("tab.new", { name: "obsidian", mod: MOD, props: { ...note, id: newId() } });
        done();
      }))
      .children(tabs.map((tab, i) => item(`keep-add-${i}`, tabs.length > 1 ? `Add to obsidian (tab ${tab.index})` : "Add to obsidian",
        `One more note in that tab (${tab.panes} now)`, () => {
          const last = panes().filter((x) => x.tab === tab.id).pop();
          run("tab.select", { id: tab.id });
          if (last) run("pane.split", { pane: last.pane, direction: "down", mod: MOD, props: { ...note, id: newId() } });
          else run("tab.new", { name: "obsidian", mod: MOD, props: { ...note, id: newId() } });
          done();
        })));
  }

  content(t, width) {
    const d = this.doc;
    if (!d || d.loading) return [div().text_color(t.dim).child("Opening…")];
    if (d.error) return [this.notice(t, d.error)];
    // What could not be drawn (and the hint about live updates) sits above the note, which stays readable.
    const lines = [...this.notes, ...(this.hint ? [this.hint] : [])];
    return [...lines.map((text) => this.notice(t, text, t.dim)), ...this.docView(d, t, width, "d")];
  }

  notice(t, text, color = t.dim) {
    return div().px(12).py(8).rounded(6).bg(t.surface).text_size(13).text_color(color).child(text);
  }

  docView(d, t, width, id) {
    if (d.error) return [this.notice(t, d.error)];
    const out = [];
    if (d.kind === "pdf") {
      const a = this.assets.get(d.key), file = this.abs(d.file);
      if (!a?.pages) return [this.picture(t, a, width, null, id, file, "Loading…", false, true)];
      a.pages.forEach((pg, i) => out.push(this.picture(t, pg, width, null, `${id}-p${i + 1}`, file, "Loading…", false, true)));
      if (!a.done) out.push(div().text_size(12.5).text_color(t.dim).child(`Drawing page ${a.pages.length + 1} of ${a.total}…`));
      else if (a.total > a.pages.length) out.push(this.openRow(t, `${id}-rest`, `Pages 1–${a.pages.length} of ${a.total} here: open all of it in ${previewName(platform())}`, file, true));
      return out;
    }
    if (d.kind === "image") {
      out.push(this.picture(t, this.assets.get(d.key), width, null, id, null, "Loading…", false, false));
      return out;
    }
    if (d.kind === "other") return [this.openRow(t, `${id}-open`, `Open ${d.file.split("/").pop()} with its app`, this.abs(d.file))];
    if (d.kind === "excalidraw") return [this.picture(t, this.assets.get(d.key), width, null, id, null, "Drawing…")];
    if (d.kind === "canvas") return [this.canvasView(d, t, width, id)];
    if (d.missing) out.push(this.notice(t, `No heading or block “${d.missing}” in this note: showing all of it`));
    if (d.props?.length) out.push(this.properties(t, d.props));
    out.push(...this.blocks(d.blocks ?? [], t, width, id, d.file));
    return out;
  }

  properties(t, list) {
    const chip = (text) => div().flex_none().px(7).py(1).rounded(4).bg(t.raised).text_size(12.5).text_color(t.foreground).child(text);
    return v_flex().gap(3).pb(10).border_b(1).border_color(t.border).text_size(13)
      .children(list.map(([k, v], i) => h_flex().id(`prop-${i}`).gap(12).items_start()
        .child(div().w(130).flex_none().truncate().text_color(t.dim).child(k))
        .child(Array.isArray(v)
          ? h_flex().flex_1().flex_wrap().gap(4).children(v.map((x) => chip(k === "tags" ? `#${String(x).replace(/^#/, "")}` : String(x))))
          : div().flex_1().min_w(0).text_color(t.foreground).child(String(v)))));
  }

  blocks(list, t, width, id, from) {
    return list.map((b, i) => this.block(b, t, width, `${id}-${i}`, from)).filter(Boolean);
  }

  md(text, id) {
    return TextView.markdown(`${id}-${this.gen}`, text).selectable(true).on_link_click((url, cx) => this.follow(url, cx));
  }

  block(b, t, width, id, from) {
    switch (b.type) {
      case "md": return this.md(b.text, id);
      case "code": return this.md(b.text, id);
      case "query": return v_flex().gap(4)
        .child(div().text_size(11.5).text_color(t.dim).child(`${b.lang} query · shown, not run`))
        .child(this.md("```\n" + b.src + "\n```", id));
      case "mermaid": {
        const a = this.assets.get(b.key);
        if (a?.error && a.transient) return this.md("```mermaid\n" + b.src + "\n```", id); // the reason is in the notice above
        if (a?.error) return v_flex().gap(4).child(this.notice(t, `Mermaid: ${a.error.split("\n")[0]}`, t.blocked)).child(this.md("```mermaid\n" + b.src + "\n```", id));
        return this.picture(t, a, width, null, id, null, "Drawing the diagram…", true);
      }
      case "math": {
        const a = this.assets.get(b.key);
        if (a?.error && a.transient) return this.md("```\n$$\n" + b.src + "\n$$\n```", id);
        if (a?.error) return this.notice(t, `Math: ${a.error} — ${b.src}`, t.blocked);
        return this.picture(t, a, width, null, id, null, "…", true);
      }
      case "flow": return this.flow(b, t, id);
      case "callout": return this.callout(b, t, width, id, from);
      case "embed": return this.embed(b, t, width, id, from);
      case "image": {
        if (b.error) return this.notice(t, b.error);
        return this.picture(t, this.assets.get(b.key), width, parseSize(b.size), id);
      }
      default: return null;
    }
  }

  // A picture from the cache, fitted to the column (and to an embed's |size).
  // fill: grow to the column too (PDF pages), not only shrink.
  picture(t, a, width, size, id, openPath = null, waiting = "Loading…", center = false, fill = false) {
    if (!a) return div().h(36).flex_none().px(12).items_center().flex().rounded(6).bg(t.surface).text_size(12.5).text_color(t.dim).child(waiting);
    if (a.error) return this.notice(t, a.transient ? "Not drawn (see the note above)" : a.error);
    let w = a.w, h = a.h;
    if (size?.w) { h = size.h ?? (h * size.w) / w; w = size.w; }
    if (w > width || (fill && !size?.w)) { h = (h * width) / w; w = width; }
    const img = image(a.path).w(Math.round(w)).h(Math.round(h)).flex_none();
    const box = h_flex().id(`pic-${id}`).w_full().flex_none().when(center, (el) => el.justify_center()).child(img);
    // PDF pages open in Preview.
    return openPath ? box.cursor_pointer().on_click(() => openInPreview(openPath)).tooltip(previewLabel(platform())) : box;
  }

  openRow(t, id, label, path, preview = false) {
    if (!canOpen(path)) return div().text_size(13).text_color(t.dim).child(`${path.split("/").pop()} (a program: not opened from a note)`);
    return h_flex().id(id).gap(6).items_center().cursor_pointer().text_size(13).text_color(t.accent)
      .on_click(() => (preview ? openInPreview(path) : openExternal(path)))
      .child(svg(`${ICONS}/external-link.svg`).size(13)).child(label);
  }

  flow(b, t, id) {
    const words = [];
    b.tokens.forEach((tok, i) => {
      if (tok.kind === "math") {
        const a = this.assets.get(tok.key);
        words.push(a && !a.error ? image(a.path).w(a.w).h(a.h).flex_none()
          : div().text_color(a?.error && !a.transient ? t.blocked : t.dim).child(`$${tok.src}$`));
        return;
      }
      for (const [j, w] of tok.text.split(/\s+/).filter(Boolean).entries()) {
        let el = div().id(`${id}-w${i}-${j}`).flex_none().child(w);
        if (tok.bold) el = el.font_bold();
        if (tok.italic) el = el.italic();
        if (tok.code) {
          el = el.px(4).rounded(4).bg(t.raised).text_size(TEXT - 2);
          const mono = settings().font_family;
          if (mono) el = el.font_family(mono);
        }
        if (tok.link) el = el.text_color(t.accent).cursor_pointer().on_click((_e, cx) => this.follow(tok.link, cx));
        words.push(el);
      }
    });
    const size = b.heading ? [0, 26, 22, 19, 17, 16, 15][b.heading] : TEXT;
    return h_flex().w_full().flex_wrap().items_center().gap_x(4).gap_y(4).text_size(size).when(b.heading > 0, (el) => el.font_bold()).children(words);
  }

  callout(b, t, width, id, from) {
    const kind = CALLOUT_ALIAS[b.kind] ?? b.kind;
    const [icon, color] = CALLOUT[kind] ?? CALLOUT.note;
    const open = this.folds.has(id) ? this.folds.get(id) : b.fold !== "-";
    const foldable = b.fold === "+" || b.fold === "-";
    const title = h_flex().id(`${id}-t`).gap(8).items_center()
      .when(foldable, (el) => el.cursor_pointer().on_click((_e, cx) => { this.folds.set(id, !open); cx.notify(); }))
      .child(svg(`${ICONS}/${icon}.svg`).size(16).flex_none().text_color(color))
      // A title with a link needs TextView; a plain one is plain text in the callout's color.
      .child(div().flex_1().min_w(0).font_semibold().text_color(color).child(/\]\(/.test(b.title)
        ? this.md(b.title, `${id}-tt`) : b.title.replace(/\*\*|__|`/g, "").replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")))
      .when(foldable, (el) => el.child(svg(`${ICONS}/chevron-${open ? "down" : "right"}.svg`).size(14).flex_none().text_color(color)));
    return v_flex().w_full().px(14).py(10).gap(6).rounded(6).bg(color + "1c")
      .child(title)
      .when(open && b.body.length > 0, (el) => el.children(this.blocks(b.body, t, width - 28, id, from)));
  }

  embed(b, t, width, id, from) {
    if (!b.resolved) return this.notice(t, `“${b.target}” isn't in the vault`);
    if (b.kind === "image" || b.kind === "pdf") {
      const pic = this.picture(t, this.assets.get(b.key), width, parseSize(b.size), id, b.kind === "pdf" ? this.abs(b.resolved) : null, "Loading…", false, b.kind === "pdf");
      if (b.kind !== "pdf") return pic;
      return v_flex().gap(6).child(pic).child(this.openRow(t, `${id}-pdf`, `Open ${b.resolved.split("/").pop()} in ${previewName(platform())}`, this.abs(b.resolved), true));
    }
    if (b.kind === "excalidraw") return this.picture(t, this.assets.get(b.key), width, parseSize(b.size), id, null, "Drawing…", true);
    if (b.kind === "other") return this.openRow(t, `${id}-o`, b.resolved.split("/").pop(), this.abs(b.resolved));
    const inner = b.doc ? this.docView(b.doc, t, width - 20, id) : [this.notice(t, "Embedded too deep to show here")];
    const label = stem(b.resolved) + (b.anchor ? ` › ${b.anchor.replace(/^\^/, "")}` : "");
    return v_flex().w_full().pl(14).py(4).gap(8).border_l(2).border_color(t.accent + "88")
      .child(h_flex().id(`${id}-h`).gap(6).items_center().cursor_pointer().text_size(12).text_color(t.dim)
        .hover((el) => el.text_color(t.accent))
        .on_click((_e, cx) => this.go(b.resolved, b.anchor, cx))
        .child(svg(`${ICONS}/link.svg`).size(12)).child(label))
      .children(inner);
  }

  canvasView(d, t, width, id) {
    const c = d.canvas;
    if (c.empty) return this.notice(t, "This canvas is empty");
    const scale = Math.min(1, width / c.box.w);
    const s = (v) => Math.round(v * scale);
    const X = (n) => s(n.x - c.box.x), Y = (n) => s(n.y - c.box.y);
    const frame = div().relative().flex_none().w(s(c.box.w)).h(s(c.box.h));
    const kids = [];
    for (const n of c.nodes.filter((n) => n.type === "group")) {
      const color = canvasColor(n.color, t.muted);
      kids.push(div().absolute().left(X(n)).top(Y(n)).w(s(n.width)).h(s(n.height)).rounded(s(10)).border_1().border_color(color + "99").bg(color + "12"));
      if (n.label) kids.push(div().absolute().left(X(n)).top(Y(n) - s(26)).text_size(Math.max(10, 14 * scale)).text_color(t.muted).child(n.label));
    }
    if (d.edges) kids.push(image(d.edges).absolute().left(0).top(0).w(s(c.box.w)).h(s(c.box.h)));
    c.nodes.filter((n) => n.type !== "group").forEach((n, i) => {
      const color = canvasColor(n.color, t.border);
      let card = v_flex().id(`${id}-n${i}`).absolute().left(X(n)).top(Y(n)).w(s(n.width)).h(s(n.height)).overflow_hidden()
        .rounded(s(8)).border_2().border_color(color).bg(n.color ? mixHex(color, t.background, 0.88) : t.surface)
        .text_size(Math.max(9, TEXT * scale)).px(s(14)).py(s(10)).gap(s(6));
      if (n.type === "text") card = card.child(this.md(n.text ?? "", `${id}-n${i}`));
      else if (n.type === "link") {
        const url = safeUrl(n.url); // a card can only open web links
        card = (url ? card.cursor_pointer().on_click(() => openExternal(url)) : card)
          .child(div().text_color(url ? t.accent : t.dim).child(String(n.url ?? "")));
      }
      else if (n.type === "file") {
        const title = h_flex().id(`${id}-f${i}`).gap(6).items_center().cursor_pointer().text_color(t.accent).font_semibold()
          .on_click((_e, cx) => this.go(n.target, n.subpath?.replace(/^#/, ""), cx))
          .child(stem(n.target ?? n.file));
        if (n.fileKind === "image") card = card.p(0).child(this.picture(t, this.assets.get(n.key), s(n.width), { w: s(n.width), h: s(n.height) }, `${id}-i${i}`));
        else if (n.fileKind === "excalidraw" || n.doc?.kind === "excalidraw") card = card.child(title).child(this.picture(t, this.assets.get(n.key), s(n.width) - s(28), null, `${id}-x${i}`));
        else if (n.doc) card = card.child(title).children(this.docView(n.doc, t, s(n.width) - s(28), `${id}-c${i}`));
        else card = card.child(title);
      }
      kids.push(card);
    });
    return v_flex().id(`${id}-canvas`).w_full().overflow_x_scrollbar().child(frame.children(kids));
  }
}

// a over b: share of b (0..1); both "#rrggbb".
function mixHex(a, b, share) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a.slice(0, 7)), p(b.slice(0, 7))];
  return "#" + x.map((v, i) => Math.round(v * (1 - share) + y[i] * share).toString(16).padStart(2, "0")).join("");
}
