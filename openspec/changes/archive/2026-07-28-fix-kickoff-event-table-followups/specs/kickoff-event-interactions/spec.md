# kickoff-event-interactions

## ADDED Requirements

### Requirement: The event step UI always reflects current engine state
The kickoff event step's displayed selection progress (e.g. an x/x count) and, during Charge!, the currently active player and instructions SHALL always reflect the engine's current step state. A UI consumer polling or subscribing to the step SHALL observe every selection, move, placement, or Charge! advancement as it happens, not a stale snapshot from when the step began.

#### Scenario: The selection counter updates live
- **WHEN** a coach selects or deselects an eligible player during an event step
- **THEN** the displayed selection count updates to match immediately

#### Scenario: Charge!'s active player updates as the sequence advances
- **WHEN** Charge! advances from one selected player to the next
- **THEN** the displayed active player and instructions update to the new player without requiring the step to end first

### Requirement: The kickoff panel is positioned above hover/selection content and does not move
The kickoff event panel SHALL render above the selected-player and hovered-player info panels in the match HUD, in that top-to-bottom order: kickoff panel, then selected player, then hovered player. Showing or hiding hovered-player content SHALL NOT change the kickoff panel's position.

#### Scenario: Hovering a player does not move the kickoff panel
- **WHEN** a coach hovers a player while a kickoff event panel is shown
- **THEN** the kickoff panel's position is unchanged and the hovered player's info appears below the selected player's info

#### Scenario: Order is kickoff, then selected, then hovered
- **WHEN** a kickoff panel, a selected player, and a hovered player are all shown at once
- **THEN** they appear top to bottom in that order
