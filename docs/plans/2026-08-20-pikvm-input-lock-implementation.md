# PiKVM Input Lock and Send Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This repository defaults to one agent because the tasks share browser state and sequential code changes.

**Goal:** Block remote PiKVM keyboard input during Paste-as-Keys and show an honest English send panel with elapsed time and an always-available confirmed emergency unlock.

**Architecture:** Expand the existing main-world `intercept.js` into a page-local lock controller that synchronously captures `F18`, filters only remote keyboard events, and owns the status panel. Keep clipboard and send logic in isolated-world `bridge.js`; communicate only allow-listed phases and integer counts through a document event, with no transcript content. Treat 30 seconds as a long-running warning rather than cancellation because stock PiKVM exposes completion but no in-request progress or safe cancel operation.

**Tech Stack:** Dependency-free Chromium Manifest V3 JavaScript, Hammerspoon Lua, Node.js `node:test`, VM-based DOM mocks, Rulesync.

**Status:** ready for execution

---

## File map

- Modify `intercept.js`: main-world keyboard lock, operation accounting, timeout state, English status panel, and manual unlock confirmation.
- Modify `bridge.js`: publish safe state metadata, report confirmed language segments, distinguish pre-send and post-start failures, and wait for real completion without a false 30-second rejection.
- Modify `test/extension.test.js`: behavioral regression tests for capture, UI states, timeout, manual unlock, bridge state messages, queue coverage, and version.
- Modify `README.md`: setup permission, keyboard lock behavior, status panel, and manual unlock warning.
- Modify `docs/architecture/overview.md`: current event and lock flow.
- Modify `docs/reference/layouts.md`: exact keyboard lock and progress contract.
- Modify `PRIVACY.md`: counts and fixed states cross worlds, transcript remains excluded.
- Modify `SECURITY.md`: lock boundary and limitations, including mouse focus risk and manual unlock.
- Modify `docs/README.md`: map Hammerspoon behavior to the canonical Rulesync rule.
- Modify `.rulesync/rules/repository.md`: replace stale long-`Fn` architecture and add the input-lock invariant.
- Regenerate `AGENTS.md` and `CLAUDE.md`: generated outputs from the canonical Rulesync rule.
- Modify `manifest.json`, `package.json`, `package-lock.json`, and `extras/PiKVMWispr.spoon/init.lua`: synchronized `0.5.0` version.
- Modify `docs/plans/2026-08-20-pikvm-input-lock-design.md` and this plan: final accepted/completed status after live verification.

### Task 1: Main-world keyboard lock boundary

**Files:**
- Modify: `test/extension.test.js:43-110`
- Modify: `intercept.js:1-23`

- [ ] **Step 1: Replace the shallow interceptor test with a behavioral harness**

Add a `runInterceptor()` helper near the top of `test/extension.test.js`. The
helper must retain multiple listeners, expose the remote surface, and capture
document state events:

```js
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
```

Update the source-boundary test to match the new explicit branch and both event
types while retaining its clipboard, paste-shortcut, and layout assertions:

```js
assert.match(source, /event\.code === "F18"/);
assert.match(source, /addEventListener\("keydown"/);
assert.match(source, /addEventListener\("keyup"/);
assert.doesNotMatch(source, /clipboardData|postMessage/);
assert.doesNotMatch(source, /KeyV|metaKey|ctrlKey/);
```

Replace the current remote-paste test with exact lock assertions:

```js
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
    const event = keyboardEvent(type, "KeyA", remoteSurface);
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
```

- [ ] **Step 2: Run the focused test and confirm the intended failure**

Run:

```bash
node --test --test-name-pattern='interceptor locks only' test/extension.test.js
```

Expected: FAIL because current `intercept.js` stops only `F18` keydown and does
not retain a locked state or block `keyup`.

- [ ] **Step 3: Implement the minimal lock controller in `intercept.js`**

Use the existing ready check and add these exact boundaries:

```js
const STATE_EVENT_TYPE = "pikvm-wispr-state";
const REMOTE_SURFACE_IDS = new Set([
  "stream-window",
  "keyboard-window",
  "mouse-window",
]);
let pendingOperations = 0;
let uncertainSend = false;
let manuallyUnlocked = false;
const forwardedKeys = new Set();

function isRemoteKeyboardEvent(event) {
  const path = typeof event.composedPath === "function"
    ? event.composedPath()
    : [event.target];
  return path.some((node) => REMOTE_SURFACE_IDS.has(node?.id));
}

function isKeyboardLocked() {
  return !manuallyUnlocked && (pendingOperations > 0 || uncertainSend);
}

function stopKeyboardEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

function acceptTrigger(event) {
  if (event.type !== "keydown" || event.repeat || !event.isTrusted) return;
  pendingOperations += 1;
  manuallyUnlocked = false;
  renderPreparingState();
}

function handleKeyboardEvent(event) {
  if (event.code === "F18") {
    if (isPiKvmPageReady()) {
      acceptTrigger(event);
      stopKeyboardEvent(event);
    }
    return;
  }
  if (!isRemoteKeyboardEvent(event)) return;
  if (!isKeyboardLocked()) {
    if (event.type === "keydown" && !event.repeat) forwardedKeys.add(event.code);
    if (event.type === "keyup") forwardedKeys.delete(event.code);
    return;
  }
  if (event.type === "keyup" && forwardedKeys.delete(event.code)) return;
  stopKeyboardEvent(event);
}

window.addEventListener("keydown", handleKeyboardEvent, true);
window.addEventListener("keyup", handleKeyboardEvent, true);
```

Keep `getPiKvmKeyboardTarget()` and `isPiKvmPageReady()`. Define
`renderPreparingState()` as a no-op in this task so Task 2 can add the UI
without changing the event boundary:

```js
function renderPreparingState() {}
```

- [ ] **Step 4: Run interceptor tests and the full suite**

Run:

```bash
node --test --test-name-pattern='interceptor' test/extension.test.js
npm test
npm run verify
```

Expected: interceptor tests PASS, all current tests PASS, package and Rulesync
verification PASS.

- [ ] **Step 5: Commit the lock boundary**

```bash
git add intercept.js test/extension.test.js
git commit -m "feat: lock PiKVM keyboard during sends"
```

### Task 2: Persistent English send panel and emergency unlock

**Files:**
- Modify: `test/extension.test.js`
- Modify: `intercept.js`

- [ ] **Step 1: Extend the interceptor harness with deterministic DOM and timers**

Replace the minimal `createElement`, `documentElement`, and timer methods in
`runInterceptor()` with a small fake element implementation that records text,
children, click listeners, and timer callbacks:

```js
const elements = new Map();
const timers = new Map();
let timerId = 0;
let now = 0;

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

document.createElement = (tagName) => element(tagName);
document.documentElement = {
  append(node) { if (node.id) elements.set(node.id, node); },
};
document.getElementById = (id) => controls.get(id) || elements.get(id) || null;
window.setInterval = (callback) => { timerId += 1; timers.set(timerId, callback); return timerId; };
window.setTimeout = (callback) => { timerId += 1; timers.set(timerId, callback); return timerId; };
window.clearInterval = (id) => timers.delete(id);
window.clearTimeout = (id) => timers.delete(id);

function advance(ms) {
  now += ms;
  for (const callback of [...timers.values()]) callback();
}
```

Inject `Date: { now: () => now }` into the VM context and return `advance`,
`elements`, `findButton`, and `textOf` from `runInterceptor()` together with its
existing values.

- [ ] **Step 2: Add failing UI, timeout, and unlock tests**

Add these behavioral assertions using the harness:

```js
test("input lock panel stays visible and requires confirmed manual unlock", () => {
  const harness = runInterceptor();
  const trigger = keyboardEvent("keydown", "F18", harness.remoteSurface);
  harness.windowListeners.get("keydown")(trigger);

  const panel = harness.elements.get("pikvm-wispr-lock");
  assert.match(harness.textOf(panel), /PiKVM keyboard locked/);
  const unlock = harness.findButton(panel, "Unlock keyboard");
  unlock.click();
  assert.match(harness.textOf(harness.elements.get("pikvm-wispr-lock")), /Unlock keyboard\?/);

  harness.findButton(harness.elements.get("pikvm-wispr-lock"), "Keep locked").click();
  const blocked = keyboardEvent("keydown", "KeyA", harness.remoteSurface);
  harness.windowListeners.get("keydown")(blocked);
  assert.equal(blocked.state.defaultPrevented, true);

  harness.findButton(harness.elements.get("pikvm-wispr-lock"), "Unlock keyboard").click();
  harness.findButton(harness.elements.get("pikvm-wispr-lock"), "Unlock anyway").click();
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
```

`findButton()` must walk `children` recursively and match exact `textContent`.

- [ ] **Step 3: Run the focused tests and confirm failure**

```bash
node --test --test-name-pattern='input lock panel|30-second warning' test/extension.test.js
```

Expected: FAIL because `renderPreparingState()` is still empty and there is no
unlock UI or long-running timer.

- [ ] **Step 4: Implement the panel state renderer in `intercept.js`**

Add state fields and safe timer helpers:

```js
const PANEL_ID = "pikvm-wispr-lock";
const LONG_RUNNING_MS = 30000;
let phase = "idle";
let totalCharacters = 0;
let confirmedCharacters = 0;
let startedAt = 0;
let elapsedTimer = null;
let longRunning = false;

function clearTimers() {
  if (elapsedTimer !== null) window.clearInterval(elapsedTimer);
  elapsedTimer = null;
}

function startTimers() {
  clearTimers();
  startedAt = Date.now();
  elapsedTimer = window.setInterval(() => {
    longRunning = Date.now() - startedAt >= LONG_RUNNING_MS;
    renderPanel();
  }, 100);
}
```

Implement `makeElement(tag, text)`, `makeButton(text, onClick)`,
`replacePanel(panel)`, and `renderPanel()` with DOM methods only. Apply inline
styles so the panel is readable without a stylesheet. The rendering branches
must use these exact English strings:

```js
function panelMessage() {
  const elapsed = Math.max(0, Date.now() - startedAt) / 1000;
  if (phase === "unlock-confirmation") return {
    title: "Unlock keyboard?",
    detail: "PiKVM may still be sending text. Unlocking can mix your keystrokes with the active paste.",
  };
  if (manuallyUnlocked) return {
    title: "Sending continues",
    detail: "Keyboard unlocked manually",
  };
  if (phase === "failed-safe") return {
    title: "Sending status is uncertain",
    detail: "Keyboard remains locked",
  };
  if (longRunning) return {
    title: "PiKVM is still sending after 30 seconds",
    detail: `Keyboard remains locked · ${elapsed.toFixed(1)}s elapsed`,
  };
  if (phase === "preparing") return {
    title: "PiKVM keyboard locked",
    detail: "Preparing transcript…",
  };
  const progress = confirmedCharacters > 0 && confirmedCharacters < totalCharacters
    ? `${confirmedCharacters} of ${totalCharacters} characters confirmed · `
    : "";
  return {
    title: "PiKVM keyboard locked",
    detail: `${progress}Sending ${totalCharacters} characters · ${elapsed.toFixed(1)}s elapsed`,
  };
}
```

Implement the renderer and unlock actions with these helpers:

```js
let confirmationReturnPhase = "sending";

function makeElement(tag, text = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function makeButton(text, onClick) {
  const button = makeElement("button", text);
  button.type = "button";
  button.style.cssText = [
    "border:1px solid rgba(255,255,255,.45)",
    "border-radius:6px",
    "background:transparent",
    "color:#fff",
    "padding:6px 10px",
    "cursor:pointer",
  ].join(";");
  button.addEventListener("click", onClick);
  return button;
}

function replacePanel(panel) {
  document.getElementById(PANEL_ID)?.remove();
  document.documentElement.append(panel);
}

function requestUnlock() {
  confirmationReturnPhase = phase;
  phase = "unlock-confirmation";
  renderPanel();
}

function keepLocked() {
  phase = confirmationReturnPhase;
  renderPanel();
}

function unlockAnyway() {
  manuallyUnlocked = true;
  uncertainSend = false;
  phase = confirmationReturnPhase === "preparing" ? "preparing" : "sending";
  renderPanel();
}

function renderPanel() {
  const message = panelMessage();
  const panel = makeElement("section");
  panel.id = PANEL_ID;
  panel.setAttribute("role", "status");
  panel.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "width:min(360px,calc(100vw - 32px))",
    "padding:14px",
    "border-radius:10px",
    `background:${longRunning || manuallyUnlocked || phase === "failed-safe" ? "#7a4b12" : "#183d31"}`,
    "color:#fff",
    "font:13px -apple-system,BlinkMacSystemFont,sans-serif",
    "box-shadow:0 6px 24px rgba(0,0,0,.4)",
  ].join(";");

  const title = makeElement("strong", message.title);
  title.style.cssText = "display:block;font-size:14px;margin-bottom:5px";
  const detail = makeElement("div", message.detail);
  detail.style.cssText = "line-height:1.4;margin-bottom:10px";
  panel.append(title, detail);

  const actions = makeElement("div");
  actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
  if (phase === "unlock-confirmation") {
    actions.append(
      makeButton("Keep locked", keepLocked),
      makeButton("Unlock anyway", unlockAnyway),
    );
  } else if (!manuallyUnlocked && phase !== "complete") {
    const bar = makeElement("div");
    bar.setAttribute("aria-label", "Sending in progress");
    bar.style.cssText = [
      "height:3px",
      "margin:2px 0 12px",
      "border-radius:2px",
      "background:linear-gradient(90deg,transparent,#8ee6be,transparent)",
      "background-size:200% 100%",
      "animation:pikvm-wispr-progress 1.2s linear infinite",
    ].join(";");
    panel.append(bar);
    actions.append(makeButton("Unlock keyboard", requestUnlock));
  }
  panel.append(actions);
  replacePanel(panel);
}

function renderPreparingState() {
  phase = "preparing";
  totalCharacters = 0;
  confirmedCharacters = 0;
  longRunning = false;
  startTimers();
  renderPanel();
}

function clearPanelAndUnlock() {
  clearTimers();
  phase = "idle";
  uncertainSend = false;
  manuallyUnlocked = false;
  longRunning = false;
  document.getElementById(PANEL_ID)?.remove();
}

function showComplete(total) {
  clearTimers();
  pendingOperations = 0;
  uncertainSend = false;
  manuallyUnlocked = false;
  longRunning = false;
  phase = "complete";
  const panel = makeElement("section");
  panel.id = PANEL_ID;
  panel.textContent = `Sent ${total} characters`;
  replacePanel(panel);
  window.setTimeout(() => panel.remove(), 2500);
}
```

Insert one extension-owned `<style id="pikvm-wispr-lock-style">` with only the
`@keyframes pikvm-wispr-progress` animation before the first panel render. Do
not add global element selectors or change PiKVM classes.

- [ ] **Step 5: Run tests and full verification**

```bash
node --test --test-name-pattern='interceptor|input lock panel|30-second warning' test/extension.test.js
npm test
npm run verify
```

Expected: all tests and verification commands PASS.

- [ ] **Step 6: Commit the panel**

```bash
git add intercept.js test/extension.test.js
git commit -m "feat: show safe PiKVM send status"
```

### Task 3: Bridge progress and truthful completion semantics

**Files:**
- Modify: `test/extension.test.js:112-231`
- Modify: `bridge.js:1-223`

- [ ] **Step 1: Extend the bridge VM test to capture safe state events**

In the bridge behavior test, add `stateEvents`, make `document.dispatchEvent`
capture only event detail, and expose a minimal `CustomEvent`:

```js
const stateEvents = [];
const document = {
  dispatchEvent(event) {
    if (event.type === "pikvm-wispr-state") stateEvents.push(event.detail);
  },
  // Keep the existing documentElement, createElement, and getElementById mocks.
};

class CustomEvent {
  constructor(type, options) {
    this.type = type;
    this.detail = options.detail;
  }
}
```

Pass `CustomEvent` to `vm.runInNewContext`. After sending the normalized text,
assert an exact safe phase sequence and absence of transcript data:

```js
assert.deepEqual(stateEvents, [
  { phase: "sending", total: 37, confirmed: 0 },
  { phase: "progress", total: 37, confirmed: 37 },
  { phase: "complete", total: 37, confirmed: 37 },
]);
assert.doesNotMatch(JSON.stringify(stateEvents), /first|second|third|fourth|fifth|sixth/);
```

Add a mixed-language case and assert that `progress` reports the cumulative
length after each confirmed RU/EN segment and that the final count equals the
normalized transcript length.

- [ ] **Step 2: Add a failing no-false-timeout regression**

Add a source-level assertion next to the existing bridge guards:

```js
assert.doesNotMatch(source, /PASTE_TIMEOUT_MS|PiKVM paste timed out/);
assert.match(source, /pikvm-wispr-state/);
assert.match(source, /failed-before-send/);
assert.match(source, /failed-after-start/);
assert.doesNotMatch(source, /Sending \$\{text\.length\} characters/);
```

Run:

```bash
node --test --test-name-pattern='bridge' test/extension.test.js
```

Expected: FAIL because the current bridge contains the 30-second rejection and
does not publish progress events.

- [ ] **Step 3: Add the safe state publisher to `bridge.js`**

Add the event constant and validate all outbound fields:

```js
const STATE_EVENT_TYPE = "pikvm-wispr-state";
const STATE_PHASES = new Set([
  "sending",
  "progress",
  "complete",
  "failed-before-send",
  "failed-after-start",
]);

function publishState(phase, total = 0, confirmed = 0) {
  if (!STATE_PHASES.has(phase)) return;
  const safeTotal = Number.isSafeInteger(total) && total >= 0 ? total : 0;
  const safeConfirmed = Number.isSafeInteger(confirmed) && confirmed >= 0
    ? Math.min(confirmed, safeTotal)
    : 0;
  document.dispatchEvent(new CustomEvent(STATE_EVENT_TYPE, {
    detail: { phase, total: safeTotal, confirmed: safeConfirmed },
  }));
}
```

No state event may contain an error message or transcript string.

- [ ] **Step 4: Report exact segment confirmation and remove false rejection**

Change completion waiting to observe only PiKVM's real completion state:

```js
function waitForPasteCompletion(textarea, sendButton) {
  return new Promise((resolve) => {
    const timer = window.setInterval(() => {
      if (!sendButton.disabled && textarea.value === "") {
        window.clearInterval(timer);
        resolve();
      }
    }, 25);
  });
}
```

Change `sendSegment` to mark the point of uncertainty immediately before the
stock button click and report only after completion:

```js
async function sendSegment(text, controls, onStarted, onConfirmed) {
  const { textarea, sendButton, confirmation } = controls;
  textarea.value = text;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  if (sendButton.disabled) throw new Error("PiKVM Paste-as-Keys is disabled");

  const confirmationWasEnabled = Boolean(confirmation?.checked);
  if (confirmation) confirmation.checked = false;
  try {
    onStarted();
    sendButton.click();
  } finally {
    if (confirmation) confirmation.checked = confirmationWasEnabled;
  }
  await waitForPasteCompletion(textarea, sendButton);
  onConfirmed(text.length);
}
```

Update `sendText` with one cumulative confirmation path for both modes:

```js
async function sendText(text, settings, onStarted, onProgress) {
  const controls = getPiKvmControls();
  const { keymapSelector } = controls;
  const currentKeymap = keymapSelector.value;
  const segments = PiKVMWisprLanguages.splitByKeymap(text, currentKeymap);
  const textKeymaps = new Set(segments.map((segment) => segment.keymap));
  let confirmedCharacters = 0;
  const confirmSegment = (length) => {
    confirmedCharacters += length;
    onProgress(confirmedCharacters);
  };

  if (!settings.autoKeymap) {
    if (textKeymaps.size > 1) {
      throw new Error("Mixed RU/EN text: enable Auto PiKVM keymap");
    }
    const requiredKeymap = segments[0]?.keymap || currentKeymap;
    if (requiredKeymap !== currentKeymap) {
      throw new Error(`Select ${requiredKeymap} in PiKVM or enable Auto keymap`);
    }
    await sendSegment(text, controls, onStarted, confirmSegment);
    return currentKeymap;
  }

  let activeKeymap = currentKeymap;
  for (const segment of segments) {
    if (segment.keymap !== activeKeymap) {
      selectKeymap(keymapSelector, segment.keymap);
      activeKeymap = segment.keymap;
    }
    await sendSegment(segment.text, controls, onStarted, confirmSegment);
  }
  return activeKeymap;
}
```

- [ ] **Step 5: Publish one terminal phase for every accepted trigger**

In `sendQueuedText`, track whether the stock button was reached:

```js
async function sendQueuedText(text) {
  let sendStarted = false;
  let normalizedLength = 0;
  try {
    if (!text) throw new Error("Flow transcript is empty");
    if (text.length > MAX_TEXT_LENGTH) {
      throw new Error(`Transcript exceeds ${MAX_TEXT_LENGTH} characters`);
    }
    text = removeLineBreaks(text);
    if (!text.trim()) throw new Error("Flow transcript is empty");
    normalizedLength = text.length;

    const now = Date.now();
    if (text === lastText && now - lastSentAt < DUPLICATE_WINDOW_MS) {
      throw new Error("Duplicate transcript ignored");
    }

    publishState("sending", normalizedLength, 0);
    const settings = await getSettings();
    const finalKeymap = await sendText(
      text,
      settings,
      () => { sendStarted = true; },
      (confirmed) => publishState("progress", normalizedLength, confirmed),
    );
    lastText = text;
    lastSentAt = now;
    publishState("complete", normalizedLength, normalizedLength);
    return finalKeymap;
  } catch (error) {
    publishState(
      sendStarted ? "failed-after-start" : "failed-before-send",
      normalizedLength,
      0,
    );
    showStatus(error.message || "Could not send transcript", true);
    return null;
  }
}
```

In the outer `readClipboard()` catch, publish `failed-before-send` before the
existing English error notification. Remove the old persistent `Sending…` and
success notifications because the main-world panel now owns those states.

- [ ] **Step 6: Consume bridge states in the interceptor**

Add a strict `document` event listener in `intercept.js`:

```js
document.addEventListener(STATE_EVENT_TYPE, (event) => {
  const detail = event.detail;
  if (!detail || typeof detail !== "object") return;
  if (!Number.isSafeInteger(detail.total) || detail.total < 0) return;
  if (!Number.isSafeInteger(detail.confirmed)
      || detail.confirmed < 0
      || detail.confirmed > detail.total) return;

  if (detail.phase === "sending" || detail.phase === "progress") {
    phase = "sending";
    totalCharacters = detail.total;
    confirmedCharacters = detail.confirmed;
    if (detail.phase === "sending") startTimers();
    renderPanel();
    return;
  }
  if (detail.phase === "complete") {
    pendingOperations = Math.max(0, pendingOperations - 1);
    if (pendingOperations > 0) {
      renderPreparingState();
    } else if (uncertainSend) {
      phase = "failed-safe";
      renderPanel();
    } else {
      showComplete(detail.total);
    }
    return;
  }
  if (detail.phase === "failed-before-send") {
    pendingOperations = Math.max(0, pendingOperations - 1);
    if (pendingOperations > 0) {
      renderPreparingState();
    } else if (uncertainSend) {
      phase = "failed-safe";
      renderPanel();
    } else {
      clearPanelAndUnlock();
    }
    return;
  }
  if (detail.phase === "failed-after-start") {
    pendingOperations = Math.max(0, pendingOperations - 1);
    uncertainSend = true;
    phase = "failed-safe";
    renderPanel();
  }
});
```

`clearPanelAndUnlock()` clears timers, resets all lock state, and removes only
the extension-owned panel. If a completion arrives while another trigger is
pending, preserve the lock and show `Preparing transcript…` without a success
flash.

- [ ] **Step 7: Run focused, full, and security assertions**

```bash
node --test --test-name-pattern='interceptor|input lock|30-second|bridge' test/extension.test.js
npm test
rg -n "console\.|clipboardData|postMessage|detail:.*text|detail:.*error" intercept.js bridge.js
npm run verify
```

Expected: all tests PASS; `rg` returns no transcript-bearing state event or new
logging; full verification PASS.

- [ ] **Step 8: Commit bridge integration**

```bash
git add bridge.js intercept.js test/extension.test.js
git commit -m "fix: keep PiKVM input locked until completion"
```

### Task 4: Synchronize living documentation and Rulesync guidance

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/reference/layouts.md`
- Modify: `PRIVACY.md`
- Modify: `SECURITY.md`
- Modify: `docs/README.md`
- Modify: `.rulesync/rules/repository.md`
- Regenerate: `AGENTS.md`
- Regenerate: `CLAUDE.md`

- [ ] **Step 1: Repair the canonical architecture claim**

Replace the stale long-`Fn` bullet in `.rulesync/rules/repository.md` with:

```markdown
- `extras/PiKVMWispr.spoon/init.lua` identifies Flow-generated `Cmd+V` by its
  macOS process, suppresses it only on an active PiKVM page, and emits `F18`.
- `intercept.js` keeps `F18` away from PiKVM and locks remote keyboard events
  while Paste-as-Keys is active; `bridge.js` owns safe send-state updates.
```

Add a critical invariant stating that transcript state events contain only
allow-listed phases and integer counts, and that manual unlock never claims to
cancel PiKVM.

- [ ] **Step 2: Update setup and current behavior docs**

Make these exact claims in the owning living documents:

- `README.md`: after helper installation, enable macOS
  `Privacy & Security > Automation > Hammerspoon > <browser>` when prompted;
  describe the English locked/sending panel, always-visible `Unlock keyboard`,
  confirmation, and 30-second warning.
- `docs/architecture/overview.md`: say the helper observes a Flow-generated
  keyboard event, not transcript content; document the main-world lock and
  count-only state event.
- `docs/reference/layouts.md`: specify remote keydown/keyup filtering, mouse
  availability and focus risk, indeterminate progress, and manual unlock not
  being cancellation.
- `PRIVACY.md`: state that cross-world status contains only fixed phases and
  character counts.
- `SECURITY.md`: document fail-safe lock behavior and the explicit limitations
  for mouse input, browser/macOS shortcuts, and user-forced unlock.
- `docs/README.md`: add `.rulesync/rules/repository.md` to the Hammerspoon
  trigger/installer documentation row.

Do not rewrite dated reviews or decisions.

- [ ] **Step 3: Run Rulesync dry-run, then generate all targets**

```bash
npm run rulesync:dry-run
npm run rulesync:generate
```

Expected: dry-run shows only the canonical repository guidance propagated to
configured targets; generation updates `AGENTS.md` and `CLAUDE.md` from
`.rulesync/rules/repository.md`.

- [ ] **Step 4: Audit relative links and documentation drift**

Run the repository link resolver used during the prior docs audit and then:

```bash
rg -n "long.*Fn|observes a transcript|clipboard change" README.md docs .rulesync AGENTS.md CLAUDE.md
npm run rulesync:verify
git diff --check
```

Expected: no stale current-state claims, all relative links resolve, Rulesync
passes, and the diff has no whitespace errors.

- [ ] **Step 5: Run full verification and commit documentation**

```bash
npm run verify
git add README.md PRIVACY.md SECURITY.md docs/README.md \
  docs/architecture/overview.md docs/reference/layouts.md \
  .rulesync/rules/repository.md AGENTS.md CLAUDE.md
git commit -m "docs: document PiKVM input safety"
```

Expected: full verification PASS before the commit.

### Task 5: Release version, live verification, and delivery

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `extras/PiKVMWispr.spoon/init.lua`
- Modify: `test/extension.test.js:13-23`
- Modify: `docs/plans/2026-08-20-pikvm-input-lock-design.md`
- Modify: `docs/plans/2026-08-20-pikvm-input-lock-implementation.md`

- [ ] **Step 1: Add the failing release-version expectation**

Change the manifest assertion to:

```js
assert.equal(manifest.version, "0.5.0");
```

Run:

```bash
node --test --test-name-pattern='manifest is portable' test/extension.test.js
```

Expected: FAIL with actual version `0.4.4`.

- [ ] **Step 2: Synchronize version 0.5.0**

Run:

```bash
npm version 0.5.0 --no-git-tag-version
```

Then use `apply_patch` to set `manifest.json` and
`extras/PiKVMWispr.spoon/init.lua` to `0.5.0`. Verify all version locations:

```bash
rg -n '0\.4\.4|0\.5\.0' manifest.json package.json package-lock.json \
  extras/PiKVMWispr.spoon/init.lua test/extension.test.js
```

Expected: `0.5.0` appears in every synchronized location and `0.4.4` appears in
none of them.

- [ ] **Step 3: Run automated release verification**

```bash
npm test
npm run package
npm run rulesync:verify
npm run verify
git diff --check
```

Expected: all tests PASS, the extension archive is produced, Rulesync is clean,
and full verification PASS.

- [ ] **Step 4: Apply the verified local build**

```bash
./scripts/install-macos.sh
hs -c 'print(spoon.PiKVMWispr.version)'
```

Expected: helper reports `0.5.0`. Reload the unpacked extension in Vivaldi and
reload the active `/kvm/` tab once so old content scripts cannot remain active.

- [ ] **Step 5: Perform the live safety check with the user**

Use a harmless disposable text field on the remote target:

1. Trigger a short English transcript and confirm the panel immediately says
   `PiKVM keyboard locked`.
2. Press ordinary character and modifier keys during sending; none may reach
   the remote target.
3. Confirm the mouse and PiKVM controls still work, while acknowledging that a
   remote click can move focus.
4. Open `Unlock keyboard`, choose `Keep locked`, and confirm keys remain
   blocked.
5. Repeat with `Unlock anyway`; confirm the warning remains visible and keys
   become available without claiming the send was cancelled.
6. Let a normal send finish and confirm the panel reports `Sent N characters`,
   unlocks automatically, and ordinary remote typing works again.
7. Reload the page during a harmless test and confirm no page-local lock
   survives the reload.

Do not inspect or log the transcript. If any live step fails, return to the
failing component and do not mark the plans complete or push.

- [ ] **Step 6: Run final change audit and mark plans complete**

Use `check-changes` because keyboard interception is a high-risk boundary.
Review the complete diff, then set both plan status lines to `completed` with a
short verification note. Run:

```bash
npm run verify
git status --short
git diff --check
```

Expected: full verification PASS and only intended release/plan files remain
uncommitted.

- [ ] **Step 7: Commit and push the verified release**

```bash
git add manifest.json package.json package-lock.json \
  extras/PiKVMWispr.spoon/init.lua test/extension.test.js \
  docs/plans/2026-08-20-pikvm-input-lock-design.md \
  docs/plans/2026-08-20-pikvm-input-lock-implementation.md
git commit -m "chore: release 0.5.0"
git push origin main
git status --short
git rev-parse HEAD
git rev-parse origin/main
```

Expected: clean worktree and identical `HEAD` and `origin/main` revisions.
