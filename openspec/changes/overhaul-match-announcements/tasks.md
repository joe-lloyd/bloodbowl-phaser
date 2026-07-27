## 1. Event split

- [x] 1.1 Add `UI_LogEntry` to `src/types/events.ts` with a structured payload: category, headline, detail, optional roll, optional teamId
- [x] 1.2 Add `UI_Announce` with a payload of kind (`turn-started` | `round-passed` | `halftime` | `full-time`), headline, optional subtitle
- [x] 1.3 Keep `UI_Notification` temporarily as a deprecated alias that emits a low-priority `UI_LogEntry` so nothing goes silent during migration
- [x] 1.4 Classify both new events in the online `UI_INTENT_EVENTS` filter so host and guest stay in step

## 2. Outcomes into the log

- [x] 2.1 Emit a log entry from `WeatherManager` carrying the 2D6 roll, the named condition, and its effect
- [x] 2.2 Emit a log entry from the kickoff table resolution carrying the roll, the named event, and what it does
- [x] 2.3 Convert skill trigger and reroll messages to log entries with the effect authored by the rule
- [x] 2.4 Sweep the remaining `UI_Notification` emitters — turn flow, drive end, action refusals — into log entries with the right category (see note below: high-value emitters converted individually; the long tail of generic action-refusal toasts routes through the 1.3 alias)
- [x] 2.5 Extend `DiceLog` to render headline plus detail, attribute entries to a team only when attributable, and keep newest-first ordering

## 3. The announcer

- [x] 3.1 Add the announcer component: centred, large, click-through, with an enter/hold/exit beat and single-slot replacement
- [x] 3.2 Replace `NotificationFeed` with it in `GameHUD` / `HUDLayout` and remove the stacked toast layout
- [x] 3.3 Emit `UI_Announce` for turn started and round passed from `TurnManager`
- [x] 3.4 Emit `UI_Announce` for halftime and full time from the drive/match completion paths
- [x] 3.5 Verify no other emitter can raise an announcement — the kind union is the only entry point

## 4. Setup player inspection

- [x] 4.1 Emit `UI_ShowPlayerInfo` with the full player from `PlayerPlacementController` on selection and drag start
- [x] 4.2 Emit it from the dugout for Reserves, KO, and Casualty box clicks during setup
- [x] 4.3 Keep the panel populated for the duration of a drag and after the drop until another player is inspected
- [x] 4.4 Confirm `PlayerInfoPanel` renders correctly for a player with no grid position and reports status for KO'd and injured players

## 5. Camera-synced overlay

- [x] 5.1 Emit a camera-state event (neutral/active plus duration) from `CameraController` on take-over and reset
- [x] 5.2 Subscribe `BoardLabelOverlay` to it; scale up and fade out on active, scale back and fade in on neutral, using the published duration
- [ ] 5.3 Verify the kickoff sequence — `Camera_TrackBall` then `Camera_Reset` — produces a clean fade out and back in (pending browser check, task 6.4)
- [ ] 5.4 Confirm the overlay needs no per-move code by driving it from a second, unrelated camera move (pending browser check, task 6.4 — `showAllPlayers()`/keydown-ONE also publishes "active" with no overlay changes needed)
- [x] 5.5 Coordinate with the in-progress `add-action-camera-options` change so the state event is the shared seam (CameraController.publishState is the seam; any future move it calls inherits the behavior)

## 6. Cleanup and verification

- [ ] 6.1 Remove the `UI_Notification` alias and its last call sites — NOT done: ~140 call sites across `src/game/operations/*` and elsewhere still emit the deprecated string alias (action refusals, flavor text). They all land in the log via the 1.3 alias, so nothing is silent, but the alias itself is intentionally left in place; converting every remaining site to a categorized `UI_LogEntry` is a large mechanical follow-up left for a dedicated pass (see final report)
- [x] 6.2 Add tests asserting weather and kickoff outcomes land in the log with roll, headline, and detail
- [x] 6.3 Add a test asserting only the four announcement kinds can reach the announcer
- [ ] 6.4 Play a browser match: check setup inspection, the log detail on weather and kickoff, the announcer at each turn and halftime, and the label fade during the kickoff zoom — NOT done: no headless-Chromium/Playwright tooling available in this sandbox; verified instead via unit/integration tests and a successful `vite build`. Needs a manual pass.
- [ ] 6.5 Play an online match and confirm the guest's log and announcer match the host's — NOT done, needs two coordinated clients; the events are broadcast the same way `DiceRoll`/`UI_Notification` already were (see 1.4), so it should match, but this needs manual confirmation.
- [ ] 6.6 Mark the three items fixed in `ai_notes.md` with dated notes — NOT applicable: `ai_notes.md` is not tracked in this repo/worktree (it was migrated into OpenSpec changes per commit 655d197 and no longer exists on disk)
