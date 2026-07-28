# match-log-entries

## Purpose

Every roll and its outcome is recorded in the Dice Log with the result and its rulebook meaning, not just the raw dice, so the match history stays legible after the transient on-screen message is gone.

## Requirements

### Requirement: Every roll outcome is recorded in the match log
A roll and the outcome it produced SHALL both appear in the Dice Log. The entry SHALL carry the roll value, a headline naming the result, and a detail line stating what the result means in play. An outcome SHALL NOT be delivered only as a transient on-screen message.

#### Scenario: The weather roll records its table result
- **WHEN** the weather is rolled at the start of a match
- **THEN** the log contains an entry with the 2D6 value, the named weather condition, and its effect on play

#### Scenario: The kickoff table records its event
- **WHEN** the kickoff table is rolled
- **THEN** the log contains an entry with the roll, the named kickoff event, and what the event does

#### Scenario: A skill trigger records its effect
- **WHEN** a skill triggers during a roll
- **THEN** the log records which skill triggered and the effect it had on the outcome

### Requirement: Outcome text is authored by the rule that resolved it
The sentence describing a result SHALL be produced by the code that resolved the rule — the weather table, the kickoff table, or the skill rule — and carried on the log entry. The HUD SHALL NOT map roll values to descriptions.

#### Scenario: Log detail matches the applied table entry
- **WHEN** any table-driven result is resolved
- **THEN** the description shown in the log is the one supplied by the resolver for the entry it actually applied

### Requirement: Log entries are attributable and ordered
Each entry SHALL record when it happened and, where the outcome belongs to a team, which team it belongs to. Entries SHALL be presented newest first and SHALL survive later entries being added, up to the log's retention limit.

#### Scenario: A team-attributable entry is marked
- **WHEN** a player makes a dodge roll
- **THEN** the resulting entry is attributed to that player's team

#### Scenario: A neutral entry is not attributed to a coach
- **WHEN** the weather or kickoff table is rolled
- **THEN** the entry is recorded without being attributed to either coach

### Requirement: Both coaches see the same log in an online match
In an online match the log entries a guest sees SHALL match those the host produces, in the same order.

#### Scenario: Guest log matches host log
- **WHEN** a host resolves the weather and the kickoff table in an online match
- **THEN** the guest's log contains the same entries with the same rolls, headlines, and details

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
