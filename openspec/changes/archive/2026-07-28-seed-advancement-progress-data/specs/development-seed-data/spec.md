## ADDED Requirements

### Requirement: Seed teams carry an explicit, locked advancement mode

Every seeded Sevens team SHALL be built with an explicit `advancementMode` set
through the same `createTeam`/`lockAdvancementMode` path a coach uses, so no
seeded team loads with an unset mode requiring a coach to choose one before
the team can be saved or finalized. The seed catalog SHALL include at least
one team in each of the three advancement modes (Matched Play, Advanced
League, Sevens Skill Selection), and any seeded team that already carries
real SPP or advancement history SHALL be Advanced League, the only mode that
legitimately earns spendable SPP.

#### Scenario: All roster seeds have a mode

- **WHEN** development teams are generated for every supported roster
- **THEN** every generated team has a non-empty `advancementMode` and
  `advancementModeLocked` is true

#### Scenario: All three modes are represented

- **WHEN** the full seed catalog is generated
- **THEN** at least one team has each of `matched-play`, `advanced-league`,
  and `sevens-skill-selection` as its advancement mode

#### Scenario: A progressed team is Advanced League

- **WHEN** a seeded team carries players with earned SPP or stored
  advancements (via the player lifecycle decorations)
- **THEN** that team's advancement mode is `advanced-league`

### Requirement: Matched Play and Sevens Skill Selection have real in-progress seed state

At least one seeded Matched Play team SHALL have a partially-allocated event
skill package (at least one player already awarded a package skill, and
allowance remaining), and at least one seeded Sevens Skill Selection team
SHALL have a pending post-game skill-selection award, so both modes'
progression mechanics — not just the mode label — are directly testable from
a clean seed refresh.

#### Scenario: A Matched Play seed team has a partial package

- **WHEN** the seeded Matched Play team is inspected
- **THEN** at least one player already carries a `matched-play-package`
  sourced advancement, and the team's package allowance is not fully spent

#### Scenario: A Sevens Skill Selection seed team has pending work

- **WHEN** the seeded Sevens Skill Selection team is inspected
- **THEN** it carries a `pendingDevelopment` entry of kind
  `"sevens-skill-selection"` with at least one eligible participant
