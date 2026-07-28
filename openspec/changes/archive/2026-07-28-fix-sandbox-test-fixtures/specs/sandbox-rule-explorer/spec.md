## ADDED Requirements

### Requirement: Default sandbox matchup is never a mirror-match
When the sandbox starts with no explicit teams and no scenario loaded, it SHALL default to two different rosters — Human for team 1 and Orc (not Black Orc) for team 2 — so the two sides are visually distinguishable by team color and roster at a glance, without hovering over individual players.

#### Scenario: Fresh sandbox load shows distinguishable sides
- **WHEN** the sandbox scene initializes with no teams passed in
- **THEN** team 1 is a Human roster team and team 2 is an Orc roster team

#### Scenario: Default rosters are never identical
- **WHEN** the sandbox falls back to its default teams
- **THEN** team 1's roster and team 2's roster are never the same roster name
