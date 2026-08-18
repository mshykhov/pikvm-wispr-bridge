(() => {
  const DEFAULT_SETTINGS = {
    autoKeymap: true,
  };

  const autoKeymap = document.getElementById("auto-keymap");
  const status = document.getElementById("status");

  function save() {
    chrome.storage.local.set({
      autoKeymap: autoKeymap.checked,
    }, () => {
      status.textContent = "Saved";
      window.setTimeout(() => { status.textContent = ""; }, 1200);
    });
  }

  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    autoKeymap.checked = settings.autoKeymap;
  });

  autoKeymap.addEventListener("change", save);
})();
