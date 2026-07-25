# sideline-presentation

## ADDED Requirements

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
