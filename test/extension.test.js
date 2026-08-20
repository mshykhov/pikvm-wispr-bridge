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

function runInterceptor() {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const remoteSurface = { id: "stream-window" };
  const controls = new Map([
    ["stream-window", remoteSurface],
    ["hid-pak-text", {}],
    ["hid-pak-button", {}],
  ]);
  const document = {
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    createElement() { return { append() {}, remove() {}, style: {} }; },
    documentElement: { append() {} },
    getElementById(id) { return controls.get(id) || null; },
  };
  const window = {
    addEventListener(type, listener) { windowListeners.set(type, listener); },
    clearInterval() {},
    clearTimeout() {},
    setInterval() { return 1; },
    setTimeout() { return 1; },
  };
  vm.runInNewContext(read("intercept.js"), { document, window });
  return { documentListeners, remoteSurface, windowListeners };
}

function keyboardEvent(type, code, target) {
  const state = { defaultPrevented: false, propagationStopped: false };
  return {
    code,
    isTrusted: true,
    repeat: false,
    target,
    type,
    composedPath: () => [target],
    preventDefault() { state.defaultPrevented = true; },
    stopPropagation() { state.propagationStopped = true; },
    state,
  };
}

test("manifest is portable and narrowly scoped to PiKVM paths", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const matches = manifest.content_scripts.flatMap((script) => script.matches);

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "0.4.4");
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

test("interceptor reserves only the bridge-only F18 trigger", () => {
  const source = read("intercept.js");

  assert.match(source, /event\.code === "F18"/);
  assert.match(source, /isPiKvmPageReady/);
  assert.match(source, /addEventListener\("keydown"/);
  assert.match(source, /addEventListener\("keyup"/);
  assert.doesNotMatch(source, /clipboardData|postMessage/);
  assert.doesNotMatch(source, /KeyV|metaKey|ctrlKey/);
  assert.doesNotMatch(source, /LAYOUT_SHORTCUTS|meta-space|alt-shift/);
});

test("interceptor locks only the PiKVM remote keyboard after F18", () => {
  const { remoteSurface, windowListeners } = runInterceptor();
  const keydown = windowListeners.get("keydown");
  const keyup = windowListeners.get("keyup");

  const beforeLock = keyboardEvent("keydown", "KeyA", remoteSurface);
  keydown(beforeLock);
  assert.equal(beforeLock.state.defaultPrevented, false);

  const triggerDown = keyboardEvent("keydown", "F18", remoteSurface);
  keydown(triggerDown);
  assert.equal(triggerDown.state.defaultPrevented, true);
  assert.equal(triggerDown.state.propagationStopped, true);

  const triggerUp = keyboardEvent("keyup", "F18", remoteSurface);
  keyup(triggerUp);
  assert.equal(triggerUp.state.propagationStopped, true);

  for (const type of ["keydown", "keyup"]) {
    const event = keyboardEvent(type, "KeyB", remoteSurface);
    windowListeners.get(type)(event);
    assert.equal(event.state.defaultPrevented, true);
    assert.equal(event.state.propagationStopped, true);
  }

  const pageControl = keyboardEvent("keydown", "KeyA", { id: "hid-pak-text" });
  keydown(pageControl);
  assert.equal(pageControl.state.defaultPrevented, false);
});

test("interceptor releases keys that PiKVM received before locking", () => {
  const { remoteSurface, windowListeners } = runInterceptor();
  const keydown = windowListeners.get("keydown");
  const keyup = windowListeners.get("keyup");

  keydown(keyboardEvent("keydown", "MetaRight", remoteSurface));
  keydown(keyboardEvent("keydown", "F18", remoteSurface));

  const existingRelease = keyboardEvent("keyup", "MetaRight", remoteSurface);
  keyup(existingRelease);
  assert.equal(existingRelease.state.defaultPrevented, false);

  const repeatedRelease = keyboardEvent("keyup", "MetaRight", remoteSurface);
  keyup(repeatedRelease);
  assert.equal(repeatedRelease.state.defaultPrevented, true);
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
  assert.match(source, /Sending \$\{text\.length\} characters/);
  assert.match(source, /Extension updated; reload the PiKVM tab/);
  assert.match(source, /Extension context invalidated/);
  assert.doesNotMatch(source, /if \(sending\) return/);
  assert.match(source, /globalThis\.chrome\?\.runtime/);
  assert.match(source, /runtime\.sendMessage/);
  assert.match(source, /event\.isTrusted/);
  assert.match(source, /event\.code !== "F18"/);
  assert.doesNotMatch(source, /addEventListener\("paste"/);
  assert.doesNotMatch(source, /clipboardData|KeyV|metaKey|ctrlKey/);
  assert.doesNotMatch(source, /switchTargetLayout|layoutShortcut/);
  assert.doesNotMatch(source, /navigator\.clipboard|readText|fetch\(|XMLHttpRequest|console\./);
});

test("bridge replaces transcript line breaks before sending", async () => {
  const listeners = new Map();
  const sent = [];
  let status = null;
  let timerId = 0;
  const textarea = {
    value: "",
    dispatchEvent() {},
  };
  const sendButton = {
    disabled: false,
    click() {
      sent.push(textarea.value);
      textarea.value = "";
    },
  };
  const confirmation = { checked: true };
  const keymapSelector = {
    value: "en-us",
    options: [{ value: "en-us" }, { value: "ru" }],
    dispatchEvent() {},
  };
  const controls = {
    "hid-pak-ask-switch": confirmation,
    "hid-pak-button": sendButton,
    "hid-pak-keymap-selector": keymapSelector,
    "hid-pak-text": textarea,
  };
  const document = {
    documentElement: {
      appendChild(element) { status = element; },
    },
    createElement() {
      return {
        style: {},
        remove() {
          if (status === this) status = null;
        },
      };
    },
    getElementById(id) {
      if (id === "pikvm-wispr-status") return status;
      return controls[id] || null;
    },
  };
  const window = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    clearInterval() {},
    setInterval(callback) {
      queueMicrotask(callback);
      timerId += 1;
      return timerId;
    },
    setTimeout(callback, delay) {
      timerId += 1;
      if (delay === 0) queueMicrotask(callback);
      return timerId;
    },
  };
  const chrome = {
    runtime: {
      async sendMessage() {
        return {
          ok: true,
          text: "first\r\n second\nthird\rfourth\u2028fifth\u2029sixth",
        };
      },
    },
    storage: {
      local: {
        get(defaults, callback) { callback(defaults); },
      },
    },
  };

  vm.runInNewContext(read("bridge.js"), {
    chrome,
    document,
    Event: class Event {},
    PiKVMWisprLanguages: languages,
    queueMicrotask,
    window,
  });

  listeners.get("keydown")({
    code: "F18",
    isTrusted: true,
    repeat: false,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(sent, ["first second third fourth fifth sixth"]);
  assert.equal(confirmation.checked, true);
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

test("macOS helper replaces only Wispr Flow paste with the private trigger", () => {
  const source = read("extras/PiKVMWispr.spoon/init.lua");

  assert.match(source, /keyStroke\(\{\}, "f18", 0\)/);
  assert.match(source, /eventSourceUnixProcessID/);
  assert.match(source, /com\.electron\.wispr-flow/);
  assert.match(source, /flowPasteWatcher/);
  assert.match(source, /getKeyCode\(\) ~= 9/);
  assert.doesNotMatch(source, /fnKeyCode|minimumHoldSeconds|clipboardWatcher/);
  assert.doesNotMatch(source, /keyStroke\(\{"cmd"\}, "v", 0\)/);
});
