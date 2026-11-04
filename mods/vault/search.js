// Full-text search in a vault: the Herdr-facing glue. The logic is in search-core.js.

import { exec, home, window } from "herdr";
import * as fs from "fs/promises";
import { makeToolFinder, normPlatform } from "./platform.js";
import { searchWith, snippet } from "./search-core.js";

export { snippet };

let deps = null;
const get = () => (deps ??= {
  exec,
  platform: normPlatform(window().platform),
  tool: makeToolFinder({ platform: window().platform, home: home(), exec, readdir: (p) => fs.readdir(p) }),
  cache: new Map(), // vault → its file list, until the vault changes
});

// → [{ rel, line?, text? }] (rel: path in the vault), or throws.
export const searchVault = (root, query) => searchWith(get(), root, query);

// The vault changed: its file list is read again by the next search.
export const forgetFiles = (root) => get().cache.delete(root);

// Is ripgrep installed? (the panel can say so before the first search)
export const hasRipgrep = () => get().tool("rg").then(Boolean);
