# Privacy

Wispr Flow to PiKVM does not collect analytics, telemetry, account information,
or browsing history.

The extension first uses the browser's standard `paste` event. Some PiKVM focus
targets do not produce that event, so the extension also requests clipboard-read
permission for a fallback. The fallback runs only after a trusted `Cmd+V` or
`Ctrl+V` event on a fully loaded PiKVM `/kvm/` page. Clipboard access happens in
a hidden offscreen extension document.

Transcript text is placed into PiKVM's existing Paste-as-Keys control. It is not
stored by the extension, written to logs, or sent to another service.

The extension stores only whether automatic PiKVM keymap selection is enabled.
Transcript text is never written to extension storage.

The optional Hammerspoon helper observes the next clipboard change only after a
long `Fn` hold while a PiKVM tab is active. It stops after one text change or a
20-second timeout.
