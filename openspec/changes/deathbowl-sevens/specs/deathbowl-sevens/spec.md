## ADDED Requirements

### Requirement: Admin-only entry

Only an admin SHALL see and reach the Deathbowl Sevens entry. A match seats the admin's team and three computer teams, each meeting DB-D1 to DB-D5.

#### Scenario: Non-admin

- **WHEN** a signed-in non-admin opens the Deathbowl route
- **THEN** they are sent to the main menu and no menu row shows the mode

#### Scenario: Team that does not qualify

- **WHEN** the admin picks a team over 700,000 or with fewer than 8 players
- **THEN** the lobby names each failed rule and does not start the match

### Requirement: Plus pitch and seats

The match SHALL play on the DB-P1 plus with seats North, East, South and West attacking as DB-P2 says, and score only in each team's own target end zone (DB-P3).

#### Scenario: Corner is crowd

- **WHEN** a player is pushed into a corner square
- **THEN** it is a crowd push

#### Scenario: Wrong end zone

- **WHEN** a North carrier stands in East's target end zone
- **THEN** no touchdown is scored

### Requirement: Set-up, opening balls and turn order

Teams SHALL set up in turn order under DB-S1, two balls SHALL start on distinct D8 centre squares (DB-S2), and turns SHALL go clockwise in the first half and anticlockwise in the second (DB-S3) for 8 turns per team per half (DB-F1).

#### Scenario: A full match of turns

- **WHEN** every team ends every turn at once
- **THEN** the turns run in the DB-S3 order, 64 in all, and the match ends

### Requirement: Continuous touchdowns

A touchdown SHALL score without ending the drive. The scored ball, and a second ball the scoring team holds, SHALL re-enter under DB-F2 and DB-F3. Knock-out rolls and reserve moves SHALL follow when the turn ends (DB-F4).

#### Scenario: Scoring on the team's own turn

- **WHEN** a carrier scores with movement left
- **THEN** its ball re-enters at the centre, the carrier may finish its move, and the team's turn then ends

#### Scenario: Scoring on another team's turn

- **WHEN** a block pushes a carrier into its own target end zone
- **THEN** the carrier's team scores, its ball re-enters, and the blocking team's turn goes on

### Requirement: Actions against several teams

A team SHALL be able to Blitz and Foul each opposing team once per turn, and make two Passes and two Hand-offs with no ball or player thrown twice (DB-A1, DB-A2). Third teams SHALL be asked whether to assist, in clockwise order (DB-A4).

#### Scenario: Second Blitz against another team

- **WHEN** a team has Blitzed East and declares a Blitz against South
- **THEN** the declaration is accepted, and a second Blitz against East is refused

#### Scenario: Lent assist

- **WHEN** an unmarked West player beside the defender is offered to North's block and West agrees
- **THEN** the block counts the assist

### Requirement: Two balls

No player SHALL hold two balls and two balls SHALL never rest on one square (DB-B1). Passes SHALL obey DB-B2, and interception attempts DB-B3.

#### Scenario: Carrier meets the other ball

- **WHEN** a ball bounces onto a standing carrier of the other ball
- **THEN** the carrier cannot catch it and it bounces on

### Requirement: Points and placings

The match SHALL score points under DB-R1 and place teams under DB-R2. Points SHALL only go to a team whose player caused them.

#### Scenario: Shared place

- **WHEN** two teams end level on points
- **THEN** both are shown in the same place

### Requirement: Computer coaches

A computer coach SHALL play any seat at every difficulty, using Deathbowl weights fitted from four-seat self-play.

#### Scenario: Four computer seats

- **WHEN** four planner coaches play 200 matches headless
- **THEN** every match reaches full time with no invariant findings and every seat scores

### Requirement: Exhibition and resume

A Deathbowl match SHALL write nothing to team careers, competitions or Firestore, and SHALL save to its own local slot that resumes to the same state.

#### Scenario: Reload mid-turn

- **WHEN** the browser reloads during a computer seat's turn
- **THEN** the match resumes to the same snapshot hash, and an existing Sevens save is untouched
