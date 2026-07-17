# Tasks: add-rule-scenario-catalog

## 1. Scenario foundation

- [x] 1.1 Add `skills?: SkillType[]` to `PlayerPlacement`; `applyScenario` attaches catalog skills additively to placed players. Existing scenarios unchanged (full suite green).
- [x] 1.2 Catalog types in `src/game/rules-lab/` (`RuleScenarioEntry`, `RuleConfig`, `RuleOutcome`, `ScriptResult`) with stable placement-reference resolution for script player ids.

## 2. Runner + seed finder

- [x] 2.1 `runRuleConfig(config, seed)`: build HeadlessGame (placements, skills, team rerolls), execute the script, auto-answer decisions per the config's decision policy (default accept-skill/first-option), return responses + snapshot + events.
- [x] 2.2 `findSeed(config, outcomeId, {from, limit})`: bounded deterministic search; loud error with the exhausted range. Unit-test both paths.
- [x] 2.3 Outcome predicate helpers: pending-decision matchers (reroll offered/reaction offered incl. sources and chooser), event matchers (SkillTriggered/RerollUsed/Turnover/knockdown), snapshot matchers (position, status, ball).

## 3. Seed the catalog with the 8 implemented skills

- [x] 3.1 Authoring helpers: "failed roll offers reroll" factory and "block result" factory so a typical entry stays ~20 lines.
- [x] 3.2 Catalog entries for Block, Wrestle, Stand Firm, Tackle (block/reaction shapes) under `src/data/ruleScenarios/`, migrating assertions from `skill-block.test.ts` / `skill-triggers.test.ts`.
- [x] 3.3 Catalog entries for Dodge, Sure Hands, Catch, Pass (reroll shapes), migrating assertions from `skill-rerolls.test.ts`.

## 4. Generated tests + coverage gate

- [x] 4.1 `__tests__/headless/rules/catalog.test.ts`: describe.each over entry x config x outcome — findSeed then verify.
- [x] 4.2 Gate test: every registered rule has >=1 config; inert-skill snapshot (replaces the coverage snapshot in `skill-block.test.ts`). Retire hand-written cases now duplicated by the catalog, keeping framework-machinery tests (reroll constraints, suspension, ownership).

## 5. Sandbox leveled selector

- [ ] 5.1 `SandboxOverlay`: Topic -> Rule (implemented/inert badges from `SkillRegistry`) -> Configuration selectors with progressive disclosure; Core topic wraps existing `SCENARIOS`.
- [ ] 5.2 Load path: `UI_LoadScenario` carries rule config + seed; `ScenarioLoader` applies skill-equipped placements (via 1.1).
- [ ] 5.3 Seed row: numeric input, randomize, outcome picker + "Find seed" running the in-browser headless search; exhausted search surfaces in the UI; expected outcome text shown after load.

## 6. CLI + wrap-up

- [ ] 6.1 `pnpm headless --rule <skill> [--config <id>] [--outcome <id>] [--seed <n>]` on the shared runner; document in `--help`.
- [ ] 6.2 Full suite green; sandbox manually verified for one reroll skill (Sure Hands) and one reaction skill (Stand Firm) end-to-end.
