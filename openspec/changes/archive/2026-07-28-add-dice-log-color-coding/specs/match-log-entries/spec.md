## ADDED Requirements

### Requirement: Dice log entries are colored by whether they favor the viewer
Each dice roll and durable log entry SHALL be classified into one of five colors — good (favorable), bad (unfavorable), neutral, warning, or unclassified — and rendered with that color, computed by a single shared classification rule applied identically in online and solo/local play.

#### Scenario: Online — a roll for the viewer's own team that succeeds is colored good
- **WHEN** a dice roll with `resultState: "success"` is attributed to the viewer's own team in an online match
- **THEN** the entry is rendered in the "good" (green) color

#### Scenario: Online — a roll for the viewer's own team that fails is colored bad
- **WHEN** a dice roll with `resultState: "failure"` is attributed to the viewer's own team in an online match
- **THEN** the entry is rendered in the "bad" (red) color

#### Scenario: Online — a successful roll for the opponent is colored bad
- **WHEN** a dice roll with `resultState: "success"` is attributed to the opponent's team in an online match
- **THEN** the entry is rendered in the "bad" (red) color, because the opponent's success is unfavorable to the viewer

#### Scenario: Online — a failed roll for the opponent is colored good
- **WHEN** a dice roll with `resultState: "failure"` is attributed to the opponent's team in an online match
- **THEN** the entry is rendered in the "good" (green) color, because the opponent's failure is favorable to the viewer

#### Scenario: Solo/local — a successful roll is colored good regardless of team
- **WHEN** playing solo/local (no online match perspective) and a dice roll has `resultState: "success"`
- **THEN** the entry is rendered in the "good" (green) color regardless of which team the roll is attributed to

#### Scenario: Solo/local — a failed roll is colored bad regardless of team
- **WHEN** playing solo/local (no online match perspective) and a dice roll has `resultState: "failure"` or `"fumble"`
- **THEN** the entry is rendered in the "bad" (red) color regardless of which team the roll is attributed to

#### Scenario: Coin Toss, Weather, and Kickoff Event are always neutral
- **WHEN** a dice roll has `rollType` of `"Coin Toss"`, `"Weather"`, or `"Kickoff Event"`, or a log entry has `category` of `"weather"` or `"kickoff"`
- **THEN** the entry is rendered in a distinct neutral color, in both online and solo/local play, unaffected by perspective

#### Scenario: Informational/warning entries are always the warning color
- **WHEN** a log entry has `category: "info"` (the deprecated `UI_Notification` path, e.g. "Select a Kicker first!")
- **THEN** the entry is rendered in a distinct warning color, unaffected by perspective

#### Scenario: A score entry favors the scoring team
- **WHEN** a log entry has `category: "score"`
- **THEN** it is classified as "good" for the scoring team and colored per the online/solo perspective rules above

#### Scenario: Unclassifiable entries keep their current appearance
- **WHEN** a dice roll has no recognized `resultState` (e.g. `"none"`) and an unrecognized `rollType`, or a log entry has `category` of `"skill"`, `"reroll"`, `"action"`, or `"drive"`
- **THEN** the entry keeps its existing unclassified appearance (no good/bad/neutral/warning color applied)
