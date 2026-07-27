# match-log-entries

## Purpose

Every roll and its outcome is recorded in the Dice Log with the result and its rulebook meaning, not just the raw dice, so the match history stays legible after the transient on-screen message is gone.

## Requirements

### Requirement: Every roll outcome is recorded in the match log
A roll and the outcome it produced SHALL both appear in the Dice Log. The entry SHALL carry the roll value, a headline naming the result, and a detail line stating what the result means in play. An outcome SHALL NOT be delivered only as a transient on-screen message.

#### Scenario: The weather roll records its table result
- **WHEN** the weather is rolled at the start of a match
- **THEN** the log contains an entry with the 2D6 value, the named weather condition, and its effect on play

#### Scenario: The kickoff table records its event
- **WHEN** the kickoff table is rolled
- **THEN** the log contains an entry with the roll, the named kickoff event, and what the event does

#### Scenario: A skill trigger records its effect
- **WHEN** a skill triggers during a roll
- **THEN** the log records which skill triggered and the effect it had on the outcome

### Requirement: Outcome text is authored by the rule that resolved it
The sentence describing a result SHALL be produced by the code that resolved the rule — the weather table, the kickoff table, or the skill rule — and carried on the log entry. The HUD SHALL NOT map roll values to descriptions.

#### Scenario: Log detail matches the applied table entry
- **WHEN** any table-driven result is resolved
- **THEN** the description shown in the log is the one supplied by the resolver for the entry it actually applied

### Requirement: Log entries are attributable and ordered
Each entry SHALL record when it happened and, where the outcome belongs to a team, which team it belongs to. Entries SHALL be presented newest first and SHALL survive later entries being added, up to the log's retention limit.

#### Scenario: A team-attributable entry is marked
- **WHEN** a player makes a dodge roll
- **THEN** the resulting entry is attributed to that player's team

#### Scenario: A neutral entry is not attributed to a coach
- **WHEN** the weather or kickoff table is rolled
- **THEN** the entry is recorded without being attributed to either coach

### Requirement: Both coaches see the same log in an online match
In an online match the log entries a guest sees SHALL match those the host produces, in the same order.

#### Scenario: Guest log matches host log
- **WHEN** a host resolves the weather and the kickoff table in an online match
- **THEN** the guest's log contains the same entries with the same rolls, headlines, and details
