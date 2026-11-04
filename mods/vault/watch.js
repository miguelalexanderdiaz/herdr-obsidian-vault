// A folder watcher that can be restarted, stopped and survives a bad batch. The same file is in
// mods/vault and mods/vault-reader (a mod folder is self-contained); tests/watch.test.mjs checks
// they are identical. Pure: herdr's watchFolder is passed in.
//
// watchFolder() waits for the next batch of changed paths under a folder. On Linux it rejects for
// trees of more than 4096 directories: onFail runs then, and the mod falls back to a timer
// (POLL_MS) and says so (LIVE_OFF) instead of going quietly stale.

export const POLL_MS = 10_000;
export const LIVE_OFF = "Live updates are off for this folder (too many sub-folders to watch): checking every 10 seconds.";

export class Watcher {
  constructor(watch) {
    this.watch = watch;
    this.id = 0;
  }

  // Starts watching `root`; an earlier loop (same folder or another) ends at its next wake-up.
  // Resolves when this loop ends.
  async start(root, { onBatch, onFail } = {}) {
    const id = ++this.id;
    const alive = () => id === this.id;
    while (alive()) {
      let changed;
      try { changed = await this.watch(root); }
      catch (e) { if (alive()) { try { onFail?.(e); } catch { /* the caller's problem, not the loop's */ } } return; }
      if (!alive()) return;
      try { await onBatch?.(changed); } catch { /* one bad batch must not end the watch */ }
    }
  }

  stop() { this.id++; }
}
