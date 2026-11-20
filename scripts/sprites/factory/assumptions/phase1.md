# Phase 1 assumptions

Decisions made without the owner while building the framework and the Vampire team.

## Facings
- Facing rotation follows `DIRECTIONS` in `reference/blender_players.py` (s = 0, se = 45, e = 90 ...),
  with the figure facing -Y at rotation 0 and the camera at azimuth 45. With that convention **`se` is
  the view facing the camera** and `e` is the three-quarter view. The round 3 to 5 concept images
  labelled "se" were rotated 90 degrees, which is `e` here. All eight facings are rendered, so the
  approved three-quarter view is in the atlas as `e`.
- Review sheets show the animations in `se` as asked, which is therefore the frontal view.

## Size, frame and anchor
- Each model is scaled so its `idle/se/0` height equals today's sprite, times a per-model `height`
  factor limited to 0.9..1.1. Vampire factors: thrall 0.97, runner 1.10, thrower 1.05, blitzer 1.08,
  vargheist 1.00 (measured: 41, 46, 44, 45 and 61 px against today's 42, 42, 42, 42 and 60).
- The frame is today's square frame size for the model, enlarged in steps of 32 px only if a pose does
  not fit. The foot anchor is (frame / 2, 0.605 x frame), the same ratio as today's manifest.
- `ppu` in the manifest is written as 25, the value in today's manifest, because I do not know what the
  game uses it for and the pixel sizes match today's.

## Layers
- `base` contains the whole figure including the outline, with kit areas in neutral grey, as in
  `reference/build_sheets.py`. `kit1` / `kit2` contain only kit pixels as a grey ramp (0.42, 0.68, 0.96).
- Tinting is a plain multiply, so the hue-shifted shadow tones of the approved concept's kit colours are
  lost: kit shadows are darker versions of the team colour.
- All three layers of a model use the same frame rectangles (trimmed to the base layer's pixels), so a
  kit frame can be mostly transparent. Today's atlases trim each layer separately.
- The cape lining stays a fixed dark red in the base layer; it is not a kit colour.

## Look
- One render sample per pixel with hard shadows. The concept used several samples, which blended tones
  into off-ramp colours and gave more frame-to-frame noise; one sample gives exactly the ramp colours.
- The master palette is shared by all teams and has grown from the concept's 24 colours to cover other
  races (about 100 entries). A single figure uses roughly 15-25 of them.

## Animations
- `block` and `pass` are 8 frames (today's pipeline had a 6-frame block).
- Falls end on the back for bipeds, on the side for quadrupeds, centaurs and vehicles, and as a heap
  for the floating plan.
- The Vampire idles are the approved round 5 ideas, with large-body motion changed to two states to
  reduce flicker (the Thrall's weight shift and the Runner's toe bounce are now two-state).

## Vampire team
- Model keys and sexes: `thrall` (male), `vampire_runner` (the lightweight female sprinter),
  `vampire_thrower` (female), `vampire_blitzer` (male), `vargheist`.
- Default review colours for all 30 teams are my own choices (`lib/palette.py`, `TEAM_COLOURS`); the
  references contain none.

## Not done in phase 1
- Only the Vampire models are finished. The other body plans and race presets are bases, each checked
  with one preview of a demo model at most.
- Stray files: `factory/tmp/` holds my test output and logs; it can be deleted.
