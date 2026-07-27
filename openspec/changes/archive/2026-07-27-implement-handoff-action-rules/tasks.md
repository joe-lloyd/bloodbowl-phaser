# Tasks: implement-handoff-action-rules

## 1. The hand-off target predicate

- [x] 1.1 Add a shared `isLegalHandoffTarget(hander, mate)` — same team, adjacent to the hander's current square, Standing, `hasTackleZone` — in the rules layer
- [x] 1.2 Use it for the resolution-time check and use the reachability form (a legal final square adjacent to such a team-mate) for the `handoff` term in `actionAvailability`
- [x] 1.3 Keep declaration legal without possession when the ball is reachable within the player's movement

## 2. HandoffOperation

- [x] 2.1 Add `HandoffOperation(passerId, targetId)`: validate the target, fold the hand-off triggers (Animosity), set the ball to the target's square, queue `CatchOperation` with `origin: "handoff"`, then `FinishPassActivationOperation` with the Give and Go exemption
- [x] 2.2 Add `handOffBall(passerId, targetPlayerId)` to `IGameService`/`GameService` and stop routing hand-offs through `throwBall`
- [x] 2.3 Mirror the new command in `NetworkedGameService` and in the headless protocol/`HeadlessGame`, refusing a hand-off command that names a square instead of a target id
- [x] 2.4 Remove the four `declaredAction === "handoff"` special cases from `PassOperation` now that no hand-off reaches it
- [x] 2.5 Move the successful-hand-off stat increment onto the new path

## 3. Board interaction

- [x] 3.1 Drop `handoff` from `isPassMode` so no pass zones, pass line, or interception preview are drawn during a hand-off
- [x] 3.2 Highlight the legal team-mates during the hand-off step and resolve a click on one of them through `handOffBall`
- [x] 3.3 Ignore clicks on empty squares and illegal targets during the hand-off step, refusing by reason (not adjacent / not Standing / lost Tackle Zone)
- [x] 3.4 Confirm the action window's Move → Handoff stepper still lets the player move first and closes the move once the hand-off resolves

## 4. Verification

- [x] 4.1 Seeded scenario: declare Hand-off without the ball, pick it up mid-move, hand off successfully — assert no PA test was rolled
- [x] 4.2 Seeded scenario: hand-off with an adjacent eligible opponent — assert no interception decision is raised
- [x] 4.3 Seeded scenario: only adjacent team-mate is Distracted — assert the hand-off is refused and the ball does not move
- [x] 4.4 Seeded scenario: dropped hand-off bounces and causes a Turnover; Give and Go variant keeps the activation open
- [x] 4.5 Online test: a guest's hand-off is proxied by target id and both boards agree
- [x] 4.6 Update the hand-off cases in `src/data/ruleScenarios/passing.ts` and run the rule-scenario, unit, and headless suites
