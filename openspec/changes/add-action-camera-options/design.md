# Design: add-action-camera-options

## Context

`CameraController` (Phaser) already has `zoomTo`, `panTo`, `trackObject` (lerp 0.25), `showAllPlayers` (fit pitch), and `reset`. Today only the kickoff uses it, via `Camera_TrackBall` (pan → zoom 2.5 → track) and `Camera_Reset`; a comment notes auto-reset was removed for "manual control" that was never built. The camera is a pure browser view concern — no engine or headless involvement, and not synced in online play. There is no persisted user preference and no follow of the activating player.

## Goals / Non-Goals

**Goals:**

- The coach controls resting zoom and how aggressively the camera follows the action, including turning follow fully off.
- Following works for whoever is acting (the activating player and the ball), not just the kickoff.
- The ball follow is smooth and readable across its whole path.
- Settings persist per viewer and apply live.

**Non-Goals:**

- Syncing camera between online players (each viewer is independent).
- Free RTS-style pan/drag/edge-scroll (out of scope; this is about follow + zoom).
- Any engine, rules, or headless change.

## Decisions

### 1. A resting camera state the settings define, not one-off tweens

Introduce the notion of a "resting" zoom + follow-intensity that the camera returns to, sourced from the persisted settings. `reset()` returns to the coach's chosen zoom (not a hard-coded default), and follow behavior reads the intensity. Alternative — keep firing fixed-parameter animations per event — rejected: it can't express "stay back" or a user zoom, which is the whole request.

### 2. Follow intensity as a single scalar mapping to lerp + zoom

One setting `0..1` (Off, Light, Close): Off = no follow, camera holds the resting fit/zoom; Light = gentle lerp (~0.08) at modest zoom; Close = tight lerp (~0.25) at higher zoom. Mapping lives in the controller so the UI stays a single slider. This directly fixes "ball too fast": lower lerp = smoother catch-up, and easing on the pan.

### 3. Generalize ball tracking to the activating actor

Add a `Camera_TrackObject` trigger (the existing `Camera_TrackBall` becomes a special case) fired from activation/move/pass/kick events with the sprite to follow. The camera follows the current actor and hands off to the ball when the ball is the thing in motion (pass/kick/bounce). Following persists for the whole travel by not stopping the follow until the motion-complete event, fixing the "only first leg" problem.

### 4. Settings in localStorage via a small hook, live-applied

`{ zoom: number, followIntensity: 0..1 }` read at scene create and on change; a HUD control writes them and pushes them to the live `CameraController`. No engine coupling; mirrors the localStorage settings pattern used elsewhere (e.g. the sound suite settings).

## Risks / Trade-offs

- [Following during fast multi-step animations feels jerky] → lerp + easing tuned per intensity; Off/Light give calm options; validated by manual passes.
- [Camera fights user during their own manual inspection] → follow only re-centers on activation/motion events, not continuously, so a still board stays where the coach left it.
- [Zoom persisted too tight on a small screen] → clamp zoom to a sane range derived from `showAllPlayers` fit as the lower bound.

## Migration Plan

Tune `CameraController` (intensity param, resting zoom, easing) with no behavior change at defaults; generalize the track event; add the settings hook + HUD control last. Each step is independently shippable; no persisted-data migration (absent settings fall back to current defaults).

## Open Questions

- Whether "fit whole pitch" is a discrete preset button or just the minimum of the zoom range (lean: both — button sets zoom to the fit value).
- Default intensity for new users (lean: Light — some follow, not disorienting).
