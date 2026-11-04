// Regenerates tests/stubs/gpui-methods.json: the method names a gpui-kit element offers, read from Herdr's
// own gpui-kit.d.ts (R2-CR-2). Run by hand after Herdr updates:
//   node tests/tools/gen-gpui-methods.mjs [path/to/gpui-kit.d.ts]
// The d.ts is looked up in $HERDR_APP_HOME, then ~/.config/herdr-app. Plain Node; not part of any mod.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "stubs", "gpui-methods.json");

export function findDts() {
  const roots = [process.env.HERDR_APP_HOME, path.join(os.homedir(), ".config", "herdr-app")].filter(Boolean);
  for (const r of roots) { const p = path.join(r, "gpui-kit.d.ts"); if (fs.existsSync(p)) return p; }
  return null;
}

// Method names of `NativeElement` and of every interface in the module that extends it.
export function methodNames(dts) {
  const lines = dts.split("\n");
  const names = new Set();
  let inside = false;
  for (const line of lines) {
    const head = line.match(/^  export interface (\w+)(?:<[^>]*>)?(?: extends ([^{]*))?\s*\{/);
    if (head) { inside = head[1] === "NativeElement" || /\bNativeElement\b/.test(head[2] ?? ""); continue; }
    if (inside && line === "  }") { inside = false; continue; }
    if (inside) {
      const m = line.match(/^    ([A-Za-z_]\w*)\s*[<(]/);
      if (m) names.add(m[1]);
    }
  }
  return [...names].sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? findDts();
  if (!file) { console.error("gpui-kit.d.ts not found (set HERDR_APP_HOME or pass a path)"); process.exit(1); }
  const names = methodNames(fs.readFileSync(file, "utf8"));
  const version = (fs.readFileSync(file, "utf8").match(/for (gpui-shell [\d.]+)/) ?? [])[1] ?? "unknown";
  fs.writeFileSync(OUT, JSON.stringify({ source: `gpui-kit.d.ts of ${version}`, names }, null, 1) + "\n");
  console.log(`${names.length} names written to ${path.relative(process.cwd(), OUT)} (${version})`);
}
