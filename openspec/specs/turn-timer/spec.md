# turn-timer

## Purpose

Define the online match clock: a server-timestamp-anchored per-turn countdown both players see identically without per-second writes, host-enforced auto end-turn on expiry, a per-player timeout bank that pauses the game, and host-configured timer settings.

## Requirements

### Requirement: Server-synced turn countdown

Each turn SHALL have a countdown anchored to a server timestamp plus the host-configured per-turn limit, so both players see the same deadline rather than independently drifting local clocks. Both clients SHALL display the remaining time for the active turn. The countdown SHALL be derived by clients from the stored deadline and SHALL NOT require a write per second. This requirement applies only when the host has configured a per-turn limit; when the host has selected "no time limit," no countdown is created or displayed for either client.

#### Scenario: Both players see the same countdown

- **WHEN** a turn begins and the match has a configured per-turn limit
- **THEN** both players see a countdown to the same deadline for that turn

#### Scenario: No per-second writes

- **WHEN** the countdown is running
- **THEN** clients compute remaining time locally from the stored deadline without continuous server writes

#### Scenario: No countdown shown for an unlimited match

- **WHEN** a turn begins in a match configured with "no time limit"
- **THEN** neither client displays a countdown, a frozen timer, or any other timer state for that turn

### Requirement: Auto end-turn on expiry

When the active turn's countdown reaches zero, the active player's turn SHALL end automatically. The host SHALL enforce the end-of-turn even if the active player's client is unresponsive, so a player cannot lock the game open indefinitely. Forcing the turn to end SHALL finalize any in-progress player declaration so the next team can declare actions immediately — no leftover declaration from the force-ended turn may block them. This requirement does not apply when the match is configured with "no time limit," since no countdown exists to expire.

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

#### Scenario: No forced end-turn in an unlimited match

- **WHEN** a match is configured with "no time limit" and the active player takes an arbitrarily long time
- **THEN** the host never force-ends their turn on account of time

### Requirement: Per-player timeout bank that pauses the game

Each player SHALL have a finite timeout bank (default five minutes) that they may spend to pause both the turn countdown and gameplay. While paused, the countdown SHALL freeze and commands SHALL be blocked for both players until the pausing player resumes or their bank is exhausted; elapsed pause time SHALL be deducted from that player's bank. A player SHALL NOT pause using time they no longer have.

#### Scenario: Player pauses the clock

- **WHEN** a player spends timeout to pause
- **THEN** the countdown freezes, both players see the game paused and who paused it, and neither can act until resume

#### Scenario: Pause time deducted

- **WHEN** a player resumes after pausing
- **THEN** the elapsed pause duration is subtracted from that player's timeout bank

#### Scenario: Bank exhausted

- **WHEN** a paused player's timeout bank reaches zero
- **THEN** the game automatically resumes and that player can no longer pause

### Requirement: Host-configured timer settings

The per-turn time limit and the initial timeout bank SHALL be set by the host in the lobby and applied equally to both players for the match. The per-turn time limit's options SHALL include a "no time limit" choice, in which case no per-turn countdown or auto end-turn applies for the match.

#### Scenario: Configured limits applied

- **WHEN** the host sets the per-turn limit and timeout bank and starts the match
- **THEN** both players' turn countdowns and timeout banks use those configured values

#### Scenario: Host selects no time limit

- **WHEN** the host selects "no time limit" for the per-turn limit and starts the match
- **THEN** neither player sees a per-turn countdown for the rest of the match, and turns are never auto-ended for running out of time
