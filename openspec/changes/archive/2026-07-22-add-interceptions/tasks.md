## 1. Range Ruler geometry (PassController)

- [x] 1.1 Add a shared `rulerOverlaps(from, landing, square)` helper (perpendicular-distance-to-segment ≤ 0.5 on square centres, with endpoint clamping) in `PassController`.
- [x] 1.2 Rewrite `checkInterceptions(from, landing, opponents, isAccurate)` to use `rulerOverlaps`, filtering to `status === ACTIVE` and `hasTackleZone(opponent)`; return `{ playerId, position, modifier }` where `modifier` is -3 (accurate) or -2 (inaccurate).
- [x] 1.3 Extend `attemptInterception(player, baseModifier, markingOpponents)` so success = Agility Test pass OR natural 6, and natural 1 always fails; total modifier = `baseModifier - markingOpponents`.
- [x] 1.4 Update `__tests__/unit/controllers/PassController.test.ts` for the new geometry (orthogonal, diagonal, corner-graze, off-line) and the natural-6 / marking cases.

## 2. Interception decision plumbing

- [x] 2.1 Add `InterceptionDecisionRequest` (`type: "interception"`, `chooserTeamId`, `candidates: { playerId, modifier }[]`) and `InterceptionDecisionAnswer` (`{ playerId?: string }`) to `src/types/decisions.ts`; extend the `DecisionRequest`/`DecisionAnswer` unions.
- [x] 2.2 Handle the `interception` request in `DecisionService` (raise, await, resolve) alongside reroll/reaction.
- [x] 2.3 Add pendingDecision/reply mapping for `interception` in `src/headless/protocol.ts` and `HeadlessGame`, with a default auto-pick (lowest-penalty candidate) when unscripted.
- [x] 2.4 Add interception events (attempt / success / fail) to `src/types/events.ts`.

## 3. Wire interception into the Pass sequence (PassOperation)

- [x] 3.1 After `attemptPass` returns and `onPassResult` folds (non-fumble only), compute eligible interceptors via `checkInterceptions(passer.gridPosition, result.finalPosition, opponents, result.accurate)`.
- [x] 3.2 If any are eligible, raise the `interception` decision to the defending coach; if declined or none, continue to the existing catch/bounce branch unchanged.
- [x] 3.3 For the chosen interceptor, compute their marking count via `CatchController.countMarkingOpponents(interceptor.gridPosition, passingTeam)` and call `attemptInterception`.
- [x] 3.4 On success: set ball to the interceptor's square, emit interception-success event, skip catch/bounce, and call `triggerTurnover("Intercepted")`. On failure: emit interception-fail event and fall through to normal resolution.
- [x] 3.5 Ensure sequencing with the ball-flight animation delay matches existing fumble/turnover ordering.

## 4. Pass-setup UI: interception highlight + centre lock

- [x] 4.1 Add a `Pitch.drawInterceptSquares(squares)` method on a new `pass_intercept` layer and clear it in `clearPassVisualization`.
- [x] 4.2 In `PassInteractionState.handleSquareHover`, quantise the aim to the hovered square centre and compute threatened squares with the same `checkInterceptions` geometry (passer → hovered square) over live opponents.
- [x] 4.3 Call `drawInterceptSquares` with the eligible opponent squares; render nothing when there are no threats.
- [x] 4.4 Verify the previewed ruler and the resolved ruler agree (shared helper), and the arrow renders to `gridToPixel` centres.
- [x] 4.5 (If pass targeting also has a HUD dialog) surface the interceptor choice dialog alongside the existing reroll/reaction dialogs.

## 5. Tests & scenario lock

- [x] 5.1 Add a seeded interception scenario to `src/data/ruleScenarios/passing.ts` (passer, landing square, one Standing opponent under the ruler, plus a Prone opponent and an off-line opponent as negative cases).
- [x] 5.2 Add a headless CLI test that runs the scenario and asserts eligibility, the -3/-2/±marking modifiers, natural-6 success, possession change, and Turnover.
- [x] 5.3 Add a headless protocol test asserting the `interception` pendingDecision/reply round-trips (chooser = defending team).
- [x] 5.4 Run `openspec validate add-interceptions` and the full test suite; fix any regressions.
