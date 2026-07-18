# Tasks: add-action-camera-options

## 1. Camera controller tuning

- [ ] 1.1 Add a resting-state concept to `CameraController`: a settable resting zoom that `reset()` returns to (instead of the captured default), clamped to a range whose minimum is the `showAllPlayers` fit zoom
- [ ] 1.2 Add a `followIntensity` (0..1) parameter mapping to lerp + track-zoom (Off = no follow, Light ≈ 0.08, Close ≈ 0.25) with easing on the pan
- [ ] 1.3 Keep the ball follow engaged until the ball's motion-complete event (fix the "first leg only" stop)

## 2. Generalize tracking to the activating actor

- [ ] 2.1 Add a `Camera_TrackObject` trigger (generalizing `Camera_TrackBall`) carrying the sprite to follow; keep the kickoff path working through it
- [ ] 2.2 Bind activation/move/pass/kick events to the follow so the camera tracks whoever is acting, then the ball when the ball is the moving object
- [ ] 2.3 Respect follow-intensity Off in all bindings (no camera movement on actions)

## 3. Settings + HUD control

- [ ] 3.1 Camera-settings hook: `{ zoom, followIntensity }` in localStorage, read at scene create, per viewer
- [ ] 3.2 In-HUD control: zoom in/out + "fit pitch", and a follow slider including Off; writes settings and pushes them live to the `CameraController`
- [ ] 3.3 Apply changes live mid-match; ensure online viewers are independent (no sync)

## 4. Verification

- [ ] 4.1 Manual browser pass: zoom in/out persists across reload; follow Off keeps the camera static on activation; Close tracks the activating player and the ball smoothly to rest
- [ ] 4.2 Full test suite green; `CameraController` unit tests updated for the new resting-zoom/intensity behavior
