# tournament-builder

## Purpose

Provide organizers a way to create tournaments with a chosen format, seed entrants, generate reproducible brackets/schedules, and advance play from recorded results to a champion.

## Requirements

### Requirement: Create a tournament
The system SHALL provide a page to create a tournament with a name, a format (single-elimination or round-robin at minimum), and a set of entrant teams drawn from shared teams or added ad-hoc for local-only play.

#### Scenario: Build a single-elimination tournament
- **WHEN** an organizer names a tournament, picks single-elimination, and adds entrants
- **THEN** the tournament is created with those entrants and format

### Requirement: Seeding and bracket/schedule generation
The system SHALL seed entrants and generate the bracket (elimination) or schedule (round-robin) deterministically from the seeding, so the pairings are reproducible.

#### Scenario: Bracket generated from seeds
- **WHEN** entrants are seeded and the bracket is generated
- **THEN** first-round pairings follow the seeding and the full bracket is laid out

### Requirement: Result-driven advancement
Recording a fixture result SHALL advance the bracket (winner proceeds) or update the round-robin table, until a champion/final standing is determined.

#### Scenario: Winner advances
- **WHEN** a bracket fixture's result is recorded
- **THEN** the winning team advances to the next round and the loser is eliminated (single-elimination)

#### Scenario: Tournament completes
- **WHEN** the final fixture result is recorded
- **THEN** the tournament reports its champion / final standings

### Requirement: Tournament entrants reference a team rather than embedding it
A tournament entrant SHALL identify its team by owner uid and team id, with cached display fields for rendering the bracket. The tournament document SHALL NOT contain a copy of the roster.

#### Scenario: A tournament document holds no roster copy
- **WHEN** an eight-team tournament is created
- **THEN** the stored tournament contains eight team references and no player records

#### Scenario: The bracket renders from cached display fields
- **WHEN** the bracket is displayed
- **THEN** team names, roster names, coach names, and seeds render without fetching every roster

### Requirement: A team belongs to at most one active competition
A team already entered in an active league or tournament SHALL NOT be entered into a tournament. The refusal SHALL name the competition the team is already in. The association SHALL be cleared when the tournament completes or the team is withdrawn.

#### Scenario: Entry is refused for an already-committed team
- **WHEN** a coach tries to enter a team that is already in an active league
- **THEN** the entry is refused and the existing commitment is named

#### Scenario: Completing a tournament frees its entrants
- **WHEN** a tournament reaches a champion and completes
- **THEN** its entrants can be entered into other competitions

### Requirement: Coaches are referenced by uid
Coach identity on entrants and fixtures SHALL be a uid with a cached display name, not a copied coach record.

#### Scenario: Tournament stores a coach reference
- **WHEN** a tournament is created
- **THEN** each entrant records its coach's uid and a cached display name, and no further coach data

### Requirement: Existing embedded tournaments are read and converted
The reader SHALL accept tournament documents that embed roster snapshots, converting them to references on read, and SHALL write the reference shape on the next save.

#### Scenario: An old tournament opens
- **WHEN** a tournament saved with embedded rosters is opened
- **THEN** its bracket displays correctly and it is stored in the reference shape the next time it is saved
