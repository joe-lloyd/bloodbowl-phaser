## MODIFIED Requirements

### Requirement: Host-authoritative engine

Each side of a match SHALL run its own full game engine, started from the same state and the same jointly generated seed. Every state change SHALL be an action-protocol command executed on the local engine of the side that may act, and then executed identically on the other side's engine. The side that may act SHALL see the result without waiting on the network. Dice SHALL come from each engine's seeded RNG; both engines produce the same rolls because they run the same commands from the same seed and state.

#### Scenario: Acting coach's command resolves locally

- **WHEN** the coach whose turn it is moves a player
- **THEN** their own engine resolves the move and their board shows the result before any message reaches the other side

#### Scenario: Other side reproduces the result

- **WHEN** the other side receives that command
- **THEN** its engine produces the same events, the same dice and the same resulting state

### Requirement: Live spectating while waiting

The waiting player SHALL see the opponent's play as it happens, by running each received command on their own engine and rendering its events, with an explicit waiting indicator showing whose action or decision the game awaits.

#### Scenario: Waiting player watches a block

- **WHEN** the active player performs a block with a push
- **THEN** the waiting player's board animates the same dice result and push once the command arrives, without refreshing

## ADDED Requirements

### Requirement: Desync detection and healing

Every command message SHALL carry a checksum of the sender's state before and after the command. The receiver SHALL compare both with its own state. On any mismatch it SHALL stop applying commands, request a resync, and rebuild its engine from the full snapshot sent by the side that may act.

#### Scenario: Missed command

- **WHEN** a command arrives whose "before" checksum differs from the receiver's state
- **THEN** the receiver requests a resync and applies no further commands until it has rebuilt from the snapshot

#### Scenario: Engines diverge

- **WHEN** the receiver's state after running a command does not match the sender's "after" checksum
- **THEN** the receiver requests a resync, logs both checksums, and continues from the snapshot

### Requirement: Control follows the turn

The side that may act SHALL be the owner of the pending decision if there is one, otherwise the active team's side (the kicking team's side during kickoff). Only that side SHALL accept input; the receiving side SHALL check the same rule before running a command and treat a violation as a desync.

#### Scenario: Defender answers uphill block dice

- **WHEN** an uphill block gives the die choice to the defender
- **THEN** the defender's side resolves the choice locally and sends it, and the attacker's side applies it
