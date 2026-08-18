(() => {
  const MESSAGE_TYPE = "pikvm-wispr-send";
  const DUPLICATE_WINDOW_MS = 2000;
  const MAX_TEXT_LENGTH = 20000;
  const PASTE_TIMEOUT_MS = 30000;
  const DEFAULT_SETTINGS = {
    autoKeymap: true,
  };
  let lastText = "";
  let lastSentAt = 0;
  let sending = false;

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(DEFAULT_SETTINGS, resolve);
    });
  }

  function showStatus(message, isError = false) {
    document.getElementById("pikvm-wispr-status")?.remove();

    const status = document.createElement("div");
    status.id = "pikvm-wispr-status";
    status.textContent = message;
    status.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "padding:10px 14px",
      "border-radius:8px",
      `background:${isError ? "#8b1e1e" : "#1f6f43"}`,
      "color:#fff",
      "font:13px -apple-system,BlinkMacSystemFont,sans-serif",
      "box-shadow:0 4px 18px rgba(0,0,0,.35)",
    ].join(";");

    document.documentElement.appendChild(status);
    window.setTimeout(() => status.remove(), isError ? 5000 : 2500);
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

  function selectKeymap(selector, keymap) {
    const available = [...selector.options].some((option) => option.value === keymap);
    if (!available) throw new Error(`PiKVM keymap ${keymap} is unavailable`);
    selector.value = keymap;
    selector.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function waitForPasteCompletion(textarea, sendButton) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        if (!sendButton.disabled && textarea.value === "") {
          window.clearInterval(timer);
          resolve();
        } else if (Date.now() - startedAt >= PASTE_TIMEOUT_MS) {
          window.clearInterval(timer);
          reject(new Error("PiKVM paste timed out"));
        }
      }, 25);
    });
  }

  async function sendSegment(text, controls) {
    const { textarea, sendButton, confirmation } = controls;
    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    if (sendButton.disabled) {
      throw new Error("PiKVM Paste-as-Keys is disabled");
    }

    const confirmationWasEnabled = Boolean(confirmation?.checked);
    if (confirmation) confirmation.checked = false;

    try {
      sendButton.click();
    } finally {
      if (confirmation) confirmation.checked = confirmationWasEnabled;
    }

    await waitForPasteCompletion(textarea, sendButton);
  }

  async function sendText(text, settings) {
    const controls = getPiKvmControls();
    const { keymapSelector } = controls;
    const currentKeymap = keymapSelector.value;
    const segments = PiKVMWisprLanguages.splitByKeymap(text, currentKeymap);
    const textKeymaps = new Set(segments.map((segment) => segment.keymap));

    if (!settings.autoKeymap) {
      if (textKeymaps.size > 1) {
        throw new Error("Mixed RU/EN text: enable Auto PiKVM keymap");
      }
      const requiredKeymap = segments[0]?.keymap || currentKeymap;
      if (requiredKeymap !== currentKeymap) {
        throw new Error(`Select ${requiredKeymap} in PiKVM or enable Auto keymap`);
      }
      await sendSegment(text, controls);
      return currentKeymap;
    }

    let activeKeymap = currentKeymap;
    for (const segment of segments) {
      if (segment.keymap !== activeKeymap) {
        selectKeymap(keymapSelector, segment.keymap);
        activeKeymap = segment.keymap;
      }
      await sendSegment(segment.text, controls);
    }

    return activeKeymap;
  }

  async function handlePaste() {
    if (sending) return;
    sending = true;

    try {
      const text = await navigator.clipboard.readText();
      if (!text) throw new Error("Flow transcript is empty");
      if (text.length > MAX_TEXT_LENGTH) {
        throw new Error(`Transcript exceeds ${MAX_TEXT_LENGTH} characters`);
      }

      const now = Date.now();
      if (text === lastText && now - lastSentAt < DUPLICATE_WINDOW_MS) {
        throw new Error("Duplicate transcript ignored");
      }

      const settings = await getSettings();
      const finalKeymap = await sendText(text, settings);
      lastText = text;
      lastSentAt = now;
      showStatus(`Sent ${text.length} characters; PiKVM keymap ${finalKeymap}`);
    } catch (error) {
      showStatus(error.message || "Could not send transcript", true);
    } finally {
      sending = false;
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== MESSAGE_TYPE) return;
    handlePaste();
  });
})();
