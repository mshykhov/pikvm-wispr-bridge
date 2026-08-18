const OFFSCREEN_PATH = "offscreen.html";
const CLIPBOARD_MESSAGE_TYPE = "pikvm-wispr-read-clipboard";
let creatingOffscreenDocument = null;

async function hasOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl],
    });
    return contexts.length > 0;
  }

  const matchedClients = await clients.matchAll();
  return matchedClients.some((client) => client.url === offscreenUrl);
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (creatingOffscreenDocument) return creatingOffscreenDocument;

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.CLIPBOARD],
    justification: "Read text after a paste shortcut on an active PiKVM page",
  });
  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

function isEligiblePiKvmSender(sender) {
  try {
    const url = new URL(sender.tab?.url || "");
    return ["http:", "https:"].includes(url.protocol)
      && (url.pathname === "/kvm" || url.pathname.startsWith("/kvm/"));
  } catch {
    return false;
  }
}

async function readClipboard(sender) {
  if (!isEligiblePiKvmSender(sender)) {
    throw new Error("Clipboard request did not come from a PiKVM page");
  }

  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({
    target: "offscreen",
    type: CLIPBOARD_MESSAGE_TYPE,
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== "background"
    || message?.type !== CLIPBOARD_MESSAGE_TYPE) return false;

  readClipboard(sender)
    .then(sendResponse)
    .catch((error) => sendResponse({
      ok: false,
      error: error.message || "Could not read clipboard",
    }));
  return true;
});
