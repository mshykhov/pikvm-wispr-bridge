(() => {
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

  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.code !== "F18") return;
    if (!isPiKvmPageReady()) return;

    event.stopPropagation();
  }, true);
})();
