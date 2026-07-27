## Why

A block-caused KO already works correctly: `InjuryOperation` routes a KO result through `movePlayerToBox(player, { box: "ko" }, eventBus)` (`src/game/rules/playerLocation.ts`), which clears `gridPosition`, sets status, and emits `PlayerStatusChanged` — the one event `PlayPhaseHandler` listens for to reconcile the sprite off the pitch. `FoulOperation.ts` duplicates that injury-application switch inline instead of reusing the seam: on KO it sets `target.status = PlayerStatus.KO` directly with no `movePlayerToBox` call and no `PlayerStatusChanged` emission, so the sprite never disappears from the pitch and the player never visually reaches the KO box, even though engine state marked them KO'd. The same gap exists for foul-caused Casualty. `SendOffOperation.ts` has the identical shape: `player.status = PlayerStatus.REMOVED` with no `movePlayerToBox(player, { box: "sent-off" }, eventBus)` (the correct pattern already exists elsewhere, e.g. `EndDriveOperations.ts:107`) and no status-changed event — and there is no dugout rendering for a "sent-off" player at all (`Dugout.ts` only draws Reserves and Dead/Injured sections). Because the KO'd/sent-off player's sprite lingers on the pitch looking Stunned/Prone, the fouling player's red foul-target highlight (cleared by `deselectPlayer()` in a `finally` right after the fire-and-forget `foulPlayer()` call, well before `FinishFoulActivationOperation`/`SendOffOperation` actually run) has something to keep re-highlighting, compounding the "stuck highlight" symptom.

## What Changes

- A foul-caused KO or Casualty SHALL move the target player to its box (KO box / dead-and-injured) through the same `movePlayerToBox` seam block-caused injuries already use, clearing `gridPosition` and emitting `PlayerStatusChanged` so the pitch view reconciles exactly as it does for a block.
- A Sent Off player SHALL be moved to a "sent-off" box through `movePlayerToBox`, removing them from the pitch, and the dugout SHALL render a distinct section/icon (e.g. a red-card marker) for sent-off players so it's visually clear they cannot play the rest of the match.
- The fouling player's red target-highlight SHALL clear only once the foul's full resolution (including any KO/Casualty/Send-Off consequence) has actually completed, not merely once the fire-and-forget operation has been queued.

## Capabilities

### New Capabilities
- `foul-injury-resolution`: how a foul's KO, Casualty, and Send-Off outcomes relocate the affected player off the pitch (KO box, dead-and-injured, sent-off/dugout-with-marker) and reconcile the view, mirroring the existing block-caused injury seam.

## Impact

- `src/game/operations/FoulOperation.ts` — route KO/Casualty through `movePlayerToBox`/existing `CasualtyOperation` instead of an inline duplicate switch.
- `src/game/operations/SendOffOperation.ts` — call `movePlayerToBox(player, { box: "sent-off" }, eventBus)`, matching `EndDriveOperations.ts`'s existing pattern.
- `src/game/elements/Dugout.ts` — add a sent-off/ejected section with a distinguishing icon (e.g. red card).
- `src/game/controllers/GameplayInteractionController.ts` (`foulPlayer` call site, `deselectPlayer`) — wait on `GameFlowManager.whenIdle()` (already exists, `GameFlowManager.ts:76-81`) before clearing the foul highlight, instead of clearing it immediately after the fire-and-forget `flowManager.add(...)` call.
