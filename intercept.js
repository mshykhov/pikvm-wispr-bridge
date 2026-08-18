(() => {
  const MESSAGE_TYPE = "pikvm-wispr-send";
  const LAYOUT_MESSAGE_TYPE = "pikvm-wispr-layout-shortcut";
  const LAYOUT_SHORTCUTS = {
    "alt-shift": [
      { code: "AltLeft", key: "Alt", modifier: "altKey" },
      { code: "ShiftLeft", key: "Shift", modifier: "shiftKey" },
    ],
    "ctrl-shift": [
      { code: "ControlLeft", key: "Control", modifier: "ctrlKey" },
      { code: "ShiftLeft", key: "Shift", modifier: "shiftKey" },
    ],
    "meta-space": [
      { code: "MetaLeft", key: "Meta", modifier: "metaKey" },
      { code: "Space", key: " " },
    ],
    "ctrl-space": [
      { code: "ControlLeft", key: "Control", modifier: "ctrlKey" },
      { code: "Space", key: " " },
    ],
  };

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

  function sendRemoteShortcut(name) {
    const keys = LAYOUT_SHORTCUTS[name];
    const target = getPiKvmKeyboardTarget();
    if (!keys || typeof target?.onkeydown !== "function"
      || typeof target?.onkeyup !== "function") return;

    const modifiers = {
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    };

    for (const key of keys) {
      if (key.modifier) modifiers[key.modifier] = true;
      target.onkeydown(new KeyboardEvent("keydown", {
        code: key.code,
        key: key.key,
        ...modifiers,
      }));
    }

    for (const key of [...keys].reverse()) {
      target.onkeyup(new KeyboardEvent("keyup", {
        code: key.code,
        key: key.key,
        ...modifiers,
      }));
      if (key.modifier) modifiers[key.modifier] = false;
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== LAYOUT_MESSAGE_TYPE) return;
    if (!isPiKvmPageReady()) return;
    sendRemoteShortcut(event.data.shortcut);
  });

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

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (isMacPaste) releaseRemoteModifier("MetaLeft", "Meta");
    if (isOtherPaste) releaseRemoteModifier("ControlLeft", "Control");
    window.postMessage({ type: MESSAGE_TYPE }, window.location.origin);
  }, true);
})();
