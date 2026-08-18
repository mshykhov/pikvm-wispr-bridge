(() => {
  const DEFAULT_SETTINGS = {
    autoLayout: false,
    layoutShortcut: "alt-shift",
    layoutDelayMs: 250,
  };

  const autoLayout = document.getElementById("auto-layout");
  const layoutShortcut = document.getElementById("layout-shortcut");
  const layoutDelay = document.getElementById("layout-delay");
  const status = document.getElementById("status");

  function save() {
    chrome.storage.local.set({
      autoLayout: autoLayout.checked,
      layoutShortcut: layoutShortcut.value,
      layoutDelayMs: Number(layoutDelay.value),
    }, () => {
      status.textContent = "Saved";
      window.setTimeout(() => { status.textContent = ""; }, 1200);
    });
  }

  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    autoLayout.checked = settings.autoLayout;
    layoutShortcut.value = settings.layoutShortcut;
    layoutDelay.value = String(settings.layoutDelayMs);
  });

  autoLayout.addEventListener("change", save);
  layoutShortcut.addEventListener("change", save);
  layoutDelay.addEventListener("change", save);
})();
