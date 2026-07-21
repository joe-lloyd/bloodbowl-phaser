# Design: implement-negatrait-rules

## Context

The skill framework (registry, typed trigger folds, reroll machinery, decision channel, flow-queue operations) covers 48/108 catalog skills. The negatrait batch was deferred from `implement-all-skill-rules` because it needs two seams the framework lacks: a roll between declaring and performing an action, and durable player conditions (the 2025 book resolves most negatrait failures into **Distracted**, **Rooted**, or **Chomped** rather than "lose your activation"). The Stab work already established the special-action pattern (declared action string → `GameOperation` → activation ends via a back-of-queue finish op, protocol command mirroring it). Rulebook text for all 20 entries is extracted in `docs/rulebook/skills.json` (OCR-noisy in places — Take Root and Bloodlust truncate mid-sentence; re-check the PDF at implementation). Historical fragility: activation/turnover interplay has produced bugs before (ai_notes), so this batch carries extra scenario coverage.

## Goals / Non-Goals

**Goals:**

- All 20 batch skills registered and gated: gate snapshot 48 → 68, suite green per group.
- Conditions are first-class, serialized state — visible to UI, headless snapshots, and the online proxy, enforced at existing seams rather than scattered `if`s.
- The activation gate is one seam used by every activation-roll negatrait; no per-trait special cases in managers.

**Non-Goals:**

- Always Hungry's Throw Team-mate clause, interception-flow traits, batch-9 subsystems.
- AI strategy for the new decisions (agents keep decline-by-default; Animal Savagery's forced choice picks the first eligible team-mate deterministically for agents).
- Star player rules, inducements, prayers.

## Decisions

### 1. One `onActivationDeclared` fold, run inside the declaration flow

`declareAction` queues the declared action's flow as today, but first folds `onActivationDeclared` over the activating player (async — it rolls dice and may await decisions). The context carries `{ player, action, dice, rng }` plus mutation fields: `downgradeTo` (Bloodlust → Move), `endActivation` (Unchannelled Fury, Animosity refusal), `applyCondition` (Bone Head/Really Stupid → Distracted, Take Root → Rooted), and `lashOutTarget` (Animal Savagery). Failure effects apply through existing status/turn paths (`finishActivation`, knockdown ops). One roll per activation; the once-per-turn ledger in `RerollArbiter` is not involved — these are compulsory rolls, rerollable only by team reroll where the book allows. Alternative — hooking each ActionManager — rejected: N seams for one mechanism.

### 2. Conditions as serialized player state, enforced at existing seams

Add `conditions` to `Player` (a small set: `distracted`, `rooted`, `chomped`), included in `serialization.ts` snapshots and `PlayerStatusChanged` events. Effects land where the engine already asks the relevant question: assist/tackle-zone logic (`BlockValidator`/marking helpers) skips Distracted players; `MovementManager` refuses moves for Rooted/Chomped and skips their push-back (push chain treats Rooted as immovable, like Stand Firm's decline path); stand-up/follow-up checks consult conditions. Expiry is owned by the condition, per book: Distracted clears when the player is next activated (verify exact wording against the PDF's Distracted definition — it lives in the general rules, not skills.json), Rooted ends at end of drive or on Knocked Down/Placed Prone, Chomped ends the moment the chomper stops Marking. Alternative — encode conditions as pseudo-skills — rejected: they are state with expiry, not rules.

### 3. Pro extends the reroll machinery to die level (resolves the open question)

`RollLike` already carries the rolled dice; the reroll offer gains a `pro` source when the roller has Pro, hasn't attempted it this activation, and the roll kind is eligible (not armour/injury/casualty, not outside the player's activation). Accepting Pro rolls the 3+ gate first; on success exactly one die (chooser picks the die index for multi-die rolls — one new decision payload field, not a new decision type) is rerolled; on failure the roll stands and no other reroll source may be offered for it (book: once attempted, no other source). Alternative — a standalone decision type — rejected: doubles protocol surface for the same choice.

### 4. Special actions reuse the Stab pattern verbatim

Breathe Fire, Projectile Vomit, Hypnotic Gaze, and Chomp each get a declared action string, a `GameOperation`, a headless protocol command, and an activation-ending finish op — exactly like `StabOperation`. Blitz replacement (Breathe Fire, Projectile Vomit, Chomp per book) reuses the Stab gate (`declared === "blitz"`). Hypnotic Gaze's pre-move is the Blitz movement pattern: move first, then the special action ends the activation; no move after the gaze. My Ball needs no operation — it forbids pass/hand-off declarations and relinquish-style skills via the existing synchronous `onActionDeclared` fold.

### 5. Keyword matching is a helper, not per-rule logic

Animosity (X) and Hatred (X) read their instance `parameter` and match against `Player.keywords` (Race/Position/Trait keyword enums already on the type) via one shared `matchesKeyword(player, param)` helper; `Animosity (all)` matches any team-mate. Rules stay parameter-aware per the established `getSkill` pattern.

### 6. End-of-opponent-turn trigger fires in `TurnManager.endTurn`

Before control passes to the next team, fold an `onTurnEnding` trigger over the team whose opponent's turn just ended — Pick-Me-Up rolls its 5+ per eligible Prone team-mate within 3 squares of a standing carrier of the trait, honouring the "a stood-up carrier cannot also use it this turn" clause. Trigger lands with its first consumer per the spec's rule; Trickster (block-declared relocation decision) exercises the existing `onBlockDeclared` seam.

## Risks / Trade-offs

- [Activation/turnover interplay is historically fragile] → dedicated seeded scenarios for: failed gate on the last activatable player, lash-out knockdown of the ball carrier (turnover), Bloodlust downgrade after a declared Blitz consuming the turn's Blitz, refusal ending activation without turnover.
- [OCR text truncates Take Root/Bloodlust/Breathe Fire clauses; Distracted's definition is outside skills.json] → read the PDF directly for those clauses before coding them; treat skills.json as index, PDF as authority.
- [Conditions touch block/push/movement paths shipped by earlier batches] → effects only at named seams, each with catalog interaction configs (e.g. Rooted vs push chain, Distracted vs assists) owned by this batch per the interactions-owned-by-later-batch rule.
- [Pro's die-level reroll complicates the arbiter contract] → the `pro` source is additive; existing sources' behaviour is locked by the current suite.

## Migration Plan

Groups land in order, suite green after each: (1) activation gate + conditions plumbing, (2) simple gates (Bone Head, Really Stupid, Unchannelled Fury, Take Root, Timmm-ber!, Drunkard), (3) reroll rules (Loner, Pro), (4) choice/keyword traits (Animal Savagery, Bloodlust, Animosity, Hatred, Trickster, Pick-Me-Up, Always Hungry), (5) special actions (Breathe Fire, Projectile Vomit, Hypnotic Gaze, Chomp, My Ball).

## Open Questions

- Exact Distracted expiry wording (PDF general rules) — assumed "until next activated"; verify before wiring expiry.
- Whether Bloodlust's end-of-activation Thrall bite is in scope (needs a bite decision + injury on a team-mate); if the roster has no Thrall Linemen the clause is inert — implement the gate/downgrade now, bite when Vampire rosters land, allowlist-note otherwise.
