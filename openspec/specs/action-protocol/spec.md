# action-protocol

## Purpose

Define a JSON command/response protocol that lets an external agent drive a game through the existing `IGameService` surface — declaring actions, enumerating legal options, and following flow (dice, decisions, turnovers) without reimplementing rules.

## Requirements

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

### Requirement: Chained and crowd push decisions
The protocol SHALL support the `push-direction` pending decision occurring multiple times for a single block (one per chain link), each attributed to the blocking team via `chooserTeamId`. Options MAY include occupied squares (chain pushes) and one off-pitch coordinate representing the crowd exit. Command gating SHALL apply to each link as to any pending decision.

#### Scenario: Chain surfaces sequentially
- **WHEN** a block causes a two-link chain push in a headless game
- **THEN** answering the first push-direction decision yields a response carrying the second, and only after both are answered does the response report the applied moves

### Requirement: New skill-driven actions are declarable through the protocol
The headless JSON protocol and the browser controller SHALL expose every new player-facing action introduced by the remaining skills so they are AI-playable and manually testable: a Jump/Leap move over an adjacent square, a Chainsaw Attack, a Throw Bomb, a Punt, and a Multiple Block. Each SHALL be a protocol command that resolves through its flow operation and reports events, turnover state, and any pending decision like every other action.

#### Scenario: A Chainsaw Attack is declarable and resolves
- **WHEN** a Chainsaw player is sent `{"type":"chainsawAttack","attackerId":...,"defenderId":...}`
- **THEN** the command resolves the Chainsaw Attack, returns its events, and reports whether the wielder kicked back

#### Scenario: A Jump move is declarable
- **WHEN** a player with Leap or Pogo is sent a Jump move command targeting a square across an adjacent one
- **THEN** the command resolves the Agility Test with the correct modifiers and reports success or the fall

### Requirement: Skill reactions to an opponent's action surface as decisions
Reaction skills that fire during an opponent's action — Dump-Off (an immediate Quick Pass when Blocked or targeted) and On the Ball (a pre-Passing-Test move) — SHALL surface as pending decisions on the reacting team's channel, resolvable through the protocol, and SHALL be included in legal-action enumeration where the reacting player has a live choice.

#### Scenario: Dump-Off surfaces as a reacting-team decision
- **WHEN** an opponent declares a Block against a Dump-Off carrier who can Quick Pass
- **THEN** a pending decision is surfaced to the carrier's team to take or decline the Quick Pass before the Block resolves

### Requirement: Reroll pending decision
The protocol SHALL support a `pendingDecision` of type `reroll` — carrying the deciding team, player, roll kind, and available sources (specific skill and/or team reroll) — and a `use-reroll` reply command `{accept, source?}`. While a reroll decision is pending, non-reply game commands SHALL be rejected, consistent with existing decision gating.

#### Scenario: Reroll reply resumes play
- **WHEN** a reroll decision is pending and `{"type":"use-reroll","accept":true,"source":"skill"}` is submitted
- **THEN** the roll is rerolled from the seeded dice service and the response reports the new result with the decision cleared
