# board-overlay-camera-sync

## ADDED Requirements

### Requirement: The camera publishes its state
The camera SHALL emit a state change whenever it leaves or returns to its neutral framing, carrying the transition duration. Consumers SHALL be able to react to camera movement without knowing which specific move is running.

#### Scenario: Taking over the camera publishes an active state
- **WHEN** the camera begins tracking the ball for a kickoff
- **THEN** a camera-state change to active is emitted with the transition duration

#### Scenario: Resetting the camera publishes a neutral state
- **WHEN** the camera resets to its neutral framing
- **THEN** a camera-state change to neutral is emitted with the transition duration

### Requirement: Board labels fade out while the camera is active
The board-label overlay — dugout section headers, sideline crew, and end-zone team names — SHALL scale up slightly and fade to fully transparent when the camera leaves neutral, over the published transition duration. Faded labels SHALL NOT remain visible over a zoomed pitch.

#### Scenario: Team names do not hang over the kickoff zoom
- **WHEN** the action camera zooms to follow the kickoff
- **THEN** the end-zone team names and dugout labels scale up and fade out rather than staying fixed on screen

### Requirement: Board labels return when the camera resets
When the camera returns to neutral, the overlay SHALL scale back to its resting size and fade back in over the published transition duration, landing in the same positions it held before.

#### Scenario: Labels return after the kickoff
- **WHEN** the camera resets after the kickoff resolves
- **THEN** the board labels fade back in at their original positions and size

### Requirement: The behavior is driven by camera state, not by individual moves
The overlay's response SHALL be bound to the camera-state event alone. Adding a new camera move SHALL require no change to the overlay.

#### Scenario: A new camera move inherits the behavior
- **WHEN** a camera move other than the kickoff track takes the camera out of neutral
- **THEN** the board labels fade out and back in with no overlay-specific code for that move
