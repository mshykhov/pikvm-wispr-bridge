(() => {
  const MESSAGE_TYPE = "pikvm-wispr-send";

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

  function releaseRemoteModifier(code, key) {
    const target = getPiKvmKeyboardTarget();

    if (typeof target?.onkeyup === "function") {
      target.onkeyup(new KeyboardEvent("keyup", {
        code,
        key,
      }));
    }
  }

  window.addEventListener("keydown", (event) => {
    const isMacPaste = event.code === "KeyV"
      && event.metaKey
      && !event.altKey
      && !event.ctrlKey
      && !event.shiftKey;
    const isOtherPaste = event.code === "KeyV"
      && event.ctrlKey
      && !event.altKey
      && !event.metaKey
      && !event.shiftKey;

    if (event.repeat || (!isMacPaste && !isOtherPaste)) return;
    if (!isPiKvmPageReady()) return;

    event.stopPropagation();
    event.stopImmediatePropagation();
    if (isMacPaste) releaseRemoteModifier("MetaLeft", "Meta");
    if (isOtherPaste) releaseRemoteModifier("ControlLeft", "Control");
  }, true);

  window.addEventListener("paste", (event) => {
    if (!isPiKvmPageReady()) return;

    const text = event.clipboardData?.getData("text/plain") || "";
    if (!text) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    window.postMessage({ type: MESSAGE_TYPE, text }, window.location.origin);
  }, true);
})();
