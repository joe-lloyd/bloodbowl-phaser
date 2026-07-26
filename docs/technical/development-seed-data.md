# Development seed data

Deterministic, rule-valid teams and competitions for UI and end-to-end
testing. Owned by the `dev-seed` namespace; every generated record carries
`seedMetadata` (`{ namespace, version, fixtureKey }`), so cleanup can never
select coach-created records.

## What gets seeded

- **30 teams** — one per supported roster, built through the shared
  purchasing helpers and checked by the shared legality validator
  (`src/game/rules/rosterLegality.ts`, the same validator the team builder's
  save runs): 7–11 players, at most 4 non-Linemen, positional maxima,
  Insignificant limit, non-negative budget. Treasury is the unspent
  remainder of the 600k draft budget; team value is derived from the
  finished roster.
- **Player lifecycle examples** (`src/seeding/playerLifecycle.ts`) —
  rookies everywhere, plus an SPP-earner, a multi-advancement veteran, a
  stat-decreased injured player, and a capped 6-advancement Legend. All
  advancements go through `applyAdvancement`; career stat lines reproduce
  the stored SPP totals exactly.
- **6 competitions** (`src/seeding/competitionFixtures.ts`) — a league and
  a tournament in each of draft, active, and complete states, with
  deterministic results, standings, bracket progression, and a recorded
  champion. Each team enters at most one *active* competition; completed
  memberships remain as history and fold into team W/D/L records.

## Refreshing the seeds

UI: **Team Management → 🌱 Seed All Rosters** (refresh) and
**🗑️ Delete Seed Teams** (remove). Code:

```ts
import { seedDevelopmentData, cleanupDevelopmentSeedData } from "src/seeding";

seedDevelopmentData();        // build → validate → persist (idempotent)
cleanupDevelopmentSeedData(); // remove every version of the namespace
cleanupDevelopmentSeedData(2); // remove only seed version 2
```

A refresh removes all seed-owned records (any version, including legacy
pre-metadata `"{Roster} Sample"` teams matched by exact name) and rebuilds.
Coach-created teams and competitions are never selected — they carry no
`seedMetadata`.

## Validating

The runner validates before persisting and refuses to write an illegal
catalog (`SeedFixtureError` names the fixture key and rule; the post-build
`SeedValidationError` lists every invariant violation). To check persisted
state directly:

```bash
npx vitest run __tests__/unit/seeding __tests__/integration/developmentSeed.test.ts
```

`validateDevelopmentSeedData(teams, competitions)` is the programmatic
entry point (roster legality, finances, history totals, competition
lifecycle, active membership).

## Bumping the seed version

When the fixture catalog changes shape (new fields, renamed ids, different
fixture plans), increment `SEED_VERSION` in `src/seeding/seedMeta.ts`.
Records stamped with older versions are removed on the next refresh and
rebuilt from the new catalog; `cleanupDevelopmentSeedData(version)` can
target one version explicitly.

## Determinism

Ids (`dev-seed-team-human`, `dev-seed-league-founders-league`, …), RNG
streams (`rngFor("match:…")` named seeds), colors, and timestamps
(`SEED_EPOCH` offsets) are all fixed, so re-running the same version
converges on identical records — safe for screenshot and e2e assertions.

## Visual baselines (pending)

Headless-browser fixtures and screenshot baselines (openspec tasks 5.3/5.4)
are **deferred to the `add-comprehensive-e2e-scenario-testing` change**,
which owns the Playwright toolchain. When it lands, point its fixtures at
the stable ids above and record the baseline-update command here.
