# sideline-presentation

## Purpose
Defines the visual and interactive presentation of dugout sections and team sideline staff without obstructing reserve-management workflows.

## Requirements

### Requirement: Redesigned dugout
The dugout SHALL present the reserves, KO, and dead/injured sections as a themed sideline bench with clear section separation and team colours, while preserving the interactive grid slots used for placement and reserve management.

#### Scenario: Dugout still supports interaction
- **WHEN** the redesigned dugout is shown
- **THEN** reserve, KO, and dead sections are visually distinct and their player slots remain interactive for placement/drag as before

### Requirement: Sideline staff are shown and scaled to team counts
The system SHALL render the team's retained sideline staff — assistant coaches, cheerleaders, and other staff — along the sideline/dugout, with the number shown scaled to the counts on the team up to a per-type cap.

#### Scenario: More cheerleaders show more sprites
- **WHEN** a team has several cheerleaders
- **THEN** that many cheerleader sprites appear on the sideline, up to the cap

#### Scenario: Staff do not obstruct interaction
- **WHEN** sideline staff are rendered
- **THEN** they occupy dedicated slots and do not overlap the interactive reserve/KO/dead grids

### Requirement: Dedicated animated staff terraces
Each dugout SHALL include a separate staff terrace beside its reserve box,
behind the clear touchline lane. Cheerleaders SHALL perform a pom-pom routine,
assistant coaches and apothecaries SHALL sit in chairs, and dedicated fans
SHALL wear team scarves. All figures SHALL use the team's match colours.
Decorative loops SHALL hold still when reduced motion is requested.

#### Scenario: Both teams retain a full sideline crew
- **WHEN** both teams have staff counts at or above the drawing caps
- **THEN** all capped staff figures fit in their own terraces, separately from the player boxes and exit lane
- **AND** the overview camera includes both staff terraces

### Requirement: Medical crews collect players by the touchline
A stretcher or coffin crew SHALL start at the destination box, follow the
team's touchline lane until aligned with the patient, then enter the pitch
along that grid line. The patient SHALL remain at their injury location
until pickup. The loaded crew SHALL retrace the exact route to the box.

#### Scenario: An injured player is collected
- **WHEN** a player is knocked out, injured or killed
- **THEN** an animated pair of medics brings an empty carrier from the player's box to the player along the touchline and an aligned grid line
- **AND** after pickup the crew carries the player back along the same route

#### Scenario: An exit is interrupted
- **WHEN** the scene is reloaded or the player's box changes during an exit
- **THEN** the old trip stops and its medics and carrier are removed
- **AND** it cannot later reposition the player or leave a duplicate figure

### Requirement: Sent-off players walk around the edge
A sent-off player SHALL first walk to the touchline on their own dugout's
side, then along the lane outside the pitch, and finally into the sent-off
box. Each turn in the route SHALL be preserved by the walking animation.

#### Scenario: A player on the far side is sent off
- **WHEN** a player is sent off away from their own dugout
- **THEN** the player walks to their dugout's touchline on an aligned grid line and follows the sideline into their box
