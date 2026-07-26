# Tasks: overhaul-competition-seed-data

## 1. Seed Infrastructure

- [x] 1.1 Define seed namespace, version, fixture key, and stable-id metadata for teams, players, matches, and competitions
- [x] 1.2 Add deterministic fixture builders that use named RNG seeds
- [x] 1.3 Implement idempotent upsert and version-targeted cleanup that cannot select coach-created records

## 2. Legal Team Builders

- [x] 2.1 Refactor development team seeding to use shared player, re-roll, staff, fan, pricing, and roster legality services
- [x] 2.2 Define a legal at-least-seven-player seed for every supported roster with at most four non-Lineman players
- [x] 2.3 Derive treasury from draft budget minus actual purchases and derive team value from the completed roster
- [x] 2.4 Fail seed generation with fixture-specific diagnostics for positional, Lineman-keyword, roster-size, or budget violations

## 3. Player Lifecycle Fixtures

- [x] 3.1 Add deterministic rookie, SPP-earning, multi-advancement, injured, and capped player fixtures
- [x] 3.2 Build advancement history and value changes through the normal progression services
- [x] 3.3 Build coherent match and career statistics that reproduce stored SPP and progression totals
- [x] 3.4 Validate all active players against their team's advancement mode and roster access
  - Note: roster skill access (primary/secondary), advancement legality, cap, and stat coherence are validated. Advancement-MODE validation is pending `add-team-advancement-modes` (modes do not exist yet); `validatePlayerProgression` in `src/seeding/validateSeeds.ts` is the extension point.

## 4. Competition Lifecycle Fixtures

- [x] 4.1 Seed draft/new, active/in-progress, and completed/historical leagues
- [x] 4.2 Seed draft/new, active/in-progress, and completed/historical tournaments
- [x] 4.3 Generate coherent fixtures, results, standings, brackets, rounds, champions, and team history links
- [x] 4.4 Assign each team to at most one active competition while retaining valid completed memberships

## 5. Validation and UI Coverage

- [x] 5.1 Add an invariant validator covering roster legality, finances, history totals, competition lifecycle, and active membership
- [x] 5.2 Add idempotency and safe-cleanup integration tests with adjacent coach-created records
- [ ] 5.3 Add headless Playwright fixtures for team list, progressed player, new/active/completed league, and new/active/completed tournament views
  - Note: deferred to `add-comprehensive-e2e-scenario-testing` (owns the Playwright toolchain, not installed here). Seed ids/RNG are deterministic and ready for it.
- [ ] 5.4 Add stable screenshot baselines for key competition states using fixed ids, seeds, viewport, and fonts
  - Note: deferred with 5.3.
- [x] 5.5 Document development seed refresh, validation, version bump, and visual-baseline update commands
