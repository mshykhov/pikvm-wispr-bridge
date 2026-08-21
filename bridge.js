(() => {
  const CLIPBOARD_MESSAGE_TYPE = "pikvm-wispr-read-clipboard";
  const STATE_EVENT_TYPE = "pikvm-wispr-state";
  const STATE_PHASES = new Set([
    "sending",
    "progress",
    "complete",
    "failed-before-send",
    "failed-after-start",
  ]);
  const DUPLICATE_WINDOW_MS = 2000;
  const MAX_TEXT_LENGTH = 20000;
  const DEFAULT_SETTINGS = {
    autoKeymap: true,
  };
  let lastText = "";
  let lastSentAt = 0;
  let processingQueue = false;
  const pasteQueue = [];

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(DEFAULT_SETTINGS, resolve);
    });
  }

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

  function showStatus(message, isError = false, persistent = false) {
    document.getElementById("pikvm-wispr-status")?.remove();

    const status = document.createElement("div");
    status.id = "pikvm-wispr-status";
    status.textContent = message;
    status.style.cssText = [
      "position:fixed",
      "right:16px",
      `bottom:${document.getElementById("pikvm-wispr-lock") ? "180px" : "16px"}`,
      "z-index:2147483647",
      "padding:10px 14px",
      "border-radius:8px",
      `background:${isError ? "#8b1e1e" : "#1f6f43"}`,
      "color:#fff",
      "font:13px -apple-system,BlinkMacSystemFont,sans-serif",
      "box-shadow:0 4px 18px rgba(0,0,0,.35)",
    ].join(";");

    document.documentElement.appendChild(status);
    if (!persistent) {
      window.setTimeout(() => status.remove(), isError ? 5000 : 2500);
    }
  }

  function getPiKvmControls() {
    const textarea = document.getElementById("hid-pak-text");
    const sendButton = document.getElementById("hid-pak-button");
    const confirmation = document.getElementById("hid-pak-ask-switch");
    const keymapSelector = document.getElementById("hid-pak-keymap-selector");

    if (!textarea || !sendButton || !keymapSelector) {
      throw new Error("PiKVM Text controls are unavailable");
    }

    return { textarea, sendButton, confirmation, keymapSelector };
  }

  function isPiKvmPageReady() {
    return Boolean(
      document.getElementById("hid-pak-text")
      && document.getElementById("hid-pak-button")
      && document.getElementById("hid-pak-keymap-selector"),
    );
  }

  async function readClipboard() {
    const runtime = globalThis.chrome?.runtime;
    if (typeof runtime?.sendMessage !== "function") {
      throw new Error("Extension updated; reload the PiKVM tab");
    }

    try {
      return await runtime.sendMessage({
        target: "background",
        type: CLIPBOARD_MESSAGE_TYPE,
      });
    } catch (error) {
      if (/Extension context invalidated/i.test(error?.message || "")) {
        throw new Error("Extension updated; reload the PiKVM tab");
      }
      throw error;
    }
  }

  function removeLineBreaks(text) {
    return text.replace(/[ \t]*[\r\n\u2028\u2029]+[ \t]*/g, " ");
  }

  function selectKeymap(selector, keymap) {
    const available = [...selector.options].some((option) => option.value === keymap);
    if (!available) throw new Error(`PiKVM keymap ${keymap} is unavailable`);
    selector.value = keymap;
    selector.dispatchEvent(new Event("change", { bubbles: true }));
  }

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

  async function sendSegment(text, controls, onStarted, onConfirmed) {
    const { textarea, sendButton, confirmation } = controls;
    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    if (sendButton.disabled) {
      throw new Error("PiKVM Paste-as-Keys is disabled");
    }

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
    try {
      for (const segment of segments) {
        if (segment.keymap !== activeKeymap) {
          selectKeymap(keymapSelector, segment.keymap);
          activeKeymap = segment.keymap;
        }
        await sendSegment(segment.text, controls, onStarted, confirmSegment);
      }
    } finally {
      if (keymapSelector.value !== currentKeymap) {
        selectKeymap(keymapSelector, currentKeymap);
      }
    }

    return currentKeymap;
  }

  async function sendQueuedText(text) {
    let sendStarted = false;
    let normalizedLength = 0;
    let confirmedLength = 0;
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
      await sendText(
        text,
        settings,
        () => { sendStarted = true; },
        (confirmed) => {
          confirmedLength = confirmed;
          publishState("progress", normalizedLength, confirmedLength);
        },
      );
      lastText = text;
      lastSentAt = now;
      publishState("complete", normalizedLength, normalizedLength);
    } catch (error) {
      publishState(
        sendStarted ? "failed-after-start" : "failed-before-send",
        normalizedLength,
        confirmedLength,
      );
      showStatus(error.message || "Could not send transcript", true);
    }
  }

  async function drainPasteQueue() {
    processingQueue = true;
    try {
      while (pasteQueue.length > 0) {
        await sendQueuedText(pasteQueue.shift());
      }
    } finally {
      processingQueue = false;
    }
  }

  function handlePaste(text) {
    pasteQueue.push(text);
    if (!processingQueue) drainPasteQueue();
  }

  window.addEventListener("keydown", (event) => {
    if (!event.isTrusted || event.repeat || event.code !== "F18") return;
    if (!isPiKvmPageReady()) return;

    window.setTimeout(async () => {
      try {
        const response = await readClipboard();
        if (!response?.ok) {
          throw new Error(response?.error || "Could not read clipboard");
        }
        handlePaste(response.text);
      } catch (error) {
        publishState("failed-before-send");
        showStatus(error.message || "Could not read clipboard", true);
      }
    }, 0);
  }, true);
})();
