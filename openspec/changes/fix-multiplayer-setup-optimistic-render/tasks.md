## 1. Fix the root cause: stop splitting a reposition into remove + place

- [x] 1.1 In `src/game/controllers/PlayerPlacementController.ts`, remove the
      `this.emit(GameEventNames.PlayerRemoved, playerId)` call inside
      `placePlayer()` that fires when the player already has an entry in
      `placedPlayers`. Keep the Map bookkeeping (`this.placedPlayers.set(...)`)
      and the `PlayerPlaced` emit unchanged — a reposition now emits only
      `PlayerPlaced`.
- [x] 1.2 Re-read `GameScene.ts`'s `PlayerPlaced` handler
      (`setupSceneSpecificListeners`) and confirm it alone (via
      `gameService.placePlayer`, `syncFromTeam`, `refreshDugouts`,
      `checkSetupCompleteness`) fully covers what a reposition needs, with no
      remaining dependency on the removed `PlayerRemoved` emit for this case.
- [x] 1.3 Confirm `PlayerPlacementController.removePlayer()` (the separate method
      used for an actual off-pitch/illegal drop) is untouched and still emits
      `PlayerRemoved` as before.

## 2. Harden the optimistic-preserve guard (defense in depth)

- [x] 2.1 In `src/network/OnlineMatch.ts`, extract the guest's "preserve my own
      in-flight setup state" merge (currently inline in `applyBundle`, the
      `preserveMySetup`/`saved` block) into a small pure, exported helper —
      e.g. `preserveOwnSetupPlacements(snapshot, myTeamId, teams)` — that
      snapshots and restores `gridPosition` **and** `player.status` for the
      calling team's own players when `snapshot.phase === GamePhase.SETUP &&
      snapshot.activeTeamId === myTeamId`.
      (Implemented as three small exported functions —
      `shouldPreserveOwnSetup`, `captureSetupPlacements`,
      `restoreSetupPlacements` — rather than one combined helper, so each is
      independently unit-testable.)
- [x] 2.2 Call the extracted helper from `applyBundle` in place of the inline
      logic, preserving existing behavior for `gridPosition` and adding the new
      `status` protection.

## 3. Tests

- [x] 3.1 In `__tests__/setup/PlayerPlacementController.test.ts`, extend the
      existing "should move player if already placed" case (or add a new one)
      to spy on the controller's `emit` (or subscribe listeners) and assert that
      relocating an already-placed player emits `PlayerPlaced` exactly once and
      does **not** emit `PlayerRemoved`; assert placing a brand-new player and
      explicitly removing a player still emit as before.
- [x] 3.2 Add a focused unit test (e.g.
      `__tests__/network/onlineMatchSetupOptimistic.test.ts`) for the extracted
      `preserveOwnSetupPlacements` helper: given a stale snapshot where the
      guest's own player has `status: RESERVE` and no `gridPosition` (simulating
      the intermediate "removed" response) while the live team object already
      holds the optimistic new `gridPosition` and `status: ACTIVE`, assert the
      merged/restored player keeps `status: ACTIVE` and the new `gridPosition`
      — i.e. `playerBoxOf` on the result is `"pitch"`, never `"reserves"`.
- [x] 3.3 Run the full test suite in the foreground
      (`npm test` / project's configured vitest command) and confirm all tests
      pass, including the pre-commit hook's full run at commit time.
      (148 test files / 1350 tests passed.)

## 4. Manual verification (optional but recommended)

- [ ] 4.1 Use the `run` skill or local dev server to spin up a two-tab online
      match, reach setup, and drag an already-placed player across legal
      squares repeatedly, confirming no visible flash to the Reserves box on
      either tab.
