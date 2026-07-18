# action-camera

## ADDED Requirements

### Requirement: Player-controlled zoom
The system SHALL let the coach set the resting camera zoom, including a "fit whole pitch" option, and SHALL treat that zoom as the state the camera returns to after any tracked action.

#### Scenario: Coach zooms in
- **WHEN** the coach increases the zoom setting
- **THEN** the camera zooms in and, after any action-follow completes, returns to that zoom rather than a fixed default

#### Scenario: Fit whole pitch
- **WHEN** the coach selects "fit whole pitch"
- **THEN** the camera frames the entire pitch and holds that view

### Requirement: Action and ball tracking
When enabled, the camera SHALL follow the acting player and the ball — whoever is currently activating or in motion — driven by gameplay events, and the ball follow SHALL remain engaged for the full travel of the ball rather than only its first leg.

#### Scenario: Follow the activating player
- **WHEN** a player activates and moves with follow enabled
- **THEN** the camera tracks that player

#### Scenario: Ball is followed to rest
- **WHEN** the ball is kicked or thrown and scatters across multiple squares
- **THEN** the camera keeps following the ball until it comes to rest

### Requirement: Follow intensity including off
The system SHALL provide a single follow-intensity control ranging from off (camera stays back, no follow) through light to close chase, mapping to how tightly and how zoomed-in the camera tracks. When off, gameplay actions SHALL NOT move the camera from the coach's resting view.

#### Scenario: Follow turned off keeps the camera back
- **WHEN** follow intensity is set to off and a player activates and moves
- **THEN** the camera does not re-center or zoom onto the action

#### Scenario: Close chase tracks tightly
- **WHEN** follow intensity is set to close and the ball moves
- **THEN** the camera zooms in and tracks the ball closely

### Requirement: Per-viewer persisted settings applied live
Camera zoom and follow-intensity settings SHALL be stored per viewer, persisted across sessions, applied immediately without restarting the match, and independent of online/host state so each viewer controls only their own camera.

#### Scenario: Settings persist and apply live
- **WHEN** a coach changes camera settings mid-match and later reloads
- **THEN** the new settings take effect immediately and are restored on reload

#### Scenario: Online viewers are independent
- **WHEN** two coaches in one online match set different camera settings
- **THEN** each sees their own camera behavior with no effect on the other
