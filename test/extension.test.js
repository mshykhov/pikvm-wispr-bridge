const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const os = require("node:os");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const languages = require(path.join(root, "languages.js"));

test("manifest is portable and narrowly scoped to PiKVM paths", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const matches = manifest.content_scripts.flatMap((script) => script.matches);

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "0.4.0");
  assert.deepEqual(manifest.permissions, ["clipboardRead", "offscreen", "storage"]);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.ok(matches.every((match) => match.includes("/kvm/")));
  assert.doesNotMatch(JSON.stringify(manifest), /panga-bleak|pikvm-v4/i);
});

test("extension packages an offscreen clipboard fallback", () => {
  for (const file of ["background.js", "offscreen.html", "offscreen.js"]) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} must exist`);
  }
  const background = read("background.js");
  const offscreen = read("offscreen.js");
  const packageScript = read("scripts/package.sh");

  assert.match(background, /chrome\.offscreen\.createDocument/);
  assert.match(background, /Reason\.CLIPBOARD/);
  assert.match(background, /\/kvm\//);
  assert.match(offscreen, /document\.execCommand\("paste"\)/);
  assert.doesNotMatch(offscreen, /navigator\.clipboard\.readText/);
  assert.match(packageScript, /background\.js/);
  assert.match(packageScript, /offscreen\.html/);
  assert.match(packageScript, /offscreen\.js/);
});

test("interceptor supports the local OS paste shortcuts", () => {
  const source = read("intercept.js");

  assert.match(source, /isMacPaste/);
  assert.match(source, /isOtherPaste/);
  assert.match(source, /MetaLeft/);
  assert.match(source, /ControlLeft/);
  assert.match(source, /isPiKvmPageReady/);
  assert.doesNotMatch(source, /clipboardData|postMessage/);
  assert.doesNotMatch(source, /LAYOUT_SHORTCUTS|meta-space|alt-shift/);
});

test("interceptor blocks PiKVM key handling without cancelling browser paste", () => {
  const listeners = new Map();
  const keyboardTarget = { onkeyup() {} };
  const controls = new Set([
    "hid-pak-text",
    "hid-pak-button",
  ]);
  const window = {
    location: { origin: "https://pikvm.example" },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  const document = {
    getElementById(id) {
      if (id === "stream-window") return keyboardTarget;
      if (controls.has(id)) return {};
      return null;
    },
  };

  vm.runInNewContext(read("intercept.js"), {
    document,
    KeyboardEvent: class KeyboardEvent {},
    window,
  });

  let keydownPrevented = false;
  let propagationStopped = false;
  let immediatePropagationStopped = false;
  listeners.get("keydown")({
    altKey: false,
    code: "KeyV",
    ctrlKey: false,
    metaKey: true,
    preventDefault() { keydownPrevented = true; },
    repeat: false,
    shiftKey: false,
    stopImmediatePropagation() { immediatePropagationStopped = true; },
    stopPropagation() { propagationStopped = true; },
  });
  assert.equal(keydownPrevented, false);
  assert.equal(propagationStopped, true);
  assert.equal(immediatePropagationStopped, false);
  assert.equal(listeners.has("paste"), false);
});

test("bridge uses PiKVM controls and guards clipboard sends", () => {
  const source = read("bridge.js");

  assert.match(source, /hid-pak-text/);
  assert.match(source, /hid-pak-button/);
  assert.match(source, /hid-pak-keymap-selector/);
  assert.match(source, /hid-pak-ask-switch/);
  assert.match(source, /DUPLICATE_WINDOW_MS/);
  assert.match(source, /MAX_TEXT_LENGTH/);
  assert.match(source, /autoKeymap/);
  assert.match(source, /isPiKvmPageReady/);
  assert.match(source, /pasteQueue/);
  assert.doesNotMatch(source, /if \(sending\) return/);
  assert.match(source, /chrome\.runtime\.sendMessage/);
  assert.match(source, /event\.isTrusted/);
  assert.match(source, /addEventListener\("paste"/);
  assert.match(source, /clipboardData/);
  assert.doesNotMatch(source, /switchTargetLayout|layoutShortcut/);
  assert.doesNotMatch(source, /navigator\.clipboard|readText|fetch\(|XMLHttpRequest|console\./);
});

test("language splitter preserves text and separates Cyrillic from Latin", () => {
  assert.deepEqual(languages.splitByKeymap("Привет, hello!"), [
    { keymap: "ru", text: "Привет, " },
    { keymap: "en-us", text: "hello!" },
  ]);
  assert.deepEqual(languages.splitByKeymap("123 привет"), [
    { keymap: "ru", text: "123 привет" },
  ]);
  assert.deepEqual(languages.splitByKeymap("hello world"), [
    { keymap: "en-us", text: "hello world" },
  ]);
});

test("popup exposes automatic PiKVM keymap settings", () => {
  const html = read("popup.html");
  const source = read("popup.js");
  assert.match(html, /Automatically select PiKVM ru\/en-us keymap/);
  assert.match(html, /never switches the keyboard layout/);
  assert.doesNotMatch(html, /Alt \+ Shift|Win\/Super/);
  assert.match(source, /autoKeymap: true/);
  assert.match(source, /chrome\.storage\.local/);
});

test("macOS helper installer is idempotent and uninstallable", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pikvm-wispr-test-"));
  const home = path.join(temp, "home");
  const bin = path.join(temp, "bin");
  const app = path.join(temp, "Hammerspoon.app");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(bin, "hs"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  const env = {
    ...process.env,
    HOME: home,
    HAMMERSPOON_APP: app,
    PATH: `${bin}:${process.env.PATH}`,
  };
  const run = (script) => childProcess.execFileSync(
    "bash",
    [path.join(root, "scripts", script)],
    { env, encoding: "utf8" },
  );

  run("install-macos.sh");
  run("install-macos.sh");

  const initFile = path.join(home, ".hammerspoon", "init.lua");
  const initSource = fs.readFileSync(initFile, "utf8");
  const markerCount = initSource.match(/pikvm-wispr-bridge:start/g)?.length || 0;
  assert.equal(markerCount, 1);
  assert.ok(fs.lstatSync(
    path.join(home, ".hammerspoon", "Spoons", "PiKVMWispr.spoon"),
  ).isSymbolicLink());

  run("uninstall-macos.sh");
  assert.doesNotMatch(fs.readFileSync(initFile, "utf8"), /pikvm-wispr-bridge:start/);
  assert.equal(fs.existsSync(
    path.join(home, ".hammerspoon", "Spoons", "PiKVMWispr.spoon"),
  ), false);
  const backups = fs.readdirSync(path.dirname(initFile))
    .filter((name) => name.startsWith("init.lua.backup."));
  assert.equal(backups.length, 2);
});

test("macOS helper requires the exact PiKVM path boundary", () => {
  const source = read("extras/PiKVMWispr.spoon/init.lua");
  assert.ok(source.includes('url:match("^https?://[^/]+/kvm/")'));
  assert.doesNotMatch(source, /\/kvm\/\?"/);
});
