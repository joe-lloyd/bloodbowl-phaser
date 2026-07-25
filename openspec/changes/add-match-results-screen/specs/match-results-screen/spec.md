# match-results-screen

## ADDED Requirements

### Requirement: Full time presents a results screen
Reaching the game-over phase SHALL present a results screen to the coach. The screen SHALL appear for every completed match — local, online, sandbox, and competition fixtures — and SHALL NOT depend on whether progression is enabled.

#### Scenario: A local match with progression disabled shows results
- **WHEN** a local match with progression disabled reaches full time
- **THEN** the results screen is presented

#### Scenario: An online match shows results to both coaches
- **WHEN** an online match reaches full time
- **THEN** both the host and the guest are presented with the results screen

### Requirement: The results screen states the outcome
The screen SHALL show both team names, the final score, and the outcome — which team won, or that the match was drawn. Where the match ended by concession or forfeit, that SHALL be stated.

#### Scenario: A win is stated
- **WHEN** a match ends 2–1
- **THEN** the screen names the winning team and shows the final score

#### Scenario: A draw is stated
- **WHEN** a match ends 1–1
- **THEN** the screen states the match was drawn and shows the final score

#### Scenario: A concession is stated
- **WHEN** a match ends because a coach conceded
- **THEN** the screen states that the match ended by concession

### Requirement: Per-player match statistics are shown for both teams
The screen SHALL show, for every player who took part, their completions, thrown team-mate results, interceptions, casualties inflicted, and touchdowns. Both teams' statistics SHALL be visible to both coaches. Statistics SHALL come from the stats tracked during the match.

#### Scenario: Statistics are shown without progression
- **WHEN** a match with progression disabled reaches the results screen
- **THEN** each team's per-player statistics table is shown, without an SPP column

#### Scenario: Statistics are shown with progression
- **WHEN** a match with progression enabled reaches the results screen
- **THEN** each team's per-player statistics table is shown, including SPP earned

#### Scenario: Non-participants are omitted
- **WHEN** a rostered player never took the field
- **THEN** that player is not listed in the statistics table

### Requirement: Progression follows the results rather than gating them
When progression is enabled, the screen SHALL continue from the results into MVP nomination, SPP confirmation, and player advancement. When progression is disabled, the screen SHALL state that this match awards no SPP and offer no progression controls.

#### Scenario: Progression sections appear only when enabled
- **WHEN** progression is disabled
- **THEN** no MVP, SPP, or advancement controls are shown, and the screen explains that this match awards no SPP

#### Scenario: Progression flow is reachable when enabled
- **WHEN** progression is enabled
- **THEN** MVP nomination, SPP confirmation, and advancement are available after the results

### Requirement: The screen always offers a way out
The results screen SHALL always offer a route back out of the match. Where progression is enabled and a player must advance, the exit MAY be held until that requirement is met, and the reason SHALL be stated.

#### Scenario: Leaving a non-progression match
- **WHEN** a coach finishes reading the results of a match with progression disabled
- **THEN** they can leave the match and return to the main menu

#### Scenario: A required advancement is explained
- **WHEN** a player must advance before the coach can finish
- **THEN** the exit is disabled and the screen states which requirement is outstanding

### Requirement: A competition fixture result is recorded and confirmed
When the match was launched as a competition fixture, the result SHALL be recorded against that fixture, and the screen SHALL confirm the recording before the coach leaves. The result SHALL be recorded exactly once.

#### Scenario: Fixture result recorded and confirmed
- **WHEN** a competition fixture reaches full time
- **THEN** the fixture result is recorded and the results screen confirms it was recorded

#### Scenario: The result is not recorded twice
- **WHEN** the results screen is re-rendered after the result has already been recorded
- **THEN** no second result is recorded

### Requirement: Full time is announced and logged
The end of the match SHALL be announced on screen and recorded in the match log, naming the teams, the score, and the outcome. The console SHALL NOT be the only place the result appears.

#### Scenario: Full time reaches the coach
- **WHEN** a match reaches full time
- **THEN** an on-screen full-time announcement is raised and a matching entry is written to the match log
