# reroll-decisions

## Purpose

Define how failed eligible rolls offer a reroll — as a browser dialog and a headless `reroll` pending decision — with centrally enforced reroll constraints and deterministic, observable outcomes drawn from the seeded dice service.

## Requirements

### Requirement: Failed eligible rolls offer a reroll decision
When a roll fails and a reroll source is available (a skill reroll for that roll kind, or a team reroll on the acting team's turn), the system SHALL pause and offer the choice to the acting team before applying the failure — as a dialog in the browser and as a `pendingDecision` of type `reroll` in the headless protocol, answered by a `use-reroll` command.

#### Scenario: Headless reroll decision
- **WHEN** a pickup fails for a player with Sure Hands during a headless command
- **THEN** the response carries a pending reroll decision naming the player, source skill, and roll kind, and other game commands are rejected until it is answered

#### Scenario: Declining applies the original failure
- **WHEN** the reroll offer is declined
- **THEN** the original failure resolves exactly as it would have without the offer, consuming no reroll and no additional dice

### Requirement: Reroll constraints enforced centrally
The system SHALL enforce: a reroll may not be rerolled; a skill reroll is usable once per action; a team reroll is usable once per team turn, only on that team's turn, and decrements the team's reroll counter. When both sources are available the acting team chooses which to spend.

#### Scenario: No reroll of a reroll
- **WHEN** a rerolled roll fails again
- **THEN** no further reroll is offered for that roll

#### Scenario: Team reroll limited per turn
- **WHEN** a team has already used a team reroll this turn and another eligible roll fails
- **THEN** only skill sources (if any) are offered

### Requirement: Rerolls are deterministic and observable
Rerolls SHALL draw from the same seeded dice service, and a `RerollUsed` event SHALL report source, roll kind, and before/after results. Identical seeds and identical decisions SHALL produce identical outcomes.

#### Scenario: Deterministic replay across reroll paths
- **WHEN** two games run with the same seed and the same accept/decline answers
- **THEN** all dice results and outcomes are identical
