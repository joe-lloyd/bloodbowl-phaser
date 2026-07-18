# Tasks: add-pitch-dugout-visual-overhaul

## 1. Theme model + default (pure refactor)

- [ ] 1.1 Define `PitchTheme` (surface colour/gradient/optional texture key, zone colours, line styles, dugout palette) and a theme catalog
- [ ] 1.2 Add a default theme reproducing today's exact look; route `Pitch` (`render`/`drawGrid`/`drawEndZones`/`drawFieldMarkings`/`drawWideZones`) through the theme instead of hard-coded `GameConfig.COLORS`
- [ ] 1.3 Confirm geometry constants and `gridToPixel`/`pixelToGrid` are untouched; existing placement/scenario tests stay green (regression gate)

## 2. Pitch surface redesign

- [ ] 2.1 Themed surface (gradient/texture, turf/hash detailing) with drawn fallback when a texture is absent
- [ ] 2.2 Clearer end zones, wide zones, line of scrimmage, centre line per theme, tuned to stay legible behind player/ball sprites
- [ ] 2.3 Add 3–4 starter themes (e.g. classic grass, mud, astro, wasteland)

## 3. Dugout + sideline staff

- [ ] 3.1 Redesign `Dugout` sections into a themed bench (team colours, clear reserve/KO/dead separation) keeping the interactive grid slots intact
- [ ] 3.2 Sideline staff renderer: read the team's assistant coach / cheerleader / staff counts and place that many sprites in dedicated slots, capped per type, not overlapping the interaction grids

## 4. Theme selection + online sync

- [ ] 4.1 Host-facing theme picker (lobby + local pre-match), sharing one catalog + component
- [ ] 4.2 Write the chosen theme id to the lobby/match doc and render the host's theme on the guest; persist with the match
- [ ] 4.3 Local play stores the pick in match setup state

## 5. Verification

- [ ] 5.1 Manual browser pass: each theme renders, players/ball stay readable, dugout interaction and drag still work, staff scale with counts
- [ ] 5.2 Load one scenario under two themes and confirm identical grid/pixel positions; full test suite green
