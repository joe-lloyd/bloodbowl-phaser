## Why

Testing multiplayer features (blocks, kickoff events, long dice-heavy sequences) is currently constrained by the shortest useful turn timer (60s), which keeps expiring mid-test and force-ending turns. The host has no way to disable the turn clock entirely for a match, even though the underlying sync mechanism (a nullable `timer.deadline`) already supports "no active countdown" as a first-class state — it's just never offered as a host choice.

## What Changes

- Add a "No time limit" choice to the lobby's turn-timer setting, alongside the existing duration options (1/1.5/2/3/4 min).
- When the host has "No time limit" selected, the host client writes `timer.deadline: null` at the start of each turn instead of an expiring deadline, so neither client ever sees a countdown or a forced end-of-turn for that match.
- The turn clock UI (host and guest) continues to render nothing when there is no active deadline — no new "unlimited" display state is introduced, so there's no risk of a frozen/broken-looking timer.
- The per-player timeout bank (pause) setting is unaffected; pausing remains tied to whether a deadline exists, so with no time limit the pause control simply doesn't appear (there's nothing to pause).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `turn-timer`: "Host-configured timer settings" now allows the host to choose no time limit, in which case the "Server-synced turn countdown" and "Auto end-turn on expiry" requirements do not apply for that match.

## Impact

- `src/firebase/lobby.ts`: `LobbySettings.turnSeconds` gains a documented sentinel value (`0`) meaning "no limit"; `DEFAULT_SETTINGS` unchanged.
- `src/ui/components/pages/OnlineLobby.tsx`: `SettingsPanel`'s turn-timer `<select>` gains a "No time limit" option.
- `src/ui/pages/TurnClock.tsx`: host's turn-start effect writes `deadline: null` when `turnSeconds` is the no-limit sentinel, instead of `Date.now() + turnMs`.
- No Firestore schema/rules changes (deadline is already nullable); no changes to guest-side rendering logic (already handles `deadline == null`).
- Tests: extend unit coverage for the lobby settings UI and the host's deadline-writing decision.
