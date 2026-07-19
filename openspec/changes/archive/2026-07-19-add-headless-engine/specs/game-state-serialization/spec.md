# game-state-serialization

## ADDED Requirements

### Requirement: JSON-safe game snapshot
The system SHALL provide `serializeGameState` producing a plain-JSON snapshot of the full game situation: phase, sub-phase, active team, turn data, score, weather, ball position, and every player's id, name, team, pitch position, status, stats, skills, and movement used. Collection fields backed by `Set`/`Map` in memory (`activatedPlayerIds`, `movementUsed`) SHALL serialize as arrays/records.

#### Scenario: Snapshot survives JSON round-trip
- **WHEN** a snapshot is passed through `JSON.parse(JSON.stringify(snapshot))`
- **THEN** the result is deep-equal to the original snapshot with no empty-object artifacts from `Set`/`Map` fields

#### Scenario: Turn data is fully represented
- **WHEN** two players have been activated and one has used 3 squares of movement
- **THEN** the snapshot lists both activated player ids and records the movement used per player id

### Requirement: Snapshot deserialization restores a game
The system SHALL provide `deserializeGameState` that reconstructs in-memory game state (including `Set`/`Map` fields) from a snapshot, such that a headless game initialized from it continues play correctly.

#### Scenario: Save and restore mid-turn
- **WHEN** a snapshot taken mid-turn is deserialized into a new headless game with the same teams and RNG state/seed
- **THEN** the same subsequent commands are legal and produce the same results as in the original game

### Requirement: Stable external field naming
Snapshot field names SHALL be stable, documented identifiers (kebab/camel case per existing type names) suitable for external consumers; renames after release require a spec change.

#### Scenario: External consumer reads a snapshot
- **WHEN** an external tool reads `snapshot.ballPosition` and `snapshot.players[n].status`
- **THEN** those fields exist with the documented names and value domains (e.g. status is one of the `PlayerStatus` enum strings)
