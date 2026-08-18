# Security

## Reporting

Please open a GitHub issue for non-sensitive problems. For a vulnerability that
could expose clipboard data, use GitHub's private vulnerability reporting if it
is enabled for the repository.

## Security boundary

- The extension activates only on `/kvm/` pages and verifies PiKVM Text controls
  before intercepting paste.
- Clipboard text is read only in response to a paste shortcut.
- No PiKVM credentials are stored by the extension; it uses the authenticated
  browser session and PiKVM's own Web UI.
- The optional Hammerspoon helper checks both the frontmost browser and active
  `/kvm/` URL before generating a paste shortcut.

Only load the extension from a repository or release you trust. A browser
extension with clipboard permission can read sensitive text if modified
maliciously.
