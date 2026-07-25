## 1. Pitch Geometry and Setup Model

- [ ] 1.1 Define shared Sevens end-zone, Line of Scrimmage, neutral-area, centre-field, and Wide Zone geometry helpers
- [ ] 1.2 Add unit tests for both teams' mirrored setup regions and boundary squares
- [ ] 1.3 Extend setup state with kicking/receiving phase, placed-player counts, and structured restriction results

## 2. Authoritative Setup Validation

- [ ] 2.1 Implement the maximum-seven and own-side-only placement rules
- [ ] 2.2 Implement the maximum-one-player-per-Wide-Zone rule
- [ ] 2.3 Implement the minimum-three-centre-field players directly adjacent to the team's Line of Scrimmage rule
- [ ] 2.4 Implement short-handed validation, including the three-or-fewer concession choice and legal relaxation when a full setup is impossible
- [ ] 2.5 Reuse the same validator for interactive placement, formation application, setup confirmation, and submitted online/headless commands

## 3. Setup Sequence and Interaction

- [ ] 3.1 Enforce kicking-team setup before receiving-team setup and reject out-of-phase ownership commands
- [ ] 3.2 Show live structured restriction feedback and prevent confirmation while satisfiable rules remain unmet
- [ ] 3.3 Add the penalty-free pre-setup concession decision for teams with three or fewer available players
- [ ] 3.4 Ensure excess available players remain in Reserves when seven players have been placed

## 4. Formation Presets

- [ ] 4.1 Define Sevens formation presets against shared pitch geometry rather than absolute team-one coordinates
- [ ] 4.2 Validate a preset against current available players and apply only legal placements
- [ ] 4.3 Report any unfilled or relaxed requirement after applying a preset to a short-handed team

## 5. Synchronization and Verification

- [ ] 5.1 Serialize setup phase, placements, concession decision, and validation state in saves and online snapshots
- [ ] 5.2 Add headless commands and legal-action responses for placement, preset, concession, and confirmation
- [ ] 5.3 Add unit tests for all placement restrictions, mirrored geometry, short-handed setups, and sequential confirmation
- [ ] 5.4 Add headless Playwright scenarios for valid seven-player setup, each invalid restriction, preset use, and three-or-fewer continuation/concession
- [ ] 5.5 Add one fixed-viewport screenshot baseline for each team's valid final setup and verify the suite runs headlessly
