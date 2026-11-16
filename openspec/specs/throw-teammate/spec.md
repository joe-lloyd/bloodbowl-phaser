# throw-teammate

## Purpose

Define the Throw Team-mate and Kick Team-mate Actions per the 2025 rulebook: target eligibility, range limits, the Passing Ability Test with Strong Arm, thrown-player scatter and Right Stuff landing, fumble handling, the Always Hungry eat roll, and turnover conditions.

## Requirements

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

After a successful (non-fumbled) throw, the thrown player SHALL be scattered from the aim square and then make a Right Stuff landing roll to determine how they arrive. By default the scatter SHALL use the standard Scatter template. A thrown player with Swoop MAY choose the Throw-in template and may re-roll a failed Landing when using it. Landing SHALL use an Agility Test, with -1 for a Subpar or Fumbled Throw and -1 for each opponent Marking the landing square; on a success the thrown player lands Standing, otherwise they Fall Over. If the final square is occupied, the occupant SHALL be knocked down and the thrown player SHALL Bounce from that square. This SHALL repeat until reaching an empty square, where the thrown player Falls Over, or leaving the pitch for Injury by the Crowd. The thrown player SHALL NOT finish in another player's square.

#### Scenario: Standard scatter without Swoop
- **WHEN** a thrown player is scattered and the thrown player does not use Swoop
- **THEN** the standard Scatter template is used for the thrown player's displacement

#### Scenario: Swoop uses the Throw-in template and permits a landing re-roll
- **WHEN** a thrown player with Swoop chooses the Throw-in template
- **THEN** the thrown player travels using the Throw-in template and may re-roll a failed Landing

#### Scenario: Landing on an occupied square is a crash
- **WHEN** a thrown player's final square is occupied by another player
- **THEN** the occupant is knocked down and the thrown player Bounces until reaching an empty square, where they Fall Over

#### Scenario: Failed landing leaves the thrown player Prone
- **WHEN** the Right Stuff landing roll fails
- **THEN** the thrown player is placed Prone in the landing square

### Requirement: Throw Team-mate fumble handling

A Fumbled Throw of a Throw Team-mate Action SHALL Bounce the thrown team-mate from the thrower's square and require a Landing Agility Test at -1. A successful Landing SHALL leave them Standing; a failed Landing SHALL make them Fall Over and take an Armour Roll. A fumble alone SHALL NOT cause a Turnover. A thrown ball carrier SHALL keep the ball while Bouncing, and SHALL drop it from their final landing square only if they fail to land. Landing on an occupied square SHALL use the same collision and Bounce rules as any other throw.

#### Scenario: Fumbled throw bounces and attempts to land
- **WHEN** a Throw Team-mate Action is a Fumbled Throw
- **THEN** the thrown team-mate Bounces from the thrower's square and attempts to land at -1, without an automatic Injury Roll or Turnover

### Requirement: Kick Team-mate Action

The Kick Team-mate trait SHALL allow a player to perform a Kick Team-mate Action that resolves using the Throw Team-mate rules (same eligibility, aim, scatter, and Right Stuff landing), except that a Fumbled kick SHALL immediately remove the kicked player from play and make an Injury Roll for them, and SHALL cause a Turnover. Strong Arm SHALL NOT modify a Kick Team-mate Action.

#### Scenario: Kick reuses throw resolution on success
- **WHEN** a Kick Team-mate Action does not fumble
- **THEN** the kicked player scatters and makes a Right Stuff landing roll exactly as a thrown player would

#### Scenario: Fumbled kick removes and injures the player
- **WHEN** a Kick Team-mate Action fumbles
- **THEN** the kicked player is removed from play, an Injury Roll is made for them, and a Turnover is caused

### Requirement: Always Hungry eat roll

When a player with the Always Hungry trait performs a Throw Team-mate (or Kick Team-mate) Action, before completing the throw the system SHALL roll a D6 for the thrower. On a 2+ the Action continues normally. On a 1 the thrower attempts to eat the team-mate and rolls a further D6: on a 2+ the team-mate squirms free and the Action becomes a Fumbled Throw; on a 1 the team-mate is eaten and immediately removed from the Team Draft List with no Apothecary and no Regeneration allowed. If an eaten team-mate was carrying the ball, it SHALL bounce from the thrower's square. Eating a team-mate SHALL cause a Turnover only if that team-mate held the ball.

#### Scenario: Hungry roll of 2+ proceeds normally
- **WHEN** an Always Hungry thrower rolls 2+ on the eat check
- **THEN** the Throw Team-mate Action continues to its Passing Ability Test

#### Scenario: Squirm free forces a fumble
- **WHEN** the Always Hungry eat check rolls a 1 and the follow-up roll is 2+
- **THEN** the team-mate squirms free and the Action becomes a Fumbled Throw

#### Scenario: Eaten team-mate is removed without saves
- **WHEN** the Always Hungry eat check rolls a 1 and the follow-up roll is also a 1
- **THEN** the team-mate is removed from the draft list with no Apothecary or Regeneration, any carried ball bounces, and a Turnover is caused only if the eaten player held the ball

### Requirement: Throw Team-mate turnover conditions

A failed Landing or collision SHALL cause a Turnover if the thrown player held the ball. Leaving the pitch or knocking down another player on the active team SHALL also cause a Turnover. A failed Landing without the ball, or a fumbled Throw Team-mate Action alone, SHALL NOT cause a Turnover. A fumbled Kick Team-mate Action SHALL retain its separate removal and injury rules.

#### Scenario: Standing landing is not a turnover
- **WHEN** a thrown player lands Standing in an empty square
- **THEN** no Turnover is caused by the Throw Team-mate Action

#### Scenario: Failed landing without the ball is not a turnover
- **WHEN** a thrown player without the ball fails to land without knocking down another active-team player
- **THEN** they Fall Over without causing a Turnover

#### Scenario: Failed landing with the ball is a turnover
- **WHEN** a thrown ball carrier fails to land
- **THEN** the ball Bounces from their final square and a Turnover is caused
