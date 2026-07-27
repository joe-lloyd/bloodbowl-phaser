## Why

The transition between drives is the least reliable part of a match. Scoring a touchdown logs `[Orchestrator] No handler for phase: TOUCHDOWN` and leaves the scene in an undefined state; KO recovery silently mutates status with no feedback and produced a player who existed twice at once — one copy on the pitch and one stuck in the KO box; and setup then refused to complete because the team could not field seven. Separately, starting a second match in the same browser session crashes on the kickoff with `Cannot read properties of null (reading 'queueDepthSort')` from `new BallSprite` — a destroyed first-match scene is still handling `BallKicked`. Together these mean a Sevens match usually cannot survive its first touchdown, and a session usually cannot survive its first match.

## What Changes

- **TOUCHDOWN is a handled phase.** The orchestrator SHALL handle `GamePhase.TOUCHDOWN` — celebrating the score and driving into the end-of-drive sequence — instead of falling through to the unhandled-phase warning.
- **KO recovery is a visible, paced sequence.** Each knocked-out player SHALL be rolled for individually (D6, 4+ recovers), with the roll shown and an animation of the player either returning to the Reserves box or staying in the KO box, before the next drive's setup begins.
- **A recovered player exists in exactly one place.** Recovery SHALL move the player's single record from KO to Reserves and rebuild its dugout/pitch representation accordingly. A recovered player SHALL NOT appear simultaneously on the pitch and in the KO box.
- **Short-handed setup works.** A team with fewer than seven available players SHALL be able to complete setup by fielding every player it has. Setup completion SHALL be defined as "all available players placed", not "seven placed", and the kickoff SHALL proceed.
- **Scene teardown is complete.** When a match's scene shuts down, its phase handlers and event subscriptions SHALL be removed so a later match's events are never delivered to a destroyed scene. Creating visuals SHALL be a no-op on a scene that is no longer active.

## Capabilities

### New Capabilities
- `touchdown-sequence`: the TOUCHDOWN phase is handled end to end — score, celebration, hand-off into the end-of-drive sequence — with no unhandled-phase warning.
- `short-handed-setup`: a team with fewer than the full seven available players completes setup and kicks off.
- `scene-lifecycle-teardown`: a destroyed scene's handlers and subscriptions are removed, so a second match in the same session starts clean.

### Modified Capabilities
- `drive-reset`: KO recovery is rolled and animated one player at a time, and a recovered player is moved to Reserves as a single record with no duplicate.

## Impact

- Orchestration: `src/game/controllers/SceneOrchestrator.ts` (TOUCHDOWN case, handler teardown), `src/game/controllers/handlers/*`.
- Drive flow: `src/game/operations/EndDriveOperations.ts` (`ClearPitchOperation`, `KORecoveryOperation`, `StartNextDriveOperation`), `src/services/GameService.ts` (`addTouchdown`, `endDrive`, `rollKORecovery`, `resetDriveState`).
- Setup: `src/game/managers/SetupManager.ts` (`isSetupComplete`, placement cap), `src/game/validators/SetupValidator.ts`, `src/config/GameConfig.ts` (`MIN_PLAYERS` semantics), `src/network/NetworkedGameService.ts` mirror.
- Scene/visuals: `src/scenes/GameScene.ts` (`shutdown`, `placeBallVisual`), `src/game/controllers/handlers/KickoffPhaseHandler.ts`, `src/game/elements/BallSprite.ts`, `src/game/elements/Dugout.ts` (KO ↔ Reserves rebuild), `src/ui/pages/GamePage.tsx` (`ServiceContainer.reset` ordering).
- Tests: headless drive-transition scenarios (touchdown → KO recovery → short-handed setup → kickoff) and a repeat-match regression test.
