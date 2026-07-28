## Why

Four follow-up bugs surfaced by real play since `implement-kickoff-event-table` shipped and was archived:

1. **The x/x selection counter doesn't update as players are selected/moved.** `KickoffEventOverlay.tsx` calls `setStep(gameService.getKickoffEventStep())` on every relevant event, but `KickoffEventManager.getStep()` returns the *same mutable object* it always has — `togglePlayerSelection`, `movePlayer`, and `placePlayer` all mutate `this.step`'s arrays in place rather than replacing the object. React's `useState` setter bails out on a referentially-identical value, so the overlay silently stops re-rendering mid-step even though the engine state underneath has genuinely changed.
2. **Charge! looks broken — the coach can't move their guys.** `advanceCharge()` has the identical problem: it mutates `this.step.charge.activePlayerId` in place, so the overlay's displayed "active player" and instructions freeze on the first Charge! player even after the engine has moved on to the second or third, making it look like nothing is happening when a player tries to act on whoever the (stale) UI shows.
3. **The kickoff table roll isn't reproducing after a page refresh/reroll.** Rolling the kickoff table once, refreshing, then triggering it again produces a different result than expected for what should be the same deterministic sequence, risking desync.
4. **The kickoff panel gets shoved down the page by the player-hover panel.** `GameHUD.tsx` renders `PlayerInfoPanel` before `KickoffEventOverlay` in the same flex column, and `PlayerInfoPanel` stacks hovered content above selected content (`flex-col-reverse`) — so hovering a player both grows the panel above the kickoff overlay (pushing it down) and shows the shortest-lived content (hover) above the longer-lived content (selection), the opposite of the desired top-to-bottom order: kickoff notes, then selected player, then hovered player.

## What Changes

- `KickoffEventManager.getStep()` SHALL return a fresh, structurally-copied snapshot of the current step (including its `charge` sub-object and array fields) on every call, so any state consumer using referential-equality change detection (React `useState`, `useEventBus`-driven refresh) reliably re-renders on every mutation within a step's lifetime.
- The Charge! sequence's active player and progress SHALL be visibly current at every point in the sequence — never frozen on a stale prior player once `advanceCharge()` has moved on.
- Resolving the kickoff table exactly once per drive SHALL be guaranteed even across a page refresh/state-restore mid-kickoff: the table SHALL NOT be rolled a second time for a drive whose kickoff has already resolved, and restoring a saved match mid-kickoff SHALL reproduce the already-resolved event and outcome rather than rolling again.
- The kickoff HUD layout SHALL render, top to bottom: the kickoff event panel (fixed, unaffected by hover), then the selected player's info, then the hovered player's info — hovering a player SHALL NOT move or resize the kickoff panel.

## Capabilities

### Modified Capabilities
- `kickoff-events`: add a requirement that a drive's kickoff table is resolved exactly once, including across a save/restore mid-kickoff.
- `kickoff-event-interactions`: add a requirement that the interactive-step UI (selection count, Charge! active player) always reflects the engine's current step state, not a stale snapshot from when the step began.

## Impact

- `src/game/kickoff/KickoffEventManager.ts` — `getStep()` snapshot semantics; `advanceCharge()`, `togglePlayerSelection()`, `movePlayer()`, `placePlayer()` unaffected internally (still mutate freely) since the fix is at the read boundary.
- `src/ui/components/hud/KickoffEventOverlay.tsx` — no change needed once `getStep()` returns a fresh reference each call, but verify its `refresh()` wiring.
- `src/ui/components/hud/GameHUD.tsx` — reorder `KickoffEventOverlay` before `PlayerInfoPanel` in the right HUD column.
- `src/ui/components/hud/PlayerInfoPanel.tsx` — stop reversing hovered above selected; selected renders above hovered.
- `src/services/GameService.ts` / `src/game/managers/BallManager.ts` (`resolveKickoffEvent`, `rollKickoff`) — guard against re-rolling a drive's kickoff table after it has already resolved, including on state restore.
- `src/services/rng/RNGService.ts` — verify `getState()`/`setState()` (already capturing `currentSeed`) are actually persisted and restored around the kickoff sequence; this may turn out to be a duplicate-roll bug rather than an RNG-state bug — investigate both.
