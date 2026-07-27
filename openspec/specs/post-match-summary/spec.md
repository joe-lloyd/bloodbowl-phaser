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

SPP finalisation SHALL require explicit confirmation and SHALL be idempotent for the match. Confirmed roster-player changes SHALL persist through the team repository. An online client SHALL persist only its owned team and both clients SHALL render the host's authoritative tally/rolls. Confirming SPP for a team's first-ever completed match SHALL make that team active (team-lifecycle-modes).

#### Scenario: Summary reopened

- **WHEN** a confirmed summary is reopened
- **THEN** no SPP is applied a second time

### Requirement: The summary marks pending development but does not resolve it

The summary SHALL mark which players may or must advance after SPP is confirmed, but SHALL NOT offer skill or characteristic assignment itself. Resolving an advancement happens only in Manage Team's player development page (player-development-page). The coach MAY finish the post-match step with pending or mandatory advancement still unresolved.

#### Scenario: Mandatory spend deferred

- **WHEN** a player has reached their next Characteristic threshold after SPP is confirmed
- **THEN** the summary marks that player as must-advance and lets the coach finish post-match without resolving it there

#### Scenario: Pending development points to Manage Team

- **WHEN** the coach finishes a confirmed summary with players eligible or required to advance
- **THEN** the summary offers a route to Manage Team, where the next match launch enforces the mandatory-advance rule (player-development-page)
