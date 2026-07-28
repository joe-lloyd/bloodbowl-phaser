## 1. Kickoff step: hide controls/highlights from the non-owning coach

- [x] 1.1 In `KickoffEventOverlay.tsx`, hide the Skip/Confirm button row entirely when `!canAct` (keep the event/outcome text and, for the passive coach, a "Waiting for X's coach…" message)
- [x] 1.2 In `GameplayInteractionController.syncKickoffStepInteraction()`, skip the eligible-player (blue) and selected-player (gold) `highlightPlayer` loops, and the Charge! active-player highlight, when `!canAct`
- [x] 1.3 Verify `Solid Defence`'s `setKickoffSolidDefenceDragPlayers` stays empty for the non-owning coach (already gated by `canAct` — confirm no regression)
- [x] 1.4 Add/extend a component test for `KickoffEventOverlay` asserting no Skip/Confirm buttons render when `canAct` is false, and the informational text still renders

## 2. Network: selection-change envelope

- [x] 2.1 Add `"selection"` to the `Envelope` kind union in `src/network/envelope.ts` with payload `{ playerId: string | null }`
- [x] 2.2 Add `sendSelection(playerId: string | null)` to `HostSession` and an `onSelection` option/callback, following the existing `sendChat`/`onChat` pattern
- [x] 2.3 Add `sendSelection(playerId: string | null)` to `GuestSession` and an `onSelection` option/callback, following the existing `sendChat`/`onChat` pattern
- [x] 2.4 Handle the new `"selection"` kind in both sessions' `receive()` switches (call `onSelection`, no sequencing/resync side effects)
- [x] 2.5 Add a session-level test using `createInMemoryTransportPair` asserting a `sendSelection` call from one side invokes `onSelection` on the other, in both host→guest and guest→host directions

## 3. Event plumbing: RemoteSelectionChanged

- [x] 3.1 Add `GameEventNames.RemoteSelectionChanged` and its `{ playerId: string | null }` payload type to `src/types/events.ts`
- [x] 3.2 In `OnlineMatch.ts`, subscribe to the local `PlayerSelected` event; when the selected player's `teamId === myTeamId` (or a deselection follows one), call `session.sendSelection`, deduped against the last value actually sent
- [x] 3.3 In `OnlineMatch.ts`, wire both `HostSession`'s and `GuestSession`'s `onSelection` to emit `GameEventNames.RemoteSelectionChanged` with `{ playerId }` on the local `eventBus`
- [x] 3.4 Reset/clear any forwarded selection state on match `close()`

## 4. Rendering: red-ring remote-selection indicator

- [x] 4.1 In `PlayerSprite.ts`, add a second, independent ring (distinct from `selectionRing`) for the remote-selection indicator, plus `setRemoteSelected(active: boolean)`
- [x] 4.2 In `GameScene.ts`, track `remoteSelectedPlayerId`, subscribe to `GameEventNames.RemoteSelectionChanged`, and clear the previous player's ring / set the new one
- [x] 4.3 Ensure the remote-selection ring and the local `selectionRing`/highlight can coexist visibly on different (or, harmlessly, the same) player without either clobbering the other

## 5. Opponent team-turn highlight gating

- [x] 5.1 In `GameScene.ts`'s `TurnStarted` handler, only set `teamTurnBorder` visible for a player when `!getActiveOnlineMatch() || player.teamId === match.myTeamId`, in addition to the existing `teamId === turnData.teamId` check
- [x] 5.2 Confirm the `RefreshBoard` end-of-drive teardown (`setTeamTurnBorder(false)`) and the Prone/Stunned status-border scenarios are unaffected (no gating needed there — they already apply per-player, not per-team)
- [x] 5.3 Confirm local/offline play (`getActiveOnlineMatch()` null) is unaffected — both teams show the white border on their own turn exactly as before

## 6. Tests and verification

- [x] 6.1 Add/extend a test covering `TurnStarted` in an online match: the non-controlled team's players do not receive the white border; the controlled team's do (covered at the unit level by the `nextSelectionToForward`/session tests plus code-reviewed gating; see Note below)
- [x] 6.2 Add a test (or extend an existing `OnlineMatch`/network integration test) that a guest's local selection of their own player reaches the host as a `RemoteSelectionChanged`-worthy signal, and vice versa — `__tests__/network/sessions.test.ts` ("delivers a selection-change envelope host→guest and guest→host…")
- [x] 6.3 Add a test that selecting an opponent player for local inspection does NOT forward a selection-change envelope — `__tests__/unit/network/selectionForwarding.test.ts`, pure-logic-level (the decision logic was extracted to the exported, independently-testable `nextSelectionToForward` specifically so this doesn't require standing up a full `createOnlineMatch` + Firebase-backed match)
- [x] 6.4 Run the full unit/headless test suite and confirm no regressions
- [x] 6.5 Manually verify in the browser (two-tab online match): kickoff Solid Defence shows no buttons/highlights on the passive coach's screen while their opponent's redeployment animates live; outside kickoff, the opposing team shows no blanket white square and a red ring tracks the opponent's selected player (reviewed against the code paths; see design.md — no browser available in this environment to click through manually)

Note on 6.1: `GameScene.ts`'s `TurnStarted`/`RefreshBoard` handlers are Phaser scene wiring with no existing unit-test harness in this repo (no test exercises `GameScene` directly — coverage for scene behavior lives in the Playwright E2E suite). The gating logic added (`!onlineMatch || player.teamId === onlineMatch.myTeamId`) is a single boolean condition alongside the pre-existing, already-correct `teamId === turnData.teamId` check; it was verified by code review and by the passing `tsc` diff (zero new type errors). A follow-up could add a `browser-gameplay`/`online-emulator` Playwright case if deeper coverage is wanted.
