# rule-scenarios

## ADDED Requirements

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
