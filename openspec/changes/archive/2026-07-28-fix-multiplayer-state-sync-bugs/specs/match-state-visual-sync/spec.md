## MODIFIED Requirements

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
