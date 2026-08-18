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

Mixed Cyrillic and Latin text cannot be made reliable by changing only the
PiKVM keymap. A future automatic mode must split the text into language runs and
use deterministic, OS-specific shortcuts that select rather than merely toggle
the target layout.

Emoji and some typographic characters may not exist in the selected hardware
keymap and should be tested separately.
