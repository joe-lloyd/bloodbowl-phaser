# Proposal: add-rule-scenario-catalog

## Why

The skill-rules framework can now enforce rules (8 of 126 catalog skills implemented), but verifying a rule means hand-writing a vitest file and hand-pushing skills onto players — the `Scenario` type cannot even express "this player has Dodge". There is no way to demo or manually test a rule in the sandbox (one flat scenario dropdown), and nothing forces a new rule to arrive with tests. Before implementing the remaining ~118 skills, we need infrastructure that makes each rule cheap to verify everywhere: one declarative catalog of per-rule scenarios consumed by the sandbox UI, the headless CLI, and the test suite.

## What Changes

- **Scenario placements can equip skills**: `PlayerPlacement.skills?: SkillType[]`, applied by `applyScenario`, so skill situations are declarative and identical in browser, CLI, and tests.
- **Rule-scenario catalog**: a new data module mapping each skill to one or more named *configurations* (placements + skills + optional protocol-command script that drives play to the rule-relevant moment) and declared *outcomes* (named, machine-checkable predicates over the command responses/snapshot, e.g. "reroll offered", "defender stays up").
- **Leveled sandbox selector**: the sandbox overlay's flat dropdown becomes progressive disclosure — Topic (core rules / skill category) → Rule (badged ✓ implemented / ○ inert) → Configuration → Seed. Selectors appear only once the previous level is chosen.
- **Outcome-driven seed finder**: the sandbox and CLI can search seeds until a chosen outcome predicate holds (the engine is Phaser-free, so the browser runs headless games silently to find a seed, then loads the visual game with it). No hardcoded magic seeds.
- **Generated per-rule test suite**: one vitest suite iterates the catalog — every configuration × every declared outcome, seed-hunted and asserted — replacing per-skill hand-written boilerplate for future rules.
- **Coverage gate**: a test fails when a skill has a registered rule but no catalog configurations (implemented-but-untested), and snapshots the inert list so catalog drift is conscious.
- **CLI rule runner**: `pnpm headless --rule <skill>` runs a rule's configurations from the terminal and reports which outcome each seed produced.

## Capabilities

### New Capabilities

- `rule-scenarios`: The catalog format and semantics — skill-equipped placements, configurations, scripted drives, named outcome predicates, seed search determinism.
- `sandbox-rule-explorer`: The leveled sandbox selector and outcome-driven seed picking in the browser.
- `rule-test-coverage`: The generated per-rule test suite, the implemented-rules-must-have-scenarios gate, and the CLI rule runner.

### Modified Capabilities

<!-- none: skill-rules' registry/coverage requirements are unchanged; this change consumes them -->

## Impact

- **Modified code**: `src/types/Scenario.ts` (+`skills` on placements), `src/game/applyScenario.ts`, `src/ui/components/hud/SandboxOverlay.tsx` (leveled selector), `src/headless/cli.ts` (`--rule`), `src/data/scenarios.ts` (core scenarios get topic tags).
- **New code**: `src/data/ruleScenarios/` (catalog, one file per skill category), outcome predicate helpers, seed-finder utility (shared browser/Node), `__tests__/headless/rules/` generated suite + coverage gate.
- **Seeded content**: catalog entries for the 8 implemented skills (Block, Dodge, Tackle, Sure Hands, Catch, Pass, Wrestle, Stand Firm), migrating the assertions of the existing hand-written skill tests.
- **Coordination**: builds directly on `add-skill-rules-system` (unarchived — archive it first or accept both in flight). `reconcile-skill-catalog` should land before mass catalog authoring so configuration names track the corrected 2025 skill list; the infrastructure itself does not depend on it.
