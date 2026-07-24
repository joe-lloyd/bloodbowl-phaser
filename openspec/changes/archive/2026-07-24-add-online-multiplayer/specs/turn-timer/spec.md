# turn-timer

## ADDED Requirements

### Requirement: Server-synced turn countdown

Each turn SHALL have a countdown anchored to a server timestamp plus the host-configured per-turn limit, so both players see the same deadline rather than independently drifting local clocks. Both clients SHALL display the remaining time for the active turn. The countdown SHALL be derived by clients from the stored deadline and SHALL NOT require a write per second.

#### Scenario: Both players see the same countdown

- **WHEN** a turn begins
- **THEN** both players see a countdown to the same deadline for that turn

#### Scenario: No per-second writes

- **WHEN** the countdown is running
- **THEN** clients compute remaining time locally from the stored deadline without continuous server writes

### Requirement: Auto end-turn on expiry

When the active turn's countdown reaches zero, the active player's turn SHALL end automatically. The host SHALL enforce the end-of-turn even if the active player's client is unresponsive, so a player cannot lock the game open indefinitely.

#### Scenario: Turn ends when time runs out

- **WHEN** the active player's countdown reaches zero
- **THEN** their turn ends and control passes to the opponent

#### Scenario: Unresponsive active player

- **WHEN** the countdown expires and the active player's client has not acted
- **THEN** the host ends the turn on their behalf and play continues

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

The per-turn time limit and the initial timeout bank SHALL be set by the host in the lobby and applied equally to both players for the match.

#### Scenario: Configured limits applied

- **WHEN** the host sets the per-turn limit and timeout bank and starts the match
- **THEN** both players' turn countdowns and timeout banks use those configured values
