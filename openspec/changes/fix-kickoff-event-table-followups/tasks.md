## 1. Fix the stale-step reference (counter + Charge!)

- [x] 1.1 In `KickoffEventManager.getStep()`, return a fresh shallow copy of `this.step`, including new array copies for `selectedPlayerIds`/`movedPlayerIds`/`awaitingPlacement` and a new object copy of `charge` (with a new `queue` array) when present
- [x] 1.2 Verify `KickoffEventOverlay.tsx`'s `refresh()` now produces a re-render on every `togglePlayerSelection`/`movePlayer`/`placePlayer`/`advanceCharge` mutation
- [x] 1.3 Manually verify in the browser: Quick Snap's selection counter updates live while selecting and moving players; Charge!'s displayed active player advances through the whole queue

## 2. Kickoff-roll-once guard

- [x] 2.1 Trace the exact call path for a page refresh/state-restore mid-kickoff (`GameStateRestored` handling, `PhaseChanged` re-entry into `KICKOFF`) to find where a second roll could be triggered
- [x] 2.2 Add a drive-scoped `kickoffResolvedForDrive` flag (or equivalent), set when `rollAndResolve` completes and cleared in the existing end-of-drive teardown
- [x] 2.3 Guard `resolveKickoffEvent`/`BallManager.rollKickoff` so a drive whose kickoff already resolved does not roll again; replay/restore the stored outcome instead
- [x] 2.4 Confirm `RNGService.getState()`/`setState()` (`currentSeed`) is actually included in match save/restore around the kickoff sequence; fix the save/restore path if it is not

## 3. HUD stacking order

- [x] 3.1 In `GameHUD.tsx`, move `<KickoffEventOverlay />` before `<PlayerInfoPanel />` in the right HUD column
- [x] 3.2 In `PlayerInfoPanel.tsx`, change the outer container from `flex-col-reverse` to `flex-col` and reorder so `selectedPlayer` renders before `hoveredPlayer`/`hoveredCrew`
- [x] 3.3 Manually verify: with a kickoff panel open, hovering a player does not move the kickoff panel, and visual order top-to-bottom is kickoff panel → selected player → hovered player

## 4. Verification

- [x] 4.1 Add a unit test asserting `getKickoffEventStep()` returns a new object reference after a selection/move/placement mutation
- [x] 4.2 Add a headless/seeded scenario: save mid-kickoff (after the table has rolled), restore, and assert the same event/outcome is reported with no second roll
- [x] 4.3 Add a browser or unit test covering the Charge! sequence's active-player field changing correctly across `advanceCharge()` calls
- [x] 4.4 Run the full unit/headless test suite and confirm no regressions
