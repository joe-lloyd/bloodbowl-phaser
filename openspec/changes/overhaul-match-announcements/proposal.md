## Why

Match feedback is split badly. Every outcome — the weather roll, the kickoff table result, skill triggers — is announced as a transient toast at the top of the screen and then lost, while the Dice Log records the roll but not what it meant. Meanwhile the genuinely structural moments (turn change, the round flipping to the other coach, halftime) are announced in the same small toast as everything else, so they read as noise. Two more presentation defects sit alongside: dragging a player during setup shows no player information at all, so a coach cannot tell who they are placing; and the new end-zone/dugout board labels are drawn in a fixed screen-space overlay, so they hang motionless over the pitch while the action camera zooms for the kickoff.

## What Changes

- **Outcomes become log entries, not toasts.** Roll results and their consequences SHALL be written to the Dice Log as entries carrying the roll, the outcome, and its meaning — "Weather 8: Perfect Bloodbowl Weather", "Kickoff 6: Quick Snap — the receiving team may each move one square". The transient toast SHALL stop being the place where results live.
- **The top banner becomes a state announcer.** The top-of-screen announcement SHALL be reserved for structural transitions only — a coach's turn beginning, the round passing to the other coach, and halftime — and SHALL be rendered large and centred so it reads as a bookend to each part of the match rather than a notification.
- **Player info is shown during setup.** Selecting, dragging, or hovering a player during setup SHALL show that player's information panel — name, number, position, characteristics, skills — the same way it does during play.
- **Board labels respond to the camera.** The board-label overlay SHALL scale up slightly and fade out when the action camera takes over, and scale back down and fade in when the camera resets, rather than staying pinned to the screen. The behavior SHALL be driven by camera events so future action-camera work inherits it without further changes.

## Capabilities

### New Capabilities
- `match-log-entries`: every roll and its outcome is recorded in the Dice Log with the result and its rulebook meaning, not just the raw dice.
- `phase-announcer`: a large, centred announcement reserved for turn changes, round flips, and halftime, acting as a bookend to each part of the match.
- `setup-player-inspection`: player information is available while placing players during setup.
- `board-overlay-camera-sync`: the board-label overlay fades and scales in response to camera state changes instead of remaining fixed on screen.

## Impact

- HUD: `src/ui/components/hud/DiceLog.tsx` (outcome entries), `src/ui/components/hud/NotificationFeed.tsx` (replaced by the announcer), `src/ui/components/hud/HUDLayout.tsx` and `GameHUD.tsx` (layout and placement), `src/ui/components/hud/PlayerInfoPanel.tsx`.
- Events: `src/types/events.ts` — `UI_Notification` consumers split between a log-entry event and an announcement event; `UI_ShowPlayerInfo` emitted from the setup path.
- Emitters that currently toast results: `src/game/managers/WeatherManager.ts`, `src/game/controllers/KickoffController.ts`, `src/game/controllers/handlers/KickoffPhaseHandler.ts`, `src/game/managers/TurnManager.ts`, `src/game/controllers/SceneOrchestrator.ts`, skill rules that emit `SkillTriggered`.
- Setup: `src/game/controllers/PlayerPlacementController.ts`, `src/game/managers/SetupManager.ts`, `src/ui/components/hud/SetupControls.tsx`, `src/game/elements/Dugout.ts`.
- Camera/overlay: `src/ui/components/hud/BoardLabelOverlay.tsx`, `src/game/controllers/CameraController.ts`, `Camera_TrackBall` / `Camera_Reset` events. Coordinates with the in-progress `add-action-camera-options` change.
- Online: announcements and log entries must be filtered consistently by the `UI_INTENT_EVENTS` rules so a guest sees the same feed.
