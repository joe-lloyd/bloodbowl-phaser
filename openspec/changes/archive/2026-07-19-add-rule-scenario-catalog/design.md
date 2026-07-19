# Design: add-rule-scenario-catalog

## Context

`add-skill-rules-system` delivered the rule framework: registry, trigger points, reroll/reaction decisions, 8 implemented skills, all verified by hand-written seeded tests (`__tests__/headless/skill-*.test.ts`) that push skills onto players imperatively. The sandbox (`SandboxOverlay`) is a flat dropdown over ~6 core scenarios in `src/data/scenarios.ts`. The headless CLI takes `--scenario`/`--seed`/`--script`. The engine is fully Phaser-free, so headless games can run anywhere — including silently inside the browser. 118 skills remain to implement; each needs manual sandbox verification AND automated tests, which today means bespoke work per skill.

## Goals / Non-Goals

**Goals:**

- One declarative catalog entry per rule drives sandbox demo, CLI run, and vitest coverage — write once, verified in three places.
- Scenarios can express skills on placed players.
- Outcomes are named predicates, and seeds are *found*, not hardcoded — "show me the seed where the reroll gets offered".
- The registry coverage report and the catalog are cross-checked by a gate test so implemented rules can't ship untested.

**Non-Goals:**

- Implementing more skill rules (separate batch changes).
- Correcting the skill catalog's names/categories (`reconcile-skill-catalog`).
- Replay/recording UI, scenario editing UI, or persistence of user-built scenarios.
- Exhaustive outcome enumeration per rule (each rule declares the outcomes worth locking; more can be added later).

## Decisions

### 1. Catalog as typed TS data, one file per skill category

`src/data/ruleScenarios/<category>.ts` exporting `RuleScenarioEntry[]`:

```ts
interface RuleScenarioEntry {
  skill: SkillType;
  configs: RuleConfig[];
}
interface RuleConfig {
  id: string;            // "attacker-only"
  name: string;          // "Attacker has Block"
  description: string;
  setup: ScenarioSetup;  // placements now carry skills
  script?: HeadlessCommand[]; // drives play to the rule moment (after scenario load)
  outcomes: RuleOutcome[];
}
interface RuleOutcome {
  id: string;            // "both-down-saved"
  name: string;
  /** Predicate over the script's command responses + final snapshot */
  matches(result: ScriptResult): boolean;
  /** Assertions run by the generated test once a matching seed is found */
  verify?(result: ScriptResult): void; // vitest expect() calls
}
```

Rationale: TS (not JSON) so predicates/verifiers are plain functions with full type-checking, and the catalog imports `SkillType` — no string drift. Alternative — JSON + a predicate DSL — rejected: a DSL would grow to reimplement JS for zero benefit here.

### 2. `PlayerPlacement.skills?: SkillType[]`

`applyScenario` attaches the listed skills (via the `SKILL_DEFINITIONS` catalog) to the placed player, replacing none of their roster skills — additive only. This is the single change to the scenario type; everything else layers above it.

### 3. Scripts are protocol commands with decision auto-answers

A config's `script` is a list of `HeadlessCommand`s executed via `HeadlessGame.execute`. Player ids use stable placement references (`team1[0]`) resolved at run time, mirroring how tests already look players up. When a script step leaves a `pendingDecision` un-answered, the runner answers it from a per-config `decisionPolicy` (default: accept rerolls/reactions, first option otherwise) so outcomes about the decisions themselves ("reroll offered") can also be expressed by predicates over the response stream before the policy answers. Alternative — encoding decisions inline in the script — rejected: which decisions appear depends on the seed, so scripts must stay decision-agnostic.

### 4. One shared `ScriptRunner` + seed finder for Node and browser

`src/game/rules-lab/runRuleConfig.ts`: builds a `HeadlessGame` from the config (team rerolls, placements, skills), runs the script, returns `ScriptResult { responses, snapshot, events }`. `findSeed(config, outcomeId, {from, limit})` iterates seeds until the outcome's `matches` holds. Browser use: the sandbox calls `findSeed` directly (headless engine in-page — cheap, a config script is a handful of commands); if a search exceeds the limit (default 200 seeds) the UI reports "outcome not found in N seeds" rather than hanging. No worker needed at this scale; revisit if configs grow scripts long enough to jank the main thread.

### 5. Leveled sandbox selector with progressive disclosure

`SandboxOverlay` gains four stacked selectors, each rendered only when the previous level has a value: **Topic** (Core rules + one entry per `SkillCategory`) → **Rule** (skills of that category, badge ✓/○ from `SkillRegistry.has`) → **Configuration** → **Seed row** (number input, 🎲 random, and an outcome dropdown + "Find seed" that runs `findSeed` and loads the game with the found seed; the expected outcome renders under the selector as today). Core-rule scenarios (`SCENARIOS`) appear under the Core topic with the existing single-level behavior. Selecting a config loads it through the existing `ScenarioLoader` path (`UI_LoadScenario` extended to carry `ruleConfig` + seed).

### 6. Generated tests iterate the catalog; the gate closes the loop

`__tests__/headless/rules/catalog.test.ts` uses `describe.each` over every entry/config/outcome: `findSeed` then `verify` (plus implicit assertions: script ran ok, outcome matched). The **gate** test asserts: every `SkillRegistry`-implemented skill has ≥1 catalog config, and the inert list matches a named snapshot (same conscious-update pattern as the existing coverage test, which this replaces). Seed searches are bounded and deterministic (fixed start/limit), so CI cost is predictable; a config whose outcome needs rarer dice states declares its own search window.

### 7. CLI `--rule <skill> [--config <id>] [--outcome <id>]`

Reuses the same runner: prints each config, the seed found per outcome, and the response events — the terminal equivalent of the sandbox flow, satisfying "test every rule via the CLI". With `--seed`, runs exactly that seed and reports which outcome matched.

## Risks / Trade-offs

- [Seed search can't find an outcome (probability too low in the config)] → configs are authored so target outcomes have decent probability (e.g. low AG for failures); the finder's bounded window fails loudly with the searched range, prompting a config fix rather than a flaky pass.
- [Catalog boilerplate per rule discourages authoring] → helpers for the common shapes (a "failed roll offers reroll" factory, a block-result factory) keep typical entries ~20 lines; the 8 seeded entries serve as copy templates.
- [Browser seed search janks the UI] → command scripts are short and `noDelay` games run in microseconds; bounded at 200 seeds; measured before considering a worker.
- [Two scenario systems drift (core `SCENARIOS` vs rule catalog)] → core scenarios become the "Core rules" topic of the same selector and can adopt configs/outcomes incrementally; no parallel UI.
- [Unarchived `add-skill-rules-system` coordination] → this change only consumes its exports (registry, protocol) — no delta specs against it; archive order stays flexible.

## Migration Plan

1. Scenario type + `applyScenario` skills support (zero behavior change for existing scenarios).
2. Runner + seed finder + catalog types, seeded with Block only; generated suite runs it.
3. Migrate the remaining 7 implemented skills' assertions into catalog entries; flip the gate on; retire duplicated hand-written cases (keep the machinery tests — reroll constraints, suspension — which test the framework, not rules).
4. Sandbox selector + CLI flag, both reading the same catalog.

## Open Questions

- Should `use-reroll`-style decision moments be first-class outcomes ("decision offered to team X") in the predicate helper set from day one? (Default: yes — the 8 seeded entries need it.)
- Whether core `SCENARIOS` gain outcomes/configs now or stay single-level under the Core topic (default: stay as-is).
