# System overview

Wispr Flow to PiKVM is a local bridge with no agent on the target computer. A
macOS helper observes a transcript copied by Wispr Flow, a Chromium extension
places it into PiKVM's existing Paste-as-Keys control, and PiKVM emits ordinary
USB HID keyboard events to the target.

## Components

- The Hammerspoon Spoon identifies Flow-generated paste by its macOS process,
  checks the frontmost browser and `/kvm/` URL, suppresses that paste event, and
  emits the private `F18` trigger.
- The main-world content script stops `F18` before PiKVM's remote keyboard
  handler can forward it.
- The isolated content script validates PiKVM Text controls, requests clipboard
  text, queues sends, splits language runs, and drives Paste-as-Keys.
- The service worker validates the sender URL and creates an offscreen document.
  The offscreen document performs the permission-gated clipboard read.
- The popup stores only the `autoKeymap` boolean in extension-local storage.

## Transcript flow

1. Wispr Flow places its transcript on the clipboard and generates `Cmd+V`.
2. The helper accepts that event only when its source is Wispr Flow and a
   supported browser has an active HTTP(S) `/kvm/` tab, then replaces it with
   `F18`.
3. The extension validates the loaded PiKVM controls and asks the service worker
   for clipboard text.
4. The service worker accepts requests only from `/kvm` or `/kvm/...` and reads
   the clipboard through its offscreen document.
5. The content script rejects empty, oversized, or immediate duplicate text,
   then sends queued language segments through PiKVM's Text controls.
6. PiKVM maps each segment through its selected host keymap and sends physical
   HID keypresses. The target OS owns the focused field and active layout.

## State and boundaries

Transcript text exists in the Mac clipboard, extension messages, an in-memory
queue, and PiKVM's Text control. The extension does not store or log it. The only
persistent extension state is automatic keymap selection.

The bridge relies on Chromium Manifest V3 APIs, Hammerspoon, Wispr Flow, the
stock PiKVM Web UI DOM, and PiKVM's authenticated browser session. It cannot
inspect the target clipboard or determine or switch the target OS layout.
