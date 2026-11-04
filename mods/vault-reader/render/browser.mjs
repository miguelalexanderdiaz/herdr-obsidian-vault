// The browser process of one render run: start it with its own profile folder, ask it to close, make sure
// it and its helper processes are gone, remove the profile. Plain Node (outside Herdr), with spawn and fs
// passed in so tests/browser.test.mjs can drive success, error and timeout without a real browser.
import { profileName, browserArgs } from "./lib.mjs";

// A problem that is not a bug: it is reported to the person as a plain sentence (no-browser, timeout ...).
export class Known extends Error {}

export function createBrowser({ spawn, spawnSync, fs, path, dataDir, pid, platform, startTimeoutMs = 15_000, exitWaitMs = 2_000 }) {
  let proc = null;
  let profile = null;
  const win = platform === "win32";

  // → the DevTools websocket URL once the browser prints it on stderr.
  function launch(bin) {
    // One profile per run: two readers drawing at once must not share one.
    profile = path.join(dataDir, profileName(pid));
    fs.mkdirSync(profile, { recursive: true });
    // detached on POSIX: the browser leads its own process group, so one signal reaches its helpers too.
    proc = spawn(bin, browserArgs(profile), { stdio: ["ignore", "ignore", "pipe"], detached: !win });
    return new Promise((ok, fail) => {
      let err = "";
      const t = setTimeout(() => fail(new Known("no-browser")), startTimeoutMs);
      proc.on("error", () => { clearTimeout(t); fail(new Known("no-browser")); });
      proc.stderr.on("data", (d) => {
        err += d;
        const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) { clearTimeout(t); ok(m[1]); }
      });
      proc.on("exit", () => { clearTimeout(t); fail(new Known("no-browser")); });
    });
  }

  const running = () => proc && proc.exitCode === null && proc.signalCode === null;

  // The whole process tree, now.
  function killTree() {
    if (!running()) return;
    try {
      if (win) spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(-proc.pid, "SIGKILL"); // the group; helpers die with the main process
    } catch {
      try { proc.kill("SIGKILL"); } catch { /* already gone */ }
    }
  }

  function removeProfile() {
    if (!profile) return;
    // maxRetries: on Windows a file can stay locked for a moment after its process ended.
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* best effort */ }
    profile = null;
  }

  // Synchronous and rough: for signals and the deadline timer, where the process may be killed next.
  function stopNow() {
    killTree();
    removeProfile();
  }

  // Polite first: `close` is the DevTools Browser.close call (or nothing), then wait for the exit, then the
  // tree is killed anyway so no helper recreates files in the profile, and only then is the profile removed.
  async function stop(close) {
    if (running()) {
      const exited = new Promise((ok) => proc.once("exit", ok));
      try { await Promise.race([Promise.resolve(close?.()).catch(() => {}), new Promise((ok) => setTimeout(ok, 500))]); } catch { /* closing is best effort */ }
      await Promise.race([exited, new Promise((ok) => setTimeout(ok, exitWaitMs))]);
    }
    killTree();
    removeProfile();
  }

  return { launch, stop, stopNow, profile: () => profile, process: () => proc };
}
