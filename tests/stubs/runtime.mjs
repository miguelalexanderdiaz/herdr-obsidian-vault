// Import this first in a test that loads a mod's main.js: it removes what Herdr's runtime lacks, so a mod
// that reaches for it fails the test the way it fails in Herdr (R2-CR-2). Never restored: it applies to
// the whole test file (node --test runs each file in its own process).
for (const k of ["TextDecoder", "TextEncoder", "structuredClone"]) delete globalThis[k];
