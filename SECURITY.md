# Security

## Reporting

Please open a GitHub issue for non-sensitive problems. For a vulnerability that
could expose clipboard data, use GitHub's private vulnerability reporting if it
is enabled for the repository.

## Security boundary

- The extension activates only on `/kvm/` pages and verifies PiKVM Text controls
  before accepting its private `F18` bridge trigger.
- Clipboard reading requires that trusted private trigger, a fully loaded PiKVM
  UI, and a sender URL whose path is `/kvm/`. Ordinary `Cmd+V` and `Ctrl+V` are
  left to the computer behind PiKVM.
- No PiKVM credentials are stored by the extension; it uses the authenticated
  browser session and PiKVM's own Web UI.
- Automatic keymap selection changes only PiKVM's existing `ru`/`en-us`
  selector. It never sends a layout-switch shortcut to the remote computer.
- The Hammerspoon helper checks both the frontmost browser and active `/kvm/`
  URL, and verifies that the paste event came from the Wispr Flow process,
  before generating the private trigger.
- The main-world controller blocks new remote keyboard events from the private
  trigger until PiKVM confirms completion. It allows a matching release for a
  key forwarded before locking so modifiers cannot remain stuck.
- Cross-world send states contain only allow-listed phases and integer counts,
  never transcript content or error text.

The input lock does not block mouse input, browser shortcuts, or macOS
shortcuts. A remote click can redirect remaining Paste-as-Keys text. Manual
`Unlock anyway` removes local keyboard filtering but cannot cancel a stock
PiKVM request already in progress. A long-running warning therefore keeps the
keyboard locked until completion or explicit manual unlock.

Only load the extension from a repository or release you trust. A browser
extension with clipboard permission can read sensitive text if modified
maliciously.
