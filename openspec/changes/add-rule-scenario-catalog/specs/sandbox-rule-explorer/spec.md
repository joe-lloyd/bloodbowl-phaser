# sandbox-rule-explorer

## ADDED Requirements

### Requirement: Leveled scenario selection
The sandbox SHALL present scenario selection as progressive levels — Topic (core rules and one entry per skill category), then Rule, then Configuration, then Seed — where each level's selector is only shown once the previous level has a value. Core-rule scenarios SHALL remain reachable under the Core topic.

#### Scenario: Drilling down to a rule configuration
- **WHEN** the coach picks the Agility topic, then Dodge, then "Dodge away from one marker"
- **THEN** the sandbox loads that configuration's setup with the players' skills applied, and the seed controls appear

#### Scenario: Levels hidden until relevant
- **WHEN** no topic is selected
- **THEN** no rule, configuration, or seed selectors are shown

### Requirement: Implementation status is visible per rule
The rule selector SHALL badge each skill as implemented or inert, sourced from the skill registry's coverage report, so catalog coverage is visible while browsing.

#### Scenario: Inert rule badged
- **WHEN** the coach browses a category containing a skill with no registered rule
- **THEN** that skill is visibly marked inert, and selecting it still loads its configurations (the game simply plays without the rule's effect)

### Requirement: Outcome-driven seed selection in the sandbox
The seed controls SHALL offer: direct numeric entry, a randomize action, and an outcome picker that searches seeds (via the in-browser headless engine) until the chosen outcome's predicate matches, then loads the visual game with the found seed and displays the expected outcome. An exhausted search SHALL surface its failure in the UI.

#### Scenario: Find a seed for a chosen outcome
- **WHEN** the coach picks the "reroll offered" outcome for a Sure Hands configuration and clicks find
- **THEN** the sandbox finds a seed producing that outcome headlessly, reloads the scenario with it, and shows the expected outcome text

#### Scenario: Same seed replays the same story
- **WHEN** the coach reloads a configuration with the same seed
- **THEN** the visible dice and outcomes are identical to the previous run
