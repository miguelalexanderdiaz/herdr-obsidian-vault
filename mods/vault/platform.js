// Everything that differs between macOS, Linux and Windows for this mod lives in this file:
// how to open a file, where tools (ripgrep) are installed, where Obsidian keeps its vault list,
// what to tell the person when something is missing. Pure: no Herdr imports, so node can test it
// (tests/platform.test.mjs) with a fake exec and a fake platform.
//
// The parts shared with mods/vault-reader/platform.js are copied verbatim (mods are self-contained
// folders); tests/platform.test.mjs checks the copies are identical. Edit both together.

// "macos" | "linux" | "windows" (as herdr's window().platform), from any spelling.
export function normPlatform(p) {
  const s = String(p ?? "").toLowerCase();
  if (s === "macos" || s === "darwin" || s === "mac") return "macos";
  if (s === "windows" || s === "win32" || s === "win") return "windows";
  return "linux";
}

// ---- paths ----------------------------------------------------------------

// Forward slashes, no trailing slash (the root "/" and "C:/" keep theirs). Backslashes are separators
// only in Windows paths ("C:\\..." or "\\\\server\\..."); in a POSIX name they are part of it.
export function normPath(p) {
  let s = String(p ?? "");
  if (/^[A-Za-z]:[\\/]|^\\\\/.test(s)) s = s.replace(/\\/g, "/");
  s = s.replace(/\/{2,}/g, "/");
  if (s.length > 1 && s.endsWith("/") && !/^[A-Za-z]:\/$/.test(s)) s = s.slice(0, -1);
  return s;
}

export const nameOf = (p) => normPath(p).split("/").filter(Boolean).pop() ?? String(p);

// ~ for the home folder in a path shown to the person.
export function tilde(p, home) {
  const path = normPath(p), h = normPath(home ?? "");
  if (h && (path === h || path.startsWith(h + "/"))) return "~" + path.slice(h.length);
  return path;
}

// The path of `p` inside `root` ("a/b.md"), or null when it is outside. Both are
// normalized first, so Windows separators from watchFolder() and pickFolder() work.
export function relOf(root, p) {
  const r = normPath(root), q = normPath(p);
  if (q === r) return "";
  return q.startsWith(r + "/") ? q.slice(r.length + 1) : null;
}

// ---- opening files ---------------------------------------------------------

// The program and arguments that open `target` (a file or an http/https/mailto URL) with the
// system's default app. Windows uses rundll32's FileProtocolHandler rather than `cmd /c start`:
// cmd would read an "&" in a URL as the start of another command.
export function openCommand(platform, target) {
  switch (normPlatform(platform)) {
    case "macos": return ["open", [target]];
    case "windows": return ["rundll32", ["url.dll,FileProtocolHandler", target]];
    default: return ["xdg-open", [target]];
  }
}

// Files that start a program when the system opens them. A note can link to any file of a vault
// someone else shared; the reader opens documents, not programs.
const PROGRAM_EXT = /\.(app|command|tool|workflow|action|terminal|scpt|scptd|sh|bash|zsh|fish|csh|bat|cmd|com|exe|msi|msp|scr|pif|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|lnk|url|reg|hta|jar|desktop|appimage|run|bin|pkg|dmg|deb|rpm|apk|py|pl|rb|php)$/i;
export const canOpen = (file) => !PROGRAM_EXT.test(String(file ?? ""));

// PDFs and pictures open in Preview on macOS (as the button says), elsewhere in the default app.
export function previewCommand(platform, target) {
  return normPlatform(platform) === "macos" ? ["open", ["-a", "Preview", target]] : openCommand(platform, target);
}
export const previewName = (platform) => (normPlatform(platform) === "macos" ? "Preview" : "your default app");
export const previewLabel = (platform) => (normPlatform(platform) === "macos" ? "Open in Preview" : "Open in the default app");

// Keyboard: the back shortcut as shown in a tooltip, per OS. Alt+Left and Backspace work everywhere.
export const backHint = (platform) => (normPlatform(platform) === "macos" ? "Back (⌘[, Alt+Left)" : "Back (Alt+Left)");
// Is this key event "go back"? e: { key, modifiers: { alt, platform } }
export function isBackKey(platform, e) {
  const k = e?.key, m = e?.modifiers ?? {};
  if (k === "backspace") return true;
  if (k === "left" && m.alt) return true;
  return k === "[" && Boolean(m.platform) && normPlatform(platform) === "macos";
}

// ---- programs ----------------------------------------------------------------

// Arguments that make a tool print its version and exit 0 (Poppler uses -v).
const VERSION_ARGS = { pdftoppm: ["-v"], pdfinfo: ["-v"] };
export const versionArgs = (name) => VERSION_ARGS[name] ?? ["--version"];

// Homebrew on Linux installs under its own user's home (written in parts: it is not a person's path).
const LINUXBREW = ["", "home", "linuxbrew", ".linuxbrew", "bin"].join("/");

// Where a tool may live when the app's PATH doesn't have it: tried after the bare name.
export function toolCandidates(platform, name, home) {
  const h = normPath(home ?? "");
  switch (normPlatform(platform)) {
    case "macos":
      return [name, `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `/opt/local/bin/${name}`, `${h}/.nix-profile/bin/${name}`, `${h}/.volta/bin/${name}`];
    case "windows": {
      const exe = `${name}.exe`;
      const list = [name, `${h}/scoop/shims/${exe}`, `${h}/AppData/Local/Microsoft/WinGet/Links/${exe}`, `C:/ProgramData/chocolatey/bin/${exe}`,
        `${h}/.volta/bin/${exe}`];
      if (name === "node") list.push("C:/Program Files/nodejs/node.exe");
      if (name === "pdftoppm" || name === "pdfinfo") list.push(`${h}/scoop/apps/poppler/current/Library/bin/${exe}`, `C:/Program Files/poppler/Library/bin/${exe}`, `C:/Program Files/poppler/bin/${exe}`);
      if (name === "rg") list.push(`C:/Program Files/ripgrep/${exe}`);
      return list;
    }
    default:
      return [name, `/usr/local/bin/${name}`, `/usr/bin/${name}`, `/bin/${name}`, `/snap/bin/${name}`, `${LINUXBREW}/${name}`,
        `${h}/.nix-profile/bin/${name}`, `${h}/.local/bin/${name}`, `${h}/.volta/bin/${name}`];
  }
}

// Node installed by a version manager: dirs under home whose bin/node may exist.
export function nodeManagerDirs(platform, home) {
  const h = normPath(home ?? "");
  return normPlatform(platform) === "windows"
    ? [`${h}/AppData/Roaming/nvm`, `${h}/AppData/Local/fnm_multishells`]
    : [`${h}/.nvm/versions/node`, `${h}/.local/share/fnm/node-versions`, `${h}/.fnm/node-versions`, `${h}/.asdf/installs/nodejs`];
}

// Highest version folder name first: "v22.14.0" before "v20.11.1".
export function newestFirst(names) {
  const key = (n) => (String(n).match(/\d+/g) ?? []).slice(0, 3).map((x) => String(x).padStart(6, "0")).join(".");
  return [...names].sort((a, b) => key(b).localeCompare(key(a)));
}

// → path to a working `name`, or null. exec(cmd, args) → { code, stdout } (rejects when it can't start).
// readdir(dir) → names | rejects, optional: used for Node version managers.
export async function findTool({ name, platform, home, exec, readdir, via = true }) {
  const p = normPlatform(platform);
  const probe = async (bin) => {
    const r = await exec(bin, versionArgs(name)).catch(() => null);
    return r?.code === 0;
  };
  for (const bin of toolCandidates(p, name, home)) if (await probe(bin)) return bin;
  if (readdir && name === "node") {
    for (const dir of nodeManagerDirs(p, home)) {
      const names = await readdir(dir).catch(() => []);
      for (const v of newestFirst(names)) {
        const nested = p === "windows" ? `${dir}/${v}/node.exe` : `${dir}/${v}/bin/node`;
        if (await probe(nested)) return nested;
        const flat = `${dir}/${v}/installation/bin/node`;
        if (p !== "windows" && await probe(flat)) return flat;
      }
    }
  }
  if (via) {
    // The system's own lookup: where.exe on Windows; on macOS/Linux the person's login shell,
    // which has the PATH their terminal has (nvm, Homebrew, mise ...).
    const r = p === "windows"
      ? await exec("where", [name]).catch(() => null)
      : await exec("sh", ["-c", `exec "\${SHELL:-sh}" -lc 'command -v ${name}'`]).catch(() => null);
    const first = (r?.stdout ?? "").split(/\r?\n/).map((s) => s.trim()).find((s) => /^([A-Za-z]:|\/)/.test(s));
    if (r?.code === 0 && first && await probe(first)) return first;
  }
  return null;
}

// A tool finder with a cache: found stays found; a miss is forgotten after `missTtl` ms, so
// installing the tool while Herdr runs works without a restart.
export function makeToolFinder(opts) {
  const { now = () => Date.now(), missTtl = 30_000 } = opts;
  const cache = new Map();
  return async (name) => {
    const hit = cache.get(name);
    if (hit && (hit.path || now() - hit.at < missTtl)) return hit.path;
    const path = await findTool({ ...opts, name });
    cache.set(name, { path, at: now() });
    return path;
  };
}

// Node 22 or newer: "v22.14.0" → true.
export function nodeOk(versionText) {
  const m = String(versionText ?? "").match(/v?(\d+)\./);
  return Boolean(m) && Number(m[1]) >= 22;
}

// ---- what to tell the person ----------------------------------------------------

const HINTS = {
  rg: { macos: "brew install ripgrep", linux: "install ripgrep with your package manager (for example: apt install ripgrep)", windows: "winget install BurntSushi.ripgrep.MSVC" },
  poppler: { macos: "brew install poppler", linux: "install poppler-utils with your package manager (for example: apt install poppler-utils)", windows: "scoop install poppler" },
  node: { macos: "brew install node", linux: "install Node.js 22 or newer (nodejs.org, or your package manager)", windows: "winget install OpenJS.NodeJS" },
  curl: { macos: "curl ships with macOS", linux: "install curl with your package manager (for example: apt install curl)", windows: "curl ships with Windows 10 and newer" },
  browser: { macos: "install Google Chrome, Chromium, Brave or Microsoft Edge", linux: "install Chrome, Chromium, Brave or Microsoft Edge", windows: "Microsoft Edge is built into Windows; or install Chrome or Brave" },
  obsidian: { macos: "install the Obsidian app (obsidian.md)", linux: "install the Obsidian app (obsidian.md)", windows: "install the Obsidian app (obsidian.md)" },
};

// → "<what> isn't installed: <hint>" for the UI. what: rg | poppler | node | curl | browser | obsidian.
export function missingMessage(platform, what) {
  const names = { rg: "ripgrep (rg)", poppler: "Poppler (pdftoppm, pdfinfo)", node: "Node.js 22 or newer", curl: "curl", browser: "A Chromium-based browser", obsidian: "The Obsidian app" };
  const hint = HINTS[what]?.[normPlatform(platform)] ?? "";
  const lead = what === "browser" || what === "obsidian" ? `${names[what]} wasn't found` : `${names[what] ?? what} isn't installed`;
  return hint ? `${lead}: ${hint}` : lead;
}

// ---- Obsidian's vault list -------------------------------------------------------------------

// Where Obsidian keeps obsidian.json (the list of vaults it knows), most likely first. All of
// them are inside the home folder, which is all a mod may read.
export function obsidianConfigCandidates(platform, home) {
  const h = normPath(home ?? "");
  switch (normPlatform(platform)) {
    case "macos": return [`${h}/Library/Application Support/obsidian/obsidian.json`];
    case "windows": return [`${h}/AppData/Roaming/obsidian/obsidian.json`];
    default: return [`${h}/.config/obsidian/obsidian.json`, `${h}/.var/app/md.obsidian.Obsidian/config/obsidian/obsidian.json`,
      `${h}/snap/obsidian/current/.config/obsidian/obsidian.json`];
  }
}
