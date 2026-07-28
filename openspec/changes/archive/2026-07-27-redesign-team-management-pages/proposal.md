## Why

Two related complaints about where team information lives: (1) the Team Management overview page (`TeamManagement.tsx`, the "all teams" grid) renders a full stats block — Team Value, Treasury, Roster count, Record — inline inside every team card, which the user wants moved to the per-team detail page (`TeamBuilder.tsx`) instead, since the overview is meant for browsing/picking a team, not studying one; (2) the local-play team-select screen (`TeamSelect.tsx`) renders every saved team as a full-width stacked row, twice (once per player column), with no search, filter, or grouping — so a coach with many saved teams gets a page whose height scales directly with `2 × team count`.

## What Changes

- The Team Management overview page's per-card stats block (Team Value, Treasury, Roster count, Record) SHALL be removed from the overview card and SHALL instead appear on that team's detail page (`TeamBuilder.tsx`), near its existing `TV:` badge.
- The overview card SHALL keep only what it needs for browsing/identifying a team (name, roster type, colour, maybe team value as a single line) — the exact minimal card content is an implementation decision, not a new requirement, as long as the full stats grid is gone from the overview.
- The local-play team-select screen SHALL replace each side's flat stacked-row list with a denser, filterable presentation (at minimum: a live text search/filter by team name or roster; a visibly smaller per-team row/card) so the page no longer grows linearly and unboundedly with the number of saved teams.
- Both changes are presentation-only: no change to what a team stores, how team value/record are computed, or which teams are eligible to play.

## Capabilities

### New Capabilities
- `team-management-layout`: where per-team stats (value, treasury, roster count, record) are shown (overview vs. detail) and how the local-play team-select screen presents a coach's saved teams at scale (search/filter, denser rows).

## Impact

- `src/ui/components/pages/TeamManagement.tsx` — remove the inline stats grid (currently `formatGold`/`numToHex` local helpers), keep the career-statistics `<details>` block or relocate it alongside if it makes sense.
- `src/ui/components/pages/TeamBuilder.tsx` — add the relocated stats block near the existing `TV:` badge; will need `formatGold`/`calculateTeamValue` (already imported/used) plus `numToHex`/record fields not currently read there.
- `src/ui/components/pages/TeamSelect.tsx` — add a search/filter input per column and reduce each team row's size; the underlying `legalityIssues()` disabled/tooltip behavior is unchanged.
