# Privacy

Wispr Flow to PiKVM does not collect analytics, telemetry, account information,
or browsing history.

The extension does not request clipboard-read permission. It receives text only
from the browser's standard `paste` event after the user or Wispr Flow produces
`Cmd+V` or `Ctrl+V` while an eligible PiKVM `/kvm/` page is active.

Transcript text is placed into PiKVM's existing Paste-as-Keys control. It is not
stored by the extension, written to logs, or sent to another service.

The extension stores only whether automatic PiKVM keymap selection is enabled.
Transcript text is never written to extension storage.

The optional Hammerspoon helper observes the next clipboard change only after a
long `Fn` hold while a PiKVM tab is active. It stops after one text change or a
20-second timeout.
