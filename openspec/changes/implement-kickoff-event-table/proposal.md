## Why

Every drive rolls on the kickoff table and then does nothing with the result. `KickoffController.rollKickoffEvent()` maps 2-12 to a name, emits `KickoffResult`, and the handler prints it — no Bribe is granted, no turn marker moves, no player is re-set-up, no re-roll is awarded. Worse, the table it rolls on is the standard Blood Bowl table, not the Sevens one: it has "Perfect Defense" on 4, "Blitz!" on 10 and "Throw a Rock" on 11, none of which exist in Sevens, and it puts Brilliant Coaching on 8 where Sevens puts Changing Weather. So the one moment that is supposed to make each drive different is currently a label on a dice roll.

## What Changes

- **The Sevens kickoff table replaces the standard one.** The roll SHALL resolve on the Blood Bowl Sevens table: 2 Get the Ref, 3 Time-Out, 4 Solid Defence, 5 High Kick, 6 Cheering Fans, 7 Brilliant Coaching, 8 Changing Weather, 9 Quick Snap, 10 Charge!, 11 Dodgy Snack, 12 Pitch Invasion.
- **Every event has its rulebook effect.** Each result SHALL apply its effect to game state — Bribes granted, turn markers moved, free team re-rolls awarded for the drive, weather re-rolled with a Scatter (3) on Perfect Conditions, MA/AV reduced for the drive, players placed prone and stunned.
- **Events that need a coach act before the ball lands.** Solid Defence, High Kick, Quick Snap and Charge! SHALL open an interactive step for the owning coach — selecting up to D3+1 players, re-placing them, moving them one square, placing a receiver under the ball, or running a free activation sequence — and the kickoff SHALL wait for that step to complete or be skipped.
- **Charge! ends early on a knockdown.** When a player selected for Charge! falls over or is knocked down during their free activation, no further selected players SHALL be activated.
- **Drive-scoped effects expire with the drive.** A free re-roll, an Offensive Assist owed to the next Block, and a Dodgy Snack MA/AV reduction SHALL last exactly as long as the rules say and SHALL be cleared when that window closes.
- **Results are legible.** The roll, the named event and its rulebook meaning SHALL be recorded in the match log, and the effect on each team SHALL be visible rather than silent.

## Capabilities

### New Capabilities
- `kickoff-events`: the Sevens 2-12 kickoff table, its roll, and the events that resolve without coach input (Get the Ref, Time-Out, Cheering Fans, Brilliant Coaching, Changing Weather, Dodgy Snack, Pitch Invasion), including the lifetime of the drive-scoped effects they create.
- `kickoff-event-interactions`: the events that require the coach to act before the kick resolves — Solid Defence, High Kick, Quick Snap and Charge! — including the D3+1 selection, the free activations, and how the kickoff waits for and can skip them.

## Impact

- Kickoff: `src/game/controllers/KickoffController.ts` (the table itself, and the wait-for-interaction seam), `src/game/controllers/handlers/KickoffPhaseHandler.ts` (event resolution instead of logging).
- Events: `src/types/events.ts` — `KickoffResult` payload gains the resolved effect; new events for the interactive steps and for drive-scoped effects being granted and expiring.
- Game state: `src/services/GameService.ts` and `src/network/NetworkedGameService.ts` — bribes held, drive re-rolls, pending offensive assist, per-player drive modifiers; `src/game/managers/TurnManager.ts` (turn-marker movement for Time-Out), `src/game/managers/WeatherManager.ts` (re-roll plus Scatter (3) on Perfect Conditions).
- Setup/movement reuse: `src/game/managers/SetupManager.ts` and `src/game/validators/SetupValidator.ts` for Solid Defence re-placement and High Kick placement; `src/game/managers/MovementManager.ts` for the Quick Snap single square; the normal activation path for Charge! free actions (Move, one Blitz, one Throw Team-mate, one Kick Team-mate).
- UI: a kickoff-event step in `src/ui/components/hud/` (selection, confirm, skip), reusing the setup controls for re-placement.
- Online: the interactive steps are coach-owned decisions and must be routed through the host-native/guest-proxy path and the `UI_INTENT_EVENTS` filter.
- Depends on `sevens-setup-rules` from `enforce-sevens-setup-rules` for "set up again following all the usual restrictions" (Solid Defence). Depends on `match-log-entries` from `overhaul-match-announcements` for the logged meaning; degrades to the existing notification if that lands later.
