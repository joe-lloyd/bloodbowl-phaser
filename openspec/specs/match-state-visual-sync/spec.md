# match-state-visual-sync Specification

## Purpose
Defines how the visible board is kept in step with authoritative match state: exactly one ball representation and one carrier marker, players drawn only where their record puts them, activation styling that survives a restore, and action presentation (such as the Punt kick) that resolves at the animation boundary rather than teleporting state.
## Requirements
### Requirement: Ball possession has one synchronized representation

The game SHALL represent the ball as exactly one of a loose ball at a square or a ball
carried by one player. When a pickup succeeds during a movement route, the loose-ball
visual SHALL be removed, the carrier SHALL be marked as possessing the ball, and route
execution SHALL continue from the pickup step using the updated state. When ball-position
reconciliation runs in response to a networked event bundle (guest applying the host's
play), it SHALL read state that already reflects that same bundle's authoritative
snapshot — never a previously-applied bundle's state.

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

#### Scenario: Guest's ball visual matches the bundle just applied

- **WHEN** the guest receives a bundle whose events include a ball-position-changing
  event (e.g. `BallPlaced`, `BallPickup`) alongside an updated snapshot
- **THEN** the ball reconciliation triggered by that event renders the ball at the
  position given in that same bundle's snapshot, not the position from the
  previously-applied bundle

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

### Requirement: A non-controlled team never shows a blanket team-turn highlight in an online match

In an online match, a coach SHALL NOT see the blanket "active team" white square highlight on any player of the team they do not control. This applies regardless of whose turn it is. The yellow (prone) and orange (stunned) status border colors, and the reduced-opacity treatment for players who have already been activated this turn, are status information rather than team-selectability and SHALL continue to render for both teams exactly as before.

#### Scenario: Opponent's turn shows no blanket highlight

- **WHEN** it becomes the opposing team's turn in an online match
- **THEN** none of that team's players show the white active-team square highlight on the local coach's screen

#### Scenario: My own team is unaffected

- **WHEN** it is the local coach's own team's turn
- **THEN** their own players show the white active-team square highlight exactly as before

#### Scenario: Status borders are unaffected

- **WHEN** an opposing player is Prone or Stunned
- **THEN** their yellow or orange status border still renders regardless of who controls that team

#### Scenario: Offline/local play is unaffected

- **WHEN** a match is played locally with no online match active
- **THEN** the active team's white square highlight renders for whichever team's turn it is, exactly as before

### Requirement: A single live indicator shows the opposing coach's current selection

In an online match, the local coach SHALL see a distinct live indicator (a red ring) on at most one player of the opposing team at a time: the player the opposing coach currently has selected. This indicator SHALL update as the opposing coach changes their selection or deselects, and is independent of the local coach's own selection highlighting. The indicator SHALL also be cleared at each turn boundary so a stale selection (e.g. from a coach who disconnected mid-selection) cannot persist past the turn that produced it.

#### Scenario: A red ring appears on the opponent's selected player

- **WHEN** the opposing coach selects one of their own players
- **THEN** the local coach's board shows a red ring on that specific player and no other opposing player

#### Scenario: The indicator moves with the opponent's selection

- **WHEN** the opposing coach selects a different one of their own players
- **THEN** the red ring moves from the previous player to the newly selected one

#### Scenario: The indicator clears on deselection

- **WHEN** the opposing coach deselects their player
- **THEN** the red ring no longer appears on the board

#### Scenario: The indicator does not interfere with local selection

- **WHEN** the local coach has one of their own players selected while the opposing coach also has a player selected
- **THEN** both the local yellow selection highlight and the opponent's red ring render independently without one clobbering the other

#### Scenario: The indicator does not persist past a turn boundary

- **WHEN** a new turn starts, whether or not the previously selecting coach sent an updated selection (including if they disconnected)
- **THEN** any remote-selection red ring from the prior turn is cleared

