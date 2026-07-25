## 1. Playwright Toolchain

- [ ] 1.1 Add a pinned `@playwright/test` development dependency and document/install the matching Chromium binary
- [ ] 1.2 Create `playwright.config.ts` with browser-free `engine-scenarios`, headless `browser-gameplay`, and tagged `visual-regression` projects
- [ ] 1.3 Add package scripts for all E2E projects, a single case/regression filter, headed debug, trace viewing, report merging, and explicit screenshot updates
- [ ] 1.4 Configure Playwright's Vite web server, deterministic locale/timezone/viewport, animation controls, output directories, retries, and CI-safe worker defaults
- [ ] 1.5 Add a smoke case proving the engine project does not instantiate browser fixtures and a browser smoke case proving Chromium can load the game headlessly

## 2. Shared Scenario-Case Model

- [ ] 2.1 Define typed scenario-case, seeded-variant, semantic-step, expected-checkpoint, execution-layer, tag, and regression-provenance contracts
- [ ] 2.2 Keep existing `Scenario` values backward-compatible while adding an adapter that promotes eligible legacy scenarios into scenario cases
- [ ] 2.3 Add stable reference resolution for teams, placed players, grid squares, decisions, and action targets without runtime-generated ids
- [ ] 2.4 Implement schema validation for duplicate ids, missing seeds, empty expectations, invalid steps, unsupported required layers, and stale references
- [ ] 2.5 Add focused tests for schema parsing, legacy compatibility, stable references, validation errors, and deterministic case ordering

## 3. Roster-Authentic Fixtures

- [ ] 3.1 Build a fixture resolver over production roster templates that can select a roster position by native skill/trait and return stable player references
- [ ] 3.2 Encode and test the fixture priority policy: native starting skill first, rules-valid/thematic roster second, reasoned synthetic grant last
- [ ] 3.3 Add synthetic-grant metadata and a validator that names a preferred native fixture when one is registered
- [ ] 3.4 Replace duplicate hand-built test teams where practical with shared production-roster fixture builders
- [ ] 3.5 Audit existing sandbox and rule scenarios for implausible roster/skill combinations and migrate them without changing their intended outcomes
- [ ] 3.6 Verify Throw Team-mate and Kick Team-mate cases use appropriate Ogre/Gnoblar or other production-eligible pairings by default

## 4. Engine and Browser Adapters

- [ ] 4.1 Implement the engine adapter that maps semantic steps to the existing headless action protocol and records responses, decisions, events, and snapshots
- [ ] 4.2 Implement reusable browser page objects for navigation, sandbox selection, HUD actions, decision controls, logs, and match/result screens
- [ ] 4.3 Implement a Phaser pitch page object that maps grid squares through production geometry and performs real canvas pointer interaction
- [ ] 4.4 Add accessible selectors or scoped `data-testid` hooks for browser controls that lack stable role/name selectors
- [ ] 4.5 Add a test/development-only read-only browser bridge for serialized state, events, phase, scene, and pending decisions, and prove production builds omit it
- [ ] 4.6 Implement browser semantic-step adapters and fail validation when a browser-required step has no supported adapter
- [ ] 4.7 Add parity tests showing one shared case/seed reaches equivalent relevant state and events through engine and browser adapters

## 5. Seeded Variants and Diagnostics

- [ ] 5.1 Extend the bounded seed finder to emit reviewable committed variant data without mutating scenarios during normal test execution
- [ ] 5.2 Convert existing hardcoded and runtime-searched scenario outcomes to named committed variants where feasible
- [ ] 5.3 Make normal E2E execution fail when a committed seed drifts from its named outcome, reporting expected and actual results without silently reseeding
- [ ] 5.4 Write per-case diagnostic bundles containing setup, roster fixture, seed, semantic steps, checkpoints, response stream, events, and initial/final snapshots
- [ ] 5.5 Configure browser failures to retain trace, screenshot, console/page errors, and video-on-retry alongside the shared diagnostic bundle
- [ ] 5.6 Add a replay command that accepts a scenario id plus variant, seed, or regression id and runs it in engine, headless browser, or headed browser mode

## 6. Coverage Inventory and Gates

- [ ] 6.1 Generate inventory entries from sandbox scenarios, rule configurations/outcomes, action-protocol commands, decision types, and relevant phase transitions
- [ ] 6.2 Add reviewed exclusion metadata with a reason and owner/tracking reference for intentionally uncovered inventory entries
- [ ] 6.3 Map scenario cases to engine, browser, and visual layers and emit deterministic machine-readable coverage results
- [ ] 6.4 Generate a human-readable report grouped by capability and interaction with covered, missing, excluded, and invalid entries per layer
- [ ] 6.5 Add gates for missing required coverage, duplicate case/regression ids, invalid fixtures, unexplained synthetic grants, unreachable variants, stale outcomes, and unsupported adapters
- [ ] 6.6 Merge sharded Playwright results and coverage fragments without double-counting or dropping scenario variants
- [ ] 6.7 Add package commands that compare current coverage with a committed baseline and highlight added or removed gaps

## 7. Sandbox Reproduction Experience

- [ ] 7.1 Feed interactive scenario cases and all named seeded variants into the sandbox selectors while preserving legacy scenario browsing
- [ ] 7.2 Display selected rosters, positional players, relevant native skills/traits, and reasoned synthetic grants in the sandbox overlay
- [ ] 7.3 Display expected checkpoints and live pass/fail progress while a scenario variant is played
- [ ] 7.4 Add search/filtering by stable scenario id, capability, interaction, rule/trait, tag, and regression id
- [ ] 7.5 Add copyable reproduction references for case plus variant/seed and restore them through a direct sandbox URL or equivalent launch command
- [ ] 7.6 Add browser E2E tests for selecting, replaying, filtering, and sharing expanded sandbox scenarios

## 8. Core Interaction Scenario Expansion

- [ ] 8.1 Add detailed movement variants for normal movement, occupied/illegal squares, tackle zones, successful/failed dodge, Rush, stand-up, Jump, Leap, and movement continuation
- [ ] 8.2 Add ball-state variants for pickup, failed pickup/turnover, bounce, throw-in, catch, failed catch, loose ball, carrier knockdown, and touchdown
- [ ] 8.3 Add passing variants for range bands, accurate/inaccurate/wildly inaccurate/fumble results, target selection, interception decisions, hand-off, and pending-action completion
- [ ] 8.4 Add block variants for every die face, strength/dice bands, assists, Both Down skill interactions, follow-up, push choice, chain push, crowd surf, and ball displacement
- [ ] 8.5 Add armour/injury variants for no break, stun, KO, casualty, death, modifiers, regeneration/apothecary decisions where supported, and resulting player placement
- [ ] 8.6 Add activation variants for each declared action, cancellation/finish behavior, once-per-turn consumption, reroll accept/decline/source choice, reactions, and turnover paths
- [ ] 8.7 Add phase-flow variants for coin flip, setup legality, kickoff events, touchback, turn changes, touchdown, end of drive, KO recovery, halftime, second-half kickoff, and game over/result
- [ ] 8.8 Add negative and boundary cases for invalid commands, wrong-team interaction, unavailable actions, stale decisions, pitch edges, maximum movement, and exhausted rerolls

## 9. Rule, Trait, and Special-Action Matrix

- [ ] 9.1 Give every registered rule-scenario configuration committed variants for each materially distinct declared outcome and verify generated engine coverage
- [ ] 9.2 Audit all implemented skills/traits for native or rules-valid roster fixtures and record justified exceptions
- [ ] 9.3 Add decision-path variants for optional skills, reacting-team choices, reroll sources, parameterized skills, and once-per-turn/drive limits
- [ ] 9.4 Add detailed E2E variants for Throw Team-mate, Kick Team-mate, Bombardier, Chainsaw, Ball & Chain, fouls, secret weapons, and other special actions
- [ ] 9.5 Add interaction variants for explicitly book-linked skill pairs and confirm both the applying and suppressed/cancelled outcomes
- [ ] 9.6 Add browser representatives for every distinct UI interaction shape used by the rule catalog while keeping remaining seed permutations in the engine project
- [ ] 9.7 Make the existing implemented-rule coverage gate require valid scenario variants and E2E layer mappings for newly registered rules

## 10. Match, Local, and Online Flows

- [ ] 10.1 Add deterministic full-match engine cases through setup, both halves, scoring, drive resets, and final result
- [ ] 10.2 Add browser E2E journeys for local match creation, scenario launch, core turn interactions, halftime, and match completion
- [ ] 10.3 Add browser coverage for pitch-theme selection, redesigned dugouts, sideline presentation, and persistence across a match
- [ ] 10.4 Add emulator-backed browser cases for selected host/guest synchronization, decisions, reconnect/resume, and final result without external credentials
- [ ] 10.5 Tag expensive or emulator-backed journeys separately while retaining them in the unified coverage report and required CI schedule

## 11. Visual Regression

- [ ] 11.1 Define stable visual checkpoints and baseline naming for pitch themes, dugouts, action highlights, decision overlays, sandbox metadata, and match results
- [ ] 11.2 Disable or settle animation, pin fonts/viewport/device scale, and mask only documented volatile regions before screenshot assertions
- [ ] 11.3 Add representative approved baselines and assert semantic gameplay state before each visual comparison
- [ ] 11.4 Verify normal runs never rewrite baselines and document the explicit reviewed update workflow
- [ ] 11.5 Publish actual, expected, and diff images as CI artifacts for failed visual cases

## 12. Regression Policy, CI, and Documentation

- [ ] 12.1 Add regression provenance fields and filtering so every confirmed gameplay bug can be linked to a deterministic scenario case
- [ ] 12.2 Document and enforce the contribution rule that a confirmed bug fix includes a failing-before/passing-after case at the lowest sufficient layer
- [ ] 12.3 Require an additional browser case when a bug involves canvas/DOM input, overlays, rendering, scene transitions, or browser integration
- [ ] 12.4 Add deterministic Playwright sharding, browser caching, merged reports, timing output, and artifact retention to CI
- [ ] 12.5 Document installation, suite selection, sandbox replay, seed discovery/refresh, headed debugging, traces, coverage gaps, visual updates, and fixture-authenticity rules
- [ ] 12.6 Run unit/integration tests, all Playwright projects, strict OpenSpec validation, and a clean production build; resolve failures and record initial E2E coverage totals
