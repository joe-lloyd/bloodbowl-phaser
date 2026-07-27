## 1. Playwright Toolchain

- [x] 1.1 Add a pinned `@playwright/test` development dependency and document/install the matching Chromium binary
- [x] 1.2 Create `playwright.config.ts` with browser-free `engine-scenarios`, headless `browser-gameplay`, and tagged `visual-regression` projects
- [x] 1.3 Add package scripts for all E2E projects, a single case/regression filter, headed debug, trace viewing, report merging, and explicit screenshot updates
- [x] 1.4 Configure Playwright's Vite web server, deterministic locale/timezone/viewport, animation controls, output directories, retries, and CI-safe worker defaults
- [x] 1.5 Add a smoke case proving the engine project does not instantiate browser fixtures and a browser smoke case proving Chromium can load the game headlessly

## 2. Shared Scenario-Case Model

- [x] 2.1 Define typed scenario-case, seeded-variant, semantic-step, expected-checkpoint, execution-layer, tag, and regression-provenance contracts
- [x] 2.2 Keep existing `Scenario` values backward-compatible while adding an adapter that promotes eligible legacy scenarios into scenario cases
- [x] 2.3 Add stable reference resolution for teams, placed players, grid squares, decisions, and action targets without runtime-generated ids
- [x] 2.4 Implement schema validation for duplicate ids, missing seeds, empty expectations, invalid steps, unsupported required layers, and stale references
- [x] 2.5 Add focused tests for schema parsing, legacy compatibility, stable references, validation errors, and deterministic case ordering

## 3. Roster-Authentic Fixtures

- [x] 3.1 Build a fixture resolver over production roster templates that can select a roster position by native skill/trait and return stable player references
- [x] 3.2 Encode and test the fixture priority policy: native starting skill first, rules-valid/thematic roster second, reasoned synthetic grant last
- [x] 3.3 Add synthetic-grant metadata and a validator that names a preferred native fixture when one is registered
- [x] 3.4 Replace duplicate hand-built test teams where practical with shared production-roster fixture builders
- [x] 3.5 Audit existing sandbox and rule scenarios for implausible roster/skill combinations and migrate them without changing their intended outcomes
- [x] 3.6 Verify Throw Team-mate and Kick Team-mate cases use appropriate Ogre/Gnoblar or other production-eligible pairings by default

## 4. Engine and Browser Adapters

- [x] 4.1 Implement the engine adapter that maps semantic steps to the existing headless action protocol and records responses, decisions, events, and snapshots
- [x] 4.2 Implement reusable browser page objects for navigation, sandbox selection, HUD actions, decision controls, logs, and match/result screens
- [x] 4.3 Implement a Phaser pitch page object that maps grid squares through production geometry and performs real canvas pointer interaction
- [x] 4.4 Add accessible selectors or scoped `data-testid` hooks for browser controls that lack stable role/name selectors
- [x] 4.5 Add a test/development-only read-only browser bridge for serialized state, events, phase, scene, and pending decisions, and prove production builds omit it
- [x] 4.6 Implement browser semantic-step adapters and fail validation when a browser-required step has no supported adapter
- [x] 4.7 Add parity tests showing one shared case/seed reaches equivalent relevant state and events through engine and browser adapters

## 5. Seeded Variants and Diagnostics

- [x] 5.1 Extend the bounded seed finder to emit reviewable committed variant data without mutating scenarios during normal test execution
- [x] 5.2 Convert existing hardcoded and runtime-searched scenario outcomes to named committed variants where feasible
- [x] 5.3 Make normal E2E execution fail when a committed seed drifts from its named outcome, reporting expected and actual results without silently reseeding
- [x] 5.4 Write per-case diagnostic bundles containing setup, roster fixture, seed, semantic steps, checkpoints, response stream, events, and initial/final snapshots
- [x] 5.5 Configure browser failures to retain trace, screenshot, console/page errors, and video-on-retry alongside the shared diagnostic bundle
- [x] 5.6 Add a replay command that accepts a scenario id plus variant, seed, or regression id and runs it in engine, headless browser, or headed browser mode

## 6. Coverage Inventory and Gates

- [x] 6.1 Generate inventory entries from sandbox scenarios, rule configurations/outcomes, action-protocol commands, decision types, and relevant phase transitions
- [x] 6.2 Add reviewed exclusion metadata with a reason and owner/tracking reference for intentionally uncovered inventory entries
- [x] 6.3 Map scenario cases to engine, browser, and visual layers and emit deterministic machine-readable coverage results
- [x] 6.4 Generate a human-readable report grouped by capability and interaction with covered, missing, excluded, and invalid entries per layer
- [x] 6.5 Add gates for missing required coverage, duplicate case/regression ids, invalid fixtures, unexplained synthetic grants, unreachable variants, stale outcomes, and unsupported adapters
- [x] 6.6 Merge sharded Playwright results and coverage fragments without double-counting or dropping scenario variants
- [x] 6.7 Add package commands that compare current coverage with a committed baseline and highlight added or removed gaps

## 7. Sandbox Reproduction Experience

- [x] 7.1 Feed interactive scenario cases and all named seeded variants into the sandbox selectors while preserving legacy scenario browsing
- [x] 7.2 Display selected rosters, positional players, relevant native skills/traits, and reasoned synthetic grants in the sandbox overlay
- [x] 7.3 Display expected checkpoints and live pass/fail progress while a scenario variant is played
- [x] 7.4 Add search/filtering by stable scenario id, capability, interaction, rule/trait, tag, and regression id
- [x] 7.5 Add copyable reproduction references for case plus variant/seed and restore them through a direct sandbox URL or equivalent launch command
- [x] 7.6 Add browser E2E tests for selecting, replaying, filtering, and sharing expanded sandbox scenarios

## 8. Core Interaction Scenario Expansion

- [ ] 8.1 Add detailed movement variants for normal movement, occupied/illegal squares, tackle zones, successful/failed dodge, Rush, stand-up, Jump, Leap, and movement continuation
- [ ] 8.2 Add ball-state variants for pickup, failed pickup/turnover, bounce, throw-in, catch, failed catch, loose ball, carrier knockdown, and touchdown
- [ ] 8.3 Add passing variants for range bands, accurate/inaccurate/wildly inaccurate/fumble results, target selection, interception decisions, hand-off, and pending-action completion
- [ ] 8.4 Add block variants for every die face, strength/dice bands, assists, Both Down skill interactions, follow-up, push choice, chain push, crowd surf, and ball displacement
- [ ] 8.5 Add armour/injury variants for no break, stun, KO, casualty, death, modifiers, regeneration/apothecary decisions where supported, and resulting player placement
- [x] 8.6 Add activation variants for each declared action, cancellation/finish behavior, once-per-turn consumption, reroll accept/decline/source choice, reactions, and turnover paths
- [x] 8.7 Add phase-flow variants for coin flip, setup legality, kickoff events, touchback, turn changes, touchdown, end of drive, KO recovery, halftime, second-half kickoff, and game over/result
- [x] 8.8 Add negative and boundary cases for invalid commands, wrong-team interaction, unavailable actions, stale decisions, pitch edges, maximum movement, and exhausted rerolls

## 9. Rule, Trait, and Special-Action Matrix

- [x] 9.1 Give every registered rule-scenario configuration committed variants for each materially distinct declared outcome and verify generated engine coverage
- [x] 9.2 Audit all implemented skills/traits for native or rules-valid roster fixtures and record justified exceptions
- [x] 9.3 Add decision-path variants for optional skills, reacting-team choices, reroll sources, parameterized skills, and once-per-turn/drive limits
- [x] 9.4 Add detailed E2E variants for Throw Team-mate, Kick Team-mate, Bombardier, Chainsaw, Ball & Chain, fouls, secret weapons, and other special actions
- [x] 9.5 Add interaction variants for explicitly book-linked skill pairs and confirm both the applying and suppressed/cancelled outcomes
- [x] 9.6 Add browser representatives for every distinct UI interaction shape used by the rule catalog while keeping remaining seed permutations in the engine project
- [x] 9.7 Make the existing implemented-rule coverage gate require valid scenario variants and E2E layer mappings for newly registered rules

## 10. Match, Local, and Online Flows

- [x] 10.1 Add deterministic full-match engine cases through setup, both halves, scoring, drive resets, and final result
- [x] 10.2 Add browser E2E journeys for local match creation, scenario launch, core turn interactions, halftime, and match completion
- [x] 10.3 Add browser coverage for pitch-theme selection, redesigned dugouts, sideline presentation, and persistence across a match
- [x] 10.4 Add emulator-backed browser cases for selected host/guest synchronization, decisions, reconnect/resume, and final result without external credentials
- [x] 10.5 Tag expensive or emulator-backed journeys separately while retaining them in the unified coverage report and required CI schedule

## 11. Visual Regression

- [x] 11.1 Define stable visual checkpoints and baseline naming for pitch themes, dugouts, action highlights, decision overlays, sandbox metadata, and match results
- [x] 11.2 Disable or settle animation, pin fonts/viewport/device scale, and mask only documented volatile regions before screenshot assertions
- [x] 11.3 Add representative approved baselines and assert semantic gameplay state before each visual comparison
- [x] 11.4 Verify normal runs never rewrite baselines and document the explicit reviewed update workflow
- [x] 11.5 Publish actual, expected, and diff images as CI artifacts for failed visual cases

## 12. Regression Policy, CI, and Documentation

- [x] 12.1 Add regression provenance fields and filtering so every confirmed gameplay bug can be linked to a deterministic scenario case
- [x] 12.2 Document and enforce the contribution rule that a confirmed bug fix includes a failing-before/passing-after case at the lowest sufficient layer
- [x] 12.3 Require an additional browser case when a bug involves canvas/DOM input, overlays, rendering, scene transitions, or browser integration
- [x] 12.4 Add deterministic Playwright sharding, browser caching, merged reports, timing output, and artifact retention to CI
- [x] 12.5 Document installation, suite selection, sandbox replay, seed discovery/refresh, headed debugging, traces, coverage gaps, visual updates, and fixture-authenticity rules
- [x] 12.6 Run unit/integration tests, all Playwright projects, strict OpenSpec validation, and a clean production build; resolve failures and record initial E2E coverage totals

### Where 8.6 and 8.7 are covered

Both are satisfied by cases rather than by a file named after the task line:

- **8.6 (activation)** — `activation-cancel-declared-action` (cancel and
  re-declare), `negative-second-activation-refused` (finish, then the
  once-per-turn refusal), `negative-prone-player-cannot-block` and
  `negative-wrong-team-activation` (illegal declarations), the rule catalog's
  declaration of every action kind, and `ruleMatrix.test.ts`, which asserts
  the catalog exercises reroll accept/decline/source, reacting-coach
  accept/decline, declined interception, refused follow-up, once-per-turn
  limits and parameterised skills. Turnover paths are asserted by
  `exactlyOneTurnover` / `noTurnover` and `legacy-double-turnover-seeded`.
- **8.7 (phase flow)** — `match-opening-to-kickoff` (setup legality, kickoff
  event), `match-setup-adjustments`, `match-apply-formation`,
  `match-touchback-award`, `match-touchdown-and-drive-reset` (touchdown and
  end of drive), `match-ko-recovery-at-drive-end` (KO recovery), and
  `e2e/engine/full-match.e2e.ts` (coin flip, turn changes, both halves,
  halftime, second-half kickoff, game over and final result).

### 8.1–8.5 remain open

Movement, ball-state, passing, block and armour/injury variants are largely
exercised through the 186 committed-seed rule-catalog cases and the promoted
sandbox scenarios, but were not authored as dedicated per-family variant
sets. They are the natural next increment.

### Initial E2E coverage (recorded 2026-07-27)

- **283 Playwright cases pass** in the default run: 254 `engine-scenarios`, 21 `browser-gameplay`, 8 `visual-regression`. A further 3 `online-emulator` cases pass under `pnpm e2e:online`.
- **999 Vitest** unit/integration tests pass; strict OpenSpec validation passes; `vite build` succeeds.
- Coverage, per layer (never blended): **engine 426/436 (98%)**, 10 excluded, **0 missing**; **browser 5/7**, 2 excluded, **0 missing**; **visual** — no inventory entry requires it yet.
- Every remaining gap is a *reviewed exclusion* with a reason, an owner and a tracking reference, so `src/testing/coverage/baseline.json` records **0 known gaps** — `pnpm e2e:coverage:diff` now fails on any gap at all.
