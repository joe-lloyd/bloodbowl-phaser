## Why

A local match exists only in memory. Hitting refresh, closing the tab, or a browser crash destroys it with no recovery — an hour of Sevens is gone. Online matches already survive a reload, because the host broadcasts snapshots and the guest caches the last one under `bb_online_snapshot_<code>` in localStorage; local play has no equivalent. The serialization needed already exists (`serializeGameState` / `deserializeGameState`, used by the headless runner and the online transport); nothing persists it for a local game.

## What Changes

- **A local match autosaves.** An in-progress local match SHALL be written to browser storage after every state change that advances the game, so at most one action is ever lost.
- **A saved match can be resumed.** On returning to the app, a saved in-progress match SHALL be offered for resumption, restoring the board, dugouts, score, turn, weather, and drive position where the coach left off.
- **The save is complete enough to resume.** The saved payload SHALL carry everything a resume needs beyond the game snapshot: both team rosters, which team is kicking and receiving this drive, the half and turn, the random-number generator state, the competition context if the match is a fixture, and the accumulated match statistics.
- **Signed-in coaches get a cloud save.** When a coach is signed in, the same payload SHALL also be written to Firestore under their account so a local match can be resumed on another device, with the local copy used when it is newer.
- **Saves are cleaned up.** The save SHALL be cleared when the match reaches full time and the coach leaves the results screen, or when the coach explicitly abandons the match. A stale or unreadable save SHALL be discarded rather than blocking startup.

## Capabilities

### New Capabilities
- `local-match-resume`: an in-progress local match is autosaved and can be resumed after a refresh, crash, or — when signed in — on another device.

### Modified Capabilities
- `game-state-serialization`: the snapshot is extended into a resumable save payload that additionally captures drive assignment, RNG state, match statistics, and competition context.

## Impact

- New persistence module for match saves, alongside `src/game/managers/TeamManager.ts`'s storage seam pattern.
- Serialization: `src/headless/serialization.ts` (`GameSnapshot` → save payload wrapper), `src/services/ScenarioLoader.ts` restore path.
- Services: `src/services/ServiceContainer.ts` (autosave hook on state change), `src/services/rng/*` (seed/state capture and restore), `src/game/progression/MatchStats.ts` (serializable tracker state).
- UI: `src/ui/components/pages/MainMenu.tsx` (resume entry point), `src/ui/pages/GamePage.tsx` (boot from a save, clear on completion), a discard/abandon control.
- Cloud: `src/firebase/` — a per-coach saved-match document; `src/firebase/auth.ts` for the signed-in path.
- Scene boot: `src/scenes/GameScene.ts` starting phase and board rebuild from a restored state rather than a fresh setup.
