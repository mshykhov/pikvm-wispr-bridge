# Wispr Flow to PiKVM repository

This guidance is generated from `.rulesync/rules/repository.md`; edit the source,
not `AGENTS.md` or `CLAUDE.md`.

This repository contains a Chromium extension and macOS Hammerspoon helper that
turn a Wispr Flow transcript into PiKVM Paste-as-Keys HID input. Read
`docs/README.md` before changing architecture, security boundaries, commands, or
documentation structure.

## Critical invariants

- Run extension code only on HTTP(S) paths rooted at `/kvm/` and validate the
  PiKVM Text controls before accepting the private `F18` trigger.
- Leave ordinary `Cmd+V` and `Ctrl+V` to the computer behind PiKVM. Only the
  Hammerspoon handoff may cause the extension to read the Mac clipboard.
- Never send target layout-switch shortcuts. Automatic mode changes only the
  PiKVM `ru` or `en-us` host keymap selector.
- Do not log, persist, or transmit transcript text outside the authenticated
  PiKVM page. Keep sender URL validation and the 20,000-character limit.

## Architecture

- `extras/PiKVMWispr.spoon/init.lua` arms after a long `Fn` hold, observes one
  clipboard change, suppresses Flow's own paste, and emits `F18`.
- `intercept.js` keeps `F18` away from PiKVM's remote keyboard handler.
- `bridge.js` validates readiness, queues text, selects keymaps, and drives the
  stock PiKVM Paste-as-Keys controls.
- `background.js` and `offscreen.js` own the permission-gated clipboard read.
- `languages.js` splits Cyrillic and Latin runs; `popup.js` persists only the
  automatic PiKVM keymap preference.
- `scripts/` installs the helper, removes it safely, and packages the extension.

## Commands

```sh
npm ci
npm test
npm run package
npm run rulesync:verify
npm run verify
```

Edit `.rulesync/`, then run `npm run rulesync:dry-run` before
`npm run rulesync:generate`.

## Change contract

- Follow existing dependency-free JavaScript and Lua patterns unless a task
  explicitly justifies an architectural or dependency change.
- Add regression coverage in `test/extension.test.js` for behavior changes,
  especially clipboard, keyboard interception, URL scope, and installer safety.
- Preserve idempotent installation, ownership checks, backups, and exact `/kvm/`
  URL boundaries in the macOS helper.
- Keep `manifest.json`, package contents, README, privacy, security, and living
  documents aligned with user-visible or permission changes.
- Use Conventional Commits without trailers and run `npm run verify` before
  committing.

## Documentation

Follow `docs/SCHEMA.md` and the section indexes. Living documents change with
the code they describe; decisions and reviews are snapshots and are superseded
rather than rewritten. Verify changed relative links directly.
