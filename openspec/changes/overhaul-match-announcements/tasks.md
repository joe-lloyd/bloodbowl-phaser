## 1. Event split

- [ ] 1.1 Add `UI_LogEntry` to `src/types/events.ts` with a structured payload: category, headline, detail, optional roll, optional teamId
- [ ] 1.2 Add `UI_Announce` with a payload of kind (`turn-started` | `round-passed` | `halftime` | `full-time`), headline, optional subtitle
- [ ] 1.3 Keep `UI_Notification` temporarily as a deprecated alias that emits a low-priority `UI_LogEntry` so nothing goes silent during migration
- [ ] 1.4 Classify both new events in the online `UI_INTENT_EVENTS` filter so host and guest stay in step

## 2. Outcomes into the log

- [ ] 2.1 Emit a log entry from `WeatherManager` carrying the 2D6 roll, the named condition, and its effect
- [ ] 2.2 Emit a log entry from the kickoff table resolution carrying the roll, the named event, and what it does
- [ ] 2.3 Convert skill trigger and reroll messages to log entries with the effect authored by the rule
- [ ] 2.4 Sweep the remaining `UI_Notification` emitters — turn flow, drive end, action refusals — into log entries with the right category
- [ ] 2.5 Extend `DiceLog` to render headline plus detail, attribute entries to a team only when attributable, and keep newest-first ordering

## 3. The announcer

- [ ] 3.1 Add the announcer component: centred, large, click-through, with an enter/hold/exit beat and single-slot replacement
- [ ] 3.2 Replace `NotificationFeed` with it in `GameHUD` / `HUDLayout` and remove the stacked toast layout
- [ ] 3.3 Emit `UI_Announce` for turn started and round passed from `TurnManager`
- [ ] 3.4 Emit `UI_Announce` for halftime and full time from the drive/match completion paths
- [ ] 3.5 Verify no other emitter can raise an announcement — the kind union is the only entry point

## 4. Setup player inspection

- [ ] 4.1 Emit `UI_ShowPlayerInfo` with the full player from `PlayerPlacementController` on selection and drag start
- [ ] 4.2 Emit it from the dugout for Reserves, KO, and Casualty box clicks during setup
- [ ] 4.3 Keep the panel populated for the duration of a drag and after the drop until another player is inspected
- [ ] 4.4 Confirm `PlayerInfoPanel` renders correctly for a player with no grid position and reports status for KO'd and injured players

## 5. Camera-synced overlay

- [ ] 5.1 Emit a camera-state event (neutral/active plus duration) from `CameraController` on take-over and reset
- [ ] 5.2 Subscribe `BoardLabelOverlay` to it; scale up and fade out on active, scale back and fade in on neutral, using the published duration
- [ ] 5.3 Verify the kickoff sequence — `Camera_TrackBall` then `Camera_Reset` — produces a clean fade out and back in
- [ ] 5.4 Confirm the overlay needs no per-move code by driving it from a second, unrelated camera move
- [ ] 5.5 Coordinate with the in-progress `add-action-camera-options` change so the state event is the shared seam

## 6. Cleanup and verification

- [ ] 6.1 Remove the `UI_Notification` alias and its last call sites
- [ ] 6.2 Add tests asserting weather and kickoff outcomes land in the log with roll, headline, and detail
- [ ] 6.3 Add a test asserting only the four announcement kinds can reach the announcer
- [ ] 6.4 Play a browser match: check setup inspection, the log detail on weather and kickoff, the announcer at each turn and halftime, and the label fade during the kickoff zoom
- [ ] 6.5 Play an online match and confirm the guest's log and announcer match the host's
- [ ] 6.6 Mark the three items fixed in `ai_notes.md` with dated notes
