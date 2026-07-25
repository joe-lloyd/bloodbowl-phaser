## Why

A knockout tournament is currently displayed as a two-column grid of "Round 1", "Round 2", "Round 3" headings with a flat list of fixture cards under each. Nothing about it reads as a cup: there are no connecting lines, no sense of teams being eliminated as the rounds narrow, and no visual destination. A coach cannot glance at it and see who plays whom next, which half of the draw they are in, or how far from the final they are. Blood Bowl tournaments are the format most worth showing well, and the underlying data already supports a proper bracket — `CompetitionFixture` carries `round`, `order`, `sourceFixtureIds`, `nextFixtureId`, and `nextSlot`.

## What Changes

- **Single-elimination tournaments render as a cup bracket.** The bracket SHALL be drawn as a mirrored tree: the two halves of the draw progress inward round by round toward a central final, with the trophy at the centre.
- **Fixtures are connected.** Each fixture SHALL be visually connected to the fixture its winner advances to, so a coach can trace a path from any first-round tie to the final.
- **Elimination is visible.** A team knocked out SHALL be shown as eliminated, and a team that has advanced SHALL be shown carrying forward into its next tie.
- **The bracket handles uneven draws.** Byes and draws that are not a power of two SHALL be laid out correctly, with a bye shown as an automatic advance rather than an empty fixture.
- **Fixture actions stay available.** Launching a local or hosted match and reporting a score SHALL remain available from each fixture in the bracket, without leaving the view.
- **Round-robin is unaffected.** League and round-robin competitions SHALL keep their table-and-fixture-list presentation; the bracket applies to single-elimination only.

## Capabilities

### New Capabilities
- `tournament-bracket-view`: a single-elimination tournament is presented as a connected, mirrored cup bracket converging on a central final, with elimination and advancement visible and fixture actions available in place.

## Impact

- UI: `src/ui/components/pages/CompetitionView.tsx` (the current rounds grid), new bracket layout components, `src/ui/styles/` for the connector and elimination styling.
- Layout data: a pure helper deriving bracket geometry — rounds, half-of-draw, slot positions, connectors — from `CompetitionFixture[]`, so the layout is testable without rendering.
- Types: `src/competition/types.ts` read-only use of `round`, `order`, `sourceFixtureIds`, `nextFixtureId`, `nextSlot`, `result.bye`, `championEntrantId`.
- Bracket generation: `src/competition/logic.ts` — verified to produce the linkage the layout needs; extended only if a gap is found.
- Responsive behavior: large brackets must scroll horizontally within their own container rather than forcing the page to scroll.
- Consumes the entrant display fields introduced by `normalize-cloud-data-model`; renders from cached display data without fetching rosters.
