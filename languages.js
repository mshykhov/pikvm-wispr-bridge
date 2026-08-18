((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.PiKVMWisprLanguages = api;
  }
})(typeof globalThis === "object" ? globalThis : this, () => {
  const CYRILLIC = /\p{Script=Cyrillic}/u;
  const LATIN = /\p{Script=Latin}/u;

  function keymapForCharacter(character) {
    if (CYRILLIC.test(character)) return "ru";
    if (LATIN.test(character)) return "en-us";
    return null;
  }

  function splitByKeymap(text, fallbackKeymap = "en-us") {
    const segments = [];
    let current = null;
    let neutral = "";

    for (const character of text) {
      const keymap = keymapForCharacter(character);
      if (!keymap) {
        neutral += character;
        continue;
      }

      if (!current) {
        current = { keymap, text: neutral + character };
        neutral = "";
        continue;
      }

      if (current.keymap === keymap) {
        current.text += neutral + character;
        neutral = "";
        continue;
      }

      current.text += neutral;
      neutral = "";
      segments.push(current);
      current = { keymap, text: character };
    }

    if (current) {
      current.text += neutral;
      segments.push(current);
    } else if (neutral) {
      segments.push({ keymap: fallbackKeymap, text: neutral });
    }

    return segments;
  }

  return { keymapForCharacter, splitByKeymap };
});
