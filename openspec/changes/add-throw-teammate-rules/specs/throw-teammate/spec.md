## ADDED Requirements

### Requirement: Throw Team-mate Action eligibility

A Standing player that has the Throw Team-mate trait and has their Tackle Zone MAY declare a Throw Team-mate Action, choosing one team-mate to throw. A team-mate SHALL be a legal target only if they are Standing, adjacent to the thrower (or in a square the thrower can reach to pick them up per the Action's movement), have the Right Stuff trait, and have a Strength characteristic of 3 or less. The system SHALL offer the Throw Team-mate Action only when at least one such legal target exists, and SHALL reject the Action at resolution if the chosen target is not eligible.

#### Scenario: Right-Stuff team-mate is a legal target
- **WHEN** a Throw Team-mate player selects an adjacent Standing team-mate that has Right Stuff and Strength 3
- **THEN** the Throw Team-mate Action is offered and may resolve against that team-mate

#### Scenario: Team-mate without Right Stuff is not a target
- **WHEN** the chosen team-mate does not have the Right Stuff trait
- **THEN** the Throw Team-mate Action is not offered for that team-mate and is rejected if attempted

#### Scenario: Right Stuff with Strength above 3 is not a target
- **WHEN** the chosen team-mate has Right Stuff but Strength 4 or more
- **THEN** the team-mate is not a legal Throw or Kick Team-mate target

#### Scenario: No eligible team-mate hides the action
- **WHEN** the player has Throw Team-mate but no reachable Standing team-mate is Right-Stuff-eligible
- **THEN** the Throw Team-mate Action is not offered

### Requirement: Throw Team-mate range limit

A team-mate MAY only be thrown to a square within Quick or Short pass range of the thrower; Long, Long Bomb, and off-the-ruler squares SHALL be out of range for a Throw or Kick Team-mate Action. An out-of-range aim SHALL be rejected with no Passing Ability Test and no turnover. The thrower MAY move before throwing, so range is measured from the thrower's square at the moment the throw is resolved. During pass-style aiming the system SHALL show the throw template restricted to the Quick and Short range bands.

#### Scenario: Short-range throw is allowed
- **WHEN** a thrower aims at a team-mate landing square within Short range
- **THEN** the Throw Team-mate Action resolves normally

#### Scenario: Long-range aim is rejected
- **WHEN** a thrower aims at a square beyond Short range
- **THEN** the throw is rejected with no Passing Ability Test and no turnover

#### Scenario: Move before throwing
- **WHEN** a thrower moves adjacent to an eligible team-mate and then throws
- **THEN** the Action is legal and range is measured from the thrower's post-move square

### Requirement: Throw Team-mate Passing Ability Test and Strong Arm

Resolving a Throw Team-mate Action SHALL make a Passing Ability Test for the thrower using the same range/accuracy math as a Pass Action to the chosen aim square. A thrower with the Strong Arm skill SHALL apply a positive modifier to this test. Strong Arm SHALL NOT apply to a Kick Team-mate Action. A natural 1 on the Passing Ability Test SHALL be a Fumbled Throw.

#### Scenario: Strong Arm improves a throw
- **WHEN** a thrower with Strong Arm makes the Passing Ability Test of a Throw Team-mate Action
- **THEN** the test receives Strong Arm's positive modifier

#### Scenario: Strong Arm does not help a kick
- **WHEN** a thrower with Strong Arm performs a Kick Team-mate Action
- **THEN** no Strong Arm modifier is applied to the roll

#### Scenario: Natural 1 fumbles the throw
- **WHEN** the Passing Ability Test of a Throw Team-mate Action rolls a natural 1
- **THEN** the throw is a Fumbled Throw and fumble handling applies

### Requirement: Thrown-player scatter and Right Stuff landing

After a successful (non-fumbled) throw, the thrown player SHALL be scattered from the aim square and then make a Right Stuff landing roll to determine how they arrive. By default the scatter SHALL use the standard Scatter template; a thrower with the Swoop trait SHALL instead scatter the thrown player using the Throw-in template. The landing roll SHALL be a D6 with a +1 modifier when the thrower has Swoop; on a success the thrown player lands Standing, otherwise they land Prone. If the final square is occupied, the thrown player and the occupying player SHALL both be knocked down (a crash).

#### Scenario: Standard scatter without Swoop
- **WHEN** a thrown player is scattered and the thrower does not have Swoop
- **THEN** the standard Scatter template is used for the thrown player's displacement

#### Scenario: Swoop uses the Throw-in template and boosts landing
- **WHEN** a thrower with Swoop throws a team-mate
- **THEN** the thrown player scatters using the Throw-in template and the Right Stuff landing roll gets +1

#### Scenario: Landing on an occupied square is a crash
- **WHEN** a thrown player's final square is occupied by another player
- **THEN** both the thrown player and the occupant are knocked down

#### Scenario: Failed landing leaves the thrown player Prone
- **WHEN** the Right Stuff landing roll fails
- **THEN** the thrown player is placed Prone in the landing square

### Requirement: Throw Team-mate fumble handling

A Fumbled Throw of a Throw Team-mate Action SHALL drop the thrown team-mate Prone in the thrower's square and make an Injury Roll for them, and SHALL cause a Turnover. If the thrower was carrying the ball, the ball SHALL bounce from the thrower's square.

#### Scenario: Fumbled throw drops and injures the team-mate
- **WHEN** a Throw Team-mate Action is a Fumbled Throw
- **THEN** the thrown team-mate is placed Prone in the thrower's square, an Injury Roll is made for them, and a Turnover is caused

### Requirement: Kick Team-mate Action

The Kick Team-mate trait SHALL allow a player to perform a Kick Team-mate Action that resolves using the Throw Team-mate rules (same eligibility, aim, scatter, and Right Stuff landing), except that a Fumbled kick SHALL immediately remove the kicked player from play and make an Injury Roll for them, and SHALL cause a Turnover. Strong Arm SHALL NOT modify a Kick Team-mate Action.

#### Scenario: Kick reuses throw resolution on success
- **WHEN** a Kick Team-mate Action does not fumble
- **THEN** the kicked player scatters and makes a Right Stuff landing roll exactly as a thrown player would

#### Scenario: Fumbled kick removes and injures the player
- **WHEN** a Kick Team-mate Action fumbles
- **THEN** the kicked player is removed from play, an Injury Roll is made for them, and a Turnover is caused

### Requirement: Always Hungry eat roll

When a player with the Always Hungry trait performs a Throw Team-mate (or Kick Team-mate) Action, before completing the throw the system SHALL roll a D6 for the thrower. On a 2+ the Action continues normally. On a 1 the thrower attempts to eat the team-mate and rolls a further D6: on a 2+ the team-mate squirms free and the Action becomes a Fumbled Throw; on a 1 the team-mate is eaten and immediately removed from the Team Draft List with no Apothecary and no Regeneration allowed. If an eaten team-mate was carrying the ball, it SHALL bounce from the thrower's square. Eating a team-mate SHALL cause a Turnover.

#### Scenario: Hungry roll of 2+ proceeds normally
- **WHEN** an Always Hungry thrower rolls 2+ on the eat check
- **THEN** the Throw Team-mate Action continues to its Passing Ability Test

#### Scenario: Squirm free forces a fumble
- **WHEN** the Always Hungry eat check rolls a 1 and the follow-up roll is 2+
- **THEN** the team-mate squirms free and the Action becomes a Fumbled Throw

#### Scenario: Eaten team-mate is removed without saves
- **WHEN** the Always Hungry eat check rolls a 1 and the follow-up roll is also a 1
- **THEN** the team-mate is removed from the draft list with no Apothecary or Regeneration, any carried ball bounces, and a Turnover is caused

### Requirement: Throw Team-mate turnover conditions

A Throw Team-mate or Kick Team-mate Action SHALL cause a Turnover when the thrown player ends the Action Prone, is injured or removed from play, is eaten, or the throw is fumbled. The Action SHALL NOT cause a Turnover solely because the thrown player lands Standing in an empty square.

#### Scenario: Standing landing is not a turnover
- **WHEN** a thrown player lands Standing in an empty square
- **THEN** no Turnover is caused by the Throw Team-mate Action

#### Scenario: Prone landing is a turnover
- **WHEN** a thrown player ends the Action Prone
- **THEN** a Turnover is caused
