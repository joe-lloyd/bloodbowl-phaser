# jump-action-targeting

## Purpose

Define complete and deterministic Jump target discovery and resolution for every legal jump-over player and landing square.

## Requirements

### Requirement: Every jumpable neighbour is offered as a Jump target
When a Jump is being aimed, the coach SHALL be offered every adjacent player the jumper may legally Jump over — by default every adjacent Prone or Stunned player, and additionally adjacent Standing players when the jumper has Leap or Pogo — together with each of that player's legal, in-bounds, unoccupied landing squares. The set offered SHALL equal the set returned by the engine's jump geometry; no legal target SHALL be omitted because another target was found first.

#### Scenario: Multiple adjacent downed players are all jumpable
- **WHEN** a player declares a Jump while adjacent to three Prone opponents
- **THEN** all three are highlighted as jump-over targets and each of their legal landing squares is offered

#### Scenario: Leap widens the target set to standing players
- **WHEN** a player with Leap declares a Jump while adjacent to one Prone and two Standing players
- **THEN** all three are offered as jump-over targets with their legal landing squares

### Requirement: A Jump resolves the selected jump-over and landing pair
Selecting a highlighted landing square SHALL execute the Jump that crosses the jump-over player paired with that landing square. The player SHALL end in the selected landing square. Where two jumpable neighbours share a landing square, the pair chosen SHALL be deterministic across runs given the same board.

#### Scenario: The chosen landing square determines which player is jumped
- **WHEN** a coach clicks the landing square that lies behind the second of two adjacent Prone opponents
- **THEN** the jumper crosses that second opponent and lands in the clicked square, not the first opponent's square

#### Scenario: A shared landing square resolves deterministically
- **WHEN** two adjacent jumpable players both offer the same legal landing square and the coach clicks it
- **THEN** the same jump-over player is chosen on every run of that board state

### Requirement: Jump targets exclude illegal landings
A landing square SHALL be offered only when it is one of the jumped-over player's push-back squares, is in bounds, is unoccupied, and is not the jumper's own starting square.

#### Scenario: Occupied and out-of-bounds landings are not offered
- **WHEN** a jumpable neighbour's push-back squares are partly occupied and partly off the pitch
- **THEN** only the remaining empty, in-bounds squares are highlighted as landings for that neighbour
