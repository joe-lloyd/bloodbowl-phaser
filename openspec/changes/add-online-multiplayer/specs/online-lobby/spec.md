# online-lobby

## ADDED Requirements

### Requirement: Host and join by match code

The main menu SHALL offer Host Game and Join Game. Hosting SHALL create a lobby document with a short human-enterable match code; joining SHALL locate that lobby by its code and add the joining player as the guest. A code that does not exist, is full, or is no longer joinable SHALL fail with a clear, user-visible reason and SHALL NOT create partial state.

#### Scenario: Host creates a lobby

- **WHEN** a signed-in user chooses Host Game
- **THEN** a lobby is created, the user is its host, and a match code is displayed to share

#### Scenario: Guest joins by code

- **WHEN** a signed-in user enters a valid, open match code and joins
- **THEN** they are added to that lobby as the guest and both players see each other present

#### Scenario: Invalid or full code

- **WHEN** a user submits a code that is unknown or whose lobby is already full
- **THEN** they are told joining failed and no lobby membership is created

### Requirement: Per-player team selection

Within the lobby, each player SHALL choose which of their own saved teams to bring; a player SHALL only see and select from their own team library. Each player's selection SHALL be visible to both players. A player SHALL NOT be able to select or alter the opponent's team.

#### Scenario: Each player brings their own team

- **WHEN** both players have each selected a team from their own libraries
- **THEN** both players see both chosen teams before the match starts

#### Scenario: Cannot pick opponent's team

- **WHEN** a player views the lobby
- **THEN** the team picker offers only their own teams and provides no control over the opponent's selection

### Requirement: Ready-up and wait-for-everyone gating

The match SHALL NOT start until both players have joined, each has selected a team, and each has marked ready. Until then each player SHALL see a clear waiting state indicating what is still outstanding.

#### Scenario: Match starts when all ready

- **WHEN** both players have selected a team and marked ready
- **THEN** the host starts the match and both clients transition from the lobby to the game

#### Scenario: Blocked until ready

- **WHEN** one player has not yet selected a team or readied
- **THEN** the match cannot start and both players see who or what the lobby is waiting on

### Requirement: Host-controlled match settings

The host SHALL be able to configure match settings in the lobby before start — at minimum the per-turn time limit and each player's initial timeout bank. The chosen settings SHALL apply to both players for the match. Only the host SHALL be able to change them.

#### Scenario: Host sets the turn timer

- **WHEN** the host sets the per-turn time limit in the lobby and starts the match
- **THEN** both players' turn timers use that limit for the whole match

#### Scenario: Guest cannot change settings

- **WHEN** the guest views the lobby settings
- **THEN** the settings are read-only for them
