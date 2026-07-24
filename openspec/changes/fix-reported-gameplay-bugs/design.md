## Context

Six defects were found in playtesting (`ai_notes.md`). They span four subsystems: phase orchestration (game end), the drive-reset/kickoff flow, skill rules (Horns, Dodge reroll), and the browser interaction controller (completing a targeted action). Code recon narrowed several of them to a specific layer:

- `SceneOrchestrator.transition()` has no `case GamePhase.GAME_OVER`; it falls to `default:` and logs `No handler for phase: GAME_OVER`, so the game silently stalls at the end.
- `HornsRule.onBlockDeclared` already adds +1 STR when `ctx.isBlitz` is true and recomputes intent — so the Horns bug is not the rule but the blitz path: either `ctx.isBlitz` is not set when the block is declared during a Blitz, the `onBlockDeclared` hook is not invoked on that path, or the block-dice are not recomputed from the updated strength.
- `RerollDialog` renders an accept button only when `request.sources` includes `"skill"` or `"team"`. A dodge reroll showing "decline only" means the decision request's `sources` array does not include the Dodge skill source — the bug is upstream in how the dodge reroll decision is built (`DodgeRule` / `RerollArbiter` / `DecisionService`), not in the dialog.
- Prone reset and the stuck second-half ball live in the end-of-drive / kickoff flow governed by the `drive-reset` capability.
- The "clicking a teammate reselects instead of completing the hand-off/pass" bug is in `GameplayInteractionController` / `PassController`: a click on a valid target is routed to selection instead of to the pending action.

## Goals / Non-Goals

**Goals:**
- Resolve each of the six reported defects so a full game can be started, played, and completed.
- Lock each fix with a regression test — a seeded headless/CLI scenario or unit test — per the project's rule-fix workflow.
- Keep fixes at the correct layer (rule vs. trigger wiring vs. UI), avoiding switch-style special-casing.

**Non-Goals:**
- No new gameplay features, no rules beyond correcting the six behaviors.
- No redesign of the orchestrator, reroll machinery, or interaction controller beyond what each fix requires.
- No visual/UX overhaul of the end-of-game screen beyond making `GAME_OVER` resolve to a completed/result state.

## Decisions

1. **GAME_OVER handling (`match-completion-flow`).** Add an explicit `GAME_OVER` branch in `SceneOrchestrator.transition()` that resolves the match to a completed/result state (surfacing the final result to the HUD) instead of hitting `default:`. The unhandled-phase warning must not fire for `GAME_OVER`.

2. **Prone reset at end of drive (`drive-reset`).** Extend the end-of-drive cleanup that clears the pitch so any player left prone (rendered rotated 90°) has its orientation reset. Reset happens as part of the same drive-teardown pass that already clears the pitch.

3. **Second-half ball interactable (`drive-reset`).** Ensure the second-half kickoff leaves the ball in an interactable state where it lands (pickup/selection available), matching the first-half kickoff. Fix in the kickoff-resolution path rather than the input layer.

4. **Horns on Blitz (`skill-rules`).** Keep `HornsRule` as-is (it is correct) and fix the blitz block-declaration path so `ctx.isBlitz` is set and `onBlockDeclared` fires with the block dice recomputed from the boosted strength. Verify the fix with a seeded blitz-block scenario asserting the +1.

5. **Dodge reroll accept (`skill-rules`).** Fix the dodge reroll decision so its `sources` include the Dodge skill source, so `RerollDialog` renders the "USE DODGE RE-ROLL" accept button. The dialog itself is source-driven and needs no change beyond confirming both accept and decline paths resolve the decision.

6. **Complete pending targeted action (`activation-action-completion`).** In the interaction controller, when the active player has a pending targeted action (hand-off or pass) and the user clicks a valid target, route the click to completing that action instead of switching selection. Finishing an activation must explicitly resolve any pending move/pass/hand-off rather than dropping it.

## Risks / Trade-offs

- **Horns and dodge-reroll root cause is upstream of the obvious file.** Both need tracing through the trigger/decision wiring; the fix location is a hypothesis until confirmed. Regression scenarios de-risk this by asserting observable outcomes.
- **Interaction-controller change to click routing** could affect other target-selection flows (blitz, block, foul). Scope the pending-action completion narrowly to hand-off/pass and cover the neighboring flows in testing to avoid regressions.
- **GAME_OVER resolution scope.** Making the phase "handled" is minimal; a richer end-of-game result screen is deliberately out of scope and can follow separately.
