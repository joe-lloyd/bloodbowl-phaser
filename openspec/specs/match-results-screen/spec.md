# match-results-screen

## Purpose

Define the results screen every completed match presents at full time: the actual
outcome, both teams' participant statistics, award confirmation where the match is
progression-eligible, and a safe route onward — regardless of whether progression is
enabled, and whether the match ended normally, by concession, or by forfeit.

## Requirements

### Requirement: Full time presents a results screen

Reaching game over SHALL present a results screen for every completed local, online,
sandbox, and competition match, regardless of progression eligibility.

#### Scenario: Local match without progression

- **WHEN** a local match with progression disabled reaches full time
- **THEN** the results screen is presented

#### Scenario: Online match completes

- **WHEN** an online match reaches full time
- **THEN** both host and guest are presented with the results screen

### Requirement: The screen states the actual outcome

The screen SHALL show both team names, the played final score, and whether the match was
won, drawn, conceded, or forfeited. Concession or forfeit SHALL NOT create an artificial
touchdown, mutate the played score, or award a touchdown statistic to any player.

#### Scenario: Played win is stated

- **WHEN** a match ends normally at 2-1
- **THEN** the screen names the winner and shows 2-1

#### Scenario: Draw is stated

- **WHEN** a match ends normally at 1-1
- **THEN** the screen states that the match was drawn and shows 1-1

#### Scenario: Coach concedes

- **WHEN** a coach concedes while the played score is 0-0
- **THEN** the screen labels the concession, shows the played score as 0-0, and records no
  additional player touchdown

### Requirement: Both teams' participating-player statistics are shown

The screen SHALL show each participant's completions, thrown-team-mate results,
interceptions, casualties inflicted, and touchdowns for both teams. It SHALL derive the
figures from match tracking and omit non-participants.

#### Scenario: Statistics without progression

- **WHEN** a match with progression disabled reaches the results screen
- **THEN** both teams' participant tables are shown without an SPP column

#### Scenario: Statistics with progression

- **WHEN** an eligible match reaches the results screen
- **THEN** both teams' participant tables include confirmed SPP earned

### Requirement: Eligible awards follow the result

When progression is enabled, the screen SHALL continue from result and statistics into
MVP nomination and SPP confirmation. When progression is disabled, it SHALL explain that
the match awards no SPP. The screen SHALL NOT offer skill or characteristic advancement
selection.

#### Scenario: Progression is disabled

- **WHEN** the completed match awards no progression
- **THEN** no MVP, SPP confirmation, skill, or characteristic controls are shown

#### Scenario: Progression is enabled

- **WHEN** the match is eligible for progression
- **THEN** MVP nomination and SPP confirmation are available and no advancement selector
  is shown

### Requirement: Advancement is deferred to Manage Team

After awards are confirmed, every player eligible or required to advance SHALL be saved
as pending team development. The results screen SHALL direct the coach to Manage Team
but SHALL NOT require that development to be completed before leaving.

#### Scenario: Award makes a player eligible

- **WHEN** confirmed SPP makes a player eligible for an advancement
- **THEN** pending development is stored and Manage Team lists that player

#### Scenario: Coach leaves with pending development

- **WHEN** award recording is complete and one or more players have pending development
- **THEN** the coach can leave the results screen without choosing a skill

### Requirement: The screen always offers a safe route out

The results screen SHALL offer a route back to the main menu once required result and
award recording has completed. Pending skill or characteristic choices SHALL NOT disable
that route.

#### Scenario: Leaving a non-progression match

- **WHEN** a coach finishes reading a non-progression result
- **THEN** they can return to the main menu

#### Scenario: Award confirmation is still pending

- **WHEN** required MVP or SPP confirmation has not been recorded
- **THEN** exit may be held with the outstanding recording requirement stated

### Requirement: Competition results are recorded exactly once

When the match belongs to a competition fixture, its result SHALL be recorded against
that fixture exactly once and the screen SHALL confirm recording before the coach leaves.

#### Scenario: Fixture result is recorded

- **WHEN** a competition fixture reaches full time
- **THEN** the result is recorded and confirmation appears on the screen

#### Scenario: Screen reconnects or rerenders

- **WHEN** the results screen is entered again after that fixture result was recorded
- **THEN** no duplicate result is created

### Requirement: Full time is announced and logged

Match completion SHALL be announced on screen and written to the match log with team
names, played score, and outcome. Console output SHALL NOT be its only presentation.

#### Scenario: Match reaches full time

- **WHEN** the game-over phase begins
- **THEN** the coach receives a full-time announcement and the match log contains the
  corresponding entry
