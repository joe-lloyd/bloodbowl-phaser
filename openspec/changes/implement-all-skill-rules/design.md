# Design: implement-all-skill-rules

## Context

The framework from `add-skill-rules-system` handles five effect shapes: roll modifiers via trigger contexts, reroll offers (`rerollable` + arbiter), reacting-team decisions (`DecisionService`), result mutation (`BlockResultContext`), and flow-queue operations. 8 skills use it. The remaining ~110 families (post-reconciliation) mostly fit those shapes; a minority need new trigger points or whole subsystems. `add-rule-scenario-catalog` supplies the verification loop (catalog configs → sandbox + CLI + generated tests + coverage gate); `reconcile-skill-catalog` fixes names/families first. Rulebook text is extractable from the PDF (proven for Wrestle/Stand Firm) and, after reconciliation, available per skill in `docs/rulebook/skills.json`.

## Goals / Non-Goals

**Goals:**

- Zero inert catalog skills at completion; every rule's wording sourced from `skills.json`, not memory.
- Each batch independently shippable and fully gated (rule + catalog configs + suite green) — no long-lived broken states.
- New trigger points added only with their first consumer, keeping hook granularity honest.

**Non-Goals:**

- Star player special rules, inducements, prayers, kickoff-event table rework.
- AI strategy for the new decisions (agents keep the decline-by-default policy).
- Multiplayer changes — reroll/reaction decisions already route by `chooserTeamId`; new decisions reuse that path.

## Decisions

### 1. Batch by mechanism, not by category

Skills sharing a trigger point land together, so each new seam is built once and immediately exercised by several rules (e.g. the opponent-movement trigger lands with Shadowing + Tentacles + Prehensile Tail + Diving Tackle). Alternative — batch by book category — rejected: categories mix mechanisms, which would force building every seam in the first batch.

### 2. Engine seams are lazy and follow the established patterns

- **Rush/interception rerolls**: new `RerollableRollKind`s wired through `withRerollOffer` exactly like dodge/pickup.
- **`onInjuryRoll` / `onArmourRoll` modifiers**: Mighty Blow-class effects choose armour-or-injury via a reacting decision where the book allows post-roll choice.
- **Assist hook**: `BlockValidator.analyzeBlock` folds an `onCountAssists` trigger so Guard/Defensive adjust assist eligibility without the validator knowing skills.
- **`onActivationDeclared`**: negatraits (Bone Head, Really Stupid, …) roll before the declared action, using the flow queue for the roll and the decision channel where a coach chooses (Bloodlust victim, Hypnotic Gaze target). Failure effects (lose activation, Rooted) apply through existing status/turn paths.
- **Opponent-movement trigger**: fired per step alongside `onDodgeDeclared`, giving marked-square rules a chance to react (Shadowing chase decision, Tentacles escape roll, Diving Tackle's post-roll prone drop).
- **Foul triggers**: fold points in `FoulOperation` (armour/injury modifiers, send-off modification) for the Devious batch.

### 3. Subsystems ride the flow queue as operations

Throw Team-mate, Chainsaw, Bombardier, Ball & Chain, Pogo Stick, and Kick each become `GameOperation`s (plus protocol commands where a coach aims/chooses), composed around existing rules like every other flow effect — no special-case paths inside managers. Each subsystem lands as its own batch with its own headless protocol additions, mirroring how block decisions work today.

### 4. Definition of done per skill (uniform)

Book text read from `skills.json` → rule file (one per family, parameter-aware via `getSkill`) → registered → catalog configurations covering the book's distinct clauses → generated tests pass → coverage-gate snapshot updated. The batch checkbox in tasks.md is the tracking unit; the gate makes partial batches impossible to merge silently.

### 5. Interactions are owned by the later batch

Where skills interact (Tackle/Dodge pattern), the batch that lands second owns the interaction configs (e.g. Juggernaut lands after Wrestle/Fend/Stand Firm and adds the configs where it cancels them). Interaction pairs called out in the book get explicit catalog outcomes, not just solo-skill configs.

## Risks / Trade-offs

- [110 rules is a long campaign; drift between early and late batches] → the uniform definition-of-done + gate keeps every landed batch verified regardless of when later ones arrive; batches are independent.
- [A book clause needs a hook shape we didn't predict] → hooks are added per need (framework's stated policy); the risk is per-batch, not global.
- [Negatraits touch activation flow, historically fragile (turnover/activation bugs in ai_notes)] → negatrait batch gets extra scenario coverage around activation edge cases (lost activation + turnover interplay), and lands after the simpler batches have hardened the catalog loop.
- [Some catalog entries may prove to be non-skill traits needing systems out of scope (e.g. Secret Weapon needs send-offs — which exist)] → reconciliation flags kind/usage first; anything truly out of scope gets an explicit allowlist entry in the gate rather than silent omission.

## Migration Plan

Batch order (each = one PR-sized group, suite green after each):

1. Seams-lite + movement/agility modifiers (rush rerolls first — they unlock several skills).
2. Ball handling → passing (mostly modifiers on existing rolls).
3. Block armour/injury → block dice/flow (adds injury + assist seams).
4. Marking reactions (adds opponent-movement seam).
5. Negatraits/activation (adds activation seam).
6. Fouling/Devious (adds foul seams).
7. Subsystems, one at a time (TTM, Chainsaw, Bombardier, Ball & Chain, Pogo, Kick).

## Open Questions

- Pro's "reroll one die of a multi-die roll" needs die-level rerolls (block dice, armour) — extend the reroll machinery or model as its own decision type? (Resolve when batch 5 starts.)
- Whether Kick's deviation-halving needs a coach decision or is automatic (book check at implementation).
- Exact set of skills that end up allowlisted as out-of-scope traits, if any (target: none).
