# handoff-action

## Purpose

Define the Hand-off Action end to end: declaring it without needing possession of the ball first, the optional Move that precedes it, which team-mate is a legal target, how the ball transfers without a roll to throw it, why it can never be intercepted, when the activation ends, and which skills genuinely interact with it.

## Requirements

### Requirement: A Hand-off may be declared without the ball and allows a Move first

One player on the active team per Turn SHALL be able to declare a Hand-off Action. Possession SHALL NOT be required to declare it: a player may declare a Hand-off and attempt to pick the ball up as part of the Move Action they are allowed to make first. The Hand-off SHALL be offered only while a legal target could be reached — that is, while the player has a final square within their movement that is adjacent to a team-mate that is Standing and has not lost its Tackle Zone.

#### Scenario: Declared while the ball is on the ground
- **WHEN** a player without the ball declares a Hand-off, moves onto the loose ball, picks it up, and finishes adjacent to an eligible team-mate
- **THEN** the Hand-off is legal and may be performed

#### Scenario: Second Hand-off in a turn is refused
- **WHEN** a team has already performed a Hand-off Action this turn
- **THEN** no other player may declare a Hand-off Action for the rest of that turn

#### Scenario: No reachable eligible team-mate
- **WHEN** no square within the player's movement is adjacent to a Standing, Tackle-Zone-holding team-mate
- **THEN** the Hand-off Action is not offered

### Requirement: A Hand-off targets an adjacent Standing team-mate that holds its Tackle Zone

A Hand-off SHALL resolve only against a team-mate that, measured from the hander-off's final square, is adjacent, Standing, and has not lost its Tackle Zone. A team-mate that is Prone, Stunned, Distracted, or has otherwise lost its Tackle Zone SHALL NOT be a legal target, and SHALL be neither offered nor accepted, including from the headless protocol and from a networked guest.

#### Scenario: Adjacent Standing team-mate is a legal target
- **WHEN** the hander-off finishes their move adjacent to a Standing team-mate with their Tackle Zone
- **THEN** that team-mate is highlighted as a legal target and clicking them performs the Hand-off

#### Scenario: Distracted team-mate is not a legal target
- **WHEN** the only adjacent team-mate is Distracted
- **THEN** the Hand-off cannot be performed against them and the refusal states that the team-mate has lost their Tackle Zone

#### Scenario: A non-adjacent team-mate is refused
- **WHEN** a Hand-off command names a team-mate that is not adjacent to the hander-off's current square
- **THEN** the command is refused, the ball does not move, and the player keeps their declaration

### Requirement: A Hand-off transfers the ball without a throw

Performing a Hand-off SHALL place the ball in the target team-mate's square and resolve a single Catch attempt by that team-mate. No Passing Ability test, Accurate or Inaccurate result, fumble, or scatter SHALL be produced by a Hand-off, and no range or accuracy modifier SHALL apply to the transfer.

#### Scenario: No pass roll occurs
- **WHEN** a Hand-off is performed
- **THEN** no Passing Ability test is rolled and no accuracy result is reported; the only roll is the receiving team-mate's Catch

#### Scenario: A caught Hand-off gives possession
- **WHEN** the receiving team-mate passes their Catch test
- **THEN** they hold the ball, no turnover occurs, and the Hand-off is recorded as successful

#### Scenario: A dropped Hand-off bounces and is a turnover
- **WHEN** the receiving team-mate fails their Catch test and no skill saves it
- **THEN** the ball bounces from their square under the normal rules and the team suffers a Turnover

### Requirement: A Hand-off cannot be intercepted

A Hand-off SHALL NOT present the defending team with an interception opportunity, and the Hand-off targeting step SHALL NOT display a Range Ruler, pass zones, or an interception corridor.

#### Scenario: No interception offer
- **WHEN** a Hand-off is performed with an opposition player standing between or beside the two team-mates
- **THEN** no interception decision is offered to the defending coach and the ball reaches the target

#### Scenario: The hand-off step shows targets, not a range template
- **WHEN** a coach is in the Hand-off targeting step
- **THEN** legal team-mates are highlighted, and no pass range template, pass line, or interception preview is drawn

### Requirement: Movement stops when the Hand-off is attempted

A player SHALL be able to move before performing their declared Hand-off, and SHALL NOT be able to continue moving after the Hand-off has been attempted, whether it was caught or dropped. Give and Go SHALL remain the sole exception, keeping the activation open after a Hand-off that causes no Turnover.

#### Scenario: Activation ends after the hand-off
- **WHEN** a player with movement remaining performs a Hand-off
- **THEN** their activation finishes and the remaining movement is forfeited

#### Scenario: Give and Go keeps the activation open
- **WHEN** a player with Give and Go performs a Hand-off that causes no Turnover
- **THEN** the activation stays open and they may continue moving with their remaining allowance

### Requirement: Pass-only skills do not apply to a Hand-off

Skills that trigger on a Pass Action's throw — including Safe Pass, Cloud Burster, Hail Mary Pass, Dump-Off, and On the Ball — SHALL NOT trigger on a Hand-off. Skills defined against a Hand-off — Animosity's refusal and Give and Go — SHALL trigger as written.

#### Scenario: Dump-Off does not react to a hand-off
- **WHEN** a Hand-off is performed near an opponent with Dump-Off
- **THEN** no Dump-Off reaction is offered

#### Scenario: Animosity may refuse the hand-off
- **WHEN** an Animosity (X) player attempts a Hand-off to a team-mate bearing keyword X and the roll refuses it
- **THEN** the ball stays with the hander-off, their activation ends, and no Turnover occurs
