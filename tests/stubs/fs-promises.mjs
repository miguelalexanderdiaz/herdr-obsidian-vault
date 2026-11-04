// Herdr's `fs/promises` (gpui-kit.d.ts, module "fs/promises"): exactly seven functions. Anything else from
// node's fs (stat, rename, rm, copyFile, ...) is absent here as in Herdr, so a mod that calls it fails the
// suite instead of failing for the person (R2-CR-2).
import * as real from "node:fs/promises";
export const readFile = real.readFile;
export const writeFile = real.writeFile;
export const readdir = real.readdir;
export const unlink = real.unlink;
export const rmdir = real.rmdir;
export const mkdir = real.mkdir;
export const exists = (p) => real.access(p).then(() => true, () => false);
