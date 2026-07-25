## Context

The repository already has a deterministic `HeadlessGame`, a JSONL/CLI action protocol, a `Scenario` loader, sandbox scenarios, a rule-scenario catalog with outcome predicates, and Vitest coverage. These pieces prove many mechanics efficiently, but they are split across ad hoc tests and do not establish whether the same scenario can be completed through the browser UI. There is no single inventory showing which scenarios, outcomes, interactions, match phases, and historical bugs have headless or browser E2E coverage.

The browser game mixes Phaser canvas interaction with DOM/React controls. Running every outcome through a browser would be unnecessarily slow in CI and constrained sandboxes, while testing only the engine would miss input mapping, overlays, HUD decisions, scene transitions, and rendering regressions. The architecture therefore needs exhaustive deterministic engine execution and a smaller but comprehensive UI-boundary suite under one runner and reporting model.

## Goals / Non-Goals

**Goals:**

- Use Playwright Test in Node.js as the E2E orchestrator, with headless execution as the default.
- Run the large scenario/outcome matrix without creating a browser page when no UI behavior is under test.
- Verify every registered sandbox and rule scenario, every declared seeded outcome, and every supported interaction category through the appropriate engine and/or browser lane.
- Make scenario cases reusable in the sandbox, headless runner, Playwright tests, and bug reports.
- Prefer roster-authentic teams and positional players, and make any synthetic skill assignment explicit and reviewable.
- Produce a coverage report that exposes missing cases rather than implying completeness from raw line coverage.
- Capture enough deterministic diagnostics to reproduce failures locally.

**Non-Goals:**

- Replacing focused unit, integration, or rule-level Vitest tests.
- Taking a screenshot after every action or treating pixel snapshots as gameplay assertions.
- Exhaustively enumerating every possible board state or RNG sequence; coverage is defined over the registered capability, interaction, scenario, and named-outcome inventories.
- Requiring headed browsers or GPU acceleration in CI.
- Testing third-party browser engines equally in the first rollout; Chromium is the initial required project.

## Decisions

### 1. Use one Playwright configuration with three execution projects

`engine-scenarios` runs Playwright tests in Node without requesting `browser`, `context`, or `page` fixtures. It drives `HeadlessGame` directly and owns the large deterministic scenario/outcome matrix. `browser-gameplay` starts the Vite app and runs headless Chromium for true input, overlay, HUD, navigation, and scene-transition behavior. `visual-regression` is a tagged subset of stable browser checkpoints with Playwright screenshot assertions.

This keeps Playwright as the E2E runner while avoiding browser startup and rendering costs for engine-only cases. Using Chromium for every seed was rejected because it would multiply runtime and make failures harder to diagnose. Keeping all engine E2E tests in Vitest was also rejected because it would split filtering, retries, artifacts, and coverage reporting across two E2E orchestrators.

### 2. Add a shared scenario-case contract with layer-specific adapters

The existing `Scenario` remains the pitch/setup payload. A scenario case wraps it with a stable case id, category/capability tags, roster fixture declaration, one or more named seeded variants, semantic interaction steps, decision policies, and expected checkpoints. Checkpoints can assert game snapshots, events, pending decisions, visible UI state, and optional screenshots.

An engine adapter translates semantic steps into action-protocol commands. A browser adapter translates the same intent into page-object operations. Not every semantic step must support both adapters: each case declares its required coverage layers, and the coverage gate rejects an unsupported required layer.

This avoids duplicating setup and expected results in separate headless, sandbox, and Playwright files. A browser-only script language was rejected because it would make seed search and engine reproduction diverge.

### 3. Observe browser state through stable test seams, not screenshots alone

DOM controls receive semantic roles/names and narrowly scoped `data-testid` values where accessible selectors are insufficient. Phaser pitch interactions use a page object that converts grid squares through the production grid-to-pixel mapping and clicks the canvas. A read-only test bridge, enabled only in development/test builds, exposes the current serialized snapshot, emitted events, scene/phase, and pending decision; it cannot mutate game state.

Browser cases still perform actions through visible controls or canvas clicks. The bridge supplies precise postconditions and diagnostics. Direct state injection after page load is disallowed except through the normal scenario-loading entry point.

### 4. Make roster authenticity a validated fixture policy

Scenario fixtures select the roster and positional template using this priority:

1. A roster position that owns the required skill/trait by default.
2. A thematically and rules-valid roster/position that can normally gain the skill.
3. A synthetic grant only when no practical native fixture exists or the test must isolate one interaction.

Each case records the selected roster and positions. Synthetic grants require a short reason and are surfaced in validation and coverage output. A catalog validator rejects accidental grants when a native default fixture is registered. Shared roster-fixture helpers use production roster templates, so tests do not maintain separate inaccurate player definitions.

### 5. Treat seeds as versioned test data

Each named outcome stores a known seed and expected checkpoint summary. A bounded seed finder is a developer tool for discovering or refreshing variants, not work repeated by the normal E2E run. Tests execute the committed seed directly and fail if it no longer produces its named outcome. Seed refreshes are deliberate reviewable changes and must preserve or explain changed outcome coverage.

This makes the suite fast and turns RNG call-order drift into an explicit signal. On-demand seed search remains available in the sandbox and focused developer commands.

### 6. Define completeness through a generated coverage manifest

The manifest inventories:

- sandbox scenarios;
- rule-scenario configurations and named outcomes;
- action-protocol commands and interaction categories;
- decisions and phase transitions;
- critical local/online flows selected for browser coverage;
- regression cases linked to bug ids or descriptions.

Each scenario case declares which inventory entries and layers it covers. The generated report shows engine, browser, and visual status separately and fails on missing required coverage, duplicate ids, unreachable variants, invalid fixtures, or stale regression links. Line/branch coverage remains a supporting metric rather than the definition of gameplay coverage.

### 7. Use selective visual regression and rich failure artifacts

Screenshots cover stable presentation contracts such as pitch themes, dugout layouts, action highlights, decision overlays, and final-result screens. Dynamic animation is disabled or advanced to a stable checkpoint; volatile text and timestamps are masked. Gameplay correctness is asserted from state/events/UI semantics before screenshot comparison.

On failure, Playwright retains a trace, screenshot, video on retry, console output, serialized initial/final state, emitted events, semantic step log, roster fixture, and seed. Snapshot updates require an explicit command and normal code review.

### 8. Roll out by coverage families and gate new regressions immediately

The initial implementation establishes the harness and migrates representative scenarios from movement, blocks, ball handling, passing, skills/traits, decisions, drive transitions, and match completion. Subsequent batches fill the generated gap report. The “confirmed bug requires a regression case” gate becomes active as soon as the harness lands, even while historical coverage is being backfilled.

## Risks / Trade-offs

- [Playwright installation and Chromium binaries increase setup size] → Pin `@playwright/test`, document a one-browser install command, and keep the engine project browser-free.
- [A very large scenario catalog can make CI slow] → Execute committed seeds, shard by stable case id, separate fast engine/browser/visual projects, and publish timing data for balancing.
- [Canvas tests can become coordinate-fragile] → Centralize grid-to-screen mapping in one page object and assert the mapping against production geometry.
- [Visual snapshots can be noisy across environments] → Pin browser/runtime settings, disable animation, use stable checkpoints, and limit baselines to presentation contracts.
- [The test bridge could accidentally become a backdoor] → Compile it only for test/development, expose read-only serialized data, and forbid test-only state mutations.
- [Roster authenticity can be subjective for skills without native starting access] → Encode deterministic priority rules, require a rationale for synthetic grants, and report exceptions.
- [“Every interaction” can become an unbounded claim] → Generate the authoritative interaction inventory from protocol/actions/decisions and require explicit coverage or a reviewed exclusion.
- [Seed changes can cause widespread churn after RNG refactors] → Store outcome intent separately, provide a refresh tool, and require regenerated seeds to satisfy the same assertions.

## Migration Plan

1. Add the pinned Playwright dependency, configuration, scripts, CI cache, and Chromium setup documentation.
2. Implement the shared scenario-case schema, validators, roster fixture resolver, semantic step adapters, and artifact writer.
3. Add representative engine and browser cases and prove deterministic parity for identical scenario/seed inputs.
4. Generate the initial coverage manifest and mark legacy gaps explicitly rather than silently passing them.
5. Convert existing seeded sandbox and rule scenarios to committed variants, then expand by rule and interaction family.
6. Add stable visual baselines and enable their CI project after the browser environment is pinned.
7. Enable required coverage gates in stages: schema/fixture validity first, new-bug regression policy second, then historical gap closure.

Rollback consists of disabling the new Playwright CI jobs and scripts while leaving the additive scenario metadata in place; existing Vitest and runtime scenario behavior remain compatible.

## Open Questions

- Which CI service and artifact-retention limit should determine the default shard count and trace/video retention period?
- Should reviewed coverage exclusions live beside each scenario family or in one central manifest?
- Which initial online flows can run against local emulators without introducing credentials or external network dependencies?
