# Design: implement-kickoff-event-table

## Context

`KickoffController.rollKickoffEvent()` is a 40-line switch that turns a 2D6 into a string and emits `KickoffResult { roll, event }`. `KickoffPhaseHandler` subscribes and logs it. Only case 7 does anything — it calls `weatherManager.rollWeather()`. The switch is also the standard Blood Bowl table, not the Sevens one, so four entries are wrong or non-existent in Sevens.

Everything the events need to touch already exists: `TurnManager` owns turn counts, `WeatherManager` owns weather, `GameService` owns re-rolls and player status, `SetupManager`/`SetupValidator` own placement, `MovementManager` owns movement, and the activation path owns free actions. What is missing is (a) a correct table, (b) somewhere to hold effects that last a drive or a turn, and (c) a way for the kickoff to stop and wait for a coach.

## Goals / Non-Goals

**Goals:**

- The Sevens table, with all eleven results applying their rulebook effect.
- Drive-scoped and turn-scoped effects that reliably expire.
- Interactive steps for Solid Defence, High Kick, Quick Snap and Charge! that reuse pitch-native interaction, that the kickoff waits on, work online, and can be skipped.
- One authoritative visual sequence: select kicker, select target, deviate into an enlarged airborne state, roll and resolve the table, then shrink and land into normal catch/bounce handling.
- Deterministic and reproducible headless.

**Non-Goals:**

- The full inducement economy (`add-inducements-and-apothecary` covers that; here Get the Ref only needs "team holds a Bribe").
- Setup restriction rules themselves (`enforce-sevens-setup-rules` owns them; Solid Defence calls into them).
- General-purpose ball-flight or camera changes outside the kickoff sequence.

## Decisions

### 1. A `KickoffEvent` enum plus a resolver table, not a switch

Replace the string switch with `KickoffEvent` (11 members) and a `Record<KickoffEvent, KickoffEventResolver>` where a resolver is `(ctx) => KickoffEventOutcome`. `KickoffResult`'s payload gains the enum and a structured outcome (what each team got) so the log, the HUD and the online mirror all read the same object. Alternative — extend the switch — rejected: the switch is where the wrong table came from, and it gives the log nothing to describe.

### 2. Drive-scoped effects live on a `DriveEffects` record cleared by the drive reset

Add a `driveEffects` structure to game state holding: free re-rolls per team, an owed offensive assist per team (with the turn it applies to), and per-player drive modifiers (`maModifier`, `avModifier`, `confinedToReserves`). `EndDriveOperations` clears it in the same step that clears the pitch, so expiry is one line and cannot be forgotten per-effect. Alternative — mutating the player's statline and remembering to undo it — rejected: that is exactly the class of bug the drive-transition change is already fixing.

The Cheering Fans assist is turn-scoped, not drive-scoped, so it carries the turn number it was granted for and is dropped by `TurnManager` when that turn ends, whether or not it was used.

The MA modifier has one correct insertion point: the player's MA, *before* `moveAllowance` adds the Rush allowance. `driveEffects.withDriveModifiers` produces the reduced-MA player view and `moveAllowance(view)` = `(MA - 1) + rushAllowance`, so a reduced player moves one square less normally and keeps all 2 (or 3 with Sprint) Rushes. Any caller that computes an allowance, a remaining-squares count, or the square at which Rushing begins from the raw `player` instead of that view reproduces the reported bug: the total is one lower but the Rush threshold is still raw MA, so the coach sees full MA followed by a single Rush. `MovementManager` already uses the view; `MovementValidator`, `GameplayInteractionController`, `PlayPhaseHandler` and `GameService` do not. The fix is to make the drive-modified view the only player passed to `moveAllowance`/`rushAllowance`/raw-MA comparisons on every movement path, not to special-case Dodgy Snack in each caller.

### 3. Interactive events are a pending-decision step driven from the pitch

The kickoff enters a `KICKOFF_EVENT` sub-step carrying `{ event, owningTeam, selectionLimit }`. The controller awaits the event's pitch actions and then a confirm/skip action. The overlay is informational: event meaning, remaining allowance, progress, confirm and skip. It occupies the bottom-right temporary-menu area and does not render player buttons or a separate selection list. Eligible players are highlighted and selected directly on the pitch. Destinations use board-square input, Solid Defence uses one direct setup drag from the player's current pitch square to its legal destination, and Charge! uses the existing action window and player context menu. This mirrors the engine-waiting and online ownership aspects of `reroll-decisions`, while keeping actual gameplay input in the established interaction controller. The step is a coach decision and must be added to `UI_INTENT_EVENTS` handling so a guest's pitch actions are proxied to the host.

`KickoffSequenceCompleted` is the only hand-off into the receiving team's first turn. An interactive event must not change the normal active team, start a normal turn, or consume coming-turn activations while it is pending. Its confirm/skip, any final setup validation, and any active Charge! action must all complete before the ball lands and the normal turn begins.

Ordering relative to the kick:

1. The kicking coach selects the kicker.
2. The kicking coach selects the target square.
3. Deviation is calculated. The single real ball sprite moves to the deviated
   square at an enlarged, semi-transparent scale, representing height above
   that square without hiding it. This is not a landing and SHALL NOT trigger
   a catch or bounce.
4. The kickoff table rolls.
5. The table result and any interactive step fully resolve while that same
   enlarged ball remains airborne. Changing Weather may move the airborne
   destination.
6. The single real ball sprite animates back to its normal scale and full
   opacity at the final square, representing the landing.
7. Only after that landing animation does normal catch, bounce, or touchback
   resolution run.

No second or ghost ball is created. The airborne state is represented only by
the real ball's enlarged, semi-transparent rendering. The kickoff SHALL NOT
pan, zoom, track the ball, or reset the camera; the gameplay camera remains
unchanged for the complete sequence. `BallKicked` starts the airborne
deviation, `KickoffBallLanding` starts the scale/opacity landing, and
`KickoffSequenceCompleted` clears transient state before play begins. This
lifecycle is independent of `KickoffResult`, because an interactive event may
emit its table result before its coach-controlled step finishes.

### 4. Solid Defence and High Kick reuse pitch selection and setup machinery

Solid Defence puts the kicking team into a constrained setup-drag mode. The coach drags an Open player directly from its current pitch square to a legal new setup square; a successful drop counts as one of the D3+1 redeployments. The player remains on the pitch throughout the interaction, is never staged in Reserves, and does not need to be selected in a separate first pass. An invalid drop returns the player to its original square and does not spend the allowance. The existing setup validator remains authoritative, so setup restrictions apply for free once `enforce-sevens-setup-rules` lands, and apply as-they-are before that. High Kick highlights the landing square and lets the receiving coach click one Open player on the pitch; the selected player is placed directly into that known square after validating "is this player Open" and "is the square the landing square".

### 5. Charge! reuses the normal activation path with a free-action budget

Rather than a bespoke mini-turn or bespoke action controls, Charge! selects players on the pitch and activates each through the existing activation entry point, action window, and context menu with a budget object: `{ moveFree: true, blitzRemaining: 1, throwTeammateRemaining: 1, kickTeammateRemaining: 1 }`. The sequence subscribes to knockdown/fall-over outcomes and aborts on the first one. Players activated this way are not marked `hasActed` for the coming turn.

### 6. Event state and logs are authoritative and visible

The event resolver writes normal game state, and the ordinary renderer reads that state. Pitch Invasion sets the selected player's status to Stunned through the standard status path, so the model lies sideways and receives the standard orange stunned border without a kickoff-only visual workaround. Dodgy Snack writes a named player's drive modifier or reserves confinement before the event resolves, and the match log names that player and the exact effect.

Contested event rolls are logged as separate, team-attributed components: team name, raw D6, applicable staff/Fan Factor modifier, and total. The winner/tie and granted consequence are then logged with team and player names. This applies at minimum to Cheering Fans, Brilliant Coaching, Dodgy Snack, and Pitch Invasion, so a coach can reconstruct why an outcome occurred.

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
