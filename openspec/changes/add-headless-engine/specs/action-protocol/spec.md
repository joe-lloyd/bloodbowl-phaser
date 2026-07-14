# action-protocol

## ADDED Requirements

### Requirement: JSON command interface
The system SHALL accept game actions as JSON commands (discriminated union on `type`) covering at minimum: setup placement and confirmation, kickoff (kicker selection, kick target, kickoff roll), action declaration (move, block, blitz, pass, hand-off, foul), movement along a path, block resolution, pass, foul, stand up, end turn, and decision replies. Commands map onto the existing `IGameService` surface; the protocol SHALL NOT reimplement rules.

#### Scenario: Move command executes
- **WHEN** `{ "type": "move", "playerId": "...", "path": [{"x":9,"y":5},{"x":10,"y":5}] }` is submitted for an activated player with a legal path
- **THEN** the player moves, and the response reports `ok: true` with the resulting events and updated snapshot

#### Scenario: Malformed command rejected safely
- **WHEN** a command with an unknown `type` or missing required fields is submitted
- **THEN** the response is `ok: false` with a machine-readable error reason, and the game state is unchanged

### Requirement: Legal action enumeration
The system SHALL enumerate currently legal options for the active team — which players can activate, which actions each may declare (respecting once-per-turn blitz/pass/hand-off/foul flags), and for a selected action its legal targets (reachable squares from `getAvailableMovements`, blockable opponents, valid foul victims) — using the existing validators as the single source of truth.

#### Scenario: AI queries available actions
- **WHEN** legal actions are requested at the start of a team turn
- **THEN** the response lists each non-activated standing player with the actions it may declare, and excludes actions already consumed this turn (e.g. blitz after a blitz has occurred)

#### Scenario: Enumeration matches execution
- **WHEN** any enumerated action/target is submitted as a command
- **THEN** the engine accepts it (does not reject it as illegal)

### Requirement: Command responses report outcome, events, and state
Every command response SHALL include `ok`, the domain events emitted during execution (including dice roll results from the seeded RNG), a fresh state snapshot, and — when the command was rejected — a reason.

#### Scenario: Block response carries dice results
- **WHEN** a block command is executed
- **THEN** the response's events include the block dice rolled and the chosen/applied result, and the snapshot reflects any knockdown or push

### Requirement: Mid-action decisions surface as pending decisions
When resolution requires a choice (block die selection, push direction, follow-up, and similar), the response SHALL include a `pendingDecision` describing the decision type, the deciding team, and the legal options; the game SHALL accept the matching decision-reply command and reject other game commands until the decision is resolved.

#### Scenario: Two-dice block requires die choice
- **WHEN** a block is rolled with two dice and the attacker must choose
- **THEN** the response contains a `pendingDecision` listing both dice results as options, and a subsequent decision-reply command applies the chosen result

#### Scenario: Commands blocked while decision pending
- **WHEN** a move command is submitted while a push-direction decision is pending
- **THEN** it is rejected with a reason indicating the pending decision

### Requirement: Turnovers and turn flow reported
The protocol SHALL report turnovers (with reason) and turn/half/game transitions in responses, so an external agent can follow flow without polling.

#### Scenario: Failed pickup causes turnover
- **WHEN** a move onto the ball fails the pickup roll
- **THEN** the response events include the failed roll and a turnover with its reason, and the snapshot shows the opposing team active
