# Wispr Flow to PiKVM

Speak into Wispr Flow and have the transcript typed into the active computer
behind PiKVM. The extension turns Flow's normal paste action into PiKVM's
Paste-as-Keys HID input.

```text
Hold Flow shortcut -> speak -> release -> PiKVM types the transcript
```

No agent is installed on the target computer. The target sees an ordinary USB
keyboard, so this works in browsers, desktop applications, login screens, and
other focused text fields.

## Install

### Chrome, Vivaldi, Brave, or Edge

1. Download and unzip the latest release, or clone this repository.
2. Open the browser's extensions page:
   - Chrome: `chrome://extensions`
   - Vivaldi: `vivaldi://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the unzipped repository folder.
5. Reload the PiKVM `/kvm/` tab.

The extension accepts the paste shortcut Flow generates for the local OS:

- macOS: `Cmd+V`
- Windows and Linux: `Ctrl+V`

## Use

1. Open PiKVM and click the desired field on the target computer.
2. In PiKVM's **Text** menu, select a keymap matching the active target layout.
3. Hold the Wispr Flow push-to-talk shortcut, speak, and release it.
4. A notification in the lower-right corner confirms that the text was queued.

The extension temporarily bypasses PiKVM's paste confirmation for this action;
it does not change the saved confirmation preference.

## macOS `Fn` fallback

Flow may decide that the PiKVM canvas is not a text field and copy the transcript
without issuing `Cmd+V`. The optional Hammerspoon Spoon in
[`extras/PiKVMWispr.spoon`](extras/PiKVMWispr.spoon) handles that case while
preserving the same one-action workflow:

1. Copy `extras/PiKVMWispr.spoon` into `~/.hammerspoon/Spoons/`.
2. Add the following to `~/.hammerspoon/init.lua`:

   ```lua
   hs.loadSpoon("PiKVMWispr")
   spoon.PiKVMWispr:start()
   ```

3. Reload Hammerspoon.

After a long `Fn` hold, the Spoon waits for exactly one clipboard change. It
presses `Cmd+V` only if a supported Chromium browser is still frontmost and its
active URL is a `/kvm/` page. It does not interfere with a short `Fn` tap.

## Keyboard layouts

PiKVM maps Unicode text to physical HID key presses using its selected keymap.
The target OS must use the matching active layout:

- PiKVM `en-us` -> target English (US)
- PiKVM `ru` -> target Russian

PiKVM cannot inspect or select the target OS layout. Automatic mixed-language
typing therefore requires target-specific layout switching and is not enabled
by default. See [docs/LAYOUTS.md](docs/LAYOUTS.md).

## Security and privacy

The extension:

- runs only on URLs whose path starts with `/kvm/`;
- reads the clipboard only after `Cmd+V` or `Ctrl+V` in an active PiKVM page;
- does not log, store, or send transcript text anywhere except the PiKVM page;
- ignores duplicate sends within two seconds;
- limits a single transcript to 20,000 characters.

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Development

Requirements: Node.js 20+ and `zip`.

```bash
npm test
npm run package
```

The packaged extension is written to `dist/pikvm-wispr-bridge.zip`.

## Compatibility

- Chromium browsers using Manifest V3
- Stock PiKVM Web UI with `/kvm/`
- Wispr Flow on macOS and Windows

Safari and Firefox are not currently packaged.

## License

[MIT](LICENSE)
