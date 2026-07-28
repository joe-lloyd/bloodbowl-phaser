# e2e-scenario-testing

## Purpose

Define the headless-first Playwright architecture for end-to-end testing — a
reusable scenario-case contract shared by engine and browser adapters,
committed seeds as versioned test data, selective visual checkpoints, and
reproducible failure diagnostics — so regressions are reproducible, coverage
gaps are visible, and releases can be validated without manual play-throughs.

## Requirements

### Requirement: Playwright orchestrates headless-first E2E execution
The system SHALL use Playwright Test in Node.js as the E2E runner and SHALL provide separate engine, browser-gameplay, and visual-regression projects. The engine project SHALL execute scenario cases without launching or rendering a browser page, while browser projects SHALL run headless Chromium by default and SHALL support an explicit headed debug mode.

#### Scenario: Large scenario matrix runs without a browser
- **WHEN** the engine scenario project runs the registered deterministic outcome matrix
- **THEN** it drives the headless game directly without creating a browser, context, or page

#### Scenario: Browser interaction runs headlessly in CI
- **WHEN** a browser-gameplay case runs in CI
- **THEN** Playwright drives the game in headless Chromium without requiring a visible desktop or GPU

#### Scenario: Developer debugs a browser case
- **WHEN** a developer invokes the documented headed/debug command for one case
- **THEN** the same case opens visibly with Playwright inspector and trace support

### Requirement: Shared cases drive engine and browser adapters
Each E2E scenario case SHALL declare a stable id, scenario setup, fixture metadata, semantic interaction steps, named seeded variants, expected checkpoints, and required execution layers. The engine and browser adapters SHALL consume that shared case rather than maintaining independent copies of its setup or expected outcome.

#### Scenario: One case verifies engine and UI behavior
- **WHEN** a hand-off case requires both engine and browser coverage
- **THEN** both projects use the same setup, seed, semantic action sequence, and expected game outcome while translating actions through their respective adapters

#### Scenario: Required adapter support is missing
- **WHEN** a case requires browser coverage but one of its semantic steps has no browser adapter
- **THEN** validation fails naming the case and unsupported step

### Requirement: Browser cases exercise production interaction paths
Browser E2E cases SHALL perform actions through accessible DOM controls or mapped Phaser canvas input and SHALL load initial state only through the normal scenario-loading path. A test-only browser bridge MAY expose read-only serialized snapshots, events, phase, and pending decisions for assertions and diagnostics, but SHALL NOT mutate game state.

#### Scenario: Player moves through canvas input
- **WHEN** a browser case activates a player and chooses a destination square
- **THEN** Playwright clicks the production canvas coordinates and verifies the resulting state rather than calling the movement manager directly

#### Scenario: Decision is answered through the HUD
- **WHEN** a reroll or reaction decision appears
- **THEN** the case inspects and answers the visible HUD controls and verifies the resolved decision in state and events

### Requirement: Seeded variants are deterministic test data
Every outcome-dependent E2E variant SHALL identify a committed seed and machine-checkable expected checkpoints. Normal E2E runs SHALL execute the committed seed directly; bounded seed search SHALL be a separate developer operation. Repeating an unchanged case and seed SHALL yield the same response stream and final serialized state.

#### Scenario: Fixed variant reproduces
- **WHEN** the same scenario variant runs twice with its committed seed
- **THEN** both runs produce identical relevant events, decisions, and final state

#### Scenario: RNG drift changes the named outcome
- **WHEN** a committed seed no longer produces the variant's declared outcome
- **THEN** the E2E case fails with the expected outcome, actual outcome, and seed rather than searching for a replacement silently

### Requirement: Visual regression is selective and reviewable
The visual project SHALL capture baselines only at declared stable checkpoints, SHALL pin viewport and browser settings, and SHALL control or mask known volatile presentation. Visual comparison SHALL supplement semantic gameplay assertions and SHALL require an explicit baseline-update command.

#### Scenario: Stable pitch presentation is compared
- **WHEN** a visual case reaches its declared pitch or overlay checkpoint
- **THEN** gameplay state is asserted first and the resulting screenshot is compared with its committed baseline

#### Scenario: Snapshot is not updated implicitly
- **WHEN** a screenshot differs during a normal test run
- **THEN** the case fails and retains the actual/diff artifacts without replacing the approved baseline

### Requirement: Failures retain reproducible diagnostics
For each failed browser E2E case, the runner SHALL report the case id, seed, roster fixture, semantic steps, expected and actual checkpoint, and SHALL retain configured screenshots, trace, console output, state snapshots, and event logs. Engine failures SHALL retain the same non-visual scenario data.

#### Scenario: Seeded browser case fails in CI
- **WHEN** a browser scenario fails after an interaction
- **THEN** its report contains enough state, event, trace, and seed information to replay that exact case locally

### Requirement: E2E projects are selectable and shardable
The E2E suite SHALL support stable filtering by project, capability, scenario, outcome, regression id, and tag. CI SHALL be able to shard cases deterministically and merge their reports without losing the mapping between cases and coverage entries.

#### Scenario: Developer runs one reported bug
- **WHEN** a developer filters the E2E command by a regression id
- **THEN** only the linked deterministic cases run and their artifacts use that regression id

#### Scenario: CI shards the engine matrix
- **WHEN** the engine project is split across multiple workers or jobs
- **THEN** each stable case runs exactly once and the merged coverage report includes all shards

### Requirement: Scenario cases are organized per gameplay section
Scenario-case data SHALL be organized into modules named after the gameplay section they cover, mirroring the existing `__tests__/headless/*.test.ts` section naming, rather than filed into a single generic, non-section-aligned registry. New coverage for a section SHALL be added to that section's existing case module (creating one named after the section if none exists yet) so it is discoverable by anyone already working in that section's test file.

#### Scenario: New coverage lands in its section's module
- **WHEN** a contributor adds a new scenario case for an existing gameplay section (e.g. push-chain)
- **THEN** the case is added to that section's case module rather than a generic catch-all file

#### Scenario: Existing per-section tests are not displaced
- **WHEN** the scenario-case registry is reorganized by section
- **THEN** every existing `__tests__/headless/*.test.ts` file continues to run unchanged, and no existing test is deleted as part of the reorganization
