## 1. Investigation

- [x] 1.1 Read the full captured console log in `NOTES_FOR_AI.md` and extract the load-bearing lines (the three host rejections plus the local step-switch between them)
- [x] 1.2 Trace `NetworkedGameService.declareAction()`/`cancelAction()` and confirm they answer optimistically before the host's verdict is known
- [x] 1.3 Trace `GameplayInteractionController.onActionSelected()`/`onCancelAction()` and confirm they mutate local step-machine state directly off that optimistic return value, with no reconciliation path
- [x] 1.4 Trace `GuestSession`/`OnlineMatch.applyBundle` and confirm the passive replica's *data* already self-corrects on every response (ok or rejected) via the snapshot — ruling out the replica itself as the divergence source
- [x] 1.5 Trace `PlayerActionManager`/`GameService.declareAction`/`ActivationGateOperation` to confirm the host-side commit/refusal logic is internally consistent and reproduces the exact three rejection reasons from the log in sequence
- [x] 1.6 Document confirmed-vs-uncertain findings in `design.md`

## 2. Fix

- [x] 2.1 Add `GameEventNames.NetworkCommandRejected` (and its payload type) to `src/types/events.ts`
- [x] 2.2 `NetworkedGameService` accepts an optional `IEventBus` and emits `NetworkCommandRejected` from `send()` when a response comes back rejected
- [x] 2.3 Wire the match's event bus into the guest's `NetworkedGameService` construction in `OnlineMatch.ts`
- [x] 2.4 `GameplayInteractionController` subscribes to `NetworkCommandRejected` (`onNetworkCommandRejected`), reconciling local state when the rejection matches its current optimistic declare-action or any cancel-action rejection for the selected player, and ignoring unrelated rejections
- [x] 2.5 Register/unregister the new listener alongside the controller's other listeners (constructor / `destroy()`)

## 3. Regression tests

- [x] 3.1 `__tests__/network/sessions.test.ts`: seeded Bloodlust scenario reproducing the exact `action-already-committed` → `illegal-action-declaration` → `block-not-declared` sequence at the `HostSession`/`GuestSession` protocol layer, asserting host state is never mutated by the stale commands
- [x] 3.2 `__tests__/headless/defer-action-commitment.test.ts`: `NetworkedGameService`-level test asserting `NetworkCommandRejected` fires with the correct payload for rejected `cancel-action`/`declare-action`, and does not fire for an accepted command
- [x] 3.3 `__tests__/unit/controllers/GameplayInteractionController.test.ts`: controller-level tests asserting `onNetworkCommandRejected` resets local action-mode/step state on a matching rejection and leaves it untouched for a non-matching one (different player, or an already-superseded action)

## 4. Verification

- [x] 4.1 Run the three touched test files directly (pass)
- [x] 4.2 Run the full test suite (`npm test` / pre-commit hook) before committing — 1349/1349 passed across 147 files
- [x] 4.3 Confirm no host-side rule/commit behavior changed (design.md's Non-Goals)
