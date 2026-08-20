# PiKVM input lock and send status design

Status: proposed

## Goal

Prevent physical keyboard input from being mixed with an active PiKVM
Paste-as-Keys operation. Keep the state obvious and provide an explicit escape
hatch without changing the existing text transfer protocol.

## Scope and constraints

- Lock only keyboard events headed to PiKVM's remote keyboard handler.
- Keep the mouse, PiKVM controls, browser UI, and macOS shortcuts available.
- Keep all extension UI text in English.
- Never log or expose transcript text. UI and cross-world state contain counts
  and fixed status values only.
- Continue using PiKVM's stock Paste-as-Keys button and completion state.
- Do not split a transcript into artificial chunks or display estimated
  percentages. PiKVM reports completion only after a complete request.

Remote mouse clicks remain possible by explicit product choice. A click on the
remote screen can change the target focus while Paste-as-Keys is running, so
the status panel must not imply that mouse interaction is protected.

## Architecture

`intercept.js` becomes the main-world input-lock controller. It already runs at
`document_start` before PiKVM registers its keyboard handlers and already owns
the private `F18` interception boundary.

On a trusted, non-repeating `F18` event and a ready PiKVM page, the controller
synchronously locks remote keyboard input before stopping `F18`. While locked,
capture-phase listeners stop `keydown` and `keyup` events whose target is a
PiKVM remote keyboard surface. Other page controls and pointer events continue
to work.

`bridge.js` continues to own clipboard validation, the send queue, language
segments, and Paste-as-Keys completion. It publishes only fixed state and
numeric progress metadata to the main-world controller. It never publishes the
transcript. The controller owns the visible panel and manual unlock flow, so
the escape hatch remains available even if the isolated content script fails
after the initial trigger.

The isolated bridge publishes a document-level `pikvm-wispr-state` custom
event. Its detail is limited to an allow-listed phase plus non-negative integer
`total` and `confirmed` counts. The controller ignores unknown phases and
invalid counts. The event never contains text, key data, clipboard data, URLs,
or host information.

The lock covers the complete queued operation, including keymap changes and all
language segments. Completion or a failure known to occur before PiKVM starts
sending unlocks automatically. An error after the stock send button is clicked
cannot prove that PiKVM stopped, so it keeps the keyboard locked.

## States

1. `idle`: no panel and no keyboard filtering.
2. `sending-locked`: remote keyboard events are filtered and the panel shows
   active sending state.
3. `long-running-locked`: 30 seconds have elapsed without completion. This is
   a warning, not cancellation. Sending and completion observation continue.
4. `unlock-confirmation`: the user is warned that PiKVM may still be typing.
   The keyboard remains locked while the choice is open.
5. `sending-unlocked`: the user chose `Unlock anyway`. Sending continues, but
   remote keyboard events are no longer filtered.
6. `complete`: the controller removes the lock and briefly shows success.
7. `failed-safe`: a post-start failure keeps the lock and exposes the same
   manual unlock flow.

A new trusted `F18` trigger starts a new locked operation even if a prior
operation was manually unlocked. Reloading or leaving the page clears the
page-local lock and panel.

## Status panel

The existing lower-right notification becomes a persistent send panel. During
normal sending it contains:

- `PiKVM keyboard locked`
- `Sending 428 characters · 6.2s elapsed`
- an indeterminate animated progress bar;
- a secondary `Unlock keyboard` button that is always visible.

For a transfer with multiple language segments, each completed segment updates
a truthful confirmed count such as `120 of 428 characters confirmed`. A
single-segment transfer stays indeterminate until completion. The panel does
not infer progress inside the currently active PiKVM request.

After 30 seconds, the panel changes to a warning style and says:

- `PiKVM is still sending after 30 seconds`
- `Keyboard remains locked · 30.0s elapsed`

The timeout does not reject the send, start another request, or unlock the
keyboard.

Selecting `Unlock keyboard` opens an inline confirmation:

- title: `Unlock keyboard?`
- body: `PiKVM may still be sending text. Unlocking can mix your keystrokes with the active paste.`
- actions: `Keep locked` and `Unlock anyway`

After manual unlock, the panel uses a warning style and says:
`Sending continues · Keyboard unlocked manually`. It remains visible until the
operation completes or the page is left.

On confirmed completion, the lock is removed and the panel briefly shows
`Sent 428 characters`. Errors that occur before sending use the existing error
notification without leaving a lock behind.

## Timeout and recovery

The current fixed 30-second rejection is replaced with a 30-second overdue
warning. PiKVM's stock request may legitimately run longer for long text or a
configured per-key delay, and the browser does not expose safe cancellation or
in-request progress through the stock controls.

Manual unlock changes only local keyboard filtering. It does not cancel
Paste-as-Keys. The confirmation must state this explicitly. The extension does
not send HID reset, key releases, or layout shortcuts as part of unlock.

## Verification

Automated coverage must prove that:

- `F18` locks synchronously and never reaches PiKVM;
- remote `keydown` and `keyup` are blocked while locked;
- mouse events and keyboard events outside the remote surfaces remain
  unaffected;
- the button is visible throughout sending;
- `Keep locked` preserves filtering;
- `Unlock anyway` removes filtering without reporting cancellation;
- the 30-second warning keeps the send pending and the keyboard locked;
- pre-send errors unlock, while post-start uncertainty stays locked;
- success unlocks and clears timers;
- progress messages contain counts but never transcript text;
- queued RU/EN segments keep one operation-level lock.

Manual verification uses a harmless target text field and checks the locked,
confirmation, manual-unlock, completion, and reload paths. It must confirm that
ordinary physical paste still behaves as before and that no transcript text is
written to extension logs.

## Documentation impact

Implementation updates the root README, architecture overview, keyboard
reference, privacy and security documents where their current behavior claims
change. The Rulesync canonical repository guidance is repaired before generated
instruction files are refreshed.

## Non-goals

- Exact per-character progress from PiKVM.
- Artificial request chunking.
- Cancelling a stock PiKVM Paste-as-Keys request.
- Blocking remote mouse input.
- Blocking browser or macOS shortcuts.
- Logging transcript content.
