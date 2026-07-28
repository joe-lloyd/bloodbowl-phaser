# team-management-layout

## ADDED Requirements

### Requirement: Detailed team stats live on the team detail page, not the overview
The Team Management overview page SHALL NOT render a team's detailed stats block (team value, treasury, roster count, win/draw/loss record) inline in its team-browsing cards. That stats block SHALL instead be shown on the team's own detail page.

#### Scenario: Overview card omits the stats grid
- **WHEN** a coach views the Team Management overview listing their saved teams
- **THEN** no team card shows the team value/treasury/roster-count/record grid

#### Scenario: Detail page shows the stats grid
- **WHEN** a coach opens a specific team's detail page
- **THEN** that team's value, treasury, roster count, and win/draw/loss record are shown

### Requirement: Local-play team selection scales with many saved teams
The local-play team-select screen SHALL let a coach narrow a long list of saved teams by a live text filter, and SHALL present each team as a single compact row rather than the current full-size stacked card, so the page's length does not grow unusably with a large number of saved teams.

#### Scenario: Filtering narrows the list
- **WHEN** a coach types part of a team's name or roster into the team-select filter
- **THEN** only matching teams remain visible in that column's list

#### Scenario: A large team library remains navigable
- **WHEN** a coach with many saved teams opens local-play team selection
- **THEN** each team is presented as a compact row and the filter is available to find a specific team without scrolling through the entire list
