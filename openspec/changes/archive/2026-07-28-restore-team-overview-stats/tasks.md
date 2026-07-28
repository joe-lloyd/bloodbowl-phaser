## 1. Overview page: restore stats grid, remove career statistics

- [x] 1.1 In `src/ui/components/pages/TeamManagement.tsx`, import `TeamStatsOverview` (alongside existing `numToHex` import from the same module) and render `<TeamStatsOverview team={team} />` on each team card.
- [x] 1.2 Remove the "Career statistics" `<details>` block (the per-player GP/TD/CMP/CAS/Kills/MVP table) from `TeamManagement.tsx` entirely.
- [x] 1.3 Update the doc comment on `src/ui/components/TeamManagement/TeamStatsOverview.tsx` — it currently says the grid lives on the detail page "rather than" the overview; update to reflect it now renders on both.

## 2. Detail page roster table: add career-stat columns

- [x] 2.1 In `src/ui/components/TeamBuilder/TeamRoster.tsx`, add six header columns (GP, TD, CMP, CAS, Kills, MVP) after the existing Cost column and before Actions.
- [x] 2.2 Render each player's `careerStats.matches`, `.touchdowns`, `.completions`, `.casualties`, `.kills`, `.mvps` (defaulting to 0 when `careerStats` is undefined) in the corresponding new cells.
- [x] 2.3 Update the "Empty Slot" placeholder's `colSpan` from 6 to 12 to account for the new columns.
- [x] 2.4 Sanity-check column widths so the table remains usable (rely on existing `overflow-x-auto` horizontal scroll rather than shrinking text).

## 3. Tests

- [x] 3.1 Update `__tests__/unit/ui/TeamManagement.test.tsx`: flip the existing assertions — overview SHOULD now show "Team Value"/"Treasury" and SHOULD NOT show "Career statistics".
- [x] 3.2 Add coverage in `__tests__/unit/ui/TeamRoster.test.tsx` for the new career-stat columns (header labels present; a player's career totals render in their row; a player with no `careerStats` shows zeros).
- [x] 3.3 Confirm `__tests__/unit/ui/TeamBuilder.test.tsx` and `__tests__/unit/ui/TeamStatsOverview.test.tsx` still pass unmodified (detail page keeps the grid).

## 4. Spec sync

- [x] 4.1 Verify `openspec/changes/restore-team-overview-stats/specs/team-management-layout/spec.md` delta matches the implemented behavior before `opsx:sync`/`opsx:archive` (handled in a later session).
