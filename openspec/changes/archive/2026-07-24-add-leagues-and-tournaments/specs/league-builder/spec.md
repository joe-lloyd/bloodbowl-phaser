# league-builder

## ADDED Requirements

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
