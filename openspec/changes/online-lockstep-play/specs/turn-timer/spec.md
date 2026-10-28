## MODIFIED Requirements

### Requirement: Auto end-turn on expiry

When the active turn's countdown reaches zero, the active player's turn SHALL end automatically, as an end-turn command issued by the active side. If the active side's heartbeat has gone stale past the grace period, the waiting side SHALL issue it instead, so a vanished coach cannot lock the game open. Forcing the turn to end SHALL finalize any in-progress player declaration so the next team can declare actions immediately. This requirement does not apply when the match is configured with "no time limit".

#### Scenario: Turn ends when time runs out

- **WHEN** the active player's countdown reaches zero
- **THEN** their side issues an end-turn command and control passes to the opponent

#### Scenario: Unresponsive active player

- **WHEN** the countdown expires and the active side has stopped sending heartbeats
- **THEN** the waiting side ends the turn on their behalf and play continues

#### Scenario: Next team can act immediately after a forced end-turn

- **WHEN** the countdown expires while a player has a committed once-per-turn
  declaration but never finished their activation
- **THEN** the turn ends, and the new active team's first declaration succeeds

#### Scenario: No forced end-turn in an unlimited match

- **WHEN** a match is configured with "no time limit"
- **THEN** neither side ever force-ends a turn on account of time
