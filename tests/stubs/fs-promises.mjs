// node's fs/promises plus the `exists` that Herdr's version has.
import * as real from "node:fs/promises";
export * from "node:fs/promises";
export const exists = (p) => real.access(p).then(() => true, () => false);
