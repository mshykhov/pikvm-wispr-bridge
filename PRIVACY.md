# Privacy

Wispr Flow to PiKVM does not collect analytics, telemetry, account information,
or browsing history.

The extension requests clipboard-read permission for the bridge. It reads the
clipboard only after a trusted private `F18` trigger on a fully loaded PiKVM
`/kvm/` page. The Hammerspoon helper generates that trigger only when a paste
event comes from the Wispr Flow macOS process. Clipboard access happens in a
hidden offscreen extension document. Physical `Cmd+V` and `Ctrl+V` do not
trigger clipboard access.

Transcript text is placed into PiKVM's existing Paste-as-Keys control. It is not
stored by the extension, written to logs, or sent to another service.

The isolated bridge sends the main-world status panel only an allow-listed
phase and non-negative integer total/confirmed character counts. These status
events never contain transcript text, error messages, keys, URLs, or host
information.

The extension stores only whether automatic PiKVM keymap selection is enabled.
Transcript text is never written to extension storage.

The Hammerspoon helper does not read transcript text. It identifies the source
process of keyboard events and replaces only Flow-generated paste on an active
PiKVM page with the private trigger.
