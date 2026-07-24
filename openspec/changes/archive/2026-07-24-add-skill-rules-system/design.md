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

### 6. Reactive/interrupt triggers — how skills can affect anything, any time

Roll-modifier hooks (decision 1) cover skills that adjust the *acting* player's own roll. But many skills fire in reaction to the **opponent's** action or mid-flow and can bend the base rules: Tackle (deny an escaping dodge's reroll), Diving Tackle (drop prone to worsen an opponent's dodge), Stand Firm (refuse a push), Frenzy (force a second block), Foul Appearance / Dauntless (a roll *before* the opponent's block), Side Step (choose the push square). The framework handles these with three additions, none of which touch the base rule's own code:

1. **Named trigger points, all-participant gather.** Each rule-relevant moment is a named point (`onDodgeDeclared`, `onBlockDeclared`, `onPush`, `onBlockResult`, `onFollowUp`, `onArmourBreak`, …). At each point the engine gathers registered rules from **every relevant player** — actor, target, and adjacent opponents — not just the actor. A rule reads the context (who, from/to squares, current result) and may modify it, so Tackle on a stationary defender changes an adjacent opponent's dodge context.

2. **Reactions are decisions.** A trigger that needs the reacting coach's choice (Diving Tackle "use it?", Stand Firm "stay?", Side Step "which square?", Wrestle "both down?") produces a `pendingDecision` whose `chooserTeamId` is the **reacting** player's team — exactly the mechanism uphill block dice and rerolls already use. The base action pauses on the decision and resumes with the answer. No new interrupt bus; reactions reuse the one decision channel, so ordering and the online layer are already handled.

3. **Flow-altering effects go through the queue, not inline mutation.** Effects that add or replace steps (Frenzy's second block, a pre-block Foul Appearance roll, Juggernaut turning a block into a Blitz) enqueue a `GameOperation` on the existing `GameFlowManager` rather than reaching into the base rule. The base rule stays a self-contained unit; skills compose *around* it via ordered operations. `SkillTriggered` still announces each so logs/AI/UI see why the base outcome changed.

Rejected — a global "interrupt/reaction event bus" any skill can hook: it would put flow control in events (forbidden by the architecture rules) and make ordering/priority implicit. Named trigger points + the decision channel + the operation queue keep control explicit and testable.

### 7. Online integration — skill decisions ride the host-authoritative channel

Because every skill interaction that needs a human choice is a `pendingDecision` with a `chooserTeamId` (decisions 3 and 6), the networked layer needs no new transport: it already routes decisions by `chooserTeamId` (`OwnershipGate.decisionOwner`, `mayAct`) and the host runs the only engine. This change extends four narrow seams:

- `src/headless/protocol.ts`: add the `reroll` and `reaction` `PendingDecision` variants + their reply commands (`use-reroll`, `use-reaction`).
- `HeadlessGame`: intercept the new skill decisions the same way it intercepts block dice.
- `OwnershipGate.decisionOwner`: map the new decision types to their `chooserTeamId` (the reacting team) so the online gate accepts the reply only from the right coach.
- `NetworkedGameService`: relay the new reply commands (thin, like `choose-block-result`).

All skill dice roll on the host and broadcast in the response/snapshot, so determinism and the guest's view are unchanged. A declined reroll/reaction consumes no dice, preserving replay. This keeps skills working identically in local hotseat and online play.

## Risks / Trade-offs

- [Hook granularity wrong for some future skill] → hooks are added per need; the starter set deliberately covers the distinct shapes: modify roll, modify dice count, replace result behavior, offer reroll, choice-on-result (Wrestle), and a **reaction decision** (a starter reactive skill — Stand Firm or Diving Tackle — proves trigger point + reacting-team decision + flow effect).
- [Reaction ordering when several skills trigger at one point] → gather is deterministic (fixed participant order: actor, then target, then adjacents by position); a rule may read what earlier rules set. Priority conflicts are resolved per trigger point, tested with seeded multi-skill scenarios.
- [Reactive skills interact badly with the online decision gate] → they don't: reactions are `pendingDecision`s with `chooserTeamId`, the same path the online layer already gates; covered by an online reroll/reaction ownership test alongside the existing block-dice one.
- [Reroll timing rules are fiddly (can't reroll a reroll; team reroll only on your turn)] → constraints live in one `RerollArbiter`, not per rule; seeded tests per constraint.
- [Wrestle needs a both-down choice — a *defender* decision] → reuse `pendingDecision` with `chooserTeamId`, same as uphill block dice.
- [Protocol delta lands while add-headless-engine is unarchived] → archive add-headless-engine first, or write this change's `action-protocol` delta against the promoted spec at implementation time.

## Migration Plan

Framework + registry first (zero behavior change — no rules registered), then reroll machinery, then starter rules one per PR-sized task, each with seeded tests. Coverage report added last.

## Open Questions

- Exact 2025 wording for Wrestle/Block interaction and Defender Stumbles vs. Dodge — verify against `docs/pdfs/` during implementation.
- Whether Pro/Loner-style reroll-modifying skills belong to `reroll-decisions` now or a later change (default: later).
