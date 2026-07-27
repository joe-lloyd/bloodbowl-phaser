## Context

Block-caused injury (`InjuryOperation.ts:108-124`) is the reference-correct pattern: on `InjuryResult.KO` it calls `movePlayerToBox(player, { box: "ko" }, eventBus)`, which (`playerLocation.ts:75-110`) clears `gridPosition`, sets `player.status`, and emits `GameEventNames.PlayerStatusChanged` — the sole signal `PlayPhaseHandler` (`:273-279`) listens for to call `scene.reconcilePlayerLocation(player.id)`, which hides the sprite once `resolvePlayerLocation`/`playerBoxOf` (status-driven) says the player belongs off-pitch.

`FoulOperation.ts:183-202` reimplements the injury-application switch inline and never calls that seam:
```ts
case InjuryResult.KO:
  eventBus.emit(GameEventNames.UI_Notification, "KNOCKED OUT!");
  target.status = PlayerStatus.KO;
  break;
case InjuryResult.CASUALTY:
  ...
  target.status = PlayerStatus.INJURED;
  eventBus.emit(GameEventNames.PlayerCasualtyInflicted, {...});
  break;
```
No `PlayerStatusChanged`, no `gridPosition` clear — the sprite stays on the pitch forever (until some unrelated full `reconcileBoard()` happens to run).

`SendOffOperation.ts:54-59` has the same shape (`player.status = PlayerStatus.REMOVED` with a notification, no seam call), while the *correct* pattern for send-off already exists elsewhere in the codebase at `EndDriveOperations.ts:107`: `movePlayerToBox(player, { box: "sent-off" }, eventBus)`. `playerLocation.ts` already models `"sent-off"` as a `PlayerBox` value — it's simply never drawn in `Dugout.ts`, which only has Reserves and Dead/Injured sections.

The lingering red highlight is a consequence, not a separate bug: the only red highlight on a player is the foul-targeting hover square (`GameplayInteractionController.ts:1420-1428`), cleared by `deselectPlayer()` (`:1757-1783`) called in a `finally` right after `await this.gameService.foulPlayer(...)`. But `GameService.foulPlayer` (`GameService.ts:1945-1960`) only queues `FoulOperation` via the fire-and-forget `GameFlowManager.add(...)` (`GameFlowManager.ts:55-62`, which calls `process()` without awaiting it) — so the `await` resolves almost instantly, `deselectPlayer()` runs before the queued operation (and any KO/Casualty/Send-Off it triggers) has actually finished, and clears highlights prematurely. Because the KO'd/sent-off target's sprite/square never disappears (the bug above), it stays a valid-looking highlight target with nothing left to clear it until a later full board reconcile.

## Goals / Non-Goals

**Goals:**
- Foul-caused KO, Casualty, and Send-Off all move the player off the pitch and update the view exactly like a block-caused injury does.
- A sent-off player is visibly distinguishable in the dugout (red-card marker) from a merely-KO'd or reserve player.
- The foul highlight clears only after the foul (and its consequence) has actually finished.

**Non-Goals:**
- Changing armour/injury roll probabilities or the referee/send-off check itself.
- A general rework of `GameFlowManager`'s fire-and-forget queueing model beyond waiting on it at this one call site.

## Decisions

- **Reuse, don't reimplement**: `FoulOperation.ts`'s KO/Casualty branches call the same `movePlayerToBox`/`CasualtyOperation` path `InjuryOperation.ts` already uses, rather than maintaining a second copy of the injury-application switch. This also prevents the two switches from drifting again in the future.
- **`SendOffOperation.ts` gets the one missing line**: `movePlayerToBox(player, { box: "sent-off" }, eventBus)`, matching `EndDriveOperations.ts`'s existing call — no new mechanism needed since the box type already exists.
- **Dugout gets a new sent-off section**, rendered similarly to the existing Dead/Injured section but with a red-card icon, driven by the same `playerBoxOf`/`resolvePlayerLocation` status-driven logic already used for the other sections.
- **The foul-highlight clear waits on `GameFlowManager.whenIdle()`** (already implemented, just unused at this call site) before `deselectPlayer()` runs, so it clears only once the operation (and any injury/send-off state change it caused) has actually completed.

## Risks / Trade-offs

- [Awaiting `whenIdle()` before deselecting could make the foul interaction feel slightly less instant] → acceptable; the delay is bounded by the same operation queue already resolving the foul's dice rolls and notifications, which the coach is already watching play out.
