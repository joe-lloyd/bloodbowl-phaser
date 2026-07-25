## 1. Seed Infrastructure

- [ ] 1.1 Define seed namespace, version, fixture key, and stable-id metadata for teams, players, matches, and competitions
- [ ] 1.2 Add deterministic fixture builders that use named RNG seeds
- [ ] 1.3 Implement idempotent upsert and version-targeted cleanup that cannot select coach-created records

## 2. Legal Team Builders

- [ ] 2.1 Refactor development team seeding to use shared player, re-roll, staff, fan, pricing, and roster legality services
- [ ] 2.2 Define a legal at-least-seven-player seed for every supported roster with at most four non-Lineman players
- [ ] 2.3 Derive treasury from draft budget minus actual purchases and derive team value from the completed roster
- [ ] 2.4 Fail seed generation with fixture-specific diagnostics for positional, Lineman-keyword, roster-size, or budget violations

## 3. Player Lifecycle Fixtures

- [ ] 3.1 Add deterministic rookie, SPP-earning, multi-advancement, injured, and capped player fixtures
- [ ] 3.2 Build advancement history and value changes through the normal progression services
- [ ] 3.3 Build coherent match and career statistics that reproduce stored SPP and progression totals
- [ ] 3.4 Validate all active players against their team's advancement mode and roster access

## 4. Competition Lifecycle Fixtures

- [ ] 4.1 Seed draft/new, active/in-progress, and completed/historical leagues
- [ ] 4.2 Seed draft/new, active/in-progress, and completed/historical tournaments
- [ ] 4.3 Generate coherent fixtures, results, standings, brackets, rounds, champions, and team history links
- [ ] 4.4 Assign each team to at most one active competition while retaining valid completed memberships

## 5. Validation and UI Coverage

- [ ] 5.1 Add an invariant validator covering roster legality, finances, history totals, competition lifecycle, and active membership
- [ ] 5.2 Add idempotency and safe-cleanup integration tests with adjacent coach-created records
- [ ] 5.3 Add headless Playwright fixtures for team list, progressed player, new/active/completed league, and new/active/completed tournament views
- [ ] 5.4 Add stable screenshot baselines for key competition states using fixed ids, seeds, viewport, and fonts
- [ ] 5.5 Document development seed refresh, validation, version bump, and visual-baseline update commands
