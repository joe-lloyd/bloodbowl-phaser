# sevens-setup-rules

## Purpose

Define the pitch geometry and placement restrictions for seven-a-side (Sevens) setup — own-half placement, Wide Zone limits, the three-player Line of Scrimmage requirement, the seven-player maximum, kicking-team-first sequencing, and short-handed relaxation — enforced identically across the browser UI, online play, and the headless protocol.

## Requirements

### Requirement: A team sets up only in its own half, never between the lines
Each team SHALL set up fully within the area between its own End Zone and its own Line of Scrimmage, inclusive of both. No player SHALL be set up in the area between the two Lines of Scrimmage.

#### Scenario: A placement in the neutral zone is refused
- **WHEN** a coach attempts to place a player in a square between the two Lines of Scrimmage
- **THEN** the placement is refused and the message states that neither team may set up between the Lines of Scrimmage

#### Scenario: A placement in the opponent's half is refused
- **WHEN** a coach attempts to place a player beyond the opposing Line of Scrimmage
- **THEN** the placement is refused

#### Scenario: The own End Zone is part of the setup area
- **WHEN** a coach places a player in their own End Zone
- **THEN** the placement is allowed

### Requirement: At most one player per Wide Zone
A team SHALL set up a maximum of one player in each Wide Zone. A team MAY therefore have at most two players in Wide Zones, split one per zone.

#### Scenario: A second player in the same Wide Zone is refused
- **WHEN** a coach has one player in a Wide Zone and attempts to place a second player in that same Wide Zone
- **THEN** the placement is refused and the message states the one-player-per-Wide-Zone limit

#### Scenario: One player in each Wide Zone is allowed
- **WHEN** a coach places one player in each of the two Wide Zones
- **THEN** both placements are allowed

### Requirement: Three players stand adjacent to the Line of Scrimmage
A team SHALL set up a minimum of three players in Centre Field squares directly adjacent to its own Line of Scrimmage. A formation with fewer SHALL NOT be confirmable.

#### Scenario: An under-manned line cannot be confirmed
- **WHEN** a coach with seven players placed has only two in Centre Field squares adjacent to their Line of Scrimmage and attempts to confirm
- **THEN** confirmation is refused and the message states that three players are required adjacent to the Line of Scrimmage

#### Scenario: Wide Zone squares do not count toward the line
- **WHEN** a player is placed adjacent to the Line of Scrimmage but inside a Wide Zone
- **THEN** that player does not count toward the three-player Centre Field requirement

#### Scenario: A legal formation confirms
- **WHEN** a coach places three players in Centre Field squares adjacent to their Line of Scrimmage and the rest legally
- **THEN** the formation confirms

### Requirement: A team sets up at most seven players
A team SHALL set up no more than seven players for a drive. Any available player not chosen for the drive SHALL be placed in the Reserves box and SHALL remain available for the start of the next drive.

#### Scenario: An eighth placement is refused
- **WHEN** a coach with seven players on the pitch attempts to place an eighth
- **THEN** the placement is refused and the message states the seven-player maximum

#### Scenario: Unchosen players go to Reserves
- **WHEN** a coach with nine available players confirms a setup of seven
- **THEN** the two unchosen players are in the Reserves box and are available at the start of the next drive

### Requirement: The kicking team sets up first
Setup SHALL run in order: the kicking team places and confirms its formation, then the receiving team places and confirms its own. The team not currently setting up SHALL NOT be able to place players.

#### Scenario: The receiving team waits
- **WHEN** setup begins for a drive
- **THEN** only the kicking team can place players, and the receiving team's placement opens once the kicking team confirms

#### Scenario: The receiving team sets up against a visible defence
- **WHEN** the kicking team confirms its formation
- **THEN** the receiving coach can see that formation while placing their own players

### Requirement: Restrictions are visible and refusals name the rule
While a coach is setting up, the restrictions not yet satisfied SHALL be shown. Every refused placement or refused confirmation SHALL name the specific restriction that was violated.

#### Scenario: Outstanding restrictions are listed
- **WHEN** a coach has placed four players, none adjacent to the Line of Scrimmage
- **THEN** the setup controls show that three players are still required adjacent to the Line of Scrimmage

#### Scenario: A refusal is specific
- **WHEN** a placement is refused
- **THEN** the message names the violated restriction rather than reporting a generic invalid placement

### Requirement: A reduced team may concede without penalty before setting up
A team reduced to three or fewer available players SHALL be offered the option to concede without penalty before setting up. Declining SHALL continue the drive.

#### Scenario: The option is offered
- **WHEN** setup begins for a team with three available players
- **THEN** that coach is offered a penalty-free concession before placing anyone

#### Scenario: Conceding ends the match without penalty
- **WHEN** the coach accepts the concession
- **THEN** the match ends as a concession and the conceding team takes no additional penalty

#### Scenario: Declining continues the drive
- **WHEN** the coach declines the concession
- **THEN** setup proceeds with the players available

### Requirement: Restrictions relax for a team that cannot satisfy them
A team that cannot satisfy a restriction with the players available to it SHALL NOT be blocked by that restriction. A team playing on with three or fewer players SHALL set its available players up on the Line of Scrimmage, and SHALL be able to confirm once every available player is placed legally within its own half.

#### Scenario: Two players can still confirm
- **WHEN** a team with two available players places both on its Line of Scrimmage and confirms
- **THEN** the confirmation is accepted despite fewer than three players adjacent to the Line of Scrimmage

#### Scenario: The rules a short-handed team can satisfy still apply
- **WHEN** a team with three available players attempts to place two of them in the same Wide Zone
- **THEN** the placement is refused, because that restriction can still be satisfied

### Requirement: The same restrictions apply in the browser, online and headless
Setup validation SHALL be a single shared rule set applied identically to local play, both coaches in an online match, and the headless protocol. A formation rejected in one SHALL be rejected in all.

#### Scenario: Headless setup obeys the restrictions
- **WHEN** a headless run submits a formation with all seven players in the Wide Zones
- **THEN** the formation is rejected with the same restriction message the browser would give

#### Scenario: A guest coach's setup is validated
- **WHEN** a guest coach in an online match submits an illegal formation
- **THEN** it is refused with the same message a local coach would see
