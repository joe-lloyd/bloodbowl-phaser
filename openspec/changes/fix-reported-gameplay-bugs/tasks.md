# Tasks

## 1. Match completion (GAME_OVER)

- [ ] 1.1 Add an explicit `GAME_OVER` branch to `SceneOrchestrator.transition()` that resolves the match to a completed/result state and does not hit `default:` / log the unhandled-phase warning
- [ ] 1.2 Surface the final result (score/winner) to the HUD on completion
- [ ] 1.3 Add a headless/CLI regression: playing a match to its end reaches a handled `GAME_OVER` with no unhandled-phase warning

## 2. Drive reset: prone orientation

- [ ] 2.1 Extend the end-of-drive teardown (pitch-clear path) to reset the orientation of any prone player
- [ ] 2.2 Add a seeded scenario asserting no player retains the 90° prone rotation after a drive ends

## 3. Drive reset: second-half ball interactable

- [ ] 3.1 Trace the second-half kickoff resolution and fix the ball being left in a stuck, non-interactable state where it lands
- [ ] 3.2 Add a scenario asserting a player can move to and attempt to pick up the ball after the second-half kickoff

## 4. Horns on Blitz

- [ ] 4.1 Confirm `HornsRule` is correct, then fix the blitz block-declaration path so `ctx.isBlitz` is set and `onBlockDeclared` fires with block dice recomputed from the boosted strength
- [ ] 4.2 Add a seeded blitz-block scenario asserting Horns applies +1 Strength and the dice reflect it

## 5. Dodge reroll accept

- [ ] 5.1 Fix the dodge reroll decision so its `sources` include the Dodge skill source, so `RerollDialog` renders the accept ("USE DODGE RE-ROLL") button
- [ ] 5.2 Verify both accept (performs the reroll) and decline paths resolve the decision; add a regression covering the offered accept option

## 6. Complete pending targeted action

- [ ] 6.1 In `GameplayInteractionController` / `PassController`, route a click on a valid target to completing a pending hand-off/pass instead of reselecting the clicked player
- [ ] 6.2 Ensure finishing an activation explicitly resolves any pending move/pass/hand-off rather than dropping it
- [ ] 6.3 Verify neighboring target flows (blitz/block/foul selection) are unaffected

## 7. Verification

- [ ] 7.1 Run the headless/CLI suite and unit tests; confirm all six regressions pass
- [ ] 7.2 Update `ai_notes.md` marking each fixed bug in place with a dated note
