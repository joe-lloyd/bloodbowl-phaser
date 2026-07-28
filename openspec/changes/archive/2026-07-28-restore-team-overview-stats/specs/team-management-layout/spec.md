## MODIFIED Requirements

### Requirement: Team overview cards show the per-team stats summary
The Team Management overview page SHALL render each team's stats summary — team value, treasury, roster count, and win/draw/loss record — inline on that team's overview card. The team detail page MAY also show this same summary; it is not required to be removed from the detail page.

#### Scenario: Overview card shows the stats grid
- **WHEN** a coach views the Team Management overview listing their saved teams
- **THEN** each team card shows that team's value, treasury, roster count (x/11), and win/draw/loss record

#### Scenario: Detail page still shows the stats grid
- **WHEN** a coach opens a specific team's detail page
- **THEN** that team's value, treasury, roster count, and win/draw/loss record are also shown there

## ADDED Requirements

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
