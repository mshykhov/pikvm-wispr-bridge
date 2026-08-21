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
  const elements = new Map();
  const timers = new Map();
  let timerId = 0;
  let now = 0;
  const controls = new Map([
    ["stream-window", remoteSurface],
    ["hid-pak-text", {}],
    ["hid-pak-button", {}],
  ]);

  function element(tagName = "div") {
    const listeners = new Map();
    return {
      tagName,
      children: [],
      dataset: {},
      hidden: false,
      id: "",
      style: {},
      textContent: "",
      addEventListener(type, listener) { listeners.set(type, listener); },
      append(...children) { this.children.push(...children); },
      click() { listeners.get("click")?.({ preventDefault() {} }); },
      remove() { if (this.id) elements.delete(this.id); },
      setAttribute(name, value) { this[name] = value; },
    };
  }

  function textOf(node) {
    return [node.textContent, ...node.children.map(textOf)].join(" ");
  }

  function findButton(node, label) {
    if (node.tagName === "button" && node.textContent === label) return node;
    for (const child of node.children) {
      const found = findButton(child, label);
      if (found) return found;
    }
    return null;
  }

  const document = {
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    createElement: (tagName) => element(tagName),
    documentElement: {
      append(node) { if (node.id) elements.set(node.id, node); },
    },
    getElementById(id) { return controls.get(id) || elements.get(id) || null; },
  };
  const window = {
    addEventListener(type, listener) { windowListeners.set(type, listener); },
    clearInterval(id) { timers.delete(id); },
    clearTimeout(id) { timers.delete(id); },
    setInterval(callback) {
      timerId += 1;
      timers.set(timerId, callback);
      return timerId;
    },
    setTimeout(callback) {
      timerId += 1;
      timers.set(timerId, callback);
      return timerId;
    },
  };
  function advance(ms) {
    now += ms;
    for (const callback of [...timers.values()]) callback();
  }

  vm.runInNewContext(read("intercept.js"), {
    Date: { now: () => now },
    document,
    window,
  });
  return {
    advance,
    documentListeners,
    elements,
    findButton,
    remoteSurface,
    textOf,
    windowListeners,
  };
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
  assert.equal(manifest.version, "0.5.0");
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

test("input lock panel stays visible and requires confirmed manual unlock", () => {
  const harness = runInterceptor();
  const trigger = keyboardEvent("keydown", "F18", harness.remoteSurface);
  harness.windowListeners.get("keydown")(trigger);

  let panel = harness.elements.get("pikvm-wispr-lock");
  assert.match(harness.textOf(panel), /PiKVM keyboard locked/);
  harness.findButton(panel, "Unlock keyboard").click();
  panel = harness.elements.get("pikvm-wispr-lock");
  assert.match(harness.textOf(panel), /Unlock keyboard\?/);

  harness.findButton(panel, "Keep locked").click();
  const blocked = keyboardEvent("keydown", "KeyA", harness.remoteSurface);
  harness.windowListeners.get("keydown")(blocked);
  assert.equal(blocked.state.defaultPrevented, true);

  panel = harness.elements.get("pikvm-wispr-lock");
  harness.findButton(panel, "Unlock keyboard").click();
  panel = harness.elements.get("pikvm-wispr-lock");
  harness.findButton(panel, "Unlock anyway").click();
  const allowed = keyboardEvent("keydown", "KeyA", harness.remoteSurface);
  harness.windowListeners.get("keydown")(allowed);
  assert.equal(allowed.state.defaultPrevented, false);
  assert.match(
    harness.textOf(harness.elements.get("pikvm-wispr-lock")),
    /Keyboard unlocked manually/,
  );
});

test("30-second warning never unlocks or reports cancellation", () => {
  const harness = runInterceptor();
  harness.windowListeners.get("keydown")(
    keyboardEvent("keydown", "F18", harness.remoteSurface),
  );
  harness.advance(30000);

  const panel = harness.elements.get("pikvm-wispr-lock");
  assert.match(harness.textOf(panel), /PiKVM is still sending after 30 seconds/);
  assert.match(harness.textOf(panel), /Keyboard remains locked/);
  assert.doesNotMatch(harness.textOf(panel), /cancel/i);

  const blocked = keyboardEvent("keydown", "KeyA", harness.remoteSurface);
  harness.windowListeners.get("keydown")(blocked);
  assert.equal(blocked.state.defaultPrevented, true);
});

test("elapsed-time updates keep the emergency unlock control stable", () => {
  const harness = runInterceptor();
  harness.windowListeners.get("keydown")(
    keyboardEvent("keydown", "F18", harness.remoteSurface),
  );
  const panel = harness.elements.get("pikvm-wispr-lock");
  const unlock = harness.findButton(panel, "Unlock keyboard");

  harness.advance(100);

  assert.equal(
    harness.findButton(harness.elements.get("pikvm-wispr-lock"), "Unlock keyboard"),
    unlock,
  );
});

test("interceptor shows confirmed counts and unlocks only after completion", () => {
  const harness = runInterceptor();
  const state = harness.documentListeners.get("pikvm-wispr-state");
  harness.windowListeners.get("keydown")(
    keyboardEvent("keydown", "F18", harness.remoteSurface),
  );

  state({ detail: { phase: "sending", total: 12, confirmed: 0 } });
  state({ detail: { phase: "progress", total: 12, confirmed: 6 } });
  assert.match(
    harness.textOf(harness.elements.get("pikvm-wispr-lock")),
    /6 of 12 characters confirmed/,
  );

  state({ detail: { phase: "complete", total: 12, confirmed: 12 } });
  assert.match(
    harness.textOf(harness.elements.get("pikvm-wispr-lock")),
    /Sent 12 characters/,
  );
  const allowed = keyboardEvent("keydown", "KeyA", harness.remoteSurface);
  harness.windowListeners.get("keydown")(allowed);
  assert.equal(allowed.state.defaultPrevented, false);
});

test("interceptor keeps one lock across queued sends", () => {
  const harness = runInterceptor();
  const state = harness.documentListeners.get("pikvm-wispr-state");
  const keydown = harness.windowListeners.get("keydown");
  keydown(keyboardEvent("keydown", "F18", harness.remoteSurface));
  keydown(keyboardEvent("keydown", "F18", harness.remoteSurface));

  state({ detail: { phase: "complete", total: 5, confirmed: 5 } });
  const stillBlocked = keyboardEvent("keydown", "KeyA", harness.remoteSurface);
  keydown(stillBlocked);
  assert.equal(stillBlocked.state.defaultPrevented, true);
  assert.match(
    harness.textOf(harness.elements.get("pikvm-wispr-lock")),
    /Preparing transcript/,
  );

  state({ detail: { phase: "complete", total: 6, confirmed: 6 } });
  const allowed = keyboardEvent("keydown", "KeyA", harness.remoteSurface);
  keydown(allowed);
  assert.equal(allowed.state.defaultPrevented, false);
});

test("interceptor unlocks pre-send failures but holds uncertain sends", () => {
  const harness = runInterceptor();
  const state = harness.documentListeners.get("pikvm-wispr-state");
  const keydown = harness.windowListeners.get("keydown");

  keydown(keyboardEvent("keydown", "F18", harness.remoteSurface));
  state({ detail: { phase: "failed-before-send", total: 0, confirmed: 0 } });
  const preSendAllowed = keyboardEvent("keydown", "KeyA", harness.remoteSurface);
  keydown(preSendAllowed);
  assert.equal(preSendAllowed.state.defaultPrevented, false);

  keydown(keyboardEvent("keydown", "F18", harness.remoteSurface));
  state({ detail: { phase: "failed-after-start", total: 10, confirmed: 4 } });
  const uncertainBlocked = keyboardEvent("keydown", "KeyA", harness.remoteSurface);
  keydown(uncertainBlocked);
  assert.equal(uncertainBlocked.state.defaultPrevented, true);
  assert.match(
    harness.textOf(harness.elements.get("pikvm-wispr-lock")),
    /Sending status is uncertain/,
  );
});

test("interceptor ignores send states without an accepted private trigger", () => {
  const harness = runInterceptor();
  harness.documentListeners.get("pikvm-wispr-state")({
    detail: { phase: "failed-after-start", total: 10, confirmed: 4 },
  });

  assert.equal(harness.elements.has("pikvm-wispr-lock"), false);
  const allowed = keyboardEvent("keydown", "KeyA", harness.remoteSurface);
  harness.windowListeners.get("keydown")(allowed);
  assert.equal(allowed.state.defaultPrevented, false);
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
  assert.match(source, /pikvm-wispr-state/);
  assert.match(source, /failed-before-send/);
  assert.match(source, /failed-after-start/);
  assert.match(source, /Extension updated; reload the PiKVM tab/);
  assert.match(source, /Extension context invalidated/);
  assert.doesNotMatch(source, /PASTE_TIMEOUT_MS|PiKVM paste timed out/);
  assert.doesNotMatch(source, /Sending \$\{text\.length\} characters/);
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

async function runBridge(transcript, { failAfterConfirmedSegment = 0 } = {}) {
  const listeners = new Map();
  const sent = [];
  const selectedKeymaps = [];
  const stateEvents = [];
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
    dispatchEvent() { selectedKeymaps.push(this.value); },
  };
  const controls = {
    "hid-pak-ask-switch": confirmation,
    "hid-pak-button": sendButton,
    "hid-pak-keymap-selector": keymapSelector,
    "hid-pak-text": textarea,
  };
  const document = {
    dispatchEvent(event) {
      if (event.type === "pikvm-wispr-state") stateEvents.push(event.detail);
    },
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
      queueMicrotask(() => {
        callback();
        if (sent.length === failAfterConfirmedSegment) sendButton.disabled = true;
      });
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
          text: transcript,
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
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
      }
    },
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

  return {
    confirmation,
    keymap: keymapSelector.value,
    selectedKeymaps,
    sent,
    stateEvents: JSON.parse(JSON.stringify(stateEvents)),
    status,
  };
}

test("bridge replaces transcript line breaks before sending", async () => {
  const result = await runBridge(
    "first\r\n second\nthird\rfourth\u2028fifth\u2029sixth",
  );

  assert.deepEqual(result.sent, ["first second third fourth fifth sixth"]);
  assert.equal(result.confirmation.checked, true);
  assert.deepEqual(result.stateEvents, [
    { phase: "sending", total: 37, confirmed: 0 },
    { phase: "progress", total: 37, confirmed: 37 },
    { phase: "complete", total: 37, confirmed: 37 },
  ]);
  assert.doesNotMatch(
    JSON.stringify(result.stateEvents),
    /first|second|third|fourth|fifth|sixth/,
  );
});

test("bridge reports only confirmed RU and EN segment counts", async () => {
  const result = await runBridge("hello\nПривет");

  assert.deepEqual(result.sent, ["hello ", "Привет"]);
  assert.deepEqual(result.selectedKeymaps, ["ru", "en-us"]);
  assert.equal(result.keymap, "en-us");
  assert.deepEqual(result.stateEvents, [
    { phase: "sending", total: 12, confirmed: 0 },
    { phase: "progress", total: 12, confirmed: 6 },
    { phase: "progress", total: 12, confirmed: 12 },
    { phase: "complete", total: 12, confirmed: 12 },
  ]);
});

test("bridge restores the original PiKVM keymap after a later segment fails", async () => {
  const result = await runBridge("Привет hello пока", {
    failAfterConfirmedSegment: 2,
  });

  assert.deepEqual(result.sent, ["Привет ", "hello "]);
  assert.deepEqual(result.selectedKeymaps, ["ru", "en-us", "ru", "en-us"]);
  assert.equal(result.keymap, "en-us");
  assert.deepEqual(result.stateEvents.at(-1), {
    phase: "failed-after-start",
    total: 17,
    confirmed: 13,
  });
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
