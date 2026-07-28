## MODIFIED Requirements

### Requirement: Auto end-turn on expiry

When the active turn's countdown reaches zero, the active player's turn SHALL end automatically. The host SHALL enforce the end-of-turn even if the active player's client is unresponsive, so a player cannot lock the game open indefinitely. Forcing the turn to end SHALL finalize any in-progress player declaration so the next team can declare actions immediately — no leftover declaration from the force-ended turn may block them.

#### Scenario: Turn ends when time runs out

- **WHEN** the active player's countdown reaches zero
- **THEN** their turn ends and control passes to the opponent

#### Scenario: Unresponsive active player

- **WHEN** the countdown expires and the active player's client has not acted
- **THEN** the host ends the turn on their behalf and play continues

#### Scenario: Next team can act immediately after a forced end-turn

- **WHEN** the countdown expires while a player has a committed once-per-turn
  declaration (e.g. a completed Blitz move) but never explicitly finished their
  activation
- **THEN** the turn ends, and the very next declareAction call by the new active
  team's player succeeds instead of being refused for a stale declaration
