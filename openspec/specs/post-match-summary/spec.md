# post-match-summary

## Purpose

Define the post-match progression flow for a progression-enabled match: coaches review both teams' stats and assign MVP and SPP before confirmation, concessions adjust SPP, confirmation is idempotent and persists owned teams, and advancements are completed from the summary.

## Requirements

### Requirement: Coaches complete SPP assignment before confirmation

For a progression-enabled completed match, the system SHALL show both teams' statistics, require each coach to nominate six participating players (or every participant when fewer than six), assign them unique slots 1-6, roll a seeded D6 for MVP, assign any awarded concession-touchdown SPP, and review final earned SPP before confirmation.

#### Scenario: MVP roll

- **WHEN** six eligible players occupy slots 1-6 and the coach rolls a 4
- **THEN** the player assigned slot 4 receives MVP and 4 SPP

#### Scenario: Awarded touchdown

- **WHEN** a team receives a touchdown through concession
- **THEN** its coach assigns that touchdown's 3 SPP to an eligible player of their choice

### Requirement: Concessions adjust SPP

A conceding team SHALL lose all SPP earned in that match and receive no MVP. The opponent SHALL receive a second MVP. A concession without penalty SHALL preserve the rules that apply to that concession type.

#### Scenario: Standard concession

- **WHEN** a team concedes
- **THEN** its earned SPP is zeroed, it cannot nominate an MVP, and the opponent completes two MVP awards

### Requirement: Confirmation is only-once and persists owned teams

SPP finalisation and each advancement SHALL require explicit confirmation and SHALL be idempotent for the match. Confirmed roster-player changes SHALL persist through the team repository. An online client SHALL persist only its owned team and both clients SHALL render the host's authoritative tally/rolls.

#### Scenario: Summary reopened

- **WHEN** a confirmed summary is reopened
- **THEN** no SPP or advancement is applied a second time

### Requirement: Advancement is completed from the summary

The summary SHALL mark players who may or must advance and provide all legal skill and characteristic workflows, including visible dice results, SPP cost, value change, and final confirmation.

#### Scenario: Mandatory spend

- **WHEN** a player has reached their next Characteristic threshold
- **THEN** the coach cannot finish the post-match progression step until that player buys a legal advancement
