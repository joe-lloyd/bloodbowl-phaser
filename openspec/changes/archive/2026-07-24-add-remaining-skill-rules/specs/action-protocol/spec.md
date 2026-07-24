# action-protocol (delta)

## ADDED Requirements

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
