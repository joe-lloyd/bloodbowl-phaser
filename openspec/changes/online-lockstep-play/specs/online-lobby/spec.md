## MODIFIED Requirements

### Requirement: Save and resume a match later

Players SHALL be able to leave an in-progress match and resume it later from where it paused. At every change of turn the side that may act SHALL persist the game state, the RNG state and the match stats, so that reopening the match restores the board, score, turn, dice and pending decision for both players. Either player SHALL be able to resume from that save.

#### Scenario: Save and come back

- **WHEN** a player saves and exits mid-match and later resumes it
- **THEN** the match reopens at the start of the turn that was in progress, with the same dice to come, and play continues once the opponent rejoins
