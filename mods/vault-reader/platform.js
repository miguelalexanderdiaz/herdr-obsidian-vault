// Everything that differs between macOS, Linux and Windows lives in this file:
// how to open a file, how to read file stamps, where tools are installed, what to
// tell the person when one is missing. Pure: no Herdr imports, so node can test it
// (tests/platform.test.mjs) with a fake exec and a fake platform.
//
// mods/vault/platform.js holds a copy of the parts that mod needs (mods are
// self-contained folders). tests/platform.test.mjs checks the shared parts match.

// "macos" | "linux" | "windows" (as herdr's window().platform), from any spelling.
export function normPlatform(p) {
  const s = String(p ?? "").toLowerCase();
  if (s === "macos" || s === "darwin" || s === "mac") return "macos";
  if (s === "windows" || s === "win32" || s === "win") return "windows";
  return "linux";
}

// ---- paths ----------------------------------------------------------------

// Forward slashes, no trailing slash (the root "/" and "C:/" keep theirs).
export function normPath(p) {
  let s = String(p ?? "").replace(/\\/g, "/").replace(/\/{2,}/g, "/");
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

// ---- file stamps (mtime:size) ----------------------------------------------

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Commands to try, in order, that print "<mtime>:<size> <path>" per file. The stamp
// only has to change when the file does. variant 0 is the platform's own stat.
export function statCommand(platform, paths, variant = 0) {
  const p = normPlatform(platform);
  if (p === "windows") {
    const script = `$ErrorActionPreference='SilentlyContinue'; Get-Item -LiteralPath ${paths.map(psQuote).join(",")} | ForEach-Object { "$($_.LastWriteTimeUtc.Ticks):$($_.Length) $($_.FullName)" }`;
    return ["powershell", ["-NoProfile", "-NonInteractive", "-Command", script]];
  }
  const bsd = ["stat", ["-f", "%m:%z %N", ...paths]];
  const gnu = ["stat", ["-c", "%Y:%s %n", ...paths]];
  return (p === "macos") === (variant === 0) ? bsd : gnu;
}
export const statVariants = (platform) => (normPlatform(platform) === "windows" ? 1 : 2);

// stdout of statCommand → Map(path as given → "mtime:size"). Paths come back as the OS
// prints them; they are matched to the ones asked for by normalized spelling.
export function parseStat(stdout, paths) {
  const asked = new Map(paths.map((p) => [normPath(p), p]));
  const res = new Map();
  for (const line of String(stdout ?? "").split(/\r?\n/)) {
    const m = line.match(/^(\d+:\d+) (.+)$/);
    if (!m) continue;
    const given = asked.get(normPath(m[2]));
    if (given != null) res.set(given, m[1]);
  }
  return res;
}

// Stamps for many files at once. exec(cmd, args) → { code, stdout }.
export async function stampsOf(platform, paths, exec) {
  if (!paths.length) return new Map();
  for (let v = 0; v < statVariants(platform); v++) {
    const [cmd, args] = statCommand(platform, paths, v);
    const r = await exec(cmd, args).catch(() => null);
    const got = parseStat(r?.stdout, paths);
    if (got.size) return got;
  }
  return new Map();
}

// ---- image headers (replaces sips) -------------------------------------------

const be32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le16 = (b, i) => b[i] | (b[i + 1] << 8);
const le24 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const le32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const ascii = (b, i, n) => String.fromCharCode(...b.slice(i, i + n));

// The size of a raster image from its first bytes: { type, w, h } or null.
// type: "png" | "jpg" | "gif" | "webp" | "bmp". (SVG is handled by svgSize.)
export function imageInfo(bytes) {
  const b = bytes;
  if (!b || b.length < 12) return null;
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b.length >= 24) return { type: "png", w: be32(b, 16), h: be32(b, 20) };
  if (ascii(b, 0, 3) === "GIF") return { type: "gif", w: le16(b, 6), h: le16(b, 8) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = (b[i + 2] << 8) | b[i + 3];
      const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (sof) return { type: "jpg", w: (b[i + 7] << 8) | b[i + 8], h: (b[i + 5] << 8) | b[i + 6] };
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP" && b.length >= 30) {
    const fmt = ascii(b, 12, 4);
    if (fmt === "VP8X") return { type: "webp", w: le24(b, 24) + 1, h: le24(b, 27) + 1 };
    if (fmt === "VP8 ") return { type: "webp", w: le16(b, 26) & 0x3fff, h: le16(b, 28) & 0x3fff };
    if (fmt === "VP8L") {
      const bits = le32(b, 21);
      return { type: "webp", w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (b[0] === 0x42 && b[1] === 0x4d && b.length >= 26) {
    const h = le32(b, 22) | 0;
    return { type: "bmp", w: le32(b, 18), h: Math.abs(h) };
  }
  return null;
}

// The size an SVG declares (width/height, else viewBox), or a default.
export function svgSize(text) {
  const head = String(text ?? "").slice(0, 2000);
  const num = (re) => Number((head.match(re) || [])[1]) || null;
  let w = num(/<svg[^>]*\swidth="([\d.]+)(?:px)?"/), h = num(/<svg[^>]*\sheight="([\d.]+)(?:px)?"/);
  const vb = head.match(/viewBox="[\d.\-]+[ ,]+[\d.\-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/);
  if ((!w || !h) && vb) { w = Number(vb[1]); h = Number(vb[2]); }
  return { w: w ?? 400, h: h ?? 300 };
}
export const looksLikeSvg = (text) => /<svg[\s>]/i.test(String(text ?? "").slice(0, 2000));

// macOS only, and only as fallbacks: sips reads the size of formats imageInfo() doesn't (AVIF, TIFF),
// Quick Look draws a PDF's first page when Poppler is not installed.
export const macImageSizeCommand = (file) => ["sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]];
export const macThumbnailCommand = (outDir, file) => ["qlmanage", ["-t", "-s", "2400", "-o", outDir, file]];

// ---- programs ----------------------------------------------------------------

// Arguments that make a tool print its version and exit 0 (Poppler uses -v).
const VERSION_ARGS = { pdftoppm: ["-v"], pdfinfo: ["-v"] };
export const versionArgs = (name) => VERSION_ARGS[name] ?? ["--version"];

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
      return [name, `/usr/local/bin/${name}`, `/usr/bin/${name}`, `/bin/${name}`, `/snap/bin/${name}`, `/home/linuxbrew/.linuxbrew/bin/${name}`,
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

// What the renderer (render/render.mjs) can fail with → one plain sentence, never a path or raw JSON.
// err: { error: kind | message } from the renderer's JSON, or a thrown message.
export function renderProblem(platform, err) {
  const text = String(typeof err === "string" ? err : err?.error ?? err?.message ?? "");
  const kind = text.match(/^(needs-node-22|no-node|no-browser|no-obsidian|libs-not-ready|timeout|busy)\b/)?.[1]
    ?? (/WebSocket is not defined|needs-node/i.test(text) ? "needs-node-22"
      : /ENOENT.*(asar|Obsidian)|obsidian\.asar/i.test(text) ? "no-obsidian"
      : /No Chrome|no browser|Chrome didn't start|Chrome exited/i.test(text) ? "no-browser"
      : /spawn node|node: not found|node.*ENOENT/i.test(text) ? "no-node" : null);
  switch (kind) {
    case "needs-node-22": return `Diagrams and math need Node.js 22 or newer. ${missingMessage(platform, "node")}`;
    case "no-node": return missingMessage(platform, "node") + ". Diagrams and math are shown as source until then.";
    case "no-browser": return `Diagrams and math need a browser to draw them. ${missingMessage(platform, "browser")}`;
    case "no-obsidian": return `Diagrams and math use Obsidian's own Mermaid and MathJax, read from the installed app. ${missingMessage(platform, "obsidian")}`;
    case "libs-not-ready": return "Mermaid and MathJax did not load in time. Try again in a moment.";
    case "timeout": return "Drawing took too long and was stopped. Open the note again to retry.";
    case "busy": return "Another window is drawing diagrams. Open the note again in a moment.";
    default: {
      // Unknown: keep it short and without paths.
      const first = text.split("\n")[0].replace(/(?:[A-Za-z]:)?[\\/][^\s"']+/g, "<path>").slice(0, 160);
      return first ? `Couldn't draw this: ${first}` : "Couldn't draw this";
    }
  }
}

// Candidate paths for the renderer (node resolves ~ and %VAR% and `*` itself; see render/lib.mjs).
export function obsidianAsarCandidates(platform) {
  switch (normPlatform(platform)) {
    case "macos": return ["/Applications/Obsidian.app/Contents/Resources/obsidian.asar", "~/Applications/Obsidian.app/Contents/Resources/obsidian.asar"];
    case "windows": return ["%LOCALAPPDATA%/Programs/Obsidian/resources/obsidian.asar", "%LOCALAPPDATA%/Obsidian/resources/obsidian.asar",
      "%ProgramFiles%/Obsidian/resources/obsidian.asar", "%ProgramFiles(x86)%/Obsidian/resources/obsidian.asar", "%ProgramW6432%/Obsidian/resources/obsidian.asar"];
    default: return ["/opt/Obsidian/resources/obsidian.asar", "/opt/obsidian/resources/obsidian.asar", "/usr/lib/obsidian/resources/obsidian.asar",
      "/usr/lib/obsidian/obsidian.asar", "/usr/share/obsidian/resources/obsidian.asar", "/snap/obsidian/current/resources/obsidian.asar",
      "/var/lib/flatpak/app/md.obsidian.Obsidian/current/active/files/obsidian/resources/obsidian.asar",
      "/var/lib/flatpak/app/md.obsidian.Obsidian/*/*/files/obsidian/resources/obsidian.asar",
      "~/.local/share/flatpak/app/md.obsidian.Obsidian/current/active/files/obsidian/resources/obsidian.asar"];
  }
}

export function browserCandidates(platform) {
  switch (normPlatform(platform)) {
    case "macos": return ["Google Chrome", "Chromium", "Brave Browser", "Microsoft Edge"].flatMap((n) =>
      [`/Applications/${n}.app/Contents/MacOS/${n}`, `~/Applications/${n}.app/Contents/MacOS/${n}`]);
    case "windows": return ["%ProgramFiles%", "%ProgramFiles(x86)%", "%LOCALAPPDATA%"].flatMap((root) => [
      `${root}/Microsoft/Edge/Application/msedge.exe`, `${root}/Google/Chrome/Application/chrome.exe`, `${root}/BraveSoftware/Brave-Browser/Application/brave.exe`,
      `${root}/Chromium/Application/chrome.exe`]);
    default: return [];
  }
}
// Names looked up on PATH (all OS).
export const browserNames = (platform) => (normPlatform(platform) === "windows"
  ? ["chrome", "msedge", "brave", "chromium"]
  : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "microsoft-edge-stable", "brave-browser"]);
