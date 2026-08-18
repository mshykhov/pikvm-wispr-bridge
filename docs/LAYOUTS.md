# Keyboard layouts

PiKVM Paste-as-Keys does not transfer a clipboard into the target OS. It maps
characters to physical USB HID key presses using the keymap selected in the
PiKVM **Text** menu.

The same layout must be active on the target computer. Selecting `ru` in PiKVM
does not switch Windows, macOS, or Linux to Russian.

## Reliable setup

For the first test, use one language per dictation:

1. Select the target OS layout.
2. Select the matching PiKVM keymap.
3. Dictate and send the text.

## Automatic mode

Auto mode splits mixed Cyrillic and Latin text into runs. Before a run whose
language differs from the current PiKVM keymap, it sends the configured target
layout shortcut and then selects the matching PiKVM keymap.

The mode assumes:

- the target has exactly Russian and English layouts in its switching cycle;
- the PiKVM keymap and target layout are synchronized before Auto is enabled;
- the target shortcut is correctly selected in the extension popup;
- the target layout is not changed independently while the extension is active.

After each switch, PiKVM keeps the final keymap selected, so the synchronized
state carries into the next dictation. If state is lost, select the same layout
on the target and in PiKVM once before continuing.

Emoji and some typographic characters may not exist in the selected hardware
keymap and should be tested separately.
