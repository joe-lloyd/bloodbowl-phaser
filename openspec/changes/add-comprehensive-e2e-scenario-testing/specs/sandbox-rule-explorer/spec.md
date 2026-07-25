## ADDED Requirements

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
