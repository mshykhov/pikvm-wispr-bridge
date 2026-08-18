const CLIPBOARD_MESSAGE_TYPE = "pikvm-wispr-read-clipboard";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen"
    || message?.type !== CLIPBOARD_MESSAGE_TYPE) return false;

  try {
    const target = document.getElementById("clipboard-target");
    target.value = "";
    target.focus();
    if (!document.execCommand("paste")) {
      throw new Error("Browser rejected the clipboard paste command");
    }
    sendResponse({ ok: true, text: target.value });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error.message || "Could not read clipboard",
    });
  }
  return false;
});
