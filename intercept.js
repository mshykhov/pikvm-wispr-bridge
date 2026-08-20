(() => {
  const REMOTE_SURFACE_IDS = new Set([
    "stream-window",
    "keyboard-window",
    "mouse-window",
  ]);
  let pendingOperations = 0;
  let uncertainSend = false;
  let manuallyUnlocked = false;
  const forwardedKeys = new Set();

  function getPiKvmKeyboardTarget() {
    return document.getElementById("stream-window")
      || document.getElementById("keyboard-window")
      || document.getElementById("mouse-window");
  }

  function isPiKvmPageReady() {
    return Boolean(
      getPiKvmKeyboardTarget()
      && document.getElementById("hid-pak-text")
      && document.getElementById("hid-pak-button"),
    );
  }

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

  function renderPreparingState() {}

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
})();
