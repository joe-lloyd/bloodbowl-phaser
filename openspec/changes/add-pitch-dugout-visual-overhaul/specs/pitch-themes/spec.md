# pitch-themes

## ADDED Requirements

### Requirement: Selectable pitch themes
The system SHALL provide a catalog of pitch themes, each defining the pitch surface, end-zone and wide-zone treatment, and line styling, and SHALL let the host select one before a match. Local play SHALL choose from the same catalog.

#### Scenario: Host picks a theme
- **WHEN** the host selects a pitch theme before a match
- **THEN** the pitch renders with that theme's surface, zones, and lines

#### Scenario: Local play selects a theme
- **WHEN** a local (hotseat) match is started with a chosen theme
- **THEN** the pitch renders with that theme

### Requirement: Grid geometry is invariant across themes
Changing the pitch theme SHALL NOT alter the grid dimensions, square size, offsets, or the grid↔pixel mapping; only the visual presentation changes. Player placement, hit-testing, and scenario coordinates SHALL behave identically under any theme.

#### Scenario: Placement unchanged under a new theme
- **WHEN** the same scenario is loaded under two different themes
- **THEN** every player and the ball occupy the same grid squares and pixel positions

### Requirement: Themes render without required binary assets
Each theme SHALL render acceptably from drawn primitives, so a missing optional texture degrades gracefully rather than breaking the pitch.

#### Scenario: Missing texture falls back
- **WHEN** a theme's optional texture is unavailable
- **THEN** the pitch still renders that theme from drawn primitives

### Requirement: Theme is shared in online play
In an online match the host's chosen theme SHALL be conveyed to the guest so both coaches see the same field, and the choice SHALL persist with the match.

#### Scenario: Guest sees the host's theme
- **WHEN** the host has selected a theme and the guest joins the match
- **THEN** the guest's pitch renders the host's chosen theme
