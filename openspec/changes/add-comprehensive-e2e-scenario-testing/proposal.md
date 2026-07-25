## Why

The game has strong headless and rule-catalog test foundations, but it does not yet provide a systematic end-to-end safety net for every sandbox scenario, seeded outcome, browser interaction, and reported gameplay bug. A unified scenario-driven E2E system is needed so regressions are reproducible, coverage gaps are visible, and releases can be validated reliably without depending on manual play-throughs.

## What Changes

- Add a Playwright-based E2E runner for the browser game, configured for headless Chromium by default and capable of running focused headed/debug sessions when needed.
- Add a fast headless-engine lane for the large deterministic scenario/outcome matrix, reserving browser rendering and screenshot comparison for behavior that genuinely crosses the UI boundary.
- Expand sandbox and rule scenarios into reusable E2E fixtures with explicit interaction scripts, deterministic seeds, expected state/events, and optional visual checkpoints.
- Cover positive, negative, decision, failure, turnover, continuation, and boundary outcomes for each supported rule and game interaction rather than relying on a single happy-path seed.
- Introduce a coverage manifest/report that compares implemented gameplay capabilities and sandbox scenarios against their headless and browser E2E cases.
- Require every confirmed gameplay bug to gain a named deterministic regression scenario and automated assertion before or alongside its fix.
- Select authentic roster players for scenarios whenever the roster naturally supplies the required skill or trait, such as an Ogre throwing a Gnoblar; synthetic skill grants remain available only for isolated mechanics that cannot reasonably use a native roster fixture.
- Add opt-in visual regression baselines and failure artifacts (screenshots, traces, state snapshots, and event logs) for stable, diagnostically useful checkpoints.
- Provide CI-friendly sharding, retries, timeouts, and artifact retention so the expanded suite remains practical in constrained sandbox environments.

## Capabilities

### New Capabilities

- `e2e-scenario-testing`: Defines the headless-first Playwright architecture, reusable scenario execution contract, browser interaction coverage, visual checkpoints, diagnostics, and CI behavior.

### Modified Capabilities

- `rule-scenarios`: Enriches scenario definitions with multiple seeded outcomes, scripted interactions, expected checkpoints, and roster-authentic fixture metadata.
- `rule-test-coverage`: Extends generated coverage from rule predicates to a reportable headless/browser E2E matrix and establishes the bug-to-regression-scenario policy.
- `sandbox-rule-explorer`: Makes the expanded scenario variants, authentic teams, seeded outcomes, and expected checkpoints available for interactive reproduction in the sandbox.

## Impact

- Adds Playwright and browser-install/setup commands to the Node.js toolchain and package scripts.
- Introduces E2E configuration, fixtures, page objects/helpers, scenario adapters, coverage reporting, visual baselines, and CI jobs.
- Extends `Scenario`, rule-scenario catalog, scenario loader, sandbox selectors, and test fixture APIs while preserving existing scenario compatibility.
- Expands deterministic scenario data across core rules, skills/traits, match phases, decisions, local play, and selected online flows.
- Increases repository test artifacts and CI runtime; the headless-first split, sharding, and selective visual assertions contain that cost.
