## 1. Pitch Geometry and Setup Model

- [x] 1.1 Define shared Sevens end-zone, Line of Scrimmage, neutral-area, centre-field, and Wide Zone geometry helpers
- [x] 1.2 Add unit tests for both teams' mirrored setup regions and boundary squares
- [x] 1.3 Extend setup state with kicking/receiving phase, placed-player counts, and structured restriction results

## 2. Authoritative Setup Validation

- [x] 2.1 Implement the maximum-seven and own-side-only placement rules
- [x] 2.2 Implement the maximum-one-player-per-Wide-Zone rule
- [x] 2.3 Implement the minimum-three-centre-field players directly adjacent to the team's Line of Scrimmage rule
- [x] 2.4 Implement short-handed validation, including the three-or-fewer concession choice and legal relaxation when a full setup is impossible
- [x] 2.5 Reuse the same validator for interactive placement, formation application, setup confirmation, and submitted online/headless commands

## 3. Setup Sequence and Interaction

- [x] 3.1 Enforce kicking-team setup before receiving-team setup and reject out-of-phase ownership commands
- [x] 3.2 Show live structured restriction feedback and prevent confirmation while satisfiable rules remain unmet
- [x] 3.3 Add the penalty-free pre-setup concession decision for teams with three or fewer available players
- [x] 3.4 Ensure excess available players remain in Reserves when seven players have been placed

## 4. Formation Presets

- [x] 4.1 Define Sevens formation presets against shared pitch geometry rather than absolute team-one coordinates
- [x] 4.2 Validate a preset against current available players and apply only legal placements
- [x] 4.3 Report any unfilled or relaxed requirement after applying a preset to a short-handed team

## 5. Synchronization and Verification

- [x] 5.1 Serialize setup phase, placements, concession decision, and validation state in saves and online snapshots
- [x] 5.2 Add headless commands and legal-action responses for placement, preset, concession, and confirmation
- [x] 5.3 Add unit tests for all placement restrictions, mirrored geometry, short-handed setups, and sequential confirmation
- [x] 5.4 Add headless scenarios for valid seven-player setup, each invalid restriction, preset use, and three-or-fewer continuation/concession using the repository's native Vitest protocol harness
- [x] 5.5 Add one deterministic 1200×660 SVG baseline for each team's valid final setup and verify the suite runs headlessly
