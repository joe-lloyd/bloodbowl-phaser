# rule-scenarios

## Purpose

Provide a declarative, deterministic catalog that maps skills to scenario configurations with named, machine-checkable outcomes — so a rule's behaviour can be set up, driven to its relevant moment, and verified identically in the browser, the CLI, and tests.

## Requirements

### Requirement: Scenario placements can equip skills
The scenario system SHALL allow a player placement to declare skills (`PlayerPlacement.skills`), and applying the scenario SHALL attach those skills additively to the placed player from the skill catalog. Existing scenarios without skills SHALL behave unchanged.

#### Scenario: Skill-equipped placement
- **WHEN** a scenario places a player with `skills: [Dodge]` and the game starts
- **THEN** that player has Dodge in addition to their roster skills, in browser, CLI, and test runs alike

### Requirement: Rules declare configurations with named outcomes
The system SHALL provide a rule-scenario catalog mapping a skill to one or more configurations — a scenario setup, an optional protocol-command script that drives play to the rule-relevant moment, and one or more named outcomes with machine-checkable predicates over the command responses and final snapshot. Player references in scripts SHALL be stable placement references, not run-specific ids.

#### Scenario: Configuration runs to a checkable result
- **WHEN** a configuration's script is run with a given seed
- **THEN** the runner returns the response stream and final snapshot, and each declared outcome's predicate deterministically reports whether it occurred

### Requirement: Seeds are found by outcome, not hardcoded
The system SHALL provide a bounded, deterministic seed search: given a configuration and an outcome, it iterates seeds from a fixed start until the outcome's predicate matches, and SHALL fail loudly (reporting the searched range) when the bound is reached. Identical inputs SHALL always find the identical seed.

#### Scenario: Finding the failure seed
- **WHEN** a seed search runs for the "reroll offered" outcome of a pickup configuration
- **THEN** it returns the first seed in the window whose run offers the reroll, and repeated searches return the same seed

#### Scenario: Unreachable outcome fails loudly
- **WHEN** no seed in the bounded window produces the requested outcome
- **THEN** the search reports the exhausted range as an error rather than passing silently

### Requirement: Scripted decision moments are observable and auto-answered
When a script run raises a mid-action decision (reroll, reaction, block dice, push), the runner SHALL record it in the response stream (so predicates can assert on the decision itself) and then answer it from the configuration's decision policy, defaulting to accepting skill decisions and taking the first option otherwise.

#### Scenario: Reroll offer visible to predicates
- **WHEN** a configuration's run offers a reroll during its script
- **THEN** an outcome predicate can match on the pending reroll decision (player, sources, roll kind) before the policy answers it

### Requirement: Scenario cases describe cross-layer interactions
The scenario catalog SHALL support reusable cases containing semantic interaction steps and expected checkpoints over snapshots, events, decisions, visible UI, and optional visual state. Each case SHALL declare whether it requires engine, browser, visual, or multiple execution layers, and existing scenarios without E2E metadata SHALL remain loadable.

#### Scenario: Sandbox scenario becomes an E2E case
- **WHEN** a sandbox scenario is given semantic steps and engine/browser checkpoints
- **THEN** the same setup can be run by the sandbox, headless adapter, and Playwright browser adapter without duplicating its fixture

#### Scenario: Legacy scenario remains compatible
- **WHEN** an existing scenario has no E2E case metadata
- **THEN** it continues to load with its current setup and seed behavior

### Requirement: Scenarios cover distinct seeded outcome branches
Each scenario configuration SHALL be able to declare multiple named seeded variants for materially different success, failure, decision, continuation, turnover, injury, and boundary outcomes applicable to that interaction. Every declared variant SHALL have a committed seed and machine-checkable expected result, and duplicate variants that prove no distinct behavior SHALL be rejected or consolidated.

#### Scenario: Dodge configuration covers both branches
- **WHEN** a dodge scenario has successful, failed-with-reroll, declined-reroll, and turnover outcomes
- **THEN** each applicable branch is represented by a named deterministic variant with its own expected checkpoints

#### Scenario: Variant is unreachable
- **WHEN** the seed discovery tool cannot produce a declared outcome within its bounded range
- **THEN** it reports the scenario, outcome, and searched range and does not add an invalid variant

### Requirement: Scenario fixtures prefer authentic rosters and positions
Scenario fixtures SHALL use production roster templates and SHALL prefer a positional player that has the tested skill or trait by default. If none exists, the fixture SHALL prefer a thematically and rules-valid roster that could normally gain it. A synthetic skill or stat grant SHALL require an explicit isolation reason, and catalog validation SHALL flag a synthetic grant when a registered native default fixture is available.

#### Scenario: Throw Team-mate uses an Ogre roster
- **WHEN** a Throw Team-mate interaction is configured
- **THEN** the fixture uses an Ogre roster thrower and an eligible Gnoblar by default rather than granting the traits to unrelated Human players

#### Scenario: Native starting skill exists
- **WHEN** a scenario tests a skill owned by a production positional player
- **THEN** the fixture selects that roster and position without adding the skill synthetically

#### Scenario: Synthetic grant is necessary
- **WHEN** an isolated interaction cannot practically use a native or rules-valid roster fixture
- **THEN** the scenario records the granted skill or stat and a human-readable reason surfaced by validation and coverage reports

### Requirement: Regression scenarios carry stable provenance
A scenario introduced for a confirmed gameplay bug SHALL have a stable regression identifier and a concise description of the original failure. That identifier SHALL remain attached to the scenario when the bug is fixed or the scenario is reorganized.

#### Scenario: Bug becomes a reusable scenario
- **WHEN** a confirmed gameplay defect is fixed
- **THEN** its deterministic scenario case records the regression id and original failure and is discoverable by that id in tests and the sandbox
