import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as P from "../mods/vault-reader/platform.js";
import * as V from "../mods/vault/platform.js";
import { MODS, fakeExec, png, jpeg, gif, bmp, webpLossy, webpExt, webpLossless } from "./helpers.mjs";

const OS = ["macos", "linux", "windows"];

test("platform names from any spelling", () => {
  assert.deepEqual(["darwin", "macos", "win32", "windows", "linux", "freebsd", undefined].map(P.normPlatform), ["macos", "macos", "windows", "windows", "linux", "linux", "linux"]);
});

test("paths: backslashes, trailing slashes, ~, relOf", () => {
  assert.equal(P.normPath("C:\\Users\\me\\Notes\\"), "C:/Users/me/Notes");
  assert.equal(P.normPath("/a//b/"), "/a/b");
  assert.equal(P.normPath("/"), "/");
  assert.equal(P.normPath("/Users/me/odd\\name/"), "/Users/me/odd\\name", "a backslash in a POSIX name is part of it");
  assert.equal(P.normPath("C:\\"), "C:/");
  assert.equal(P.nameOf("C:\\Users\\me\\My Vault\\"), "My Vault");
  assert.equal(P.tilde("/home/me/Notes", "/home/me"), "~/Notes");
  assert.equal(P.tilde("/home/me" + "ow/Notes", "/home/me"), "/home/me" + "ow/Notes");
  assert.equal(P.tilde("C:\\Users\\me\\Notes", "C:\\Users\\me"), "~/Notes");
  assert.equal(P.relOf("C:/v", "C:\\v\\a\\b.md"), "a/b.md");
  assert.equal(P.relOf("/v", "/v"), "");
  assert.equal(P.relOf("/v", "/vault2/x"), null);
});

test("openCommand per OS (CR-1-3)", () => {
  assert.deepEqual(P.openCommand("macos", "/a/b.pdf"), ["open", ["/a/b.pdf"]]);
  assert.deepEqual(P.openCommand("linux", "/a/b.pdf"), ["xdg-open", ["/a/b.pdf"]]);
  // Windows: no cmd, so an "&" in a URL is not a second command.
  assert.deepEqual(P.openCommand("windows", "https://a/?x=1&calc"), ["rundll32", ["url.dll,FileProtocolHandler", "https://a/?x=1&calc"]]);
  assert.deepEqual(P.previewCommand("macos", "/a.png"), ["open", ["-a", "Preview", "/a.png"]]);
  assert.deepEqual(P.previewCommand("linux", "/a.png"), ["xdg-open", ["/a.png"]]);
  assert.equal(P.previewLabel("macos"), "Open in Preview");
  assert.equal(P.previewLabel("windows"), "Open in the default app");
});

test("programs are never opened from a note", () => {
  for (const f of ["x.command", "a/b.app", "setup.EXE", "run.sh", "x.bat", "y.ps1", "z.jar", "i.desktop", "link.lnk"]) assert.equal(P.canOpen(f), false, f);
  for (const f of ["a.pdf", "b.png", "c.docx", "d.xlsx", "e.txt", "f"]) assert.equal(P.canOpen(f), true, f);
});

test("back keys: Backspace and Alt+Left everywhere, Cmd+[ on macOS only (D4)", () => {
  assert.equal(P.isBackKey("linux", { key: "backspace", modifiers: {} }), true);
  assert.equal(P.isBackKey("windows", { key: "left", modifiers: { alt: true } }), true);
  assert.equal(P.isBackKey("macos", { key: "[", modifiers: { platform: true } }), true);
  assert.equal(P.isBackKey("windows", { key: "[", modifiers: { platform: true } }), false, "the Windows key is not Cmd");
  assert.equal(P.isBackKey("linux", { key: "left", modifiers: {} }), false);
  assert.match(P.backHint("macos"), /⌘\[/);
  assert.doesNotMatch(P.backHint("linux"), /⌘/);
});

test("stat commands and parsing for the three OSes", () => {
  assert.deepEqual(P.statCommand("macos", ["/a", "/b"]), ["stat", ["-f", "%m:%z %N", "/a", "/b"]]);
  assert.deepEqual(P.statCommand("linux", ["/a"]), ["stat", ["-c", "%Y:%s %n", "/a"]]);
  assert.deepEqual(P.statCommand("macos", ["/a"], 1), ["stat", ["-c", "%Y:%s %n", "/a"]], "GNU stat on a Mac as the second try");
  const [cmd, args] = P.statCommand("windows", ["C:/v/it's.md", "C:/v/b.md"]);
  assert.equal(cmd, "powershell");
  assert.match(args.at(-1), /Get-Item -LiteralPath 'C:\/v\/it''s\.md','C:\/v\/b\.md'/, "quotes doubled, no injection");
  // golden outputs
  const asked = ["/v/a b.png", "/v/c.pdf"];
  assert.deepEqual([...P.parseStat("1700000000:1234 /v/a b.png\n1700000001:99 /v/c.pdf\nsomething else\n", asked)], [["/v/a b.png", "1700000000:1234"], ["/v/c.pdf", "1700000001:99"]]);
  // Windows prints backslashes and ticks; the stamp is keyed by the path as asked
  const win = P.parseStat("638000000000000000:10 C:\\v\\a.png\r\n", ["C:/v/a.png"]);
  assert.equal(win.get("C:/v/a.png"), "638000000000000000:10");
  assert.equal(P.parseStat("1:2 /not/asked", ["/v/x"]).size, 0);
});

test("stampsOf tries the second stat flavour when the first prints nothing", async () => {
  const exec = fakeExec((cmd, args) => (args[0] === "-f" ? { code: 1, stdout: "", stderr: "stat: illegal option" } : { stdout: "5:6 /v/a\n" }));
  const got = await P.stampsOf("macos", ["/v/a"], exec);
  assert.equal(got.get("/v/a"), "5:6");
  assert.equal(exec.calls.length, 2);
  assert.equal((await P.stampsOf("linux", [], exec)).size, 0);
  const none = await P.stampsOf("linux", ["/v/a"], fakeExec(() => undefined));
  assert.equal(none.size, 0, "stat missing: an empty map, not a throw");
});

test("imageInfo reads PNG, JPEG, GIF, WebP and BMP headers", () => {
  assert.deepEqual(P.imageInfo(png(640, 480)), { type: "png", w: 640, h: 480 });
  assert.deepEqual(P.imageInfo(jpeg(321, 123)), { type: "jpg", w: 321, h: 123 });
  assert.deepEqual(P.imageInfo(gif(16, 9)), { type: "gif", w: 16, h: 9 });
  assert.deepEqual(P.imageInfo(webpLossy(100, 50)), { type: "webp", w: 100, h: 50 });
  assert.deepEqual(P.imageInfo(webpExt(1920, 1080)), { type: "webp", w: 1920, h: 1080 });
  assert.deepEqual(P.imageInfo(webpLossless(33, 77)), { type: "webp", w: 33, h: 77 });
  assert.deepEqual(P.imageInfo(bmp(10, 20)), { type: "bmp", w: 10, h: 20 });
  assert.equal(P.imageInfo(new TextEncoder().encode("<html>not an image</html>")), null);
  assert.equal(P.imageInfo(new Uint8Array(3)), null);
  assert.equal(P.imageInfo(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0, 0, 0, 0, 0])), null, "a JPEG with no frame header");
});

test("svgSize: width/height, else viewBox, else default", () => {
  assert.deepEqual(P.svgSize('<svg width="100px" height="50">'), { w: 100, h: 50 });
  assert.deepEqual(P.svgSize('<svg viewBox="0 0 24 12">'), { w: 24, h: 12 });
  assert.deepEqual(P.svgSize("<svg>"), { w: 400, h: 300 });
  assert.equal(P.looksLikeSvg('<?xml version="1.0"?><svg xmlns="x">'), true);
});

test("tool candidates: bare name first, per-OS install folders after", () => {
  for (const os of OS) assert.equal(P.toolCandidates(os, "rg", "/h")[0], "rg");
  assert.ok(P.toolCandidates("macos", "rg", "/Users/x").includes("/opt/homebrew/bin/rg"));
  assert.ok(P.toolCandidates("linux", "pdftoppm", "/home/x").includes("/usr/bin/pdftoppm"));
  assert.ok(P.toolCandidates("windows", "pdftoppm", "C:/Users/x").some((c) => c.endsWith("poppler/Library/bin/pdftoppm.exe")));
  assert.ok(P.toolCandidates("windows", "node", "C:/Users/x").includes("C:/Program Files/nodejs/node.exe"));
  assert.deepEqual(P.versionArgs("pdftoppm"), ["-v"]);
  assert.deepEqual(P.versionArgs("rg"), ["--version"]);
});

test("findTool: PATH, then known folders, then the system lookup", async () => {
  const onPath = fakeExec((cmd) => (cmd === "rg" ? { stdout: "ripgrep 14" } : undefined));
  assert.equal(await P.findTool({ name: "rg", platform: "linux", home: "/h", exec: onPath }), "rg");

  const brew = fakeExec((cmd) => (cmd === "/opt/homebrew/bin/rg" ? { stdout: "ok" } : undefined));
  assert.equal(await P.findTool({ name: "rg", platform: "macos", home: "/Users/x", exec: brew }), "/opt/homebrew/bin/rg");

  // Windows: not in any known folder, but `where` finds it
  const where = fakeExec((cmd, args) => {
    if (cmd === "where") return { stdout: "C:\\tools\\rg.exe\r\n" };
    if (cmd === "C:\\tools\\rg.exe") return { stdout: "ok" };
    return undefined;
  });
  assert.equal(await P.findTool({ name: "rg", platform: "windows", home: "C:/Users/x", exec: where }), "C:\\tools\\rg.exe");

  // macOS/Linux: the login shell's PATH as a last resort
  const login = fakeExec((cmd, args) => {
    if (cmd === "sh") return { stdout: "/home/x/.nvm/versions/node/v22/bin/node\n" };
    if (cmd === "/home/x/.nvm/versions/node/v22/bin/node") return { stdout: "v22.1.0" };
    return undefined;
  });
  assert.equal(await P.findTool({ name: "node", platform: "linux", home: "/home/x", exec: login }), "/home/x/.nvm/versions/node/v22/bin/node");
  const shellCall = login.calls.find((c) => c.cmd === "sh");
  assert.doesNotMatch(shellCall.args.join(" "), /\$0/, "no positional-parameter trick (breaks fish)");

  const nothing = fakeExec(() => undefined);
  assert.equal(await P.findTool({ name: "rg", platform: "linux", home: "/h", exec: nothing }), null);
});

test("findTool: node from a version manager folder, newest first", async () => {
  const exec = fakeExec((cmd) => (cmd === "/h/.nvm/versions/node/v22.14.0/bin/node" ? { stdout: "v22.14.0" } : undefined));
  const readdir = async (dir) => (dir === "/h/.nvm/versions/node" ? ["v18.0.0", "v22.14.0", "v20.1.0"] : []);
  assert.equal(await P.findTool({ name: "node", platform: "linux", home: "/h", exec, readdir, via: false }), "/h/.nvm/versions/node/v22.14.0/bin/node");
  assert.deepEqual(P.newestFirst(["v8.0.0", "v22.14.0", "v20.1.0", "v22.2.0"]), ["v22.14.0", "v22.2.0", "v20.1.0", "v8.0.0"]);
});

test("tool finder: found stays, a miss is retried after 30 s (installing while Herdr runs)", async () => {
  let installed = false, t = 0;
  const exec = fakeExec((cmd) => (installed && cmd === "rg" ? { stdout: "ok" } : undefined));
  const find = P.makeToolFinder({ platform: "linux", home: "/h", exec, now: () => t, via: false });
  assert.equal(await find("rg"), null);
  const calls = exec.calls.length;
  assert.equal(await find("rg"), null);
  assert.equal(exec.calls.length, calls, "the miss is remembered for a moment");
  installed = true; t = 31_000;
  assert.equal(await find("rg"), "rg");
  const n = exec.calls.length;
  assert.equal(await find("rg"), "rg");
  assert.equal(exec.calls.length, n, "found is cached");
});

test("node version check", () => {
  assert.equal(P.nodeOk("v22.4.0\n"), true);
  assert.equal(P.nodeOk("v22.14.0"), true);
  assert.equal(P.nodeOk("v26.5.0"), true);
  assert.equal(P.nodeOk("v22.3.0"), false, "Node 22.0 to 22.3 has no global WebSocket (R2-CR-8)");
  assert.equal(P.nodeOk("v22.0.0"), false);
  assert.equal(P.nodeOk("v22"), false);
  assert.equal(P.nodeOk("v20.11.1"), false);
  assert.equal(P.nodeOk(""), false);
});

test("messages name the missing piece and an install hint for this OS", () => {
  assert.match(P.missingMessage("macos", "rg"), /^ripgrep \(rg\) isn't installed: brew install ripgrep$/);
  assert.match(P.missingMessage("linux", "rg"), /apt install ripgrep/);
  assert.match(P.missingMessage("windows", "rg"), /winget install BurntSushi\.ripgrep\.MSVC/);
  assert.match(P.missingMessage("windows", "poppler"), /scoop install poppler/);
  assert.match(P.missingMessage("linux", "poppler"), /poppler-utils/);
  assert.match(P.missingMessage("macos", "poppler"), /brew install poppler/);
  assert.match(P.missingMessage("linux", "browser"), /wasn't found/);
  assert.match(P.missingMessage("windows", "node"), /Node\.js 22\.4 or newer/);
  for (const os of OS) for (const what of ["rg", "poppler", "node", "curl", "browser", "obsidian"]) {
    const m = P.missingMessage(os, what);
    assert.ok(m.length > 10, `${os} ${what}`);
    assert.doesNotMatch(m, /\/Applications|\/opt\/homebrew|C:\\/, "no install paths in a message");
  }
});

test("renderer errors become one plain sentence, never raw JSON or a path (CR-1-5)", () => {
  const raw = '[{"error":"ENOENT: no such file or directory, stat \'/Applications/Obsidian.app/Contents/Resources/obsidian.asar\'"}]';
  const sentence = P.renderProblem("macos", { error: JSON.parse(raw)[0].error });
  assert.match(sentence, /Obsidian/);
  assert.doesNotMatch(sentence, /ENOENT|\[\{|\/Applications/);
  assert.match(P.renderProblem("linux", { error: "no-browser" }), /browser/);
  assert.match(P.renderProblem("linux", { error: "needs-node-22" }), /Node\.js 22/);
  assert.match(P.renderProblem("windows", { error: "no-obsidian" }), /Obsidian/);
  assert.match(P.renderProblem("linux", { error: "timeout" }), /too long/);
  assert.match(P.renderProblem("linux", "ReferenceError: WebSocket is not defined"), /Node\.js 22/);
  const unknown = P.renderProblem("linux", { error: "Something odd at /home/me/secret/file.txt:3\nstack" });
  assert.doesNotMatch(unknown, /\/home\/me/);
  assert.doesNotMatch(unknown, /stack/);
});

test("candidates handed to the renderer: asar and browsers per OS", () => {
  assert.ok(P.obsidianAsarCandidates("macos").some((c) => c.startsWith("/Applications/Obsidian.app")));
  assert.ok(P.obsidianAsarCandidates("linux").includes("/opt/Obsidian/resources/obsidian.asar"));
  assert.ok(P.obsidianAsarCandidates("windows").some((c) => c.startsWith("%LOCALAPPDATA%/Programs/Obsidian")));
  assert.ok(P.browserCandidates("macos").some((c) => c.endsWith("Google Chrome.app/Contents/MacOS/Google Chrome")));
  assert.ok(P.browserCandidates("windows").some((c) => c.endsWith("Microsoft/Edge/Application/msedge.exe")));
  const linux = P.browserCandidates("linux");
  for (const c of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/opt/google/chrome/chrome", "/snap/bin/chromium", "/usr/bin/microsoft-edge", "/usr/bin/brave-browser"]) assert.ok(linux.includes(c), c);
  assert.ok(linux.every((c) => c.startsWith("/") && !/flatpak/.test(c)), "absolute paths; Flatpak wrappers do not take --remote-debugging-port=0 the same way");
  assert.ok(P.browserNames("linux").includes("chromium"));
  assert.ok(P.browserNames("windows").includes("msedge"));
});

test("obsidian.json locations per OS (vault mod)", () => {
  assert.deepEqual(V.obsidianConfigCandidates("macos", "/Users/x"), ["/Users/x/Library/Application Support/obsidian/obsidian.json"]);
  const linux = V.obsidianConfigCandidates("linux", "/home/x");
  assert.equal(linux[0], "/home/x/.config/obsidian/obsidian.json");
  assert.ok(linux.includes("/home/x/.var/app/md.obsidian.Obsidian/config/obsidian/obsidian.json"), "Flatpak");
  assert.ok(linux.includes("/home/x/snap/obsidian/current/.config/obsidian/obsidian.json"), "Snap");
  assert.deepEqual(V.obsidianConfigCandidates("windows", "C:\\Users\\x"), ["C:/Users/x/AppData/Roaming/obsidian/obsidian.json"]);
});

// ---- the two copies must not drift --------------------------------------------------------

function source(file, name) {
  const text = fs.readFileSync(file, "utf8");
  const start = text.search(new RegExp(`^export (async )?(function|const) ${name}\\b`, "m"));
  assert.ok(start >= 0, `${name} in ${path.basename(path.dirname(file))}`);
  const rest = text.slice(start);
  // a function ends at the first "}" in column 0; a const at the first ";" ending a line
  const isFn = /^export (async )?function/.test(rest);
  const end = isFn ? rest.indexOf("\n}\n") + 3 : rest.indexOf(";\n") + 2;
  return rest.slice(0, end);
}

test("mods/vault/platform.js shares its functions verbatim with mods/vault-reader/platform.js", () => {
  const a = path.join(MODS, "vault-reader", "platform.js"), b = path.join(MODS, "vault", "platform.js");
  const shared = Object.keys(V).filter((k) => k in P);
  assert.ok(shared.length >= 15, "the shared set is not empty");
  for (const name of shared) assert.equal(source(b, name), source(a, name), `${name} differs between the two platform.js files`);
  // and the vault copy has only what it uses plus its own
  assert.deepEqual(Object.keys(V).filter((k) => !(k in P)), ["obsidianConfigCandidates"]);
});

test("watch.js is identical in both mods", () => {
  assert.equal(fs.readFileSync(path.join(MODS, "vault", "watch.js"), "utf8"), fs.readFileSync(path.join(MODS, "vault-reader", "watch.js"), "utf8"));
});

test("utf8Text decodes like TextDecoder, including invalid bytes, without needing it (CR-2-1)", () => {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const cases = ["plain", "café 世界 😀 end", "", "<svg width=\"1\">"].map((s) => enc.encode(s));
  for (const b of cases) assert.equal(P.utf8Text(b), dec.decode(b), Array.from(b).join(","));
  // invalid bytes become U+FFFD (one per byte here, a little more than TextDecoder's); the text around them survives
  const bad = P.utf8Text(Uint8Array.from([0x61, 0xc3, 0x28, 0xe2, 0x82, 0xff, 0xc0, 0xaf, 0xed, 0xa0, 0x80, 0x62]));
  assert.ok(bad.startsWith("a\ufffd(") && bad.endsWith("b") && !/[\ud800-\udfff]/.test(bad));
  assert.equal(P.utf8Text(enc.encode("abcdef"), 3), "abc");
  assert.equal(P.utf8Text(undefined), "");
});

test("browser lookup through the login shell: one command per OS, names only from our list (R2-CR-8)", () => {
  const [cmd, args] = P.browserLookupCommand("linux", P.browserNames("linux"));
  assert.equal(cmd, "sh");
  assert.match(args[1], /command -v google-chrome google-chrome-stable chromium /);
  assert.doesNotMatch(args.join(" "), /\$0/);
  assert.deepEqual(P.browserLookupCommand("windows", ["chrome", "msedge"]), ["where", ["chrome", "msedge"]]);
  assert.deepEqual(P.browserLookupCommand("macos", ["a b", "c;rm -rf", "chromium"])[1][1].includes("rm"), false, "odd names are dropped");
  assert.deepEqual(P.pathsFromLookup("alias chrome='x'\n/usr/bin/chromium\r\nC:\\Program Files\\Edge\\msedge.exe\n/usr/bin/chromium\nnot found\n"),
    ["/usr/bin/chromium", "C:\\Program Files\\Edge\\msedge.exe"]);
  assert.deepEqual(P.pathsFromLookup(undefined), []);
});

test("renderer problems for a settings.json path that does not exist (R2-CR-8)", () => {
  assert.match(P.renderProblem("macos", { error: "no-browser-setting" }), /settings\.json \("browser"\).*Chromium/);
  assert.match(P.renderProblem("linux", { error: "no-obsidian-setting" }), /settings\.json \("asar"\).*Obsidian/);
});
