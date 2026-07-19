# rule-test-coverage

## Purpose

Turn the rule-scenario catalog into automatic test coverage — generating tests from catalog entries, gating that every implemented rule is covered, and exposing rule runs through the headless CLI — so rule behaviour is continuously verified and drift is caught deliberately.

## Requirements

### Requirement: The test suite is generated from the catalog
The test suite SHALL iterate the rule-scenario catalog and, for every configuration and declared outcome, find a seed producing that outcome and run the outcome's verification assertions. Adding a catalog entry SHALL add its tests without writing new test files.

#### Scenario: New catalog entry is tested automatically
- **WHEN** a rule gains a catalog configuration with two outcomes
- **THEN** the next test run exercises both outcomes for that configuration with found seeds, with no test-file changes

### Requirement: Implemented rules must have catalog coverage
A gate test SHALL fail when any skill with a registered rule has no catalog configuration, and SHALL hold a named snapshot of the inert skills so changes to either set are made consciously.

#### Scenario: Implemented-but-untested rule fails the gate
- **WHEN** a new skill rule is registered without adding a catalog entry
- **THEN** the gate test fails naming that skill

#### Scenario: Inert list drift fails the gate
- **WHEN** a skill is removed from or added to the catalog of inert skills without updating the snapshot
- **THEN** the gate test fails until the snapshot is deliberately updated

### Requirement: Rules are runnable from the CLI
The headless CLI SHALL run a rule's configurations by name (`--rule <skill>`, optionally narrowed by configuration and outcome), reporting per outcome the seed found and the resulting events; with an explicit `--seed` it SHALL run exactly that seed and report which outcome matched.

#### Scenario: Run one rule from the terminal
- **WHEN** `pnpm headless --rule "Sure Hands"` runs
- **THEN** each configuration executes, printing the seed found per outcome and the decision/skill events observed

#### Scenario: Fixed seed reports its outcome
- **WHEN** `pnpm headless --rule "Sure Hands" --seed 7` runs
- **THEN** the run uses seed 7 and reports which declared outcome (if any) that seed produced
