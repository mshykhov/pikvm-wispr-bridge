(() => {
  const PANEL_ID = "pikvm-wispr-lock";
  const STYLE_ID = "pikvm-wispr-lock-style";
  const STATE_EVENT_TYPE = "pikvm-wispr-state";
  const LONG_RUNNING_MS = 30000;
  const REMOTE_SURFACE_IDS = new Set([
    "stream-window",
    "keyboard-window",
    "mouse-window",
  ]);
  let pendingOperations = 0;
  let uncertainSend = false;
  let manuallyUnlocked = false;
  const forwardedKeys = new Set();
  let phase = "idle";
  let confirmationReturnPhase = "sending";
  let totalCharacters = 0;
  let confirmedCharacters = 0;
  let startedAt = 0;
  let elapsedTimer = null;
  let longRunning = false;
  let activePanel = null;
  let activeTitle = null;
  let activeDetail = null;

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

  function clearTimers() {
    if (elapsedTimer !== null) window.clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  function startTimers() {
    clearTimers();
    startedAt = Date.now();
    elapsedTimer = window.setInterval(() => {
      longRunning = Date.now() - startedAt >= LONG_RUNNING_MS;
      updatePanelMessage();
    }, 100);
  }

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

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = makeElement("style", [
      "@keyframes pikvm-wispr-progress{",
      "0%{background-position:200% 0}",
      "100%{background-position:-200% 0}",
      "}",
    ].join(""));
    style.id = STYLE_ID;
    document.documentElement.append(style);
  }

  function replacePanel(panel) {
    document.getElementById(PANEL_ID)?.remove();
    ensureStyles();
    document.documentElement.append(panel);
  }

  function panelMessage() {
    const elapsed = Math.max(0, Date.now() - startedAt) / 1000;
    const queuedTranscripts = Math.max(0, pendingOperations - 1);
    const queueStatus = queuedTranscripts > 0
      ? ` · ${queuedTranscripts} transcript${queuedTranscripts === 1 ? "" : "s"} queued`
      : "";
    if (phase === "unlock-confirmation") return {
      title: "Unlock keyboard?",
      detail: "PiKVM may still be sending text. Unlocking can mix your keystrokes with the active paste.",
    };
    if (manuallyUnlocked) return {
      title: "Sending continues",
      detail: `Keyboard unlocked manually${queueStatus}`,
    };
    if (phase === "failed-safe") return {
      title: "Sending status is uncertain",
      detail: `Keyboard remains locked${queueStatus}`,
    };
    if (longRunning) return {
      title: "PiKVM is still sending after 30 seconds",
      detail: `Keyboard remains locked · ${elapsed.toFixed(1)}s elapsed${queueStatus}`,
    };
    if (phase === "preparing") return {
      title: "PiKVM keyboard locked",
      detail: `Preparing transcript…${queueStatus}`,
    };
    const progress = confirmedCharacters > 0 && confirmedCharacters < totalCharacters
      ? `${confirmedCharacters} of ${totalCharacters} characters confirmed · `
      : "";
    return {
      title: "PiKVM keyboard locked",
      detail: `${progress}Sending ${totalCharacters} characters · ${elapsed.toFixed(1)}s elapsed${queueStatus}`,
    };
  }

  function panelBackground() {
    return longRunning || manuallyUnlocked || phase === "failed-safe"
      ? "#7a4b12"
      : "#183d31";
  }

  function updatePanelMessage() {
    if (!activePanel || !activeTitle || !activeDetail) return;
    const message = panelMessage();
    activeTitle.textContent = message.title;
    activeDetail.textContent = message.detail;
    activePanel.style.background = panelBackground();
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
    panel.setAttribute("aria-live", "polite");
    panel.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "width:min(360px,calc(100vw - 32px))",
      "padding:14px",
      "border-radius:10px",
      `background:${panelBackground()}`,
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
    activePanel = panel;
    activeTitle = title;
    activeDetail = detail;
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
    activePanel = null;
    activeTitle = null;
    activeDetail = null;
    document.getElementById(PANEL_ID)?.remove();
  }

  function showComplete(total) {
    clearTimers();
    pendingOperations = 0;
    uncertainSend = false;
    manuallyUnlocked = false;
    longRunning = false;
    phase = "complete";
    const panel = makeElement("section", `Sent ${total} characters`);
    panel.id = PANEL_ID;
    panel.setAttribute("role", "status");
    panel.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "padding:10px 14px",
      "border-radius:8px",
      "background:#1f6f43",
      "color:#fff",
    ].join(";");
    activePanel = panel;
    activeTitle = null;
    activeDetail = null;
    replacePanel(panel);
    window.setTimeout(() => panel.remove(), 2500);
  }

  function acceptTrigger(event) {
    if (event.type !== "keydown" || event.repeat || !event.isTrusted) return;
    const operationAlreadyActive = pendingOperations > 0;
    pendingOperations += 1;
    manuallyUnlocked = false;
    if (operationAlreadyActive && phase !== "idle" && phase !== "complete") {
      renderPanel();
    } else {
      renderPreparingState();
    }
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

  document.addEventListener(STATE_EVENT_TYPE, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== "object") return;
    if (!Number.isSafeInteger(detail.total) || detail.total < 0) return;
    if (!Number.isSafeInteger(detail.confirmed)
        || detail.confirmed < 0
        || detail.confirmed > detail.total) return;
    if (pendingOperations === 0 && !uncertainSend) return;

    if (detail.phase === "sending" || detail.phase === "progress") {
      phase = "sending";
      totalCharacters = detail.total;
      confirmedCharacters = detail.confirmed;
      if (detail.phase === "sending") {
        longRunning = false;
        startTimers();
      }
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

  window.addEventListener("keydown", handleKeyboardEvent, true);
  window.addEventListener("keyup", handleKeyboardEvent, true);
})();
