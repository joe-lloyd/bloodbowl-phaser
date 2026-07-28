# team-management-layout

## Purpose

Define where per-team stats (value, treasury, roster count, record) and per-player career statistics are shown — overview vs. detail page — and how the local-play team-select screen presents a coach's saved teams at scale (search/filter, denser rows).

## Requirements

### Requirement: Team overview cards show the per-team stats summary
The Team Management overview page SHALL render each team's stats summary — team value, treasury, roster count, and win/draw/loss record — inline on that team's overview card. The team detail page MAY also show this same summary; it is not required to be removed from the detail page.

#### Scenario: Overview card shows the stats grid
- **WHEN** a coach views the Team Management overview listing their saved teams
- **THEN** each team card shows that team's value, treasury, roster count (x/11), and win/draw/loss record

#### Scenario: Detail page still shows the stats grid
- **WHEN** a coach opens a specific team's detail page
- **THEN** that team's value, treasury, roster count, and win/draw/loss record are also shown there

### Requirement: Per-player career statistics are shown on the team detail page, not the overview
The Team Management overview page SHALL NOT render per-player career statistics (games played, touchdowns, completions, casualties, kills, MVPs). The team detail page's player roster table SHALL show each player's career statistics as additional columns, one row per player.

#### Scenario: Overview omits career statistics
- **WHEN** a coach views the Team Management overview listing their saved teams
- **THEN** no team card shows a per-player career-statistics table or block

#### Scenario: Detail page roster table shows career-stat columns
- **WHEN** a coach opens a specific team's detail page and views its roster table
- **THEN** each player's row shows that player's games played, touchdowns, completions, casualties, kills, and MVPs alongside their existing name, position, stats, skills, and cost columns

#### Scenario: A player with no match history shows zeroed career stats
- **WHEN** a roster table row is shown for a player who has never taken the field
- **THEN** that player's career-stat columns display zero rather than being blank or erroring

### Requirement: Local-play team selection scales with many saved teams
The local-play team-select screen SHALL let a coach narrow a long list of saved teams by a live text filter, and SHALL present each team as a single compact row rather than the current full-size stacked card, so the page's length does not grow unusably with a large number of saved teams.

#### Scenario: Filtering narrows the list
- **WHEN** a coach types part of a team's name or roster into the team-select filter
- **THEN** only matching teams remain visible in that column's list

#### Scenario: A large team library remains navigable
- **WHEN** a coach with many saved teams opens local-play team selection
- **THEN** each team is presented as a compact row and the filter is available to find a specific team without scrolling through the entire list
