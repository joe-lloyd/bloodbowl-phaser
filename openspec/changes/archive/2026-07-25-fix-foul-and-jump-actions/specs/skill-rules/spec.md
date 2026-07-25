# skill-rules

## ADDED Requirements

### Requirement: Jump Up lets a Prone player declare and perform a Block
A Prone player with the Jump Up skill SHALL be able to declare a Block action. Declaring it SHALL require an Agility test with a `+1` modifier to stand up. On a passed test the player SHALL stand up without spending movement and the Block SHALL resolve against a chosen adjacent opponent as a normal standing Block. On a failed test the player SHALL remain Prone, the action SHALL be wasted, and it SHALL NOT be a turnover. A Prone player without Jump Up SHALL still be refused a Block declaration and directed to an action that includes movement.

#### Scenario: Prone Jump Up player blocks an adjacent opponent
- **WHEN** a Prone player with Jump Up is adjacent to a Standing opponent, the coach declares a Block against them, and the Agility test is passed
- **THEN** the player stands up without spending movement and the Block is resolved with normal block dice

#### Scenario: A failed Agility test wastes the action without a turnover
- **WHEN** a Prone player with Jump Up declares a Block and fails the Agility test
- **THEN** the player remains Prone, their activation ends with the action wasted, and possession does not change

#### Scenario: The stand-up test takes a +1 modifier
- **WHEN** the Agility test to stand up and Block is rolled
- **THEN** it is resolved with a `+1` modifier applied

#### Scenario: Prone player without Jump Up cannot declare a Block
- **WHEN** a Prone player without Jump Up attempts to declare a Block
- **THEN** the declaration is refused and the coach is told a down player must use an action that includes standing up

#### Scenario: Standing up via Jump Up costs no movement
- **WHEN** a Prone player with Jump Up stands up as part of declaring a Block and passes the test
- **THEN** no movement allowance is deducted for standing up

### Requirement: The single-Block-per-Blitz guard is scoped to its activation
The refusal that prevents a second Block during a Blitz SHALL apply only while the player that spent it is still in the Blitz activation that spent it. The guard SHALL be cleared when that activation ends, at the start of a new turn, and at drive reset. A Block declaration SHALL never be refused as "already used" when the declaring player has no Blitz action currently declared.

#### Scenario: A second Block during the same Blitz is still refused
- **WHEN** a player has blitzed, resolved its one Block, and the coach clicks a second adjacent opponent during the same activation
- **THEN** the second Block is refused and the coach is told to keep moving

#### Scenario: A later plain Block is not refused
- **WHEN** a player finished a Blitz activation earlier in the turn or in a previous turn and is later declared for a plain Block
- **THEN** the Block is allowed and no "already used its Block" refusal is raised

#### Scenario: Jump Up plus Block is not blocked by a stale Blitz guard
- **WHEN** a Prone player with Jump Up declares a Block and that player carries a stale Blitz-block flag from an earlier activation
- **THEN** the player stands up for free and the Block resolves normally

### Requirement: Jump Up and Blitz compose without stacking exceptions
A player with Jump Up who declares a Blitz while Prone SHALL stand up for free and retain the Blitz's single Block plus its remaining movement. The free stand-up SHALL NOT consume the Blitz's Block, and the Blitz's Block SHALL still be limited to one.

#### Scenario: Prone Jump Up player blitzes
- **WHEN** a Prone player with Jump Up declares a Blitz
- **THEN** they stand up for free, keep their full movement allowance, and may still make the Blitz's one Block at any point during the move
