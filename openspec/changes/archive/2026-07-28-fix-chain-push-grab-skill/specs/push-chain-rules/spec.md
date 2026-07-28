# push-chain-rules

## ADDED Requirements

### Requirement: Grab widens the open tier, not the chain tier
When the attacker has the Grab skill, the push SHALL first consider all eight on-pitch squares adjacent to the defender as open-tier options, in addition to the normal three squares behind the defender. If none of those eight squares is unoccupied, the push SHALL fall back to the normal three-square tiered resolution (open, then crowd, then chain), including chaining into an occupied square among only those three when the defender is fully boxed in.

#### Scenario: Grab finds an opening outside the usual three squares
- **WHEN** an attacker with Grab pushes a defender who has an unoccupied square among the eight adjacent squares but none of the three traditional behind-squares open
- **THEN** the push is offered as an open-tier choice among the unoccupied squares found via Grab

#### Scenario: A fully boxed-in defender still chains normally
- **WHEN** an attacker with Grab pushes a defender who has no unoccupied square among any of the eight adjacent squares
- **THEN** the push chains into an occupied square chosen from the normal three behind-squares, exactly as it would for an attacker without Grab

### Requirement: Grab does not propagate past the first push of a chain
Grab's widened square set SHALL apply only to the push directly caused by the Grab-holding attacker's Block. Any further push forced later in the same chain (moving a player who occupied the chosen square) SHALL resolve over that player's own normal three behind-squares, not the wider Grab set.

#### Scenario: A forced second push in the chain ignores Grab
- **WHEN** a Grab-assisted push lands on an occupied square, forcing that occupant to also be pushed
- **THEN** the second push offers only the normal three behind-squares for that occupant, not the wider eight-square Grab set

### Requirement: A Grab-assisted push is named in the match log
When Grab widens the push options and the coach selects a square outside the normal three behind-squares, the match log SHALL record that Grab was the reason that square was available.

#### Scenario: The log names Grab
- **WHEN** a coach uses Grab to push a defender into one of the wider eight squares
- **THEN** the match log entry for that push names Grab alongside the destination square
