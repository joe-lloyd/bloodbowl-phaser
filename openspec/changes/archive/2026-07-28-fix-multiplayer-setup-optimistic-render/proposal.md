## Why

During online multiplayer setup, dragging an already-placed player from one legal
pitch square directly to another legal pitch square makes the player sprite visibly
flash back into the Reserves dugout box for a moment before settling at the new
square. It reads as a bug (a player briefly "un-drafted" from the pitch) and it is
one — the local drag path treats a reposition as remove-then-place instead of an
atomic move, and that split survives all the way to the network layer.

## What Changes

- `PlayerPlacementController.placePlayer` stops emitting `PlayerRemoved` for a
  player who is already on the pitch and is simply being relocated to a new legal
  square. The engine's `placePlayer` (both local `SetupManager` and the guest's
  `NetworkedGameService`) already atomically overwrites a player's pitch position in
  one step — the extra `PlayerRemoved` emit was redundant local bookkeeping that
  also, as a side effect, told the engine "send this player to Reserves."
  `PlayerRemoved` is now reserved for its one real meaning: a player actually
  leaving the pitch (dropped outside the setup zone, or explicitly removed).
- Online guest setup: `OnlineMatch`'s existing "preserve my in-flight setup
  placements" guard (`applyBundle`/`preserveMySetup`) is hardened to also preserve
  `player.status` alongside `gridPosition` while an authoritative snapshot for the
  guest's own team is being reconciled during their own setup turn. This closes a
  latent gap where an intermediate host snapshot could restore the correct square
  but leave `status` at a stale `Reserve`, which alone is enough to flip the
  dugout-box computation (`playerBoxOf`) to Reserves even though the player still
  holds a pitch square.
- No rule, validation, or network-protocol behavior changes — this is a rendering
  correctness fix for an already-legal move.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `remote-play`: adds a requirement that a guest's own in-flight setup actions
  render optimistically and reconcile without a visible flash to the Reserves box.

## Impact

- `src/game/controllers/PlayerPlacementController.ts` — remove the redundant
  `PlayerRemoved` emit on reposition.
- `src/network/OnlineMatch.ts` — harden `preserveMySetup` to also protect
  `player.status`.
- `__tests__/setup/PlayerPlacementController.test.ts` — add/extend coverage
  asserting a reposition emits only `PlayerPlaced`, not `PlayerRemoved`.
- Network/multiplayer test suite — add a scenario asserting the guest's replica
  never observes a player in the Reserves box mid-reposition.
