# drive-reset

## ADDED Requirements

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
