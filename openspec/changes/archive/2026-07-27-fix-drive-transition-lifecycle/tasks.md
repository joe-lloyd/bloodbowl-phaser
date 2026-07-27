## 1. Touchdown phase ownership

- [x] 1.1 Add `TouchdownPhaseHandler` implementing `PhaseHandler` in `src/game/controllers/handlers/`
- [x] 1.2 Add `case GamePhase.TOUCHDOWN` to `SceneOrchestrator.handlePhaseChange` that instantiates and enters it
- [x] 1.3 Announce the scorer, their team, and the updated score from the handler, writing to both the on-screen announcement and the match log
- [x] 1.4 Hand off into `endDrive` from the handler when the celebration window ends, replacing the fixed `delay(2000)` chain in `GameService.addTouchdown`
- [x] 1.5 Confirm a touchdown on the last turn of the first half routes to halftime rather than another drive

## 2. Single-location player records

- [x] 2.1 Add a single `movePlayerToBox(player, destination)` seam that clears the player's current representation before creating the new one
- [x] 2.2 Route every pitch/Reserves/KO/Casualty transition through it — `CasualtyOperation`, `CrowdInjuryOperation`, `ClearPitchOperation`, KO recovery, and `SetupManager`
- [x] 2.3 Rebuild `Dugout` membership from that seam so a box never renders a player it does not own
- [x] 2.4 Add an invariant check (dev-only assertion) that every player appears exactly once across pitch and dugout boxes

## 3. Paced KO recovery

- [x] 3.1 Rework `KORecoveryOperation` to iterate knocked-out players, rolling and awaiting a beat per player instead of rolling all of them synchronously
- [x] 3.2 Emit `KORecoveryRolled` per player before applying the status change, and apply the change through the `movePlayerToBox` seam
- [x] 3.3 Animate the recovered player from the KO box to the Reserves box, and show the failed player staying put
- [x] 3.4 Ensure `StartNextDriveOperation` cannot begin until the recovery sequence has fully settled
- [x] 3.5 Decide and implement skip behavior for the sequence (skippable locally, fixed-length online) per the open question in design

## 4. Short-handed setup

- [x] 4.1 Add an `availablePlayers(teamId)` helper excluding KO, Casualty, and sent-off players
- [x] 4.2 Change `SetupManager.isSetupComplete` to require `min(7, availablePlayers)` placed; keep the placement cap at seven
- [x] 4.3 Mirror the rule in `NetworkedGameService.isSetupComplete` so host and guest agree
- [x] 4.4 Audit every `GameConfig.MIN_PLAYERS` read: keep it for team building, replace it with the availability count for fielding
- [x] 4.5 Report the zero-available-players condition explicitly instead of leaving setup incomplete
- [x] 4.6 Update `SetupControls` to show "placed X of Y available" rather than a hard-coded seven

## 5. Scene teardown

- [x] 5.1 Ensure `GameScene.shutdown` destroys the orchestrator, which exits the active handler and removes its subscriptions
- [x] 5.2 Verify every phase handler removes all listeners in `exit()`, including `KickoffPhaseHandler`
- [x] 5.3 Order `ServiceContainer.reset()` in `GamePage` so it runs before a new scene is created
- [x] 5.4 Guard `placeBallVisual` and the other sprite factories with an inactive-scene early return that logs a warning
- [x] 5.5 Add a regression test that starts, tears down, and restarts a match, asserting no listeners survive and the kickoff succeeds

## 6. Verification

- [x] 6.1 Add a headless scenario covering touchdown → paced KO recovery → short-handed setup → kickoff
- [x] 6.2 Add a headless scenario asserting a recovered player appears exactly once and is placeable
- [x] 6.3 Run the full unit and headless suites
- [ ] 6.4 Play two consecutive browser matches in one session: score, watch KO recovery, set up short-handed, and confirm the second match kicks off cleanly
- [x] 6.5 Mark the two items fixed in `ai_notes.md` with dated notes
