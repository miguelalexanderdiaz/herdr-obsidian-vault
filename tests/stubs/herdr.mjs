// Just enough of the `herdr` module for tests. Tests set state through `herdrTest`.
import fs from "node:fs";

export const herdrTest = {
  props: {}, platform: "linux", home: "/home/user", appHome: "/tmp/herdr-test-app",
  exec: async () => { throw new Error("spawn ENOENT"); },
  shared: new Map(), overlays: [], notices: [], runs: [],
  pickFolder: async () => null,
  commands: [], // queued for nextCommand(); when empty it waits forever
  watch: () => new Promise(() => {}),
};
export const props = () => herdrTest.props;
export const theme = () => ({ foreground: "#fff", background: "#000", muted: "#999", accent: "#fa0", surface: "#111", raised: "#222", border: "#333", dim: "#777", hover: "#222", selected: "#333", chrome: "#000", blocked: "#f00" });
export const exec = (...a) => herdrTest.exec(...a);
export const home = () => herdrTest.home;
export const appHome = () => herdrTest.appHome;
export const window = () => ({ platform: herdrTest.platform });
export const settings = () => ({ zoom: 1, dark: true });
export const readTextFile = async (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
export const watchFolder = (p) => herdrTest.watch(p);
export const nextCommand = () => (herdrTest.commands.length ? Promise.resolve(herdrTest.commands.shift()) : new Promise(() => {}));
export const shared = (k) => herdrTest.shared.get(k);
export const setShared = (k, v) => { herdrTest.shared.set(k, v); };
export const openOverlay = (spec) => { herdrTest.overlays.push(spec); return "o1"; };
export const closeOverlay = () => {};
export const run = (...a) => { herdrTest.runs.push(a); };
export const notify = (n) => { herdrTest.notices.push(n); };
export const panes = () => [];
export const spaces = () => [];
export const focused = () => null;
export const pickFolder = (o) => herdrTest.pickFolder(o);
