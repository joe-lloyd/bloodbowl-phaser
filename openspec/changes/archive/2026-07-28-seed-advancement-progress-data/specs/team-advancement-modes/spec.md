## ADDED Requirements

### Requirement: Advancement mode is visible in the team overview

The Team Management overview card SHALL show each team's advancement mode
as a compact pill, alongside the existing draft/active status pill, so a
coach can tell which progression rules apply to a team without opening it.

#### Scenario: Team with a mode is listed

- **WHEN** a coach views the Team Management overview and a team has an
  advancement mode set
- **THEN** a pill naming that mode (Matched Play, Advanced League, or Sevens
  Skill Selection) is shown on that team's card

#### Scenario: Legacy team without a mode is listed

- **WHEN** a coach views a team that has never had an advancement mode
  chosen
- **THEN** no advancement-mode pill is shown for that team
