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

### Requirement: E2E coverage is measured against gameplay inventories
The system SHALL generate a coverage manifest that maps registered sandbox scenarios, rule configurations and outcomes, action-protocol commands, interaction categories, decision types, selected phase transitions, and regression cases to their engine, browser, and visual E2E cases. The report SHALL distinguish required, covered, excluded, and missing entries per execution layer.

#### Scenario: Coverage report exposes a missing browser interaction
- **WHEN** an interaction category is marked as requiring browser coverage but has no browser case
- **THEN** the coverage report names the missing category and the coverage gate fails

#### Scenario: Engine and visual coverage are not conflated
- **WHEN** a scenario has exhaustive engine variants but no visual checkpoint
- **THEN** the report shows engine coverage as complete and visual coverage as absent or excluded rather than combining them into one percentage

### Requirement: Registered scenarios and outcomes execute automatically
The E2E engine project SHALL generate a case for every registered scenario variant and named rule outcome that is not explicitly excluded with a reviewed reason. Adding a scenario or outcome SHALL add it to the next generated run and coverage report without requiring a new hand-written test file.

#### Scenario: New seeded outcome joins the matrix
- **WHEN** a scenario configuration gains another named seeded outcome
- **THEN** the next engine E2E run executes it and reports its coverage automatically

#### Scenario: Exclusion lacks a reason
- **WHEN** an inventory entry is excluded without the required explanation and owner or tracking reference
- **THEN** coverage validation fails

### Requirement: Every confirmed gameplay bug gains a regression case
Every confirmed gameplay bug SHALL be represented by a deterministic automated scenario that reproduces the failure before the fix and passes after the fix. The case SHALL run at the lowest sufficient layer and SHALL also require browser coverage when the defect involves input mapping, presentation, DOM/Phaser integration, scene transitions, or other UI-boundary behavior.

#### Scenario: Engine gameplay bug is fixed
- **WHEN** a deterministic engine rule bug is confirmed
- **THEN** the fix includes a linked headless regression scenario that fails against the broken behavior

#### Scenario: UI interaction bug is fixed
- **WHEN** a bug depends on clicking, overlays, canvas mapping, or browser scene flow
- **THEN** the fix includes a linked browser E2E scenario in addition to any lower-level regression test

### Requirement: Coverage gates validate scenario quality
Coverage validation SHALL fail on duplicate case or regression ids, missing committed seeds, stale expected outcomes, unsupported required adapter steps, invalid roster fixtures, unexplained synthetic grants, and required inventory entries without cases. It SHALL publish both machine-readable and human-readable reports.

#### Scenario: Scenario uses an unnecessary synthetic skill
- **WHEN** validation finds a synthetic skill grant for which a registered production positional fixture exists
- **THEN** the gate fails with the preferred roster and position unless the scenario contains an approved isolation reason

#### Scenario: Reports merge across shards
- **WHEN** CI completes multiple E2E shards
- **THEN** their machine-readable results merge into one complete manifest and a concise human-readable gap report
