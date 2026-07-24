## Why

Playtesting surfaced six gameplay bugs (recorded in `ai_notes.md`) that break or stall a match: the game never resolves at the end, a drive leaves prone players mis-rendered, the ball becomes uninteractable after the second-half kickoff, the Horns skill grants no bonus when blitzing, targeted actions can't be completed because clicking a teammate reselects them, and dodge rerolls can't be accepted. Each is a correctness defect against expected play; together they make a full game hard to finish.

## What Changes

- **Match end is handled.** The orchestrator SHALL handle the `GAME_OVER` phase instead of logging `No handler for phase: GAME_OVER` and doing nothing — the game resolves to a completed/result state.
- **Prone players reset at end of drive.** Players left prone (rendered rotated 90°) SHALL have their orientation reset when the drive ends, consistent with the pitch clearing.
- **Ball is interactable after the second-half kickoff.** After the second-half kickoff resolves, the ball SHALL be pickable/interactable where it lands rather than becoming stuck with no available interaction.
- **Horns grants +1 STR on a Blitz.** The Horns skill SHALL add +1 Strength when its player blitzes, not only on a standing block.
- **Targeted actions complete instead of reselecting.** When the active player has a pending targeted action (hand-off or pass), clicking a valid target SHALL resolve that action rather than switching selection to the clicked teammate; activation-finishing SHALL explicitly resolve a pending move/pass/hand-off.
- **Dodge reroll can be accepted.** The dodge reroll dialog SHALL offer an accept/confirm control, not only decline, so an offered reroll can be used.

## Capabilities

### New Capabilities
- `match-completion-flow`: the game reaching `GAME_OVER` is handled by the orchestrator and resolves to a completed match/result state with no unhandled-phase warning.
- `activation-action-completion`: while an active player has a pending targeted action, clicking a valid target completes that action rather than reselecting the clicked player.

### Modified Capabilities
- `drive-reset`: end-of-drive cleanup also resets prone player orientation; the second-half kickoff leaves the ball interactable.
- `skill-rules`: Horns adds +1 STR when blitzing; the dodge reroll decision exposes an accept option, not only decline.

## Impact

- Orchestration: `src/game/controllers/SceneOrchestrator.ts` (GAME_OVER handling), `src/game/managers/TurnManager.ts`.
- Drive reset / kickoff: end-of-drive reset path and second-half kickoff ball placement/interaction (`drive-reset` code paths, `src/game/managers/*`, pitch/ball elements).
- Skills: `src/game/skills/rules/HornsRule.ts` (blitz path), dodge reroll decision surface (`src/game/skills/rules/DodgeRule.ts`, `RerollArbiter`, `src/ui/components/hud/RerollDialog.tsx`).
- UI interaction: `src/game/controllers/GameplayInteractionController.ts` and `PassController.ts` (pending-action completion vs. reselection).
- Tests: headless CLI scenarios and unit tests to lock each fix; `rule-test-coverage` scenarios where applicable.
