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
