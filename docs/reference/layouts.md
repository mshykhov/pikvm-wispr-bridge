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

## Automatic PiKVM keymap mode

Auto mode splits mixed Cyrillic and Latin text into runs and selects the matching
PiKVM `ru` or `en-us` keymap before sending each run.

Auto mode is enabled by default. It changes only the **using a host keymap**
selector shown in PiKVM's Text panel.

The extension never sends `Alt+Shift`, `Win+Space`, or another layout-switch
shortcut to the target computer. The target layout remains entirely under the
user's control.

Because PiKVM sends physical HID keys, the active target layout still needs to
support the characters being sent. Mixed Russian and English cannot be guaranteed
when the target stays in one layout.

Emoji and some typographic characters may not exist in the selected hardware
keymap and should be tested separately.

## Line breaks

The bridge replaces every transcript line break with a single space before
using PiKVM Paste-as-Keys. It never sends `Enter` from dictated text. This keeps
multi-line Flow output from executing a partial command in a terminal; the user
submits the complete command manually.
