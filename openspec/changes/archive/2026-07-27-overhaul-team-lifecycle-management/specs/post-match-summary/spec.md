# post-match-summary

## MODIFIED Requirements

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
