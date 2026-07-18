# match-stats

## ADDED Requirements

### Requirement: Per-player match statistics tracking
The system SHALL accumulate, per player, the statistics needed to award SPP and to fill the post-match summary: completions, passing/deflection SPP-earning actions, touchdowns (rushing the ball over the line), casualties inflicted, interceptions, blocks thrown, yards moved, and injuries suffered. Tracking SHALL be driven exclusively by subscribing to engine domain events; the rules engine SHALL NOT hold statistic counters.

#### Scenario: Touchdown credited to the scorer
- **WHEN** a `Touchdown` event is emitted for the ball carrier
- **THEN** that player's touchdown count increments by one

#### Scenario: Completion credited to the passer
- **WHEN** a completed pass or hand-off that earns a completion is resolved
- **THEN** the throwing player's completion count increments by one

### Requirement: Attributable casualty, interception, and MVP events
The engine SHALL emit distinct domain events for a casualty inflicted (`PlayerCasualtyInflicted` with the attacker, the victim, and the cause: block, foul, or crowd), for an interception, and for the end-of-match MVP award — so statistics can be attributed without parsing UI notification text. The existing casualty `UI_Notification` MAY remain for the on-screen message.

#### Scenario: Block casualty attributes to the attacker
- **WHEN** a block causes an opposition player to be removed as a casualty
- **THEN** a `PlayerCasualtyInflicted` event names the attacking player as the causer and the stats layer credits that player one casualty

#### Scenario: MVP awarded at end of match
- **WHEN** the match ends
- **THEN** an MVP is rolled and an `MvpAwarded` event names the receiving player

### Requirement: Headless-safe accumulation
Statistic tracking SHALL function without any DOM or Phaser dependency, so a headless match accumulates a complete stat tally with no UI mounted.

#### Scenario: Headless match produces a full tally
- **WHEN** a match is played to completion through the headless engine
- **THEN** the per-player statistics are available with no browser environment present
