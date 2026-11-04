// A module-resolution hook for tests: the Herdr-only specifiers resolve to the stubs next to it, so
// node can load a mod's main.js (tests/reader-main.test.mjs).
const STUBS = { herdr: "./herdr.mjs", "gpui-kit": "./gpui-kit.mjs", "gpui-base": "./gpui-base.mjs", "fs/promises": "./fs-promises.mjs" };
export async function resolve(specifier, context, next) {
  if (specifier in STUBS) return { url: new URL(STUBS[specifier], import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
