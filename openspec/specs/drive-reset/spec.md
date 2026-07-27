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

### Requirement: Prone player orientation resets at end of drive
The end-of-drive teardown that clears the pitch SHALL also reset the orientation of any player left prone. No player carried into the next drive (or into the dugout) SHALL retain the 90° prone rotation.

#### Scenario: Prone players are un-rotated when the drive ends
- **WHEN** a drive ends with one or more players prone (rendered rotated 90°)
- **THEN** those players' orientation is reset as part of the end-of-drive teardown and none remain visually rotated

### Requirement: Ball is interactable after the second-half kickoff
After the second-half kickoff resolves, the ball SHALL be interactable where it lands — available for pickup/selection — identically to the first-half kickoff. The ball SHALL NOT be left in a stuck, non-interactable state.

#### Scenario: Ball can be picked up after the second-half kickoff
- **WHEN** the second-half kickoff resolves and the ball lands on the pitch
- **THEN** a player can move to and attempt to pick up the ball, and the ball responds to interaction rather than staying stuck where it landed

### Requirement: KO recovery is rolled one player at a time and shown
The end-of-drive KO recovery SHALL roll a D6 for each knocked-out player individually. Each roll SHALL be surfaced — in the match log and on the dugout — before the next player is rolled for, so a coach can watch and verify the sequence. A result of 4 or more SHALL recover the player; 3 or less SHALL leave them knocked out.

#### Scenario: Each KO'd player gets a visible roll
- **WHEN** the drive ends with three knocked-out players
- **THEN** three separate D6 rolls are made and shown in sequence, one per player, each naming the player and the result

#### Scenario: A 4+ recovers and a 3 or less does not
- **WHEN** a knocked-out player's recovery roll is 4, 5, or 6
- **THEN** that player recovers; and **WHEN** the roll is 1, 2, or 3, that player remains knocked out

### Requirement: A recovered player is animated into the Reserves box
A player who recovers SHALL be animated from the KO box into the Reserves box, and a player who fails SHALL be shown remaining in the KO box. The animation SHALL complete before the next drive's setup begins, so the coach sets up against a settled dugout.

#### Scenario: Recovery animation precedes setup
- **WHEN** a player recovers at the end of a drive
- **THEN** they are shown moving from the KO box to the Reserves box, and setup for the next drive does not begin until that sequence has finished

### Requirement: A player exists in exactly one location
Every status transition between the pitch, Reserves, KO, and Casualty boxes SHALL move the player's single record and its single representation. A player SHALL NOT be shown in two locations at once, and SHALL NOT remain in the KO box after recovering.

#### Scenario: A recovered player is not duplicated
- **WHEN** a knocked-out player recovers and is later fielded for the next drive
- **THEN** that player appears only on the pitch, with no remaining copy in the KO box

#### Scenario: Clearing the pitch does not duplicate dugout entries
- **WHEN** the pitch is cleared at the end of a drive
- **THEN** each player appears exactly once across the Reserves, KO, and Casualty boxes

### Requirement: Recovered players are available for the next setup
A player recovered by KO recovery SHALL be in Reserves and eligible for placement in the next drive's setup, with no leftover pitch position from the previous drive.

#### Scenario: Recovered player can be placed
- **WHEN** setup for the next drive begins after a successful recovery
- **THEN** the recovered player is available to place and carries no stale grid position

