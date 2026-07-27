## Why

A Hand-off is not a throw, but the game resolves it as one. Declaring Hand-off puts the coach in pass-aiming mode — the range template and interception corridor are drawn — and clicking a team-mate calls `gameService.throwBall(passerId, x, y)`, which runs the whole `PassOperation`: a Passing Ability test, Accurate/Inaccurate, fumbles, scatter, interception by the defending team, and the Hail Mary/Cloud Burster/Safe Pass triggers. None of that exists in the Hand-off rules. A hand-off cannot miss, cannot be intercepted, and cannot be thrown across the pitch — the ball is placed in an adjacent team-mate's hands and that team-mate makes a Catch.

The rulebook text this change implements:

> During each Turn, a single player on the active team may declare a Hand-off Action in order to attempt to give the ball to another player. When a player declares a Hand-off Action they are first allowed to make a Move Action, though they cannot continue to move after the Hand-off Action has been attempted. A player does not have to be in possession of the ball to declare a Hand-off Action, and may attempt to pick up the ball as part of their Move Action. To perform a Hand-off action, the player that declared the Hand-off must finish their Move Action adjacent to a Standing team-mate who has not lost their Tackle Zone. The team-mate must then attempt to Catch the ball.

## What Changes

- **A Hand-off is resolved as a placement plus a Catch.** The declared Hand-off SHALL move the ball directly into the target team-mate's square and resolve a single Catch attempt by that team-mate. No Passing Ability test, no Accurate/Inaccurate result, no fumble, and no scatter SHALL occur.
- **A Hand-off cannot be intercepted.** The defending team SHALL have no interception opportunity, and no interception corridor or range template SHALL be drawn for a Hand-off.
- **The target must be adjacent, Standing, and hold its Tackle Zone.** A Hand-off SHALL only be offered against, and SHALL only resolve against, a team-mate adjacent to the hander-off's final square that is Standing and has not lost its Tackle Zone (Prone, Stunned, Distracted, or otherwise tackle-zone-less team-mates are illegal targets).
- **Move first, then hand off, then stop.** The declaring player SHALL be allowed to move before the hand-off — including picking the ball up during that move — and SHALL NOT be able to continue moving after the hand-off is attempted, except where Give and Go says otherwise.
- **Possession is not required to declare.** A player SHALL be able to declare a Hand-off while not holding the ball, provided the ball is reachable within their movement.
- **A failed Catch behaves as it does today.** The dropped ball bounces and the failure causes a Turnover under the normal rules; the change is to how the ball gets there, not to what happens when it is dropped.

## Capabilities

### New Capabilities
- `handoff-action`: the Hand-off Action end to end — declaration without possession, the optional preceding move, target legality, the no-roll transfer, the receiving Catch, and the once-per-turn action economy.

### Modified Capabilities
- `interceptions`: interception is a Pass-only opportunity; a Hand-off is explicitly outside it.

## Impact

- Resolution: a hand-off path that does not enter `src/game/operations/PassOperation.ts` — the ball is set to the target's square and a `CatchOperation` with `origin: "handoff"` is queued, followed by the existing activation-finish (with the Give and Go exemption preserved).
- Availability: `src/game/rules/actionAvailability.ts` — the `handoff` term uses tackle-zone-holding adjacency, not just Standing.
- Board input: `src/game/controllers/GameplayInteractionController.ts` — the hand-off step stops sharing pass-aiming mode (`isPassMode`), draws no pass zones/interception preview, highlights legal team-mates instead, and stops routing through `throwBall`.
- Service: `src/services/GameService.ts` — a dedicated hand-off entry point rather than `throwBall`, mirrored in `NetworkedGameService` and the headless protocol (`src/headless/HeadlessGame.ts`, `src/headless/protocol.ts`).
- Skills: `Give and Go` (keeps the activation open) and `Animosity` (refuses the hand-off) already key off the declared hand-off and must keep working on the new path; pass-only skills (Safe Pass, Cloud Burster, Hail Mary, Dump-Off, On the Ball) must no longer see it.
- Stats: `match-stats` counts a successful hand-off; the counter must move to the new path.
- Tests: `src/data/ruleScenarios/passing.ts` hand-off scenarios, plus new seeded cases for illegal targets and non-interceptability.
