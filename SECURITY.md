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

Only load the extension from a repository or release you trust. A browser
extension with clipboard permission can read sensitive text if modified
maliciously.
