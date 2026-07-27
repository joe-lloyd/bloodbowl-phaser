# player-development-page

## ADDED Requirements

### Requirement: Each player has a development page

Team management SHALL provide a per-player page showing name, number, position, current
and base characteristics with advances/injuries marked, starting and gained skills,
injuries, level, SPP spent/available, career statistics, and pending development.

#### Scenario: Player is opened from the roster

- **WHEN** a coach selects a player in Manage Team
- **THEN** that player's durable details and development state are shown

#### Scenario: Gained skills are distinguished

- **WHEN** a player has starting and gained skills
- **THEN** the page lists the two groups separately with gained-skill provenance

### Requirement: Standard SPP advancement is resolved in Manage Team

An eligible coach SHALL spend a player's SPP and resolve legal skill or characteristic
advancement from the development page using the standard advancement rules and costs.
The result SHALL be saved to the team.

#### Scenario: SPP is spent between matches

- **WHEN** a coach confirms a legal affordable advancement
- **THEN** the advancement is applied, SPP is spent, pending state is cleared as
  appropriate, and the team is saved

#### Scenario: Advancement is unaffordable

- **WHEN** the player lacks enough SPP for an advancement type
- **THEN** its cost may be shown but it cannot be confirmed

### Requirement: Post-match pending development is visible

Awards confirmed after a match SHALL create or update pending development without
assigning a skill. The roster and player page SHALL show which players can advance and
which must advance before a competition permits another match.

#### Scenario: Results create pending work

- **WHEN** post-match SPP makes a player eligible
- **THEN** Manage Team marks the player and offers their legal development options

#### Scenario: Mandatory advancement is pending

- **WHEN** a player has reached a mandatory advancement threshold
- **THEN** the roster marks the requirement and compatible match launch can direct the
  coach back to Manage Team

### Requirement: Advancement uses the team's selected mode

The development page SHALL offer only operations legal for the team's advancement mode.
Advanced League SHALL use SPP; Matched Play and Sevens Skill Selection SHALL use their
own pending package or random-skill work when those capabilities are available.

#### Scenario: Non-SPP team is opened

- **WHEN** a Matched Play or Sevens Skill Selection player is managed
- **THEN** standard SPP spending is not offered
