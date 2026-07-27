# match-state-visual-sync Specification

## Purpose
TBD - created by archiving change fix-reported-match-bugs. Update Purpose after archive.
## Requirements
### Requirement: Ball possession has one synchronized representation

The game SHALL represent the ball as exactly one of a loose ball at a square or a ball
carried by one player. When a pickup succeeds during a movement route, the loose-ball
visual SHALL be removed, the carrier SHALL be marked as possessing the ball, and route
execution SHALL continue from the pickup step using the updated state.

#### Scenario: Mid-route pickup succeeds

- **WHEN** a moving player successfully picks up a loose ball before the final square of
  their declared route
- **THEN** the loose-ball sprite is removed, that player is marked as the carrier, and
  the remaining legal route steps may resolve

#### Scenario: Mid-route pickup fails

- **WHEN** a moving player fails a pickup during their route
- **THEN** the player is not marked as the carrier and the loose ball is represented at
  the square determined by the failed-pickup rules

#### Scenario: Repeated reconciliation does not duplicate the ball

- **WHEN** ball state is reconciled more than once without an intervening rules change
- **THEN** exactly one ball representation remains

### Requirement: Knocked-out players leave the pitch immediately

When an injury resolves to Knocked Out, the player SHALL be removed from pitch occupancy
and placed in their team's Knocked Out dugout box as part of the same resolved
operation.

#### Scenario: Knocked Out injury resolves

- **WHEN** an injury roll resolves a player to Knocked Out
- **THEN** the player no longer occupies a pitch square and appears once in the correct
  Knocked Out box

#### Scenario: Subsequent play ignores the removed player

- **WHEN** play continues after a player was moved to the Knocked Out box
- **THEN** pathing, marking, and target selection treat the former square as unoccupied

### Requirement: Restored activation state is visibly reconciled

After loading or restoring a match, every player who has already completed their
activation in the current turn SHALL receive the same activated visual treatment used
during uninterrupted play.

#### Scenario: Activated player is restored

- **WHEN** a save is loaded with a player already activated in the current turn
- **THEN** that player is shown with activated opacity and cannot be selected for another
  activation

#### Scenario: Available player is restored

- **WHEN** a save is loaded with a player who has not activated in the current turn
- **THEN** that player retains the available visual treatment and remains selectable

### Requirement: Punt declares a kick presentation event

Resolving Punt SHALL emit a kick declaration event before ball placement and scatter
continue. A graphical client SHALL present the kick animation, while a headless client
SHALL acknowledge the same event without requiring rendered UI.

#### Scenario: Punt is animated in a graphical match

- **WHEN** a player declares Punt
- **THEN** the kick animation is presented before the Punt ball movement resolves

#### Scenario: Punt remains testable headlessly

- **WHEN** a headless scenario declares Punt
- **THEN** the declaration event is recorded and acknowledged and the operation reaches
  the same seeded outcome without rendering

### Requirement: Reported visual regressions have deterministic end-to-end scenarios

Each reported synchronization defect SHALL have a seeded sandbox scenario that asserts
the final canonical state, emitted events, and relevant interaction availability.
Selected stable checkpoints MAY additionally maintain screenshot baselines.

#### Scenario: Regression suite runs without a browser window

- **WHEN** the gameplay end-to-end regression suite runs in CI or the sandbox
- **THEN** all synchronization scenarios can complete in Playwright headless mode

#### Scenario: Stable checkpoint is visually compared

- **WHEN** a scenario designated for visual coverage reaches its checkpoint
- **THEN** its screenshot is compared with the approved baseline using the configured
  visual tolerance

