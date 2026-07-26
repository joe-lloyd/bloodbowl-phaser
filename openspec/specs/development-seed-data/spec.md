# development-seed-data

## Purpose

Deterministic, rule-valid, lifecycle-rich seed teams, leagues, and tournaments for UI and end-to-end testing. Seed records carry explicit namespace/version ownership metadata so they are idempotent to refresh and safely removable without touching coach-created data.

## Requirements

### Requirement: Seed teams are built through normal roster rules

Every seeded Sevens team SHALL be created through the shared purchasing and legality
services. It SHALL contain at least seven and no more than eleven players, no more than
four players without the Lineman keyword, no position above its roster maximum, and no
negative budget.

#### Scenario: All roster seeds are validated

- **WHEN** development teams are generated for every supported roster
- **THEN** every team passes the same finalization validator used by the team builder

#### Scenario: Fixture requests a fifth non-Lineman

- **WHEN** a seed definition would add a fifth player without the Lineman keyword
- **THEN** seed generation fails with the fixture id and the violated rule

### Requirement: Seed finances reflect purchases

Each seeded team SHALL start from its declared draft budget, pay roster-specific player,
re-roll, staff, and fan prices, and store treasury equal to the unspent remainder. Team
value SHALL be derived from the final roster and advancements.

#### Scenario: Purchases are made from 600,000

- **WHEN** a seed with a 600,000 draft budget buys players and re-rolls
- **THEN** its treasury equals 600,000 minus those legal purchase costs rather than
  remaining fixed at 600,000

### Requirement: Seeds cover the player development lifecycle

The seed catalog SHALL include deterministic rookies, players with earned SPP, players
with multiple legal advancements and value increases, injured players, and at least one
player at the supported advancement cap. Histories SHALL agree with current team and
player totals.

#### Scenario: Capped player is inspected

- **WHEN** the capped-development fixture is loaded
- **THEN** its advancement count, skills or characteristics, SPP spending, value
  increases, and durable history are internally consistent

#### Scenario: Career statistics are inspected

- **WHEN** a progressed seed player's match history is totaled
- **THEN** the derived career statistics and SPP agree with the stored progression mode

### Requirement: Competitions cover new, active, and completed states

Development seeds SHALL include at least one league and one tournament in each of draft
or new, active or in-progress, and completed or historical states. Fixtures, standings,
brackets, round state, results, winners, and team records SHALL be coherent with the
competition lifecycle.

#### Scenario: Active tournament is loaded

- **WHEN** the active tournament fixture is opened
- **THEN** completed bracket games have results, the current round has the expected
  playable fixtures, and future pairings are not falsely completed

#### Scenario: Completed league is loaded

- **WHEN** the completed league fixture is opened
- **THEN** all required fixtures are final, standings match the results, and a champion
  is recorded

### Requirement: A seeded team has at most one active competition

No seeded team SHALL be an entrant in more than one active league or tournament at a
time. The same team MAY retain memberships in any number of completed historical
competitions.

#### Scenario: Membership invariants are checked

- **WHEN** all seeded competition entrants are validated
- **THEN** every team has zero or one active membership and all additional memberships
  refer only to completed competitions

### Requirement: Seed operations are deterministic and isolated

Seeded entities SHALL use stable ids, explicit seed namespace and version metadata, and
fixed random seeds. Re-running the same seed version SHALL converge on the same records.
Cleanup SHALL remove only records owned by the targeted seed namespace/version.

#### Scenario: Same version is run twice

- **WHEN** the development seed command is executed twice with the same version
- **THEN** no duplicate teams, players, fixtures, or competition memberships are created

#### Scenario: Coach records coexist with cleanup

- **WHEN** an old seed version is removed while coach-created records exist
- **THEN** only records carrying that seed ownership metadata are removed
