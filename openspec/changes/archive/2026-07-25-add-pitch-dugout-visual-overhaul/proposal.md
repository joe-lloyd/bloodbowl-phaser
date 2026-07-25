# Proposal: add-pitch-dugout-visual-overhaul

## Why

The pitch is a flat green rectangle with thin grid lines (`Pitch.render`), and the dugouts are plain grey grid boxes (`Dugout`) — functional but visually dull. The game also has assistant coaches, cheerleaders, and other sideline staff as data with no on-screen presence. A richer pitch (with a few themes the host can pick from) and a redesigned dugout that shows the sideline staff make matches feel alive.

## What Changes

- **Selectable pitch themes**: several pitch looks (e.g. classic grass, mud/astro/wasteland variants) the host chooses before a match; the choice drives the pitch surface, end-zone/wide-zone treatment, and line styling. Local play picks from the same set.
- **Pitch surface redesign**: replace the single flat rectangle + hairline grid with a themed surface (texture/gradient, turf/hash detailing, clearer end zones, wide zones, line of scrimmage, centre line) while keeping the exact 20×11 grid geometry and pixel mapping the engine relies on.
- **Dugout redesign**: turn the grey reserve/KO/dead boxes into a themed bench area that reads as a sideline, with clearer sections and team colours.
- **Sideline staff visuals**: show assistant coaches, cheerleaders, and other retained staff along the sideline / in the dugout, scaled to the counts on the team (more cheerleaders = more shown, within a cap).
- **Theme selection is synced in online play** (host picks; guest renders the same) and persisted with the match, so both coaches see the same field.

## Capabilities

### New Capabilities

- `pitch-themes`: The set of selectable pitch appearances and the host's selection — the theme catalog, how a theme drives the pitch surface/zones/lines, the invariant that grid geometry and pixel mapping are unchanged, and syncing/persisting the choice in online play.
- `sideline-presentation`: The redesigned dugout and sideline staff rendering — themed bench sections and on-screen assistant coaches/cheerleaders/staff scaled to team counts.

### Modified Capabilities

<!-- none — no pitch/dugout capability exists in openspec/specs yet -->

## Impact

- **Touched code**: `src/game/elements/Pitch.ts` (themed `render`/`drawGrid`/`drawEndZones`/`drawFieldMarkings`/`drawWideZones`), `src/game/elements/Dugout.ts` (themed sections + staff slots), `GameScene` dugout/pitch construction, and `GameConfig.COLORS` (theme palettes).
- **New code**: a pitch-theme catalog + a host-facing theme picker (pre-match / lobby), a sideline-staff renderer reading the team's staff counts.
- **Assets**: optional themed textures under `public/assets/` (with drawn/gradient fallbacks so no theme depends on a missing binary).
- **Online**: theme id added to the match/lobby doc so the guest renders the host's choice; no engine or rules change (geometry and grid mapping are invariant, protecting existing hit-testing and scenarios).
- **Untouched**: engine, rules, headless (all purely visual).
