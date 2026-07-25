# Design: implement-kickoff-event-table

## Context

`KickoffController.rollKickoffEvent()` is a 40-line switch that turns a 2D6 into a string and emits `KickoffResult { roll, event }`. `KickoffPhaseHandler` subscribes and logs it. Only case 7 does anything — it calls `weatherManager.rollWeather()`. The switch is also the standard Blood Bowl table, not the Sevens one, so four entries are wrong or non-existent in Sevens.

Everything the events need to touch already exists: `TurnManager` owns turn counts, `WeatherManager` owns weather, `GameService` owns re-rolls and player status, `SetupManager`/`SetupValidator` own placement, `MovementManager` owns movement, and the activation path owns free actions. What is missing is (a) a correct table, (b) somewhere to hold effects that last a drive or a turn, and (c) a way for the kickoff to stop and wait for a coach.

## Goals / Non-Goals

**Goals:**

- The Sevens table, with all eleven results applying their rulebook effect.
- Drive-scoped and turn-scoped effects that reliably expire.
- Interactive steps for Solid Defence, High Kick, Quick Snap and Charge! that the kickoff waits on, work online, and can be skipped.
- Deterministic and reproducible headless.

**Non-Goals:**

- The full inducement economy (`add-inducements-and-apothecary` covers that; here Get the Ref only needs "team holds a Bribe").
- Setup restriction rules themselves (`enforce-sevens-setup-rules` owns them; Solid Defence calls into them).
- Animating the kickoff or camera behaviour.

## Decisions

### 1. A `KickoffEvent` enum plus a resolver table, not a switch

Replace the string switch with `KickoffEvent` (11 members) and a `Record<KickoffEvent, KickoffEventResolver>` where a resolver is `(ctx) => KickoffEventOutcome`. `KickoffResult`'s payload gains the enum and a structured outcome (what each team got) so the log, the HUD and the online mirror all read the same object. Alternative — extend the switch — rejected: the switch is where the wrong table came from, and it gives the log nothing to describe.

### 2. Drive-scoped effects live on a `DriveEffects` record cleared by the drive reset

Add a `driveEffects` structure to game state holding: free re-rolls per team, an owed offensive assist per team (with the turn it applies to), and per-player drive modifiers (`maModifier`, `avModifier`, `confinedToReserves`). `EndDriveOperations` clears it in the same step that clears the pitch, so expiry is one line and cannot be forgotten per-effect. Alternative — mutating the player's statline and remembering to undo it — rejected: that is exactly the class of bug the drive-transition change is already fixing.

The Cheering Fans assist is turn-scoped, not drive-scoped, so it carries the turn number it was granted for and is dropped by `TurnManager` when that turn ends, whether or not it was used.

### 3. Interactive events are a pending-decision step, modelled like the existing reroll decision

The kickoff enters a `KICKOFF_EVENT` sub-step carrying `{ event, owningTeam, selectionLimit }`. The controller awaits a confirm/skip action. This mirrors `reroll-decisions`, which already has a working "the engine waits for a coach" pattern and a working online route, so the online path is inherited rather than invented. The step is a coach decision and must be added to `UI_INTENT_EVENTS` handling so a guest's selection is proxied to the host.

Ordering relative to the kick:

| Event | Resolves |
|---|---|
| Solid Defence | before the ball is kicked (re-setup) |
| Quick Snap, Charge! | before the ball is kicked |
| High Kick | after the landing square is computed, before the ball lands |
| Changing Weather | before the kick; a Perfect Conditions result adds Scatter (3) to the in-air path |

### 4. Solid Defence and High Kick reuse the setup machinery

Solid Defence removes the selected players and re-enters the existing placement flow restricted to those players — the same validator, so setup restrictions apply for free once `enforce-sevens-setup-rules` lands, and apply as-they-are before that. High Kick is a single placement into a known square, validated only for "is this player Open" and "is the square the landing square".

### 5. Charge! reuses the normal activation path with a free-action budget

Rather than a bespoke mini-turn, Charge! activates each selected player through the existing activation entry point with a budget object: `{ moveFree: true, blitzRemaining: 1, throwTeammateRemaining: 1, kickTeammateRemaining: 1 }`. The sequence subscribes to knockdown/fall-over outcomes and aborts on the first one. Players activated this way are not marked `hasActed` for the coming turn.

## Risks / Trade-offs

- [Charge! interacting with skills that trigger on activation or on going down] → it runs through the normal activation path precisely so those skills fire as they normally would; covered by seeded headless scenarios for a knockdown mid-Charge.
- [An interactive step stalls an online match if a coach disconnects] → the step is skippable and inherits the existing decision timeout behaviour used by reroll decisions.
- [Time-Out moving turn markers past the ends of the half] → clamp at turn 1 and at the half's last turn; a Time-Out that would push past the end of the half is clamped, not wrapped.
- [Dodgy Snack confining a player to Reserves collides with short-handed setup] → the confined player is excluded from "available players" for this drive only, which is the same predicate `short-handed-setup` uses.

## Migration Plan

1. Table + enum + structured outcome, with all resolvers no-ops that only log. Nothing regresses; the log gets correct names.
2. `DriveEffects` + the non-interactive resolvers (Get the Ref, Time-Out, Cheering Fans, Brilliant Coaching, Changing Weather, Dodgy Snack, Pitch Invasion) with headless scenarios per event.
3. The pending-step machinery plus High Kick (the simplest interaction), then Quick Snap, then Solid Defence, then Charge!.
4. Online routing and the UI step last.

No persisted data changes; `driveEffects` is match state only and absent-means-empty.

## Open Questions

- Whether a Get the Ref Bribe should be visible alongside purchased inducements or in its own "granted this match" group (lean: same list, marked as granted).
- Whether Charge!'s free Throw Team-mate and Kick Team-mate options should be offered when the team has no player with the relevant skill (lean: hide them, they cannot be legally taken).
