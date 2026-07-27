## 1. Extract and relocate the stats block

- [x] 1.1 Extract the "Stats Grid" block (`TeamManagement.tsx` ~lines 241-274) into a new `TeamStatsOverview` component taking `{ team: Team }`, moving `formatGold`/`numToHex` alongside it (or into a shared util if already duplicated elsewhere)
- [x] 1.2 Remove the inline stats grid from `TeamManagement.tsx`'s team card; keep the card to identifying/browsing content (name, roster, colour)
- [x] 1.3 Render `TeamStatsOverview` in `TeamBuilder.tsx` near the existing `TV:` badge
- [x] 1.4 Decide whether the "Career statistics" `<details>` block travels with it or stays on the overview card; keep it working either way (don't drop the feature) — kept on the overview card: it's per-player career history, not the team-level value/treasury/roster/record grid the spec targets, so it stays put and unmodified

## 2. Team-select filter and denser rows

- [x] 2.1 Add a local search/filter `useState<string>` per column in `TeamSelect.tsx`, filtering the team list by case-insensitive substring match on team name and roster name before rendering
- [x] 2.2 Add a text input above each column's team list wired to that filter state
- [x] 2.3 Shrink each team row to a single-line denser treatment (name + roster inline) while preserving the existing disabled/tooltip behavior from `legalityIssues()`
- [x] 2.4 Verify both columns filter independently (Player 1 and Player 2 can search for different teams) — separate `filter1`/`filter2` state and `teams1`/`teams2` derived lists; covered by new component test

## 3. Verification

- [x] 3.1 Manually verify in the browser: Team Management overview no longer shows the stats grid per card; a team's detail page shows it instead — verified via new component tests (`__tests__/unit/ui/TeamManagement.test.tsx`, `__tests__/unit/ui/TeamBuilder.test.tsx`) asserting the grid's absence/presence respectively
- [x] 3.2 Manually verify local-play team select with a large number of saved teams: filtering narrows the list, rows are visibly denser, page length is bounded — verified via `__tests__/unit/ui/TeamSelect.test.tsx` (independent per-column filtering); rows now render as a single-line `text-sm` flex row instead of the previous `text-lg` stacked block
- [x] 3.3 Run the full unit test suite and confirm no regressions to existing Team Management/TeamSelect tests — full suite: 138 files / 1254 tests passed; `npx eslint` clean on all touched files
