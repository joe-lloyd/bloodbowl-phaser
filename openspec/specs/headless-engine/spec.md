# headless-engine

## Purpose

Enable a complete, playable game instance to run in a plain Node environment — free of Phaser, DOM, and singleton state — with deterministic seeded outcomes and injectable pacing, so full matches can be played and tested headless.

## Requirements

### Requirement: Game construction without Phaser or DOM
The system SHALL provide a factory (`createHeadlessGame`) that constructs a complete, playable game instance (event bus, seeded RNG, block resolution, game service) in a plain Node environment, with no imports from `phaser`, no `window`/`document` access, and no `ServiceContainer` singleton state.

#### Scenario: Create a game in Node
- **WHEN** `createHeadlessGame({ team1, team2, seed })` is called in a Node process with no DOM
- **THEN** it returns a game instance exposing the game state and command interface without throwing

#### Scenario: Multiple independent games in one process
- **WHEN** two headless games are created in the same process
- **THEN** commands issued to one game do not affect the state of the other

### Requirement: Deterministic games from a seed
The system SHALL produce identical game outcomes (dice rolls, state transitions, events) for identical seeds and identical command sequences.

#### Scenario: Same seed, same commands
- **WHEN** two headless games are created with the same teams and seed and receive the same command sequence
- **THEN** their final serialized states and emitted event sequences are identical

### Requirement: Scenario and seed initialization
The system SHALL support initializing a headless game from an existing scenario definition (`scenarios.ts` format: placements, phase, sub-phase, ball position) plus an RNG seed.

#### Scenario: Load a scenario headless
- **WHEN** a headless game is created with scenario `basic-scrimmage` and a seed
- **THEN** the initial state snapshot shows the scenario's player placements, phase, and ball position

### Requirement: Injectable presentation delays
Operations SHALL obtain pacing delays from an injected delay provider on the flow context instead of calling `setTimeout` directly. The headless delay provider SHALL resolve immediately; the browser provider SHALL preserve current timings.

#### Scenario: Headless game runs without real-time waits
- **WHEN** a full drive including blocks, armour rolls, injuries, and a pass is executed headless
- **THEN** execution completes without waiting for wall-clock animation delays (a full game completes in seconds, not minutes)

#### Scenario: Browser pacing unchanged
- **WHEN** the game runs in the browser build
- **THEN** operation pacing delays match the previous hardcoded durations

### Requirement: Full game playable headless
The system SHALL support playing a complete Blood Bowl Sevens match headless — setup, kickoff, alternating turns with turnovers, touchdowns, halftime, and game over — driven entirely through the command interface.

#### Scenario: Complete seeded match
- **WHEN** a scripted command sequence for a full match is executed against a seeded headless game
- **THEN** the game reaches `GAME_OVER` with a final score, and no step stalls waiting for a UI listener
