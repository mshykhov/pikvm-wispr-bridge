# Privacy

Wispr Flow to PiKVM does not collect analytics, telemetry, account information,
or browsing history.

The extension requests clipboard-read permission for the bridge. It reads the
clipboard only after a trusted private `F18` trigger on a fully loaded PiKVM
`/kvm/` page. The Hammerspoon helper generates that trigger after a long `Fn`
dictation and clipboard change. Clipboard access happens in a hidden offscreen
extension document. Ordinary `Cmd+V` and `Ctrl+V` do not trigger clipboard
access.

Transcript text is placed into PiKVM's existing Paste-as-Keys control. It is not
stored by the extension, written to logs, or sent to another service.

The extension stores only whether automatic PiKVM keymap selection is enabled.
Transcript text is never written to extension storage.

The Hammerspoon helper observes the next clipboard change only after a long `Fn`
hold while a PiKVM tab is active. It stops after one text change or a 20-second
timeout.
