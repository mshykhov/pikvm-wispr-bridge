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

## Quick start on macOS

Reliable one-action operation needs two small pieces:

1. The browser extension routes paste into PiKVM Paste-as-Keys.
2. The Hammerspoon helper handles the case where Flow copies a transcript but
   does not paste because the PiKVM canvas is not a text field.

### 1. Load the browser extension

1. Download and unzip the latest release, or clone this repository.
2. Open the browser's extensions page:
   - Chrome: `chrome://extensions`
   - Vivaldi: `vivaldi://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the unzipped repository folder.
5. Reload the PiKVM `/kvm/` tab.

Chromium does not allow a GitHub project to silently install an unpacked
extension. Publishing in a browser store can remove this manual step later.

### 2. Install the macOS helper

Install [Hammerspoon](https://www.hammerspoon.org/) first, then run from the
repository root:

```bash
./scripts/install-macos.sh
```

The installer:

- creates a backup of an existing `~/.hammerspoon/init.lua`;
- links the bundled `PiKVMWispr.spoon`;
- adds a small managed block to the Hammerspoon configuration;
- reloads Hammerspoon when its command-line helper is available;
- can be run repeatedly without duplicating configuration.

To remove the helper:

```bash
./scripts/uninstall-macos.sh
```

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

## Automatic Russian and English switching

The extension can split mixed text such as `Привет, hello` into Cyrillic and
Latin runs, switch the target layout, select the matching PiKVM keymap, and send
each run in order.

Setup:

1. Leave only Russian and English layouts enabled on the target computer.
2. Set the target layout and PiKVM **Text** keymap to the same language once.
3. Open the extension popup from the browser toolbar.
4. Auto switching is enabled by default. Leave **Automatically switch RU/EN**
   enabled.
5. Select the shortcut used by the target computer:
   - `Alt+Shift`
   - `Win/Super+Space`
   - `Ctrl+Shift`
   - `Ctrl+Space`
6. Dictate a mixed phrase and keep the PiKVM tab active until typing finishes.

Auto mode assumes the selected PiKVM keymap represents the target's current
layout. Both remain synchronized after each language switch. If the target
layout is changed manually outside the extension, repeat step 2.

## How the macOS `Fn` fallback works

Flow may decide that the PiKVM canvas is not a text field and copy the transcript
without issuing `Cmd+V`. The optional Hammerspoon Spoon in
[`extras/PiKVMWispr.spoon`](extras/PiKVMWispr.spoon) handles that case while
preserving the same one-action workflow:

After a long `Fn` hold, the Spoon waits for exactly one clipboard change. It
presses `Cmd+V` only if a supported Chromium browser is still frontmost and its
active URL is a `/kvm/` page. It does not interfere with a short `Fn` tap.

The extension alone is sufficient when Flow already generates `Cmd+V`. The
helper makes the behavior reliable when Flow only copies the transcript.

## Keyboard layouts

PiKVM maps Unicode text to physical HID key presses using its selected keymap.
The target OS must use the matching active layout:

- PiKVM `en-us` -> target English (US)
- PiKVM `ru` -> target Russian

PiKVM cannot inspect the target OS layout. Automatic mixed-language typing is
enabled by default and uses `Alt+Shift` until another target shortcut is selected. See
[docs/LAYOUTS.md](docs/LAYOUTS.md).

## Security and privacy

The extension:

- runs only on URLs whose path starts with `/kvm/`;
- reads the clipboard only after `Cmd+V` or `Ctrl+V` in an active PiKVM page;
- does not log, store, or send transcript text anywhere except the PiKVM page;
- stores only the Auto-layout toggle, shortcut choice, and switch delay;
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

The browser extension supports Windows and Linux, but the automatic
clipboard-change fallback is currently macOS-only. Safari and Firefox are not
currently packaged.

## License

[MIT](LICENSE)
