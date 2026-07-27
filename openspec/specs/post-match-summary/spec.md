# post-match-summary

## Purpose

Define the post-match progression flow for a progression-enabled match: the summary and
statistics are presented for every completed match regardless of eligibility, coaches
review both teams' stats and assign MVP and SPP before confirmation, concessions adjust
SPP, confirmation is idempotent and persists owned teams, and confirmed awards are handed
off as pending team development for Manage Team to complete — not applied from the
summary itself.

## Requirements

### Requirement: The summary is presented for every completed match

The post-match summary SHALL be presented whenever a match reaches game over.
Progression eligibility SHALL determine whether awards are offered, not whether the
result and statistics are presented.

#### Scenario: Ineligible match completes

- **WHEN** a match ineligible for progression reaches full time
- **THEN** its result and statistics are shown without award or advancement controls

#### Scenario: Eligible match completes

- **WHEN** a progression-eligible match reaches full time
- **THEN** its result, statistics, MVP nomination, and SPP confirmation are shown without
  direct advancement controls

### Requirement: Match statistics are independent of progression

Per-player participation and match statistics SHALL be readable for every completed
match. Eligibility SHALL affect only whether SPP is awarded and displayed.

#### Scenario: Statistics exist without SPP

- **WHEN** a summary is built for a match that awards no SPP
- **THEN** participation, completions, interceptions, casualties, and touchdowns remain
  available while SPP is zero and hidden

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

### Requirement: Confirmed awards create deferred development

MVP and SPP confirmation SHALL update the durable team record and create pending Manage
Team development where applicable. It SHALL NOT apply a skill or characteristic from the
post-match summary.

#### Scenario: SPP threshold is reached

- **WHEN** confirmed post-match awards make a player eligible to advance
- **THEN** the summary saves the awards and creates pending development without changing
  that player's skills or characteristics
