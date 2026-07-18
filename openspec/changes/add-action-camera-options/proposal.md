# Proposal: add-action-camera-options

## Why

`CameraController` can zoom, pan, and track, but it is used only for a scripted kickoff ball-follow, with no player control. There is no zoom in/out, the ball follow is too fast to read and not smoothly tracked (auto-reset was already disabled by hand), and there is no way to turn any of it off. Coaches want to choose how close and how much the camera chases the action — from "glued to the activating player and the ball" to "stay back and show the whole pitch."

## What Changes

- **User zoom control**: a persistent zoom level the coach sets (in/out, plus a "fit whole pitch" preset), applied as the resting camera state rather than a one-off animation.
- **Action tracking**: when a player activates or moves, the camera can follow the activating player and the ball, whoever is acting — driven off existing events (`PlayerActivated`/`PlayerMoved`/`BallKicked`/pass events) instead of only the kickoff.
- **Smoother, readable ball follow**: retune the ball track (slower catch-up / lerp, easing, so the ball is actually trackable) and keep it following through its whole travel, not just the first leg.
- **A follow intensity setting incl. full off**: a single control from "no follow, camera stays back" through "light nudge" to "close chase," so a coach who wants the static overview gets exactly that.
- **Settings are per-player and persisted** (localStorage), applied live without restarting a match, and independent of the online/host state (each viewer controls their own camera).

## Capabilities

### New Capabilities

- `action-camera`: Player-controlled camera behavior during a match — zoom level and presets, action/ball tracking bound to gameplay events, follow-intensity including off, and persisted per-viewer settings applied live.

### Modified Capabilities

<!-- none — no camera capability exists in openspec/specs yet -->

## Impact

- **Touched code**: `src/game/controllers/CameraController.ts` (tunable lerp/easing, follow-intensity parameter, resting-zoom concept), `GameScene`'s `Camera_TrackBall`/`Camera_Reset` handlers and its camera wiring, plus a new binding from activation/move events to camera follow.
- **New code**: a camera-settings hook + a small in-HUD control (zoom, follow slider incl. off), persisted to localStorage.
- **New/renamed events** (if needed): a `Camera_TrackObject`/activation-follow trigger generalizing today's ball-only `Camera_TrackBall`.
- **Untouched**: engine/rules and headless (camera is browser-only; headless has no camera). Online play is unaffected — camera is a local view concern, not synced.
