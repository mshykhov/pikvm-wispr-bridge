(() => {
  const MESSAGE_TYPE = "pikvm-wispr-send";
  const DUPLICATE_WINDOW_MS = 2000;
  const MAX_TEXT_LENGTH = 20000;
  let lastText = "";
  let lastSentAt = 0;
  let sending = false;

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
    window.setTimeout(() => status.remove(), 2500);
  }

  function sendThroughPiKvm(text) {
    const textarea = document.getElementById("hid-pak-text");
    const sendButton = document.getElementById("hid-pak-button");
    const confirmation = document.getElementById("hid-pak-ask-switch");
    const keymap = document.getElementById("hid-pak-keymap-selector")?.value;

    if (!textarea || !sendButton) {
      throw new Error("PiKVM Text controls are unavailable");
    }

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

    return keymap || "default";
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

      const keymap = sendThroughPiKvm(text);
      lastText = text;
      lastSentAt = now;
      showStatus(`Queued ${text.length} characters via ${keymap}`);
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
