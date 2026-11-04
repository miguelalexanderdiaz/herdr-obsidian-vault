import test from "node:test";
import assert from "node:assert/strict";
import { parseVaults, readVaultList, insideHome } from "../mods/vault/obsidian-config.js";
import { obsidianConfigCandidates } from "../mods/vault/platform.js";

const json = (vaults) => JSON.stringify({ vaults });

test("macOS and Linux: open vault first, then most recent; names from the folder", () => {
  const text = json({
    a: { path: "/Users/me/Notes", ts: 100 },
    b: { path: "/Users/me/Work/Plans", ts: 300 },
    c: { path: "/Users/me/Old", ts: 200, open: true },
  });
  const r = parseVaults(text, "/Users/me");
  assert.deepEqual(r.vaults.map((v) => v.name), ["Old", "Plans", "Notes"]);
  assert.deepEqual(r.outside, []);
  assert.deepEqual(r.vaults[1], { path: "/Users/me/Work/Plans", name: "Plans" });
});

test("Windows: backslashes become slashes, names are the last folder", () => {
  const text = json({ a: { path: "C:\\Users\\me\\Documents\\My Vault\\", ts: 1 } });
  const r = parseVaults(text, "C:\\Users\\me", { windows: true });
  assert.deepEqual(r.vaults, [{ path: "C:/Users/me/Documents/My Vault", name: "My Vault" }]);
});

test("Windows paths compare case-insensitively against the home folder", () => {
  assert.equal(insideHome("c:/users/ME/Notes", "C:\\Users\\me", true), true);
  assert.equal(insideHome("c:/users/ME/Notes", "C:\\Users\\me", false), false);
  assert.equal(insideHome("/home/mellow/x", "/home/me"), false, "a sibling with the same prefix is outside");
  assert.equal(insideHome("/home/me", "/home/me"), true);
});

test("vaults outside the home folder are reported, not dropped (CR-1-4)", () => {
  const text = json({ a: { path: "/Volumes/Data/Vault", ts: 1 }, b: { path: "/Users/me/In", ts: 2 } });
  const r = parseVaults(text, "/Users/me");
  assert.deepEqual(r.vaults.map((v) => v.name), ["In"]);
  assert.deepEqual(r.outside, [{ path: "/Volumes/Data/Vault", name: "Vault" }]);
});

test("garbage, missing keys and duplicates", () => {
  for (const bad of ["", "not json", "null", "[]", '{"vaults":null}', '{"vaults":"x"}', '{"vaults":{"a":null,"b":{"path":5},"c":{"path":" "}}}', undefined]) {
    assert.deepEqual(parseVaults(bad, "/h"), { vaults: [], outside: [] }, String(bad));
  }
  const dup = parseVaults(json({ a: { path: "/h/N", ts: 1 }, b: { path: "/h/N/", ts: 2 } }), "/h");
  assert.equal(dup.vaults.length, 1);
});

test("readVaultList: the first file that holds vaults wins; says where it looked", async () => {
  const files = { "/h/.var/app/md.obsidian.Obsidian/config/obsidian/obsidian.json": json({ a: { path: "/h/Flat", ts: 1 } }) };
  const read = async (f) => files[f] ?? null;
  const res = await readVaultList(obsidianConfigCandidates("linux", "/h"), "/h", read);
  assert.deepEqual(res.vaults.map((v) => v.name), ["Flat"]);
  assert.match(res.found, /Flatpak|md\.obsidian\.Obsidian/);
  assert.equal(res.looked.length, 2);

  const none = await readVaultList(obsidianConfigCandidates("linux", "/h"), "/h", async () => null);
  assert.deepEqual(none, { vaults: [], outside: [], found: null, looked: obsidianConfigCandidates("linux", "/h") });
  const throwing = await readVaultList(["/x"], "/h", async () => { throw new Error("denied"); });
  assert.equal(throwing.found, null);
});

test("each OS reads its own sample file", async () => {
  const cases = [
    ["macos", "/Users/me", "/Users/me/Library/Application Support/obsidian/obsidian.json", "/Users/me/Vault"],
    ["linux", "/home/me", "/home/me/.config/obsidian/obsidian.json", "/home/me/Vault"],
    ["linux", "/home/me", "/home/me/snap/obsidian/current/.config/obsidian/obsidian.json", "/home/me/Vault"],
    ["windows", "C:\\Users\\me", "C:/Users/me/AppData/Roaming/obsidian/obsidian.json", "C:\\Users\\me\\Vault"],
  ];
  for (const [os, home, file, vaultPath] of cases) {
    const read = async (f) => (f === file ? json({ x: { path: vaultPath, open: true } }) : null);
    const res = await readVaultList(obsidianConfigCandidates(os, home), home, read, { windows: os === "windows" });
    assert.equal(res.vaults.length, 1, `${os} ${file}`);
    assert.equal(res.vaults[0].name, "Vault");
  }
});
