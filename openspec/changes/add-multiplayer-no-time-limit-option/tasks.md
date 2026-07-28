## 1. Lobby settings

- [x] 1.1 Document the `turnSeconds: 0` sentinel ("no time limit") on `LobbySettings.turnSeconds` in `src/firebase/lobby.ts`.
- [x] 1.2 Add a "No time limit" option (value `0`) to the turn-timer `<select>` in `SettingsPanel` (`src/ui/components/pages/OnlineLobby.tsx`), alongside the existing 1/1.5/2/3/4 minute options.

## 2. Turn clock host logic

- [x] 2.1 In `TurnClock.tsx`'s host `TurnStarted` effect, write `timer.deadline: null` via `setTurnDeadline` when `lobby.settings.turnSeconds` is `0`/falsy, instead of `Date.now() + turnMs`.
- [x] 2.2 Confirm (by reading, no code change expected) that the render guard (`timer.deadline == null` → render nothing) and the host expiry-enforcement effect (`!timer?.deadline` → no-op) already correctly do nothing for a null deadline, for both host and guest.

## 3. Tests

- [x] 3.1 Unit test for `TurnClock`'s deadline-writing decision: given `turnSeconds = 0`, the host writes a null deadline on turn start (not an expiring one). Given a normal `turnSeconds` value, behavior is unchanged.
- [x] 3.2 Unit/component test for the lobby `SettingsPanel`: selecting "No time limit" updates `settings.turnSeconds` to `0` and round-trips through the select's displayed value.
- [x] 3.3 Run the full test suite locally to confirm no regressions.

## 4. Docs / cleanup

- [x] 4.1 Re-read `TurnClock.tsx` and `OnlineLobby.tsx` changes together to confirm no dead branches or duplicate "unlimited" concepts were introduced (per design.md's decision to reuse the existing null-deadline path).
