# player-progression

## ADDED Requirements

### Requirement: SPP awarded from match statistics
At the end of a match the system SHALL convert each player's tracked statistics into Star Player Points using the 2025 award values (completion, deflection, casualty, interception, touchdown, and MVP), add them to the player's running `spp`, and record the SPP earned this match for the summary.

#### Scenario: SPP totals from a match
- **WHEN** a player finishes a match with tracked statistics (e.g. two completions, one casualty, one touchdown)
- **THEN** their `spp` increases by the sum of the corresponding SPP award values

#### Scenario: MVP contributes SPP
- **WHEN** a player receives the MVP award
- **THEN** the MVP SPP value is added to their earned SPP for the match

### Requirement: Advancement options and costs
The system SHALL offer advancements — random primary skill, chosen primary skill, random secondary skill, chosen secondary skill, and characteristic increase — each with its 2025 SPP cost, available only when the player has enough unspent SPP. Applying an advancement SHALL update the player's `skills` or `stats`, recompute `level`, `teamValue`, and `cost`, and deduct the spent SPP.

#### Scenario: Affordable advancement is offered
- **WHEN** a player has unspent SPP at or above a given advancement's cost
- **THEN** that advancement is offered as a choice

#### Scenario: Unaffordable advancement is withheld
- **WHEN** a player's unspent SPP is below an advancement's cost
- **THEN** that advancement is not selectable

#### Scenario: Applying a skill advancement
- **WHEN** a coach confirms a chosen primary skill advancement
- **THEN** the skill is added to the player, its SPP cost is deducted, and `level`/`teamValue`/`cost` are recomputed

### Requirement: Advancement is confirmed and applied once
Advancement SHALL require explicit coach confirmation and SHALL apply at most once per player per advancement, so revisiting the post-match screen cannot double-apply or double-spend.

#### Scenario: Revisiting the summary does not re-advance
- **WHEN** an advancement has already been confirmed and applied for a player
- **THEN** returning to the post-match screen does not apply it again or deduct SPP again

### Requirement: Progression persists to the saved team
Confirmed progression (added SPP, skills, stat changes, level) SHALL be written back to the owning coach's saved team through the team repository, with new fields defaulting so existing saved teams load unchanged. In online play each coach SHALL persist only their own team.

#### Scenario: Growth survives to the next match
- **WHEN** a coach confirms advancements and reloads their saved team
- **THEN** the added SPP, new skills, and stat changes are present
