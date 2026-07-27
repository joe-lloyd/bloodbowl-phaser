# touchdown-sequence

## ADDED Requirements

### Requirement: The TOUCHDOWN phase is owned by a handler
Entering `GamePhase.TOUCHDOWN` SHALL activate a phase handler that owns the scene for the celebration window. No unhandled-phase warning SHALL be logged for TOUCHDOWN, and the scene SHALL NOT be left without an active handler while the score is being celebrated.

#### Scenario: Scoring a touchdown activates the touchdown handler
- **WHEN** a ball carrier scores and the phase becomes TOUCHDOWN
- **THEN** the touchdown handler is entered and no `No handler for phase: TOUCHDOWN` warning is logged

#### Scenario: The previous handler is exited cleanly
- **WHEN** the phase moves from PLAY to TOUCHDOWN
- **THEN** the play handler's subscriptions are removed before the touchdown handler is entered

### Requirement: The touchdown is announced with scorer and score
The touchdown SHALL be announced with the scoring team, the scoring player, and the resulting score. The announcement SHALL be recorded in the match log as well as shown on screen.

#### Scenario: Touchdown announcement names the scorer
- **WHEN** a player scores a touchdown
- **THEN** the announcement names that player and their team and shows the updated score

### Requirement: The touchdown hands off into the end-of-drive sequence
After the celebration window the touchdown handler SHALL hand control to the end-of-drive sequence — pitch clear, KO recovery, next-drive setup — with the scoring team set as the next kicking team. The handler SHALL exit and release the scene when it does so.

#### Scenario: Scoring team kicks off the next drive
- **WHEN** the celebration window ends after a touchdown
- **THEN** the end-of-drive sequence runs and the next drive's setup begins with the scoring team as the kicking team

#### Scenario: Touchdown at the end of a half continues to halftime
- **WHEN** a touchdown is scored on the final turn of the first half
- **THEN** the sequence proceeds to halftime rather than starting a further drive in that half
