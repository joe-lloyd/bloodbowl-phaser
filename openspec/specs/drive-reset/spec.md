# drive-reset

## Purpose

Define how a drive ends and the next one begins: clearing the pitch back to the dugouts, rolling KO recovery, determining the kicking team without a repeated coin flip, and carrying halftime through into a playable second half — consistently in the browser and through the headless protocol.

## Requirements

### Requirement: Pitch clears at end of every drive
At the end of a drive (touchdown scored, or halftime reached), the system SHALL return every player to their team dugout: pitch positions cleared, placement bookkeeping reset, and status set to Reserves — except knocked-out players (KO box until recovered), and injured/dead players (out for the match). The ball SHALL be removed from the pitch until the next kickoff.

#### Scenario: Touchdown clears the pitch
- **WHEN** a touchdown is scored
- **THEN** after the end-of-drive sequence no player has a pitch position, the ball position is null, and all previously standing/prone/stunned players are in Reserves

#### Scenario: Placement state does not leak between drives
- **WHEN** the next drive's setup begins
- **THEN** the setup is not reported complete until the team actually places its players for this drive

### Requirement: KO recovery rolled at end of drive
At the end of each drive the system SHALL roll KO recovery for every knocked-out player using the deterministic dice service, per the Blood Bowl 2025 rulebook threshold, and emit a per-player event with the roll and outcome. Recovered players return to Reserves and may be set up for the next drive; unrecovered players stay in the KO box.

#### Scenario: KO player recovers
- **WHEN** the end-of-drive KO recovery roll succeeds for a knocked-out player
- **THEN** an event reports the roll and recovery, and the player can be placed during the next setup

#### Scenario: KO player stays out
- **WHEN** the roll fails
- **THEN** an event reports the failure and the player cannot be placed during the next setup

### Requirement: Kicking team determined without a coin flip after drive one
The coin flip SHALL occur exactly once, before the first drive. For every later drive the system SHALL determine the kicking team automatically: after a touchdown the scoring team kicks; at halftime the team that kicked off the first half receives (kick-off swaps for the second half).

#### Scenario: Post-touchdown kickoff
- **WHEN** a team scores and the next drive begins
- **THEN** setup starts with the scoring team as the kicking team and no coin flip occurs

#### Scenario: Second-half kickoff swaps
- **WHEN** the first half ends
- **THEN** setup starts with the first-half receiving team as the second-half kicking team and no coin flip occurs

### Requirement: Halftime continues into a playable second half
The halftime sequence SHALL run the full end-of-drive steps (pitch clear, KO recovery), reset both teams' turn counts, mark the second half, and enter setup — from which a normal kickoff and second-half play proceed to GAME_OVER. This SHALL work identically in the browser and through the headless protocol.

#### Scenario: Full match through halftime headless
- **WHEN** a headless match plays past turn 6 of both teams
- **THEN** the pitch clears, setup and kickoff run without a coin flip, and second-half turns are playable through to GAME_OVER

#### Scenario: Browser reaches second half
- **WHEN** the first half ends in the browser game
- **THEN** players appear back in the dugouts, KO recovery results are shown, and the setup UI opens for the second-half kicking team without the coin-flip overlay
