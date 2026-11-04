// The Vault panel (right side, beside Files and Changes): an Obsidian vault's
// whole file list. The vault selector on top switches vaults; + Add vault picks
// a folder in Finder (it must hold a .obsidian folder). Clicking a note, canvas,
// drawing, image or PDF opens it rendered in a floating reader (mods/vault-reader);
// other files open with their app.
//
// Shared (persisted): vault.list [{ path, name }], vault.current (path),
// vault.open { vault, file } (what the floating reader shows; set by the reader).
// The same mod draws the selector's menu as a popup (props.menu).

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, shared, setShared, pickFolder, readTextFile, watchFolder, exec, home, notify, openOverlay, closeOverlay, settings, nextCommand, run } from "herdr";
import * as fs from "fs/promises";
import { searchVault } from "./search.js";

const ICON = "mods/vault/icons";
const MENU_W = 300;
const PER_FOLDER = 2000;

const nameOf = (path) => path.split("/").filter(Boolean).pop() ?? path;
const tilde = (p) => p.replace(new RegExp(`^${home().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "~");

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
  openOverlay({ mod: "vault-reader", kind: "window", key: "vault-reader", width: 0.78, height: 0.86, props: { vault, file } });
}

// The vaults Obsidian knows on this Mac (its own list), most recently opened first.
async function obsidianVaults() {
  const text = await readTextFile(`${home()}/Library/Application Support/obsidian/obsidian.json`).catch(() => null);
  try {
    const vaults = Object.values(JSON.parse(text ?? "{}").vaults ?? {});
    return vaults.filter((v) => v.path).sort((a, b) => Number(b.open ?? false) - Number(a.open ?? false) || (b.ts ?? 0) - (a.ts ?? 0))
      .map((v) => ({ path: v.path, name: nameOf(v.path) }));
  } catch { return []; }
}

export default class Vault extends View {
  init(_props, cx) {
    this.entries = new Map();
    this.folders = new Set();
    this.pending = new Set();
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
    // vault.add: the selector menu's "Add vault…" (the menu closes first; Finder's
    // picker outlives it here).
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "add") await this.addVault();
        cx.notify();
      }
    });
    cx.spawn(async (cx) => {
      // First run: start from the vaults Obsidian already knows.
      if (shared("vault.list") == null) {
        const list = await obsidianVaults();
        setShared("vault.list", list);
        if (list.length) setShared("vault.current", list[0].path);
      }
      cx.notify();
    });
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
    this.pending = new Set();
    this.error = null;
    try { this.folders = new Set(JSON.parse(localStorage.getItem(`open:${root}`) ?? "[]")); } catch { this.folders = new Set(); }
    if (!root) return;
    this.reload(cx);
    this.watch(root, cx);
    if (this.results) this.search(cx);
  }

  async readFolder(rel) {
    const dir = rel ? `${this.root}/${rel}` : this.root;
    const list = await fs.readdir(dir, { withFileTypes: true });
    return list.filter((e) => !e.name.startsWith("."))
      .map((e) => ({ name: e.name, dir: e.isDirectory() }))
      .sort((a, b) => Number(b.dir) - Number(a.dir) || label(a.name).localeCompare(label(b.name), undefined, { numeric: true, sensitivity: "base" }))
      .slice(0, PER_FOLDER);
  }

  reload(cx) {
    const root = this.root;
    cx.spawn(async (cx) => {
      try {
        const next = new Map();
        for (const rel of ["", ...this.folders]) {
          try { next.set(rel, await this.readFolder(rel)); }
          catch (e) { if (!rel) throw e; this.folders.delete(rel); }
        }
        if (root !== this.root) return;
        this.entries = next;
        this.error = null;
      } catch (e) {
        if (root === this.root) this.error = /ENOENT|No such/i.test(String(e)) ? "This vault's folder is gone" : String(e?.message ?? e);
      }
      cx.notify();
    });
  }

  watch(root, cx) {
    cx.spawn(async (cx) => {
      while (this.root === root) {
        let changed;
        try { changed = await watchFolder(root); } catch { return; }
        if (this.root !== root) return;
        // Obsidian rewrites .obsidian/workspace.json all the time: not ours.
        if (changed.some((p) => !p.slice(root.length).split("/").some((part) => part.startsWith(".")))) {
          this.reload(cx);
          if (this.results) this.search(cx);
        }
      }
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
          try { const list = await this.readFolder(rel); if (root === this.root && this.folders.has(rel)) this.entries.set(rel, list); }
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
    if (k === "other") exec("open", [`${this.root}/${rel}`]).catch(() => {});
    else openReader(this.root, rel);
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
        let res, error = null;
        try { res = await searchVault(root, q); } catch (e) { res = []; error = String(e?.message ?? e); }
        if (seq !== this.searchSeq) return;
        this.results = res;
        this.searchError = error;
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
        .child(svg("mods/workspace-chrome/search.svg").size(13).flex_none().text_color(t.dim))
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
    const status = this.searchError ? `Search failed: ${this.searchError}`
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

  async addVault() {
    const folder = await pickFolder({ prompt: "Add vault" });
    if (!folder) return;
    const path = folder.replace(/\/+$/, "");
    if (!(await fs.exists(`${path}/.obsidian`).catch(() => false))) {
      notify({ title: "Not an Obsidian vault", body: `${tilde(path)} has no .obsidian folder. Pick the vault's own folder (open it in Obsidian once if it's new).`, level: "warning" });
      return;
    }
    const list = this.list().filter((v) => v.path !== path);
    setShared("vault.list", [...list, { path, name: nameOf(path) }]);
    setShared("vault.current", path);
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
          openOverlay({ mod: "vault", kind: "popup", width: MENU_W, at, props: { menu: true } });
        })
        .tooltip(cur ? tilde(cur.path) : "No vault yet")
        .child(image("mods/vault/obsidian.png").w(15).h(15).flex_none())
        .child(div().min_w(0).truncate().font_semibold().child(cur?.name ?? "No vault"))
        .child(svg(`${ICON}/chevron-down.svg`).size(12).flex_none().text_color(t.dim)))
      .child(h_flex().id("vault-add").h(28).px(8).gap(5).flex_none().items_center().rounded(6).cursor_pointer()
        .text_size(12).text_color(t.muted).hover((el) => el.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => cx.spawn(async () => this.addVault()))
        .tooltip("Pick a vault folder in Finder")
        .child(svg(`${ICON}/plus.svg`).size(13)).child("Add vault"));
  }

  empty(t) {
    return v_flex().flex_1().p(16).gap(10).text_size(12.5).text_color(t.dim)
      .child("No vault yet. Add one to browse its notes here; clicking a note opens it rendered.")
      .child(h_flex().id("vault-add-empty").h(30).px(12).gap(6).items_center().self_start().rounded(6).cursor_pointer()
        .bg(t.raised).text_color(t.foreground).hover((el) => el.bg(t.hover))
        .on_click((_e, cx) => cx.spawn(async () => this.addVault()))
        .child(svg(`${ICON}/plus.svg`).size(13)).child("Add vault"));
  }

  tree(t) {
    const rows = this.rows("", 0, [], t);
    return v_flex().id("vault-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6).children(rows)
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
    return out;
  }

  // The selector's popup: every vault, the selected one checked; ✕ removes one
  // from this list (the folder stays); + Add vault at the end.
  menu(p) {
    const t = theme();
    const cur = this.current()?.path;
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
      .child(div().h(1).mx(4).my(3).bg(t.border))
      .child(h_flex().id("vm-add").px(8).py(6).gap(8).items_center().rounded(6).cursor_pointer().text_size(12.5).text_color(t.muted)
        .hover((el) => el.bg(t.hover).text_color(t.foreground))
        .on_click(() => { closeOverlay(p.overlay); run("vault.add"); })
        .child(svg(`${ICON}/plus.svg`).size(13).flex_none()).child("Add vault…"));
  }
}
