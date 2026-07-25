# Design: add-pitch-dugout-visual-overhaul

## Context

`Pitch` renders a flat `PITCH_GREEN` rectangle plus a 0.3-alpha grid, end zones, wide zones, and centre/setup lines, all from `GameConfig.COLORS`, over a fixed 20×11 grid at `SQUARE_SIZE`. `Dugout` lays reserves/KO/dead into grey grid rectangles. All hit-testing, placement, and scenario coordinates depend on the current grid geometry and `gridToPixel`/`pixelToGrid` mapping. Teams already carry sideline staff (assistant coaches, cheerleaders, etc.) as data with no sprite. Online play syncs board state via snapshots; the lobby/match doc is the place to carry a shared cosmetic choice.

## Goals / Non-Goals

**Goals:**

- A visually richer pitch with a few host-selectable themes.
- A redesigned dugout that reads as a sideline and shows retained staff.
- Identical field for both coaches online.
- Zero change to grid geometry, pixel mapping, or any engine/rules behavior.

**Non-Goals:**

- 3D, isometric, or animated crowds beyond simple staff sprites.
- Per-player cosmetic customization (this is pitch/sideline, not player skins).
- Editable/user-uploaded themes (fixed catalog for now).

## Decisions

### 1. Theme as data driving the existing draw methods

A `PitchTheme` describes surface (colour/gradient/optional texture key), zone and line colours, and dugout palette. `Pitch` and `Dugout` read a theme instead of hard-coded `GameConfig.COLORS`. The draw methods keep their current structure and geometry — only the fills/strokes/textures change. Alternative — a rewritten renderer — rejected: it risks the grid mapping that everything else depends on.

### 2. Geometry is invariant; only presentation changes

`SQUARE_SIZE`, grid dimensions, offsets, and `gridToPixel`/`pixelToGrid` are untouched, so hit-testing, placement, and every scenario coordinate keep working. This is the core safety property and is worth stating as a spec requirement.

### 3. Textures optional with drawn fallbacks

Themes may reference textures under `public/assets/`, but each theme MUST render acceptably from drawn primitives/gradients alone, so a missing asset degrades gracefully and no theme hard-depends on a binary (consistent with how the codebase avoids hard asset deps elsewhere).

### 4. Sideline staff scaled to team counts, capped

A sideline renderer reads the team's staff counts (assistant coaches, cheerleaders, …) and places that many small sprites in dedicated dugout/sideline slots, up to a per-type cap so a large staff can't overflow the bench. Purely presentational; driven by existing team data.

### 5. Theme choice synced via the match/lobby doc

The host's theme id is written to the lobby/match doc; the guest reads it and renders the same theme. Local play stores the pick in match setup state. No snapshot/engine change — it's a cosmetic field alongside existing settings.

## Risks / Trade-offs

- [Busy textures hurt readability of players/ball] → themes tuned so the surface stays low-contrast behind sprites; the grid/line overlay stays legible; validated visually per theme.
- [Geometry accidentally shifting during the redraw] → geometry constants untouched and asserted; existing placement/scenario tests are the regression gate.
- [Asset weight / load time] → textures optional and lazy; drawn fallback keeps the base bundle unchanged.
- [Staff sprites clutter the dugout] → per-type caps and dedicated slots; staff never overlap the reserve/KO/dead grids used for interaction.

## Migration Plan

Introduce `PitchTheme` + a default theme reproducing today's look (no visual change), route `Pitch`/`Dugout` through it, then add the extra themes, the picker, the synced theme id, and finally the sideline staff. Each step ships independently; the default-theme step is a pure refactor guarded by existing tests.

## Open Questions

- Exact theme list and whether any ship with real textures vs. all-drawn at first (lean: 3–4 drawn themes to start).
- Whether the theme picker lives in the lobby only or also in a local pre-match screen (lean: both, sharing one catalog + component).
- Staff sprite art source (reuse existing asset style vs. new set).
