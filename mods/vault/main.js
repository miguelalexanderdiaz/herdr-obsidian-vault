// The Vault panel (right side, beside Files and Changes, or as a popup): an Obsidian vault's
// whole file list. The vault selector on top switches vaults; + Add vault picks a folder
// (it must hold a .obsidian folder). Clicking a note, canvas, drawing, image or PDF opens it
// rendered in a floating reader (mods/vault-reader); other files open with their app.
//
// Shared (persisted): vault.list [{ path, name }], vault.current (path),
// vault.open { vault, file } (what the floating reader shows; set by the reader),
// vault.panes (kept reader panes; set by the reader), vault.outside (vaults Obsidian knows that
// lie beyond the home folder, which Herdr mods cannot read: listed dimmed in the selector).
// Commands: vault.add (pick a folder), vault.import (read Obsidian's vault list again).
// The same mod draws the selector's menu as a popup (props.menu).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, shared, setShared, pickFolder, readTextFile, watchFolder, exec, home, notify, openOverlay, closeOverlay, settings, nextCommand, run, window } from "herdr";
import * as fs from "fs/promises";
import { searchVault, forgetFiles } from "./search.js";
import { nameOf, normPath, tilde as tildeOf, openCommand, canOpen, obsidianConfigCandidates, missingMessage } from "./platform.js";
import { readVaultList, insideHome } from "./obsidian-config.js";
import { visibleChanges, folderEntries } from "./tree.js";
import { Watcher, POLL_MS, LIVE_OFF } from "./watch.js";
import { MOD, MOD_DIR, READER } from "./mod-name.js";

const ICON = `${MOD_DIR}/icons`;
const MENU_W = 300;
const PER_FOLDER = 2000;

const tilde = (p) => tildeOf(p, home());

function kind(name) {
  if (/\.excalidraw(\.md)?$/i.test(name)) return "drawing";
  if (/\.md$/i.test(name)) return "note";
  if (/\.canvas$/i.test(name)) return "canvas";
  if (/\.(png|jpe?g|gif|webp|svg|bmp|avif|tiff?)$/i.test(name)) return "image";
  if (/\.pdf$/i.test(name)) return "pdf";
  return "other";
}
const ICONS = { note: "file-text", drawing: "pen-tool", canvas: "canvas", image: "image", pdf: "pdf", other: "file" };
// As Obsidian's file list: notes, canvases and drawings without their extension.
const label = (name) => name.replace(/\.excalidraw\.md$/i, "").replace(/\.(md|canvas)$/i, "");

export function openReader(vault, file) {
  openOverlay({ mod: READER, kind: "window", key: READER, width: 0.78, height: 0.86, props: { vault, file } });
}

// The vaults Obsidian knows on this machine (its own list), most recently opened first:
// { vaults, outside, found, looked }. Looks in every place Obsidian keeps it on this OS.
function obsidianVaults() {
  return readVaultList(obsidianConfigCandidates(window().platform, home()), home(), (f) => readTextFile(f), { windows: window().platform === "windows" });
}

export default class Vault extends View {
  init(_props, cx) {
    this.entries = new Map();
    this.more = new Map(); // folder → how many entries beyond PER_FOLDER are not listed
    this.folders = new Set();
    this.pending = new Set();
    this.watcher = new Watcher(watchFolder);
    this.closed = false;
    if ((props() ?? {}).menu) return;
    // Search: two letters or more replace the tree with matching notes.
    this.query = "";
    this.results = null; // null: no search; else [{ rel, line?, text? }]
    this.searching = false;
    this.searchSeq = 0;
    this.sel = 0;
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Search notes…" });
    this.input.on("change", (_e, cx) => { this.query = this.input.value(); this.sel = 0; this.search(cx); });
    this.input.on("submit", () => { const r = this.results?.[this.sel]; if (r) this.open(r.rel); });
    // vault.add / vault.import: the selector menu's "Add vault…" and "Import from Obsidian" (the menu
    // closes first; the folder picker outlives it here). One bad command must not end the loop.
    cx.spawn(async (cx) => {
      while (!this.closed) {
        try {
          const c = await nextCommand();
          if (c === "add") await this.addVault();
          else if (c === "import") await this.importVaults(false);
        } catch (e) { notify({ title: "Vault", body: String(e?.message ?? e).slice(0, 200), level: "warning" }); }
        cx.notify();
      }
    });
    // First run: start from the vaults Obsidian already knows.
    cx.spawn(async (cx) => {
      if (shared("vault.list") == null) await this.importVaults(true).catch(() => setShared("vault.list", []));
      cx.notify();
    });
  }

  async close() {
    this.closed = true;
    this.watcher?.stop();
    this.pollTask?.cancel();
  }

  // Obsidian's vault list → the panel's. First run (or when the panel has none yet) it becomes the list;
  // later ("Import from Obsidian") it only adds the vaults the panel doesn't have.
  async importVaults(first) {
    const res = await obsidianVaults();
    this.importInfo = res.found ? null : `Obsidian's vault list wasn't found (looked in ${res.looked.map(tilde).join(", ")}).`;
    const have = this.list();
    const fresh = res.vaults.filter((v) => !have.some((h) => h.path === v.path));
    const list = first ? res.vaults : [...have, ...fresh];
    setShared("vault.list", list);
    setShared("vault.outside", res.outside);
    if (list.length && (first || !this.current())) setShared("vault.current", list[0].path);
    if (!first) notify({ title: "Vault", body: fresh.length ? `Added ${fresh.length} vault${fresh.length === 1 ? "" : "s"} from Obsidian.` : (res.found ? "No new vaults in Obsidian's list." : this.importInfo), level: "info" });
  }

  list() { return shared("vault.list") ?? []; }
  current() {
    const cur = shared("vault.current");
    return this.list().find((v) => v.path === cur) ?? this.list()[0] ?? null;
  }

  // ---- the selected vault's files --------------------------------------------------

  sync(cx) {
    const root = this.current()?.path ?? null;
    if (root === this.root) return;
    if (this.root) localStorage.setItem(`open:${this.root}`, JSON.stringify([...this.folders]));
    this.root = root;
    this.entries = new Map();
    this.more = new Map();
    this.pending = new Set();
    this.error = null;
    this.watcher.stop();
    this.pollTask?.cancel();
    this.pollTask = null;
    this.hint = null;
    try { this.folders = new Set(JSON.parse(localStorage.getItem(`open:${root}`) ?? "[]")); } catch { this.folders = new Set(); }
    if (!root) return;
    this.reload(cx);
    this.watch(root, cx);
    if (this.results) this.search(cx);
  }

  async readFolder(rel) {
    const dir = rel ? `${this.root}/${rel}` : this.root;
    const list = await fs.readdir(dir, { withFileTypes: true });
    return folderEntries(list, label, PER_FOLDER); // { items, more }
  }

  reload(cx) {
    const root = this.root;
    cx.spawn(async (cx) => {
      try {
        const next = new Map(), more = new Map();
        for (const rel of ["", ...this.folders]) {
          try { const { items, more: n } = await this.readFolder(rel); next.set(rel, items); more.set(rel, n); }
          catch (e) { if (!rel) throw e; this.folders.delete(rel); }
        }
        if (root !== this.root) return;
        this.entries = next;
        this.more = more;
        this.error = null;
      } catch (e) {
        if (root === this.root) {
          this.error = !insideHome(root, home(), window().platform === "windows") ? "This vault is outside your home folder, which Herdr mods can't read"
            : /ENOENT|No such/i.test(String(e)) ? "This vault's folder is gone" : String(e?.message ?? e);
        }
      }
      cx.notify();
    });
  }

  // Live refresh. Switching vaults A → B → A starts a new loop each time and the Watcher ends the old ones.
  // When the watch is refused (a very large tree on Linux), a timer takes over and the panel says so.
  watch(root, cx) {
    this.watcher.start(root, {
      onBatch: (changed) => {
        if (root !== this.root) return;
        const { all, rels } = visibleChanges(root, changed);
        if (!all && !rels.length) return;
        forgetFiles(root);
        this.reload(cx);
        if (this.results) this.search(cx);
      },
      onFail: () => {
        if (root !== this.root || this.closed) return;
        this.hint = LIVE_OFF;
        this.pollTask?.cancel();
        this.pollTask = cx.timer.every(POLL_MS, (cx) => {
          if (root !== this.root) return;
          forgetFiles(root);
          this.reload(cx);
        });
        cx.notify();
      },
    });
  }

  toggle(rel, cx) {
    if (this.folders.has(rel)) {
      for (const f of [...this.folders]) if (f === rel || f.startsWith(rel + "/")) { this.folders.delete(f); this.entries.delete(f); }
    } else {
      this.folders.add(rel);
      if (!this.entries.has(rel) && !this.pending.has(rel)) {
        const root = this.root;
        this.pending.add(rel);
        cx.spawn(async (cx) => {
          try {
            const { items, more } = await this.readFolder(rel);
            if (root === this.root && this.folders.has(rel)) { this.entries.set(rel, items); this.more.set(rel, more); }
          }
          catch (e) { this.error = String(e?.message ?? e); }
          finally { this.pending.delete(rel); cx.notify(); }
        });
      }
    }
    localStorage.setItem(`open:${this.root}`, JSON.stringify([...this.folders]));
    cx.notify();
  }

  open(rel) {
    const k = kind(rel);
    if (k === "other") {
      // Documents open with their app; programs are not launched from here.
      if (!canOpen(rel)) { notify({ title: "Not opened", body: `${rel.split("/").pop()} is a program, not a document.`, level: "warning" }); return; }
      const [cmd, args] = openCommand(window().platform, `${this.root}/${rel}`);
      exec(cmd, args).catch(() => {});
    } else openReader(this.root, rel);
  }

  // ---- search -------------------------------------------------------------------------

  // Waits a moment after typing; a newer search (or a cleared box) wins.
  search(cx) {
    const q = this.query.trim();
    const seq = ++this.searchSeq;
    if (q.length < 2 || !this.root) { this.results = null; this.searching = false; cx.notify(); return; }
    this.searching = true;
    cx.notify();
    const root = this.root;
    cx.timer.after(160, (cx) => {
      if (seq !== this.searchSeq) return;
      cx.spawn(async (cx) => {
        let res, error = null, missing = false;
        try { res = await searchVault(root, q); } catch (e) { res = []; error = String(e?.message ?? e); missing = Boolean(e?.missing); }
        if (seq !== this.searchSeq) return;
        this.results = res;
        this.searchError = error;
        this.searchMissing = missing;
        this.searching = false;
        this.sel = Math.min(this.sel, Math.max(0, res.length - 1));
        cx.notify();
      });
    });
  }

  clearSearch(cx) {
    this.input.set_value("");
    this.query = "";
    this.search(cx);
  }

  searchBox(t) {
    return h_flex().px(8).pt(8).pb(4).flex_none()
      .child(h_flex().flex_1().h(30).px(9).gap(7).items_center().rounded(7).border_1()
        .border_color(this.query ? t.accent : t.border).bg(t.surface)
        .child(svg(`${ICON}/search.svg`).size(13).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(12.5).text_color(t.foreground))
        .when(Boolean(this.query), (el) => el.child(div().id("vault-search-clear").flex_none().p(2).rounded(4).cursor_pointer()
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => this.clearSearch(cx))
          .tooltip("Clear the search (Esc)")
          .child(svg(`${ICON}/x.svg`).size(12)))));
  }

  found(t) {
    const res = this.results ?? [];
    const open = shared("vault.open");
    const showing = open && open.vault === this.root ? open.file : null;
    const status = this.searchError ? (this.searchMissing ? this.searchError : `Search failed: ${this.searchError}`)
      : this.searching && !res.length ? "Searching…"
      : !res.length ? `No note has “${this.query.trim()}”` : null;
    return v_flex().id("vault-found").flex_1().min_h(0).overflow_y_scrollbar().px(6).pb(6)
      .child(div().px(8).pt(2).pb(4).text_size(11).text_color(t.dim)
        .child(status ?? `${res.length}${res.length >= 200 ? "+" : ""} note${res.length === 1 ? "" : "s"} · ↑↓ Enter · Esc clears`))
      .children(res.map((r, i) => {
        const name = r.rel.split("/").pop();
        const folder = r.rel.includes("/") ? r.rel.slice(0, r.rel.lastIndexOf("/")) : "";
        const k = kind(name), on = i === this.sel, here = r.rel === showing;
        return v_flex().id(`vf-${r.rel}`).flex_none().px(8).py(5).gap(2).rounded(7).cursor_pointer()
          .when(on, (el) => el.bg(t.hover)).when(here, (el) => el.bg(t.selected)).hover((el) => el.bg(t.hover))
          .on_click((_e, cx) => { this.sel = i; this.open(r.rel); cx.notify(); })
          .child(h_flex().gap(7).items_center()
            .child(svg(`${ICON}/${ICONS[k]}.svg`).size(14).flex_none().text_color(here ? t.accent : t.muted))
            .child(div().flex_none().max_w(220).truncate().text_color(k === "note" || here ? t.foreground : t.muted).child(label(name)))
            .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(folder)))
          .when(Boolean(r.text), (el) => el.child(div().pl(21).truncate().text_size(11.5).text_color(t.muted).child(r.text)));
      }));
  }

  // ---- vaults -------------------------------------------------------------------------

  // One folder picker at a time, even when this panel is docked and also open as a popup (both
  // receive vault.add); a picker abandoned for two minutes no longer blocks.
  async addVault() {
    const busy = shared("vault.adding");
    if (busy && Date.now() - busy < 120_000) return;
    setShared("vault.adding", Date.now());
    try {
      const folder = await pickFolder({ prompt: "Add vault" });
      if (!folder) return;
      const path = normPath(folder);
      // Beyond the home folder fs.exists says "no" (or fails), which used to read as "has no .obsidian folder".
      if (!insideHome(path, home(), window().platform === "windows")) {
        notify({ title: "Vault outside your home folder", body: `Herdr mods can only read inside your home folder, so ${nameOf(path)} can't be added. A link to it from inside your home folder may work.`, level: "warning" });
        const out = shared("vault.outside") ?? [];
        if (!out.some((o) => o.path === path)) setShared("vault.outside", [...out, { path, name: nameOf(path) }]);
        return;
      }
      if (!(await fs.exists(`${path}/.obsidian`).catch(() => false))) {
        notify({ title: "Not an Obsidian vault", body: `${tilde(path)} has no .obsidian folder. Pick the vault's own folder (open it in Obsidian once if it's new).`, level: "warning" });
        return;
      }
      const list = this.list().filter((v) => v.path !== path);
      setShared("vault.list", [...list, { path, name: nameOf(path) }]);
      setShared("vault.current", path);
    } finally { setShared("vault.adding", null); }
  }

  removeVault(path) {
    const list = this.list().filter((v) => v.path !== path);
    setShared("vault.list", list);
    if (shared("vault.current") === path) setShared("vault.current", list[0]?.path ?? null);
  }

  // ---- drawing ------------------------------------------------------------------------

  render(cx) {
    const p = props() ?? {};
    if (p.menu) return this.menu(p);
    this.sync(cx);
    const t = theme();
    const cur = this.current();
    return v_flex().id("vault").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border)
      .text_color(t.foreground).text_size(13)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (!this.results) return;
        const n = this.results.length, k = e.key;
        if (k === "escape") this.clearSearch(cx);
        else if (k === "down" && n) this.sel = (this.sel + 1) % n;
        else if (k === "up" && n) this.sel = (this.sel + n - 1) % n;
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(this.header(t, cur))
      .when(Boolean(cur), (el) => el.child(this.searchBox(t)))
      .child(!cur ? this.empty(t) : this.results ? this.found(t) : this.tree(t));
  }

  header(t, cur) {
    return h_flex().h(42).flex_none().px(8).gap(6).items_center().border_b(1).border_color(t.border)
      .child(h_flex().id("vault-pick").flex_1().min_w(0).h(28).px(8).gap(7).items_center().rounded(6).cursor_pointer()
        .hover((el) => el.bg(t.hover))
        .on_mouse_down("left", (e) => { this.pickAt = e.bounds ?? (e.position ? { ...e.position, width: 0, height: 0 } : null); })
        .on_click(() => {
          const z = Number(settings().zoom) || 1, b = this.pickAt;
          const at = b ? { x: b.x / z, y: (b.y + b.height) / z + 4 } : "pointer";
          openOverlay({ mod: MOD, kind: "popup", width: MENU_W, at, props: { menu: true } });
        })
        .tooltip(cur ? tilde(cur.path) : "No vault yet")
        .child(svg(`${MOD_DIR}/vault.svg`).size(15).flex_none().text_color(t.muted))
        .child(div().min_w(0).truncate().font_semibold().child(cur?.name ?? "No vault"))
        .child(svg(`${ICON}/chevron-down.svg`).size(12).flex_none().text_color(t.dim)))
      .child(h_flex().id("vault-add").h(28).px(8).gap(5).flex_none().items_center().rounded(6).cursor_pointer()
        .text_size(12).text_color(t.muted).hover((el) => el.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => cx.spawn(async () => this.addVault()))
        .tooltip("Pick a vault folder")
        .child(svg(`${ICON}/plus.svg`).size(13)).child("Add vault"));
  }

  empty(t) {
    return v_flex().flex_1().p(16).gap(10).text_size(12.5).text_color(t.dim)
      .child("No vault yet. Add one to browse its notes here; clicking a note opens it rendered.")
      .when(Boolean(this.importInfo), (el) => el.child(div().text_size(11.5).child(this.importInfo)))
      .child(h_flex().id("vault-add-empty").h(30).px(12).gap(6).items_center().self_start().rounded(6).cursor_pointer()
        .bg(t.raised).text_color(t.foreground).hover((el) => el.bg(t.hover))
        .on_click((_e, cx) => cx.spawn(async () => this.addVault()))
        .child(svg(`${ICON}/plus.svg`).size(13)).child("Add vault"));
  }

  tree(t) {
    const rows = this.rows("", 0, [], t);
    return v_flex().id("vault-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6)
      .when(Boolean(this.hint), (el) => el.child(div().px(8).pb(4).text_size(11).text_color(t.dim).child(this.hint)))
      .children(rows)
      .when(Boolean(this.error) || !this.entries.get("")?.length, (el) => el.child(div().p(8).text_size(12).text_color(t.dim)
        .child(this.error || (this.entries.has("") ? "This vault is empty" : "Loading…"))));
  }

  rows(prefix, depth, out, t) {
    const open = shared("vault.open");
    const showing = open && open.vault === this.root ? open.file : null;
    for (const entry of this.entries.get(prefix) ?? []) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const expanded = this.folders.has(rel);
      const k = entry.dir ? null : kind(entry.name);
      const on = rel === showing;
      out.push(h_flex().id(`v-${rel}`).h(28).flex_none().pl(8 + depth * 16).pr(8).gap(7).items_center().rounded(7).cursor_pointer()
        .when(on, (el) => el.bg(t.selected)).hover((el) => el.bg(t.hover))
        .on_click((_e, cx) => (entry.dir ? this.toggle(rel, cx) : this.open(rel)))
        .child(entry.dir ? svg(`${ICON}/chevron-${expanded ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(svg(`${ICON}/${entry.dir ? "folder" : ICONS[k]}.svg`).size(14).flex_none().text_color(on ? t.accent : t.muted))
        .child(div().flex_1().min_w(0).truncate().text_color(entry.dir || k === "note" || on ? t.foreground : t.muted)
          .child(entry.dir ? entry.name : label(entry.name))));
      if (entry.dir && expanded) {
        if (this.entries.has(rel)) this.rows(rel, depth + 1, out, t);
        else out.push(div().h(24).pl(8 + (depth + 1) * 16 + 19).text_size(12).text_color(t.dim).child("…"));
      }
    }
    const more = this.more.get(prefix) ?? 0;
    if (more > 0) out.push(div().h(24).pl(8 + depth * 16 + 19).text_size(12).text_color(t.dim).child(`+${more} more not listed (search finds them)`));
    return out;
  }

  // The selector's popup: every vault, the selected one checked; ✕ removes one
  // from this list (the folder stays); + Add vault at the end.
  menu(p) {
    const t = theme();
    const cur = this.current()?.path;
    const outside = (shared("vault.outside") ?? []).filter((v) => !this.list().some((h) => h.path === v.path));
    const item = (v, i) => h_flex().id(`vm-${i}`).px(8).py(6).gap(8).items_center().rounded(6).cursor_pointer()
      .hover((el) => el.bg(t.hover))
      .on_click(() => { setShared("vault.current", v.path); closeOverlay(p.overlay); })
      .child(v.path === cur ? svg(`${ICON}/check.svg`).size(13).flex_none().text_color(t.accent) : div().w(13).flex_none())
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_size(12.5).text_color(t.foreground).child(v.name))
        .child(div().overflow_hidden().whitespace_nowrap().text_ellipsis_start().text_size(11).text_color(t.dim).child(tilde(v.path))))
      .child(h_flex().id(`vm-x-${i}`).size(22).flex_none().items_center().justify_center().rounded(5).text_color(t.dim)
        .hover((el) => el.bg(t.raised).text_color(t.foreground))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => { cx.stop_propagation(); this.removeVault(v.path); cx.notify(); })
        .tooltip("Remove from this list (the folder stays)")
        .child(svg(`${ICON}/x.svg`).size(12)));
    return v_flex().id("vault-menu").w_full().p(4).gap(1).bg(t.raised)
      .children(this.list().map(item))
      .when(this.list().length === 0, (el) => el.child(div().px(8).py(6).text_size(12).text_color(t.dim).child("No vaults yet")))
      .children(outside.map((v, i) => v_flex().id(`vm-out-${i}`).px(8).py(6).opacity(0.55)
        .child(div().truncate().text_size(12.5).text_color(t.foreground).child(v.name))
        .child(div().truncate().text_size(11).text_color(t.dim).child("Outside your home folder: Herdr can't read it"))))
      .child(div().h(1).mx(4).my(3).bg(t.border))
      .child(h_flex().id("vm-add").px(8).py(6).gap(8).items_center().rounded(6).cursor_pointer().text_size(12.5).text_color(t.muted)
        .hover((el) => el.bg(t.hover).text_color(t.foreground))
        .on_click(() => { closeOverlay(p.overlay); run("vault.add"); })
        .child(svg(`${ICON}/plus.svg`).size(13).flex_none()).child("Add vault…"))
      .child(h_flex().id("vm-import").px(8).py(6).gap(8).items_center().rounded(6).cursor_pointer().text_size(12.5).text_color(t.muted)
        .hover((el) => el.bg(t.hover).text_color(t.foreground))
        .on_click(() => { closeOverlay(p.overlay); run("vault.import"); })
        .tooltip("Read Obsidian's own vault list again and add the vaults that are missing here")
        .child(svg(`${ICON}/book-open.svg`).size(13).flex_none()).child("Import from Obsidian"));
  }
}
