## Why

Three separate multiplayer bug reports all trace back to the guest (non-host) client silently drifting from the host's authoritative state: the ball can render on the wrong square, the per-team turn counter on the guest's scoreboard never advances, and a clock-forced end-of-turn can leave the next team unable to act. None of these are RNG/seed problems — the host is the sole source of dice outcomes and the seed is exchanged once and never re-derived — but each is a real, user-visible desync that makes online play feel broken.

## What Changes

- Fix the guest's `OnlineMatch.applyBundle` so the authoritative snapshot is applied to the local replica **before** the host's events are replayed, not after. Ball/status reconciliation handlers (`BallPlaced`, `BallPickup`, `PlayerStatusChanged`) read `gameService.getState()` synchronously when the event fires; with the old ordering they read the *previous* bundle's stale state, which is what made the ball appear on the wrong square for the guest.
- Sync per-team turn counts (`TurnManager` state) as part of the networked `GameSnapshot`, and restore it into the guest's replica on every applied bundle. The guest's scoreboard turn tracker reads `getTurnNumber(teamId)`, which is backed by `TurnManager.turnCounts` — a field that was never part of `GameSnapshot` and therefore stayed frozen at its initial value on the guest for the whole match.
- Clear/finalize a dangling `state.activePlayer` declaration when a turn is force-ended (`GameService.endTurn()`), whether triggered by the online clock or a manual "End Turn" click mid-activation. Today, ending the turn without going through `finishActivation()` leaves the previous player's committed once-per-turn declaration (Blitz/Pass/Hand-off/Foul) in `state.activePlayer`; the next team's very first `declareAction()` call is then refused by the "a live once-per-turn declaration must release first" guard, making it look like the timer expiry (or End Turn click) didn't actually hand off the turn.
- Add regression tests at the network-session level (following `__tests__/network/sessions.test.ts` patterns) and/or headless-engine level for each of the three fixes, using the existing in-memory transport / `HeadlessGame` harness rather than two real browser clients.

## Capabilities

### New Capabilities

(none — this change fixes behavior inside existing capabilities)

### Modified Capabilities

- `game-sync-transport`: the snapshot exchanged on broadcast/resync must also carry enough turn-tracking state for a guest to reproduce each team's per-turn counter, not just the currently-active team's turn number.
- `match-state-visual-sync`: ball (and other state-derived) visual reconciliation triggered by a networked event bundle must reflect that same bundle's authoritative state, not a stale previously-applied one.
- `turn-timer`: auto end-turn on expiry must leave the engine in a state where the next team can declare actions immediately — no leftover declaration from the force-ended turn may block them.

## Impact

- `src/network/OnlineMatch.ts` — reorder `applyBundle`'s snapshot-apply vs event-replay steps; restore turn-manager state from the snapshot.
- `src/headless/HeadlessGame.ts`, `src/headless/serialization.ts` — extend `GameSnapshot` with turn-manager state and populate it in `HeadlessGame.snapshot()`.
- `src/services/GameService.ts` — `endTurn()` finalizes any dangling `state.activePlayer` before flipping the turn.
- `__tests__/network/sessions.test.ts` (or a new sibling file) — regression coverage for all three fixes.
