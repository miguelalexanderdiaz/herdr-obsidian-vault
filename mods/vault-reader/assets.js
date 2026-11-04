// Pictures for the reader: the Herdr-facing glue. The logic is in assets-core.js (and the
// per-OS parts in platform.js) so node can test it; this file only hands it the real
// exec, fs, home and platform, on first use (not at import time).

import { exec, appHome, home, window } from "herdr";
import * as fs from "fs/promises";
import { createAssets, hash, themeKey, REL } from "./assets-core.js";

export { hash, themeKey, REL };

// One instance per app folder and platform (constant while Herdr runs; tests change them).
let assets = null, assetsKey = "";
const get = () => {
  const key = `${appHome()}|${window().platform}`;
  if (assets && key === assetsKey) return assets;
  assetsKey = key;
  return (assets = build());
};
const build = () => createAssets({
  exec,
  appHome: appHome(),
  home: home(),
  platform: window().platform,
  fs: {
    readFile: (p) => fs.readFile(p),
    readText: (p) => fs.readFile(p, "utf8"),
    writeFile: (p, data) => fs.writeFile(p, data),
    exists: (p) => fs.exists(p),
    mkdir: (p, o) => fs.mkdir(p, o),
    unlink: (p) => fs.unlink(p),
    rmdir: (p) => fs.rmdir(p),
    readdir: (p) => fs.readdir(p),
  },
});

export const platform = () => get().platform;
export const stamps = (paths) => get().stamps(paths);
export const vaultImage = (file, stamp) => get().vaultImage(file, stamp);
export const pdfPage = (file, stamp) => get().pdfPage(file, stamp);
export const pdfInfo = (file, stamp) => get().pdfInfo(file, stamp);
export const pdfPageAt = (file, stamp, n) => get().pdfPageAt(file, stamp, n);
export const remoteImage = (url) => get().remoteImage(url);
export const svgFile = (text) => get().svgFile(text);
export const renderJobs = (jobs, theme, onBatch) => get().renderJobs(jobs, theme, onBatch);
export const pruneCache = () => get().pruneCache();
export const loadSettings = () => get().loadSettings();
export const saveSettings = (patch) => get().saveSettings(patch);
export const openTarget = (target) => get().openTarget(target);
export const findTool = (name) => get().tool(name);
