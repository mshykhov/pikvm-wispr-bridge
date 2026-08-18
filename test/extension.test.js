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
  assert.equal(manifest.version, "0.3.1");
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.ok(matches.every((match) => match.includes("/kvm/")));
  assert.doesNotMatch(JSON.stringify(manifest), /panga-bleak|pikvm-v4/i);
});

test("interceptor supports the local OS paste shortcuts", () => {
  const source = read("intercept.js");

  assert.match(source, /isMacPaste/);
  assert.match(source, /isOtherPaste/);
  assert.match(source, /MetaLeft/);
  assert.match(source, /ControlLeft/);
  assert.match(source, /isPiKvmPageReady/);
  assert.match(source, /clipboardData/);
  assert.doesNotMatch(source, /LAYOUT_SHORTCUTS|meta-space|alt-shift/);
});

test("interceptor forwards paste event data without cancelling the keydown default", () => {
  const listeners = new Map();
  const messages = [];
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
    postMessage(message, origin) {
      messages.push({ message, origin });
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
  listeners.get("keydown")({
    altKey: false,
    code: "KeyV",
    ctrlKey: false,
    metaKey: true,
    preventDefault() { keydownPrevented = true; },
    repeat: false,
    shiftKey: false,
    stopImmediatePropagation() {},
    stopPropagation() {},
  });
  assert.equal(keydownPrevented, false);

  let pastePrevented = false;
  listeners.get("paste")({
    clipboardData: { getData: () => "clipboard text" },
    preventDefault() { pastePrevented = true; },
    stopImmediatePropagation() {},
    stopPropagation() {},
  });
  assert.equal(pastePrevented, true);
  assert.equal(JSON.stringify(messages), JSON.stringify([{
    message: { type: "pikvm-wispr-send", text: "clipboard text" },
    origin: "https://pikvm.example",
  }]));
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
