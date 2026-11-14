# competition-roster-rules

## Purpose

Define how leagues and tournaments declare a versioned roster rule profile
(required advancement mode, draft budget, roster constraints, and Matched
Play skill package) and how team compatibility with that profile is
validated identically by the entry UI and the authoritative repository
command.

## Requirements

### Requirement: Competition rules distinguish GW rules from optional NAF departures

Every new competition SHALL store a rules choice independently of its roster
profile. The default SHALL be GW 2025 Sevens with official errata and NAF
interpretations of ambiguous rules. An organizer MAY select the dated NAF
Sevens rulings of 26 September 2026. This choice SHALL remain fixed throughout
the tournament or league season and SHALL accompany fixture launches, online
lobbies, and saved matches. An older record without a choice SHALL use the GW
baseline.

#### Scenario: NAF roster departure is selected

- **WHEN** a competition selects the dated NAF rulings
- **THEN** entry ignores Insignificant during draft-list validation
- **AND** all other roster constraints still apply

#### Scenario: A team's draft choice differs from the competition

- **WHEN** a roster prepared with NAF rules attempts to enter a GW competition
- **THEN** entry validates the roster against GW rules and refuses any violation

#### Scenario: Rules change after creation

- **WHEN** an organizer attempts to replace the saved rules choice
- **THEN** both local persistence and Firestore refuse the change

#### Scenario: Swarming is independent of optional NAF departures

- **WHEN** a match uses either rules choice
- **THEN** eligible teams retain the Swarming exception to seven-player setup

### Requirement: Competitions define a roster rule profile

Every new league or tournament SHALL define a versioned profile containing
its required advancement mode, team draft budget, eligible roster
constraints, and any Matched Play skill package. The accepted profile SHALL
be snapshotted for the competition.

#### Scenario: Tournament uses Matched Play

- **WHEN** an organizer creates a Matched Play tournament
- **THEN** the tournament stores its draft budget and tier skill package
  with the required Matched Play mode

#### Scenario: League uses Advanced League

- **WHEN** an organizer creates an Advanced League competition
- **THEN** the profile requires Advanced League teams and standard SPP
  progression

### Requirement: Entry uses shared compatibility validation

A team SHALL enter a competition only when its advancement mode, roster,
budget, skill package, legality, and pending-development state satisfy the
snapshotted profile. The UI and authoritative repository command SHALL use
the same validator.

#### Scenario: Advancement mode differs

- **WHEN** a Sevens Skill Selection team attempts to join an Advanced League
  competition
- **THEN** entry is refused and the advancement-mode mismatch is stated

#### Scenario: Team matches the profile

- **WHEN** a legal team satisfies every rule in the competition profile
- **THEN** it is available for selection and its entry is accepted

#### Scenario: Forged incompatible entry

- **WHEN** a client bypasses the UI and submits an incompatible team id
- **THEN** the repository command rejects the entry without changing
  membership

### Requirement: Compatibility is visible before selection

Competition entry UI SHALL mark teams as compatible or incompatible and
SHALL expose all currently known refusal reasons before the coach confirms
selection.

#### Scenario: Multiple rules fail

- **WHEN** a team has the wrong advancement mode and exceeds the draft
  budget
- **THEN** both refusal reasons are shown before entry is attempted
