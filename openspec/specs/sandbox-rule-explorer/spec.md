# sandbox-rule-explorer

## Purpose

Let a coach browse and reproduce rule behaviour visually in the sandbox — drilling down from topic to rule to configuration to seed, seeing which rules are implemented, and finding seeds by desired outcome — so the catalog's scenarios are explorable and deterministically replayable in the running game.

## Requirements

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

### Requirement: Expanded E2E cases are reproducible in the sandbox
The sandbox SHALL expose every registered scenario case and its named seeded variants that are marked interactive. Selecting a variant SHALL load the same setup, roster fixture, seed, and expected checkpoints used by automated E2E execution.

#### Scenario: Developer opens a failing CI variant
- **WHEN** a developer selects or links to a scenario id and seeded outcome reported by CI
- **THEN** the sandbox loads that exact case and displays its expected outcome and checkpoints

#### Scenario: Scenario has several outcome branches
- **WHEN** an interactive scenario declares success, failure, reroll, and turnover variants
- **THEN** each named variant can be selected and replayed independently without manual seed entry

### Requirement: Sandbox shows fixture authenticity
For the loaded scenario, the sandbox SHALL show the selected team rosters, positional players, native skills or traits relevant to the case, and any synthetic grants with their stated isolation reason.

#### Scenario: Native Throw Team-mate fixture is displayed
- **WHEN** the Throw Team-mate scenario loads with the Ogre fixture
- **THEN** the sandbox identifies the Ogre thrower and eligible Gnoblar and shows that their relevant traits come from the production roster

#### Scenario: Scenario uses a synthetic mutation
- **WHEN** a synthetic mutation is necessary for an isolated case
- **THEN** the sandbox labels the grant and displays why a native or thematically valid fixture was not used

### Requirement: Regression scenarios are searchable and shareable
The sandbox SHALL allow scenarios to be found by stable scenario id, capability, interaction, rule, and regression id, and SHALL produce a copyable reproduction reference containing the scenario id and seed without embedding transient runtime player ids.

#### Scenario: Reported bug is reproduced from its id
- **WHEN** a developer searches for a regression id from a bug report
- **THEN** the linked scenario and deterministic variants are shown and can be loaded directly
