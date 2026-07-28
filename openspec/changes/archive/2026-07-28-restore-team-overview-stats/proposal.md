## Why

The archived change `redesign-team-management-pages` (PR #21) moved the per-team Team Value / Treasury / Roster x/11 / Record summary grid off the Team Management overview cards onto each team's detail page, on the reasoning that the overview is for browsing, not studying, a team. The user has since said this was the wrong call — that summary is exactly what they want at a glance while scanning their team list, and removing it broke their workflow. Separately, the overview still carries a per-player "Career statistics" table (GP/TD/CMP/CAS/Kills/MVP) buried in a collapsed `<details>` block on every card, which the user wants off the overview entirely and moved into the player roster table on the team detail page instead, where it's directly next to each player's row.

## What Changes

- The Team Management overview page (`TeamManagement.tsx`) SHALL again render the Team Value / Treasury / Roster x/11 / Record summary grid (the existing `TeamStatsOverview` component) on each team's card.
- The Team Management overview page SHALL no longer render the per-player "Career statistics" `<details>` block.
- The team detail page's roster table (`TeamRoster.tsx`, rendered from `TeamBuilder.tsx`) SHALL show each player's career statistics (games played, touchdowns, completions, casualties, kills, MVPs) as additional columns, one row per player.
- The team detail page (`TeamBuilder.tsx`) keeps rendering `TeamStatsOverview` near its `TV:` badge as before — not removed, since the user only asked for it to come back on the overview, not to leave the detail page.
- This explicitly reverses part of the archived `redesign-team-management-pages` decision (see design.md).

## Capabilities

### Modified Capabilities
- `team-management-layout`: the overview page shows the team value/treasury/roster/record summary grid again (previously stated it SHALL NOT); per-player career statistics move from the overview page to columns on the team detail page's roster table (new requirement).

## Impact

- `src/ui/components/pages/TeamManagement.tsx` — remove the "Career statistics" `<details>` block; render `TeamStatsOverview` per card again.
- `src/ui/components/TeamManagement/TeamStatsOverview.tsx` — update doc comment (no longer detail-page-only).
- `src/ui/components/TeamBuilder/TeamRoster.tsx` — add career-stat columns (GP, TD, CMP, CAS, Kills, MVP) to the roster table; adjust empty-slot `colSpan`.
- `openspec/specs/team-management-layout/spec.md` — update requirements.
- Tests: `__tests__/unit/ui/TeamManagement.test.tsx` (flip both assertions), `__tests__/unit/ui/TeamRoster.test.tsx` (add coverage for new columns).
