# player-career-stats

## Purpose

Track and surface what a coach actually wants to see about a player beyond their current progression: lifetime games played, touchdowns, completions, casualties, kills, and MVPs, accumulated across every match they have appeared in and folded in exactly once per confirmed match.

## Requirements

### Requirement: Players accumulate lifetime statistics
Each player SHALL carry career statistics accumulated across matches: games played, touchdowns scored, completions, passes attempted, interceptions made, casualties inflicted, kills inflicted, squares moved, and MVP awards. These SHALL be persisted with the player.

#### Scenario: Career statistics persist across sessions
- **WHEN** a player scores a touchdown in a match and the team is later reloaded
- **THEN** that player's career touchdown total includes it

#### Scenario: A player who did not take the field records no game
- **WHEN** a match completes and a rostered player never took the field
- **THEN** their games-played total is unchanged

### Requirement: Career statistics are folded from the match summary at confirmation
Career totals SHALL be updated from the match statistics summary when the post-match result is confirmed, not continuously during play. An abandoned or unconfirmed match SHALL contribute nothing.

#### Scenario: Folding happens once per match
- **WHEN** a coach confirms the post-match summary
- **THEN** each participating player's career totals increase by exactly that match's contribution

#### Scenario: Re-confirmation does not double-count
- **WHEN** the post-match summary for an already-confirmed match is confirmed again or re-rendered
- **THEN** career totals are unchanged

#### Scenario: An abandoned match contributes nothing
- **WHEN** a match is abandoned before the post-match summary is confirmed
- **THEN** no player's career totals change

### Requirement: Career statistics are shown in team management
Team management SHALL present each player's career statistics alongside their progression, so a coach can see what a player has achieved across their career.

#### Scenario: A coach reads a player's career
- **WHEN** a coach opens a player in team management
- **THEN** that player's games played, touchdowns, completions, casualties, kills, and MVPs are shown

### Requirement: New counters are collected during the match
The match statistics tracker SHALL record squares moved and kills inflicted per player, in addition to the completions, interceptions, casualties, touchdowns, and MVPs it already records.

#### Scenario: Squares moved are counted
- **WHEN** a player moves five squares and rushes one more during a match
- **THEN** the match summary records six squares moved for that player

#### Scenario: A kill is counted separately from a casualty
- **WHEN** a player inflicts a casualty whose injury result is death
- **THEN** the match summary records both a casualty and a kill for that player
