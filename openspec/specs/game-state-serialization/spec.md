# game-state-serialization

## Purpose

Provide stable, JSON-safe serialization and deserialization of the full game situation so games can be snapshotted, transmitted to external consumers, and restored to continue play deterministically.

## Requirements

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

### Requirement: A resumable save payload wraps the game snapshot
The system SHALL provide a save payload that contains a `GameSnapshot` alongside the additional state a cold restore requires: both full team rosters, the drive's kicking and receiving team ids, the half, the random-number generator state, the match statistics accumulated so far, and an optional competition context. The payload SHALL carry a version identifier and a saved-at timestamp. The existing `GameSnapshot` contract SHALL be unchanged so the headless runner and the network transport are unaffected.

#### Scenario: Save payload round-trips through JSON
- **WHEN** a save payload is passed through `JSON.parse(JSON.stringify(payload))`
- **THEN** the result is deep-equal to the original, with no empty-object artifacts from `Set`/`Map` fields

#### Scenario: Snapshot contract is unchanged
- **WHEN** the network transport serialises a game state
- **THEN** it produces the same `GameSnapshot` shape as before, without roster, RNG, or statistics fields

### Requirement: Random-number generator state is serializable
The random-number generator SHALL expose its state as JSON-safe data and SHALL be restorable from that data, such that a restored generator produces the same sequence the original would have produced.

#### Scenario: Restored generator continues the same sequence
- **WHEN** a seeded generator's state is captured after some rolls and restored into a new generator
- **THEN** the next rolls match those the original generator would have produced

### Requirement: Match statistics are serializable
The match statistics tracker SHALL expose its accumulated per-player counters as JSON-safe data and SHALL be restorable from that data, so a resumed match continues accumulating rather than restarting from zero.

#### Scenario: Statistics continue after a resume
- **WHEN** a match with recorded completions, casualties, and touchdowns is saved and resumed
- **THEN** the post-match summary reflects the whole match, including events recorded before the save

### Requirement: A save payload restores a playable game
Deserializing a save payload SHALL reconstruct the in-memory game state, both teams, the drive assignment, the generator, and the statistics tracker, such that play continues correctly from that position.

#### Scenario: Restore mid-drive
- **WHEN** a payload saved mid-drive is restored
- **THEN** the same subsequent commands are legal and produce the same results as in the original game, including which team is kicking

#### Scenario: Restore during setup
- **WHEN** a payload saved during the setup sub-phase is restored
- **THEN** setup continues for the same team with the same players already placed
