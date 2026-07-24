# competition-play-integration

## ADDED Requirements

### Requirement: Launch a fixture as a local or hosted match
A league or tournament fixture SHALL be launchable as either a local (hotseat) match or a hosted online match, using the fixture's two teams.

#### Scenario: Launch a fixture locally
- **WHEN** an organizer launches a fixture in local mode
- **THEN** a hotseat match starts with the fixture's two teams

#### Scenario: Launch a fixture hosted
- **WHEN** a fixture is launched as a hosted match
- **THEN** an online match is created for the fixture's two teams

### Requirement: Fixture context travels with the match
A launched fixture SHALL carry its competition context — competition type, competition id, and fixture id — through the match (in local match setup state, and on the hosted lobby/match document for online play) so the result can be attributed on completion.

#### Scenario: Hosted match carries fixture context
- **WHEN** a hosted fixture match is created
- **THEN** the lobby/match document records the competition and fixture identifiers

### Requirement: Record the result back to the competition
When a competition fixture match ends, its result SHALL be recorded back to the competition document, updating the bracket/standings, and — when progression is enabled — persisting each participating team's progression to its owner.

#### Scenario: Result reported on match end
- **WHEN** a fixture match reaches its end
- **THEN** the score is recorded to the competition and the bracket/standings update

#### Scenario: Progression persisted on a competition result
- **WHEN** a fixture result is recorded with progression enabled
- **THEN** each participating team's progression is written back to its owner
