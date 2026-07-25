# kickoff-events

## ADDED Requirements

### Requirement: The Sevens kickoff table is the table rolled
The kickoff SHALL roll 2D6 on the Blood Bowl Sevens kickoff table and resolve the result: 2 Get the Ref, 3 Time-Out, 4 Solid Defence, 5 High Kick, 6 Cheering Fans, 7 Brilliant Coaching, 8 Changing Weather, 9 Quick Snap, 10 Charge!, 11 Dodgy Snack, 12 Pitch Invasion. No result from the standard Blood Bowl table — Perfect Defence, Blitz!, Throw a Rock — SHALL be produced.

#### Scenario: Each roll maps to its Sevens event
- **WHEN** the kickoff 2D6 totals 7
- **THEN** the event resolved is Brilliant Coaching, not Changing Weather

#### Scenario: Standard-table-only events never occur
- **WHEN** a kickoff is rolled any number of times
- **THEN** Blitz!, Throw a Rock and Perfect Defence are never among the results

### Requirement: The roll and its meaning are recorded
Every kickoff SHALL record the 2D6 total, the named event, and a plain statement of what the event does, and SHALL make the resulting effect on each team visible rather than applying it silently.

#### Scenario: The event is logged with its meaning
- **WHEN** the kickoff rolls 11
- **THEN** the match log records the roll, the name "Dodgy Snack", and what happens as a result

#### Scenario: The effect on a team is visible
- **WHEN** an event grants a team a Bribe or a free re-roll
- **THEN** that team's holdings show the granted item

### Requirement: Get the Ref grants each team a Bribe for the game
On a result of 2, each team SHALL immediately receive one free Bribe inducement. That Bribe SHALL remain available for the rest of the match and SHALL be lost at the end of the match if unused.

#### Scenario: Both teams receive a Bribe
- **WHEN** the kickoff rolls 2
- **THEN** each team gains one Bribe usable for the remainder of the match

#### Scenario: An unused Bribe is lost at full time
- **WHEN** the match ends with a Get the Ref Bribe unused
- **THEN** the Bribe is not carried into any later match

### Requirement: Time-Out moves both turn markers
On a result of 3, if the kicking team's turn marker is on turn 4, 5 or 6 for the half, both teams' turn markers SHALL move back one space. Otherwise both teams' turn markers SHALL move forward one space.

#### Scenario: Late-half Time-Out gives turns back
- **WHEN** the kickoff rolls 3 and the kicking team is on turn 5 of the half
- **THEN** both teams' turn markers move back one space

#### Scenario: Early-half Time-Out costs turns
- **WHEN** the kickoff rolls 3 and the kicking team is on turn 2 of the half
- **THEN** both teams' turn markers move forward one space

### Requirement: Cheering Fans awards an Offensive Assist to the next Block
On a result of 6, both coaches SHALL roll a D6 and add their Cheerleaders. The coach with the highest total — or both coaches on a tie — SHALL have the first Block Action performed during their next turn receive one additional Offensive Assist. The benefit SHALL be consumed by that first Block and SHALL NOT persist beyond that turn.

#### Scenario: The winning coach's first Block gains an assist
- **WHEN** Cheering Fans is won by one coach and that coach performs their first Block of their next turn
- **THEN** that Block counts one additional Offensive Assist

#### Scenario: A tie benefits both coaches
- **WHEN** both coaches' Cheering Fans totals are equal
- **THEN** each coach's first Block of their next turn receives the additional Offensive Assist

#### Scenario: The benefit does not carry over
- **WHEN** the coach's next turn ends without a Block being performed
- **THEN** the benefit is gone and no later Block receives it

### Requirement: Brilliant Coaching awards a free re-roll for the drive
On a result of 7, both coaches SHALL roll a D6 and add their Assistant Coaches. The coach with the highest total — or both coaches on a tie — SHALL immediately gain one free Team Re-roll for the drive ahead. An unused free re-roll SHALL be lost at the end of that drive and SHALL NOT increase the team's re-roll count for the next drive.

#### Scenario: The winning coach gains a drive re-roll
- **WHEN** Brilliant Coaching is won by one coach
- **THEN** that coach has one additional team re-roll available for the drive

#### Scenario: An unused drive re-roll expires
- **WHEN** the drive ends with the free re-roll unused
- **THEN** the team's re-roll count returns to what it was before the award

### Requirement: Changing Weather re-rolls the weather and may scatter the kick
On a result of 8, a new roll SHALL be made on the weather table and take effect immediately. If the new result is Perfect Conditions, the ball SHALL Scatter (3) in the air before it lands.

#### Scenario: New weather takes effect
- **WHEN** the kickoff rolls 8
- **THEN** the weather is re-rolled and the new condition applies for the drive

#### Scenario: Perfect Conditions scatters the kick
- **WHEN** the Changing Weather re-roll produces Perfect Conditions
- **THEN** the ball scatters three squares in the air before landing

### Requirement: Dodgy Snack afflicts a random player for the drive
On a result of 11, both coaches SHALL roll a D6. The coach who rolled lowest — or both coaches on a tie — SHALL randomly select one of their players on the pitch and roll a D6 for them. On 2+ that player's MA and AV SHALL be reduced by 1 for the duration of the drive. On a 1 the player SHALL be placed in the Reserves box for the rest of the drive.

#### Scenario: A player is left queasy
- **WHEN** the Dodgy Snack player roll is 2 or more
- **THEN** that player's MA and AV are each 1 lower for the rest of the drive and return to normal when the drive ends

#### Scenario: A player is locked in the lavatory
- **WHEN** the Dodgy Snack player roll is 1
- **THEN** that player is placed in the Reserves box and cannot be fielded again during this drive

#### Scenario: A tie afflicts both teams
- **WHEN** both coaches' Dodgy Snack D6 rolls are equal
- **THEN** each coach randomly selects one of their players on the pitch and rolls for them

### Requirement: Pitch Invasion knocks a player prone and stuns them
On a result of 12, both coaches SHALL roll a D6 and add their Fan Factor. The coach who rolled lowest — or both coaches on a tie — SHALL randomly select one of their players on the pitch; that player SHALL be Placed Prone and become Stunned.

#### Scenario: The losing coach loses a player to the crowd
- **WHEN** one coach's Pitch Invasion total is lower
- **THEN** one of that coach's players on the pitch, chosen at random, is placed prone and stunned

#### Scenario: A tie hits both teams
- **WHEN** both coaches' Pitch Invasion totals are equal
- **THEN** each coach has one randomly selected player on the pitch placed prone and stunned

### Requirement: Drive-scoped effects are cleared when the drive ends
Any effect a kickoff event creates for the duration of a drive — a free re-roll, an owed Offensive Assist, a Dodgy Snack characteristic reduction, a player confined to Reserves — SHALL be removed at the end of that drive, and SHALL NOT be present at the start of the next one.

#### Scenario: The next drive starts clean
- **WHEN** a drive that granted a free re-roll and a Dodgy Snack reduction ends
- **THEN** the next drive begins with no free re-roll and with the affected player's MA and AV restored

### Requirement: Kickoff events resolve identically in the browser and headless
Rolling and resolving a kickoff event SHALL produce the same state changes through the headless protocol as in the browser, using the deterministic dice service so a seeded scenario reproduces the same event and outcome.

#### Scenario: A seeded kickoff reproduces
- **WHEN** the same seed is used for two headless runs of a drive
- **THEN** both roll the same kickoff event and reach the same resulting state
