// The stubs must be able to fail (R2-CR-2): a misspelt gpui-kit method, a node-only fs function.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { el, allowed } from "./stubs/element.mjs";
import * as hfs from "./stubs/fs-promises.mjs";
import { methodNames } from "./tools/gen-gpui-methods.mjs";

test("element stub: a real method chains, a misspelt one throws (seeded fault)", () => {
  assert.doesNotThrow(() => el().flex().flex_col().gap_2().child("x").on_click(() => {}));
  assert.throws(() => el().flex_onee(), /no method "flex_onee"/);
  assert.throws(() => el().on_clik(() => {}), /no method "on_clik"/);
});

test("element stub: await on an element does not trip the strict check (then is passive)", async () => {
  assert.equal(typeof (await Promise.resolve(el())), "function");
});

test("committed method list matches the d.ts when this machine has it", (t) => {
  if (!allowed.source.endsWith(".d.ts")) return t.skip("no gpui-kit.d.ts on this machine: the committed list is in use");
  const committed = JSON.parse(fs.readFileSync(new URL("./stubs/gpui-methods.json", import.meta.url), "utf8")).names;
  const live = methodNames(fs.readFileSync(allowed.source, "utf8"));
  const missing = live.filter((n) => !committed.includes(n));
  assert.deepEqual(missing, [], "Herdr added element methods: node tests/tools/gen-gpui-methods.mjs");
});

test("fs stub: only Herdr's seven functions", () => {
  assert.deepEqual(Object.keys(hfs).sort(), ["exists", "mkdir", "readFile", "readdir", "rmdir", "unlink", "writeFile"]);
});

test("methodNames reads NativeElement and its extensions only", () => {
  const dts = ["declare module \"gpui-kit\" {", "  export interface NativeElement {", "    foo<T>(x: T): this;", "    /** doc */", "    bar(): this;", "  }", "  export interface Other {", "    nope(): void;", "  }", "  export interface TextViewElement extends NativeElement {", "    baz(): this;", "  }", "}"].join("\n");
  assert.deepEqual(methodNames(dts), ["bar", "baz", "foo"]);
});
