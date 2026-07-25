# drive-reset

## ADDED Requirements

### Requirement: KO recovery is rolled one player at a time and shown
The end-of-drive KO recovery SHALL roll a D6 for each knocked-out player individually. Each roll SHALL be surfaced — in the match log and on the dugout — before the next player is rolled for, so a coach can watch and verify the sequence. A result of 4 or more SHALL recover the player; 3 or less SHALL leave them knocked out.

#### Scenario: Each KO'd player gets a visible roll
- **WHEN** the drive ends with three knocked-out players
- **THEN** three separate D6 rolls are made and shown in sequence, one per player, each naming the player and the result

#### Scenario: A 4+ recovers and a 3 or less does not
- **WHEN** a knocked-out player's recovery roll is 4, 5, or 6
- **THEN** that player recovers; and **WHEN** the roll is 1, 2, or 3, that player remains knocked out

### Requirement: A recovered player is animated into the Reserves box
A player who recovers SHALL be animated from the KO box into the Reserves box, and a player who fails SHALL be shown remaining in the KO box. The animation SHALL complete before the next drive's setup begins, so the coach sets up against a settled dugout.

#### Scenario: Recovery animation precedes setup
- **WHEN** a player recovers at the end of a drive
- **THEN** they are shown moving from the KO box to the Reserves box, and setup for the next drive does not begin until that sequence has finished

### Requirement: A player exists in exactly one location
Every status transition between the pitch, Reserves, KO, and Casualty boxes SHALL move the player's single record and its single representation. A player SHALL NOT be shown in two locations at once, and SHALL NOT remain in the KO box after recovering.

#### Scenario: A recovered player is not duplicated
- **WHEN** a knocked-out player recovers and is later fielded for the next drive
- **THEN** that player appears only on the pitch, with no remaining copy in the KO box

#### Scenario: Clearing the pitch does not duplicate dugout entries
- **WHEN** the pitch is cleared at the end of a drive
- **THEN** each player appears exactly once across the Reserves, KO, and Casualty boxes

### Requirement: Recovered players are available for the next setup
A player recovered by KO recovery SHALL be in Reserves and eligible for placement in the next drive's setup, with no leftover pitch position from the previous drive.

#### Scenario: Recovered player can be placed
- **WHEN** setup for the next drive begins after a successful recovery
- **THEN** the recovered player is available to place and carries no stale grid position
