# Design: add-skill-rules-system

## Context

`.agent/rules/game-architecture-rules.md` already prescribes exactly this shape: "Rule Modifiers / Strategy Objects — model skills and special rules as composable logic; smells: giant switch(skill), hardcoded skill interactions." The data side exists (`Skills.ts` catalog, `player.skills[]`), the dice side is deterministic (`DiceController`/`RNGService`), and mid-action decisions already have a delivery mechanism (`pendingDecision` in the headless protocol, dialogs in the browser). What's missing is the connective tissue: hook points in the roll paths and a registry of rule objects.

## Goals / Non-Goals

**Goals:**

- Add a skill's rule without touching manager/controller internals — write one rule object, register it.
- Full-fidelity behavior for the starter six (Block, Dodge, Sure Hands, Catch, Pass, Wrestle) per the 2025 rulebook.
- Reroll decisions (skill + team) as real decisions in both front ends.
- Measurable coverage: which catalog skills are implemented vs. inert.

**Non-Goals:**

- Implementing all ~80 catalog skills (the system exists precisely so they land incrementally).
- Star player special rules, mutations pricing, inducements.
- AI reroll strategy (agents just answer the decision).

## Decisions

### 1. Rule objects with narrow, typed hooks

`SkillRule` exposes optional hook methods, each taking a context object it may adjust and returning nothing (mutating the context) — e.g. `onDodgeRoll(ctx: DodgeContext)`, `onBlockDiceCount(ctx)`, `onBlockResultApply(ctx)`, `onPickupRoll(ctx)`, `onCatchRoll(ctx)`, `onPassRoll(ctx)`, `offerReroll(ctx): RerollOffer | null`. Call sites gather the acting/target players' registered rules and fold them over the context. Alternative — event-listener skills — rejected per the architecture rules: events must not control flow.

### 2. Central registry, inert default

`SkillRegistry.get(skillType): SkillRule | undefined`; absent rules mean the skill does nothing (today's behavior). `SkillRegistry.coverage()` returns `{implemented, total, missing[]}` for tests/docs. A giant `switch` is explicitly forbidden; one file per rule under `src/game/skills/rules/`.

### 3. Rerolls ride the existing decision machinery

A failed eligible roll produces a `RerollOffer {playerId, source: "skill"|"team", skill?, rollKind}`. Browser: dialog. Headless: `pendingDecision {type:"reroll", …}` answered by `{type:"use-reroll", accept: boolean}` — same gating as block dice today. The reroll consumes the source (skill: once per action; team: once per turn, decrement team counter) and re-rolls through `DiceController` so determinism holds (a declined reroll consumes no dice). Team reroll counters already exist on `Team.rerolls`.

### 4. Hook placement inside the roll helpers, not the managers

`DodgeController.attemptDodge`, `BlockResolutionService`, `PickupOperation`, `CatchController`, `PassController` each get a single fold-rules step before/after their roll. Managers stay ignorant of skills entirely, per the architecture layering.

### 5. Skill activity is evented

`SkillTriggered {playerId, skill, effect}` and `RerollUsed {playerId, source, rollKind, before, after}` events feed the game log, sounds (future binding), and AI observability.

## Risks / Trade-offs

- [Hook granularity wrong for some future skill] → hooks are added per need; the starter six deliberately cover five different hook shapes (modify roll, modify dice count, replace result behavior, offer reroll, choice-on-result for Wrestle).
- [Reroll timing rules are fiddly (can't reroll a reroll; team reroll only on your turn)] → constraints live in one `RerollArbiter`, not per rule; seeded tests per constraint.
- [Wrestle needs a both-down choice — a *defender* decision] → reuse `pendingDecision` with `chooserTeamId`, same as uphill block dice.
- [Protocol delta lands while add-headless-engine is unarchived] → archive add-headless-engine first, or write this change's `action-protocol` delta against the promoted spec at implementation time.

## Migration Plan

Framework + registry first (zero behavior change — no rules registered), then reroll machinery, then starter rules one per PR-sized task, each with seeded tests. Coverage report added last.

## Open Questions

- Exact 2025 wording for Wrestle/Block interaction and Defender Stumbles vs. Dodge — verify against `docs/pdfs/` during implementation.
- Whether Pro/Loner-style reroll-modifying skills belong to `reroll-decisions` now or a later change (default: later).
