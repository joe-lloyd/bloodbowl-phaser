## Context

`GameplayInteractionController` treats Hand-off as a second flavour of Pass: `isPassMode` is true for `handoff/handoff`, the pass zones and interception corridor are drawn, and the target click calls `gameService.throwBall(...)`. `PassOperation` then reads `state.activePlayer.action` in four places to special-case the hand-off *after* it has already run the throw — the PA test at `attemptPass`, the fumble branch, the interception resolution, and the `CatchOperation` origin. So the correct hand-off behaviour is retro-fitted onto a throw that should never have happened.

The pieces needed for the correct path already exist: `CatchOperation` accepts `origin: "handoff"` and applies the right catch modifier, `FinishPassActivationOperation` ends the activation with the Give and Go exemption, `BounceOperation` and the turnover trigger handle a dropped ball, and `hasTackleZone` in `src/types/Player.ts` is the exact predicate the rulebook wording needs. This change is mostly about *not* going through `PassOperation`.

## Goals / Non-Goals

**Goals:**
- One hand-off path with no roll before the Catch, no interception, and no scatter.
- Target legality that reads the same as the rulebook sentence: adjacent, Standing, has not lost its Tackle Zone.
- Keep the two skills that genuinely interact with a hand-off — Give and Go, Animosity — working.

**Non-Goals:**
- Changing the Catch rules or catch modifiers.
- Changing what a dropped ball does (bounce plus turnover) — that stays the shared ball-settling flow.
- Changing the once-per-turn action economy (`turn.hasHandedOff`) or the Throw Team-mate action.

## Decisions

### 1. A `HandoffOperation`, not a flag inside `PassOperation`

Add a dedicated operation that: re-validates the target against the rules predicate, folds the hand-off-relevant triggers (Animosity), sets the ball to the target's square, queues `CatchOperation(targetId, true, { origin: "handoff" })`, and then queues `FinishPassActivationOperation(passerId, giveAndGoExempt)`. Alternative — keep `PassOperation` and branch early on `declaredAction === "handoff"` — rejected: that is the current design, and the four scattered `declaredAction === "handoff"` checks are why interception and the PA test still run at all. A separate operation makes "a hand-off never rolls to throw" true by construction rather than by four correct conditionals.

`throwBall` keeps its meaning: throwing. The service gains `handOffBall(passerId, targetPlayerId)` — a player id, not a square, because a hand-off targets a person, and that removes the "aimed at a square that happens to hold a team-mate" ambiguity from the wire format for online and headless clients.

### 2. Target legality is one shared predicate

```
isLegalHandoffTarget(hander, mate) =
  mate.teamId === hander.teamId &&
  mate.gridPosition && chebyshev(hander.here, mate.gridPosition) === 1 &&
  isStanding(mate) && hasTackleZone(mate)
```

Used by `actionAvailability` (to offer the action and to highlight targets), by the board-click handler (to accept the click), and by `HandoffOperation` (to reject a forged command). `hasTackleZone` already excludes Prone, Stunned, and Distracted, so the rulebook's "Standing team-mate who has not lost their Tackle Zone" maps onto existing code rather than a new status list that will drift.

Note the declaration-time term stays reachability-based — a legal target must exist *somewhere the hander can finish their move*, which is what `canEndAdjacentTo` already computes — while the resolution-time term is measured from the hander's actual final square.

### 3. The hand-off step is target selection, not aiming

Remove `handoff` from `isPassMode`. The hand-off step highlights the legal team-mates and takes a click on one of them; there is no template, no arrow, no interception preview, and no free-square targeting. This also settles what happens when the coach clicks empty space during a hand-off: nothing, instead of throwing the ball there.

### 4. Skills split cleanly by action

Animosity and Give and Go fold on the hand-off path. Safe Pass, Cloud Burster, Hail Mary Pass, Dump-Off and On the Ball are pass-triggered and are simply never reached, because their trigger points live in `PassOperation`. No skill needs an "unless hand-off" clause after this change; that is the point of splitting the operation.

## Risks / Trade-offs

- [Any caller that relied on `throwBall` to perform a hand-off — online proxy, headless protocol, saved-scenario scripts — breaks] → all three are updated together with the new command, and the rule-scenario catalog is the regression net; a hand-off command carrying a square instead of a target id is rejected with a clear reason rather than silently thrown.
- [`match-stats` counts completions from the pass path] → the successful-hand-off counter moves into the new operation, and the existing stats scenario covers it.
- [Losing the pass template removes a familiar visual affordance] → replaced by highlighting the legal team-mates, which is more accurate: the old template implied ranges a hand-off never had.
- [Give and Go's "keep moving after a hand-off" must still work when the hand-off no longer ends in `PassOperation`] → the exemption is carried on `FinishPassActivationOperation`, which the new operation queues unchanged.
