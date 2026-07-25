# activation-action-completion

## ADDED Requirements

### Requirement: Clicking a target completes a pending action
When the active player has a pending targeted action (hand-off or pass) and the user clicks a valid target for that action, the system SHALL resolve the pending action against that target rather than switching selection to the clicked player.

#### Scenario: Hand-off completes on target click
- **WHEN** the active ball carrier has a pending hand-off and the user clicks an adjacent eligible teammate
- **THEN** the ball is handed off to that teammate and the action resolves, instead of the teammate becoming the newly selected player

#### Scenario: Pass completes on target click
- **WHEN** the active player has a pending pass and the user clicks an eligible receiver
- **THEN** the pass is thrown to that receiver rather than reselecting them

### Requirement: Finishing an activation resolves pending actions
Ending a player's activation SHALL explicitly resolve any pending movement, pass, or hand-off that was selected but not yet completed, so a chosen action is never silently dropped.

#### Scenario: Pending action is not lost at end of activation
- **WHEN** a player's activation is finished while a targeted action was selected but unresolved
- **THEN** the pending action is completed as part of finishing the activation
