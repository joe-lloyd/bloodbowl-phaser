## 1. Extract and relocate the stats block

- [ ] 1.1 Extract the "Stats Grid" block (`TeamManagement.tsx` ~lines 241-274) into a new `TeamStatsOverview` component taking `{ team: Team }`, moving `formatGold`/`numToHex` alongside it (or into a shared util if already duplicated elsewhere)
- [ ] 1.2 Remove the inline stats grid from `TeamManagement.tsx`'s team card; keep the card to identifying/browsing content (name, roster, colour)
- [ ] 1.3 Render `TeamStatsOverview` in `TeamBuilder.tsx` near the existing `TV:` badge
- [ ] 1.4 Decide whether the "Career statistics" `<details>` block travels with it or stays on the overview card; keep it working either way (don't drop the feature)

## 2. Team-select filter and denser rows

- [ ] 2.1 Add a local search/filter `useState<string>` per column in `TeamSelect.tsx`, filtering the team list by case-insensitive substring match on team name and roster name before rendering
- [ ] 2.2 Add a text input above each column's team list wired to that filter state
- [ ] 2.3 Shrink each team row to a single-line denser treatment (name + roster inline) while preserving the existing disabled/tooltip behavior from `legalityIssues()`
- [ ] 2.4 Verify both columns filter independently (Player 1 and Player 2 can search for different teams)

## 3. Verification

- [ ] 3.1 Manually verify in the browser: Team Management overview no longer shows the stats grid per card; a team's detail page shows it instead
- [ ] 3.2 Manually verify local-play team select with a large number of saved teams: filtering narrows the list, rows are visibly denser, page length is bounded
- [ ] 3.3 Run the full unit test suite and confirm no regressions to existing Team Management/TeamSelect tests
