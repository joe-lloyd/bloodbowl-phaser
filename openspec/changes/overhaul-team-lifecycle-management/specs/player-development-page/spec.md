# player-development-page

## ADDED Requirements

### Requirement: Each player has a development page
Team management SHALL provide a per-player page reachable from the roster. The page SHALL show the player's name, number, position, current and base characteristics with any advances or injury reductions marked, starting skills separated from gained skills, injuries, level, SPP spent and available, and career statistics.

#### Scenario: Opening a player from the roster
- **WHEN** a coach selects a player in team management
- **THEN** that player's development page is shown with their characteristics, skills, injuries, SPP, and career statistics

#### Scenario: Advances and injuries are marked on characteristics
- **WHEN** a player has a characteristic advance and an injury reduction
- **THEN** the page shows the current value alongside the base value and marks both adjustments

#### Scenario: Gained skills are distinguished from starting skills
- **WHEN** a player has gained skills through advancement
- **THEN** the page lists starting skills and gained skills separately

### Requirement: SPP can be spent outside the post-match flow
A coach SHALL be able to spend a player's available SPP on an advancement from the development page, using the same advancement rules and costs as the post-match screen. The result SHALL be saved to the team.

#### Scenario: Spending SPP between matches
- **WHEN** a coach opens a player with enough SPP for an advancement and chooses one
- **THEN** the advancement is applied, the SPP is spent, and the team is saved

#### Scenario: Unaffordable advancements are unavailable
- **WHEN** a player does not have enough SPP for an advancement type
- **THEN** that option is shown with its cost but cannot be chosen

#### Scenario: Advancement rules are unchanged
- **WHEN** an advancement is taken from the development page
- **THEN** the same access, roll, and characteristic-cap rules apply as on the post-match screen

### Requirement: Advancement is allowed regardless of team mode
Spending SPP SHALL be permitted for both draft and active teams, since advancement is earned rather than purchased.

#### Scenario: An active team's player advances
- **WHEN** a coach spends SPP for a player on an active team
- **THEN** the advancement is applied and no active-team purchasing refusal is raised

### Requirement: Players needing attention are visible in the roster
The team view SHALL indicate which players have SPP available to spend and which must advance before the coach can continue.

#### Scenario: Available SPP is flagged
- **WHEN** a player has enough SPP for at least one advancement
- **THEN** the roster marks that player as having SPP to spend

#### Scenario: A mandatory advancement is flagged
- **WHEN** a player has reached a threshold at which they must advance
- **THEN** the roster marks that player as requiring an advancement
