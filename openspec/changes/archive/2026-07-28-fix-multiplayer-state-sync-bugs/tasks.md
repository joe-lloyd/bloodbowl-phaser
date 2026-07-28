## 1. Ball/status visual reconciliation ordering (bug #1)

- [x] 1.1 In `src/network/OnlineMatch.ts`'s guest `applyBundle`, reorder so the authoritative snapshot is applied to the replica (`applySnapshotToTeams` + `Object.assign(replica.getState(), deserializeGameState(snapshot))`) *before* the host's events are replayed on the local `eventBus`.
- [x] 1.2 Confirm `pending`, the `localStorage` snapshot cache, the phase-jump `PhaseChanged` emit, and the final `UI_SyncBoard` emit still occur in a sensible order relative to the swap (no behavior change intended for those).
- [x] 1.3 Add a network-session regression test (in `__tests__/network/sessions.test.ts` or a new sibling file) that drives a pass/bounce or pickup sequence guest-side and asserts the guest's replica `ballPosition` matches the host's at every intermediate broadcast, not just at the end. (Added `__tests__/network/onlineMatchGuestSync.test.ts`, exercising the real `createOnlineMatch` guest path with hand-built broadcast envelopes.)

## 2. Per-team turn counter sync (bug #2)

- [x] 2.1 Add `turnManager?: TurnManagerState` to the `GameSnapshot` interface in `src/headless/serialization.ts` (reuse the existing `TurnManagerState` type from `src/game/managers/TurnManager.ts`, already used by `MatchSave`).
- [x] 2.2 Populate it in `HeadlessGame.snapshot()` (`src/headless/HeadlessGame.ts`) via `this.ctx.gameService.captureTurnManagerState()`.
- [x] 2.3 In `OnlineMatch.ts`'s guest `applyBundle`, call `replica.restoreTurnManagerState(snapshot.turnManager)` whenever the field is present, alongside the existing state assignment.
- [x] 2.4 Add a network-session regression test asserting that after several turns pass (broadcasts crossing the wire, no resync), `match.game`'s host-side `getTurnNumber` for BOTH teams matches what a guest-side replica would report after applying the latest bundle — and that this still holds after a resync-only bundle (no `TurnStarted` events replayed). (Added to both `sessions.test.ts` — data travels correctly in the snapshot — and `onlineMatchGuestSync.test.ts` — the guest actually applies/restores it.)

## 3. Force-ended turn leaves no stale declaration (bug #3)

- [x] 3.1 In `GameService.endTurn()` (`src/services/GameService.ts`), finalize any dangling `state.activePlayer` before delegating to `this.turnManager.endTurn()`: if `state.activePlayer` is set, call `this.playerActionManager.commitAction(this.state.activePlayer.id)` then clear `this.state.activePlayer = null`, mirroring the existing pattern in `finishActivation()`.
- [x] 3.2 Add a headless/engine-level regression test: declare and commit a once-per-turn action (e.g. Blitz, after moving one square) without finishing the activation, force `endTurn()`, then assert the next team's first `declareAction()` call succeeds (previously refused with "Cannot change the declared Action"). (Added to `__tests__/headless/reported-gameplay-bugs.test.ts`.)
- [x] 3.3 Add/extend a network-session test exercising the same sequence through `HostSession.executeLocal`/`TurnClock`-style direct `endTurn()` call, confirming the guest's synced state also reflects a clean handoff (no stale `activePlayer` surviving in the broadcast snapshot). (Added to `sessions.test.ts`.)

## 4. Validation

- [x] 4.1 Run the full existing `__tests__/network/sessions.test.ts` suite plus the new tests and confirm all pass.
- [x] 4.2 Run the full project test suite (`npm test` or equivalent) once, in the foreground, before committing.
- [x] 4.3 Spot-check `openspec validate fix-multiplayer-state-sync-bugs --strict` passes.
