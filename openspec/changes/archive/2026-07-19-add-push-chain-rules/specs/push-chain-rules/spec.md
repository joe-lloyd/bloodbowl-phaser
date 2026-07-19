# push-chain-rules

## ADDED Requirements

### Requirement: Push option tiers per the rulebook
When resolving a push, the system SHALL offer unoccupied push squares when any exist; occupied push squares only when no unoccupied square exists (causing a chain push); and a crowd exit only when no push square exists at all (player at a sideline or end zone).

#### Scenario: Occupied squares offered only when forced
- **WHEN** a pushed player has one unoccupied and two occupied push squares
- **THEN** only the unoccupied square is offered

#### Scenario: Crowd exit when nothing else
- **WHEN** a player on the sideline is pushed and all push squares are occupied or off-pitch
- **THEN** the only option is the crowd exit

### Requirement: Chain pushes recurse under the blocking coach's control
When a player is pushed into an occupied square, the occupant SHALL be pushed onward as if pushed themselves, recursively, with every direction in the chain chosen by the coach of the player who performed the original block. Prone and stunned players SHALL be chain-pushable. Board moves SHALL apply only after the full chain is decided, innermost player first.

#### Scenario: Two-link chain
- **WHEN** a defender with no unoccupied push squares is pushed into a teammate
- **THEN** a second push-direction decision is offered to the blocking coach for the teammate, and after it resolves both players occupy their pushed squares

#### Scenario: Headless chain decisions
- **WHEN** a chain push occurs in a headless game
- **THEN** each link surfaces as a push-direction pending decision whose chooser is the blocking team, and gating rejects other commands until each is answered

### Requirement: Injury by the crowd
A player pushed into the crowd SHALL take an immediate injury roll with no armour roll; a Stunned result places them in the Reserves box instead. KO and Casualty results apply as normal. Events SHALL report the crowd push and the injury outcome.

#### Scenario: Crowd surf resolves without armour
- **WHEN** a player is pushed into the crowd
- **THEN** an injury roll resolves directly, and on a Stunned result the player is in Reserves for the next drive

### Requirement: Crowd push consequences for ball and turn
If the crowd-pushed player held the ball, the ball SHALL be thrown in from the square they exited (throw-in template direction + rulebook distance), resolving through normal bounce/catch on landing. If the crowd-pushed player belonged to the active team, a turnover SHALL be caused (absorbed by the turnover latch if one is already in progress).

#### Scenario: Carrier surfed
- **WHEN** the ball carrier is pushed into the crowd
- **THEN** the ball is thrown in from the exit square and play continues with the throw-in result before the turn changes

#### Scenario: Active-team player surfed
- **WHEN** an active-team player is pushed into the crowd during their own team's block
- **THEN** exactly one turnover resolves after the chain and ball are at rest
