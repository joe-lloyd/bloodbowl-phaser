# post-match-summary

## ADDED Requirements

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

### Requirement: Confirmed awards create deferred development

MVP and SPP confirmation SHALL update the durable team record and create pending Manage
Team development where applicable. It SHALL NOT apply a skill or characteristic from the
post-match summary.

#### Scenario: SPP threshold is reached

- **WHEN** confirmed post-match awards make a player eligible to advance
- **THEN** the summary saves the awards and creates pending development without changing
  that player's skills or characteristics
