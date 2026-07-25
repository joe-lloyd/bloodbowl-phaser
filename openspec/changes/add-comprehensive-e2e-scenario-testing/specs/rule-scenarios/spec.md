## ADDED Requirements

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
