## Why

A captured online-match console log showed a guest coach's Block action getting permanently stuck ("infinite roll for a block") while a Vampire's Bloodlust roll never fired. The log's tell: `NetworkedGameService` logged `host rejected cancel-action: command-failed: action-already-committed` five times in a row, then `host rejected declare-action: command-failed: illegal-action-declaration`, then a local `Switched action step to: block`, then `host rejected block: command-failed: block-not-declared` — the host refusing everything while the guest's UI kept acting as if each command had succeeded. Investigation traced this to a real, reproducible bug: `NetworkedGameService.declareAction()`/`cancelAction()` are "optimistic" — they report success to their caller synchronously, before the host's asynchronous verdict is even known — and `GameplayInteractionController` builds its local action-mode/step-machine directly off that premature "true". When the host's real answer arrives and is a rejection, nothing rolls the controller's local state back, so it keeps describing a declaration the host never accepted. Every further click (e.g. attempting the Block) then bounces off the host forever, and any host-side skill roll that would have fired for the action the coach *thinks* is live (here, the Bloodlust gate) never happens, because the host never actually held that declaration.

## What Changes

- `NetworkedGameService` now emits a `NetworkCommandRejected` event (via an injected `IEventBus`) whenever a fire-and-forget command it already reported as successful is actually rejected by the host, carrying the command type, the player/attacker id, the declared action (when applicable), and the rejection reason.
- `GameplayInteractionController` subscribes to `NetworkCommandRejected` and reconciles: when the rejection matches the controller's current optimistic local state (the declare-action it just "succeeded" into, or any rejected cancel-action for the currently selected player), it deselects and immediately reselects the player, rebuilding the action menu from the — by then snapshot-corrected — replica, and surfaces a notification explaining the resync. This breaks the "stuck on a step the host never agreed to" loop instead of leaving the coach clicking into a wall.
- Regression coverage added at three layers: `HostSession`/`GuestSession` protocol level (a seeded Bloodlust scenario reproducing the exact `action-already-committed` → `illegal-action-declaration` → `block-not-declared` rejection sequence from the log, and asserting host state never mutates through it), `NetworkedGameService` unit level (asserting `NetworkCommandRejected` fires with the right payload on rejection), and `GameplayInteractionController` unit level (asserting the local step-machine resets on a matching rejection and ignores non-matching ones).

## Capabilities

### New Capabilities

(none — this extends the existing online-play capability's guest command handling)

### Modified Capabilities

- `remote-play`: adds a requirement that the guest's local interaction state reconciles when the host rejects a command the guest's UI had already optimistically treated as successful, instead of the guest continuing to act on a stale assumption.

## Impact

- `src/network/NetworkedGameService.ts` — accepts an optional `IEventBus`; emits `NetworkCommandRejected` on any rejected command.
- `src/network/OnlineMatch.ts` — passes the match's event bus into the guest's `NetworkedGameService`.
- `src/game/controllers/GameplayInteractionController.ts` — new `onNetworkCommandRejected` handler (with an `interactionSeq`/`pendingCancelSeqByPlayer` staleness guard covering both the `declare-action` and `cancel-action` branches), subscribed/unsubscribed alongside the controller's other listeners.
- `src/types/events.ts` — new `GameEventNames.NetworkCommandRejected` event and payload type.
- `src/services/GameService.ts` — `declareAction()` also refuses a same-player redeclare when the live declaration's commit reason is `"gate"` (an activation-gate roll already fired), closing a narrow host-side gap found in review (see design.md's addendum). This is the one host-side rule change in this PR; it does not touch the once-per-turn guard or the Move-then-Block carve-out.
- Tests: `__tests__/network/sessions.test.ts`, `__tests__/headless/defer-action-commitment.test.ts`, `__tests__/unit/controllers/GameplayInteractionController.test.ts`.
