# post-match-summary

## ADDED Requirements

### Requirement: End-of-match summary screen
When a match ends the system SHALL present a summary screen showing, for both teams, each player's tracked statistics and SPP earned this match, plus team totals (final score, casualties inflicted, completions) and the match MVP.

#### Scenario: Summary lists both teams
- **WHEN** a match reaches its end
- **THEN** the summary screen displays per-player stat lines and SPP earned for both teams, the team totals, and the MVP

### Requirement: Advancement entry point
The summary screen SHALL indicate which of the coach's own players have enough SPP to advance and SHALL provide the entry point into the advancement flow for those players.

#### Scenario: Advancement is reachable for eligible players
- **WHEN** the summary is shown and one of the coach's players has enough SPP to advance
- **THEN** that player is marked advanceable and the advancement flow can be opened for them

### Requirement: Summary reflects the authoritative tally in online play
In an online match the summary SHALL render from the host's final authoritative statistics, so both coaches see identical numbers.

#### Scenario: Both coaches see the same summary
- **WHEN** an online match ends
- **THEN** both coaches' summary screens show the same per-player and team totals
