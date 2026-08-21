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
selector shown in PiKVM's Text panel. The selector is restored to its original
value after the complete transcript finishes, including when a later segment
cannot be sent.

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

## Input lock and send status

After the private `F18` trigger, the extension blocks new `keydown` and `keyup`
events on PiKVM's remote keyboard surfaces until the queued Paste-as-Keys work
completes. A release for a key whose press reached PiKVM before the lock is
allowed through once to prevent a stuck modifier or ordinary key.

The English status panel displays the total character count, elapsed time, and
an indeterminate progress bar. PiKVM does not expose in-request character
progress, so the extension reports confirmed characters only after a complete
RU/EN segment. It does not estimate percentages or split text into artificial
chunks.

`Unlock keyboard` remains available throughout the lock. `Unlock anyway`
removes only local keyboard filtering and does not cancel the active PiKVM
request. The 30-second warning also leaves the keyboard locked and continues to
observe the real PiKVM completion state.

Mouse events, PiKVM controls, browser shortcuts, and macOS shortcuts are not
blocked. A remote mouse click can move focus and redirect remaining text, so the
remote screen should not be clicked during a send.
