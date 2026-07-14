# Tasks: fix-halftime-drive-reset

## 1. Rulebook verification

- [ ] 1.1 Confirm the Sevens 2025 KO recovery threshold/modifiers and end-of-drive handling of stunned players against `docs/pdfs/Blood Bowl (2025) Rulebook 3rd Season (with text).pdf`; record the answers in design.md's Open Questions

## 2. Engine sequence

- [ ] 2.1 Add `SetupManager.resetForNewDrive()`: clear `placedPlayers`, `setupReady`, player `gridPosition`s; statuses → Reserves except KO/Injured/Dead/Removed
- [ ] 2.2 Add `KORecoveryRolled` event to `types/events.ts`; implement KO recovery via `DiceController` (one roll per KO'd player)
- [ ] 2.3 Replace the no-op `startEndDriveSequence`/`recoverKO` chain in `GameService` with operations on `GameFlowManager` (`ClearPitchOperation`, `KORecoveryOperation`) using `context.delay` pacing; clear ball position
- [ ] 2.4 Centralize next-drive kicking team in `TurnManager` (scorer kicks after TD; halves swap at halftime); halftime path runs the same end-of-drive sequence before setup
- [ ] 2.5 Ensure the coin flip can only run before drive one (engine guard, not just UI)

## 3. Headless & tests

- [ ] 3.1 Tighten the full-match bot: assert pitch is empty + placements reset between drives, re-place players every drive; assert no coin flip after drive one
- [ ] 3.2 Drive-reset unit tests: pitch clear on TD, KO recovery events both outcomes (seeded), kicking-team determination table (TD/halftime), ball cleared
- [ ] 3.3 Run entire suite; keep 325 existing tests green

## 4. Browser UI

- [ ] 4.1 Dugout/sprite refresh on the drive-reset events; show KO recovery results (notification or log)
- [ ] 4.2 Gate the coin-flip overlay to the first drive; verify setup UI opens for the correct team on later drives
- [ ] 4.3 Manual smoke: play a browser match through a touchdown and through halftime into the second half
