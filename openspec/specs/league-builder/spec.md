# league-builder

## Purpose

Provide organizers a way to create leagues from member teams, generate a season schedule, and maintain standings from recorded results with cross-season persistence.

## Requirements

### Requirement: Create a league
The system SHALL provide a page to create a league with a name and member teams (from shared teams or ad-hoc for local play), and SHALL generate a season schedule (round-robin at minimum).

#### Scenario: Build a league season
- **WHEN** an organizer names a league, adds member teams, and generates the schedule
- **THEN** a round-robin season of fixtures is created

### Requirement: Standings from recorded results
The system SHALL maintain a standings table computed from recorded fixture results (wins/draws/losses and the league's chosen points/tiebreakers).

#### Scenario: Standings update on a result
- **WHEN** a league fixture result is recorded
- **THEN** the standings table updates to reflect it

### Requirement: Cross-season persistence
League state — schedule, results, standings — and the participating teams' progression SHALL persist across sessions for the duration of the season.

#### Scenario: League resumes after reload
- **WHEN** an organizer reopens a league after reloading
- **THEN** the schedule, recorded results, and standings are intact

#### Scenario: Team progression carries through the season
- **WHEN** teams play league fixtures with progression enabled
- **THEN** each team's persisted progression reflects its league matches

### Requirement: League entrants reference a team rather than embedding it
A league entrant SHALL identify its team by owner uid and team id. The league document SHALL NOT contain a copy of the roster. It MAY cache display fields — team name, roster name, coach name, seed — for rendering fixtures without fetching every roster, and those cached fields SHALL be refreshed when the league is loaded by someone able to read the team.

#### Scenario: A league document holds no roster copy
- **WHEN** a league is created with four entrants
- **THEN** the stored league contains four team references and no player records

#### Scenario: A fixture launch fetches the live roster
- **WHEN** a league fixture is launched
- **THEN** the teams are fetched by reference and the match uses their current rosters

#### Scenario: Cached display names refresh
- **WHEN** a coach renames a team that is entered in a league and the league is reloaded
- **THEN** the fixture list shows the new name

### Requirement: Player development carries across league fixtures
Because entrants reference live teams, advancement gained in one league fixture SHALL be present in the next fixture that team plays in the same league.

#### Scenario: A skill gained in round one is present in round two
- **WHEN** a player gains a skill after a round-one fixture
- **THEN** that player has the skill when their team plays its round-two fixture

### Requirement: A team belongs to at most one active competition
A team SHALL record the single active league or tournament it is entered in. Entering a team into a competition SHALL be refused when it is already entered in an active one, and the reason SHALL be stated. The association SHALL be cleared when the competition completes or the team is withdrawn.

#### Scenario: Double entry is refused
- **WHEN** a coach tries to enter a team into a second active competition
- **THEN** the entry is refused and the coach is told which competition the team is already in

#### Scenario: Completing a competition frees the team
- **WHEN** a league completes
- **THEN** its entrants' active-competition association is cleared and they can be entered elsewhere

#### Scenario: Withdrawing frees the team
- **WHEN** a team is withdrawn from an active league
- **THEN** its active-competition association is cleared

### Requirement: Coaches are referenced by uid
Coach identity on entrants and fixtures SHALL be stored as a uid with a cached display name. No coach record SHALL be copied into the league document.

#### Scenario: League stores a coach reference
- **WHEN** a league is created
- **THEN** each entrant records its coach's uid and a cached display name, and no further coach data

### Requirement: Existing embedded leagues are read and converted
The reader SHALL accept league documents that embed roster snapshots, converting them to references on read, and SHALL write the reference shape on the next save.

#### Scenario: An old league opens
- **WHEN** a league saved with embedded rosters is opened
- **THEN** it displays correctly and is stored in the reference shape the next time it is saved
