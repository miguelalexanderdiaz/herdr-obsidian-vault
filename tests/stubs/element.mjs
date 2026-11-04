// A stand-in for gpui-kit elements: every method returns the element, `when` and `hover` run their
// callback (so drawing code inside them is exercised), the rest is ignored. Counts what was built.
//
// Strict (R2-CR-2): a method name that gpui-kit does not have throws, so a misspelling fails the suite.
// The allow-list is read from Herdr's gpui-kit.d.ts when the machine has it (a developer's machine), and
// from the committed tests/stubs/gpui-methods.json otherwise (CI). Regenerate with tests/tools/gen-gpui-methods.mjs.
import fs from "node:fs";
import { findDts, methodNames } from "../tools/gen-gpui-methods.mjs";

function loadAllowed() {
  try {
    const dts = findDts();
    if (dts) return { names: new Set(methodNames(fs.readFileSync(dts, "utf8"))), source: dts };
  } catch { /* fall through to the committed list */ }
  const json = JSON.parse(fs.readFileSync(new URL("./gpui-methods.json", import.meta.url), "utf8"));
  return { names: new Set(json.names), source: "tests/stubs/gpui-methods.json" };
}
export const allowed = loadAllowed();
if (allowed.names.size < 1000) throw new Error(`element stub: only ${allowed.names.size} gpui-kit method names loaded from ${allowed.source}`);

// Keys the runtime itself reads off any object (promise checks, JSON, inspection): not element methods.
const PASSIVE = new Set(["then", "toJSON", "constructor", "prototype", "length", "name", "asymmetricMatch", "nodeType", "$$typeof"]);

export const built = { count: 0, text: [] };
export function el() {
  built.count++;
  const target = function () {};
  const proxy = new Proxy(target, {
    get(_t, key) {
      if (typeof key === "symbol") return key === Symbol.toPrimitive ? () => "[element]" : undefined;
      if (PASSIVE.has(key)) return undefined;
      if (!allowed.names.has(key)) throw new TypeError(`gpui-kit element has no method "${key}" (checked against ${allowed.source})`);
      if (key === "when") return (cond, fn) => { if (cond) fn(proxy); return proxy; };
      if (key === "hover") return (fn) => { fn(proxy); return proxy; };
      if (key === "child") return (c) => { if (typeof c === "string") built.text.push(c); return proxy; };
      if (key === "children") return (list) => { for (const c of list ?? []) if (typeof c === "string") built.text.push(c); return proxy; };
      return () => proxy;
    },
    apply() { return proxy; },
  });
  return proxy;
}
