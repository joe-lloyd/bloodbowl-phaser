# Design: add-remaining-skill-rules

## Context

The skill-rules framework (registry + typed hooks, reroll machinery, `DecisionService`, `BlockResultContext` mutation, flow-queue `GameOperation`s) already carries 77 skills. The catalog-configuration loop (`RULE_SCENARIOS` → sandbox rule explorer + CLI `--rule` + generated headless tests + `gate.test.ts` coverage gate) is the verification harness and does not change shape. Several subsystems the remaining skills need already exist: the Foul Action (`FoulOperation`, `FoulValidator`, `FoulController`), the Throw Team-mate / Right Stuff subsystem (`ThrowTeammateOperation`), the Stab special action (`StabOperation`), the Pass/Interception controllers, and the send-off/injury paths. This change reuses those seams and adds only the missing ones (foul-path folds, a Jump mechanic, pass-reaction triggers, four weapon operations, an end-of-Drive send-off pass, a Leader reroll grant).

## Goals / Non-Goals

**Goals:**

- Zero inert catalog skills except allowlisted Insignificant; every rule's wording sourced from `docs/rulebook/skills.json`, not memory.
- Each batch independently shippable and fully gated (rule + catalog configs + suite green + `gate.test.ts` snapshot bumped) — no long-lived broken states.
- New trigger points added only with their first consumer, following the established contract (deterministic gather, context mutation, decisions on the one channel, effects via the flow queue).
- Every skill gets a seeded sandbox scenario (manual check) **and** a headless test asserting the book clause.

**Non-Goals:**

- Star Player special rules, inducements, prayers, kickoff-event rework.
- AI strategy for the new decisions (agents keep decline-by-default; new decisions route by `chooserTeamId` like existing ones).
- Reworking the existing Foul / Throw Team-mate / Pass subsystems beyond adding fold points.

## Decisions

### 1. Batch by mechanism / shared seam, not by book category

Skills that share a new engine seam land together so the seam is built once and immediately exercised by several rules. The batches (see Migration Plan) are: Fouling/Devious (shares foul-path folds), Passing reactions (shares pass-declared + intercept-suppression), Jump family (shares the Jump mechanic), Special-action weapons (each its own operation), and a Misc leftovers batch (skills that ride existing rolls with no new seam). Secret Weapon + Saboteur ride with Devious because the send-off is a foul concept.

### 2. Reuse the existing Foul subsystem; add fold points, not new paths

`FoulOperation` gains fold points mirroring the block path:
- **`onFoulArmour` / `onFoulInjury`** (post-roll modifier via a reacting decision where the book allows applying "after the roll has been made"): Dirty Player (+1 to either), Lone Fouler (reroll a failed Armour roll when no assists).
- **`onFoulSentOff`**: Sneaky Git suppresses the send-off on a natural-double unbroken Armour roll.
- **`onCountAssists`** already exists — Put the Boot In extends offensive-assist eligibility (ignore markers for foul assists); Eye Gouge marks a pushed opponent ineligible-to-assist until next activated (a per-player flag cleared on activation).
- **Pile Driver** rides `onBlockResult`/follow-up: after a Block knockdown while still Marking, enqueue a free `FoulOperation`, then place the blocker Prone and end the activation.
- **Quick Foul** keeps the activation open (same pattern as Give and Go — the foul operation does not finalize the activation).
- **Violent Innovator** attributes SPP for a casualty caused by a Special Action (a flag on the special-action operations read by the casualty/SPP path).

### 3. A single Jump mechanic serves Leap / Pogo / Very Long Legs

Add a `JumpMove` resolved by `MovementManager`/`MovementValidator`: jump over one adjacent square (occupied or empty) landing two squares away, Agility Test with the standard jump modifiers. The three skills mutate a `JumpDeclaredContext` (reduce/ignore negative modifiers, add +1). Very Long Legs also adds +2 to the interception roll (a modifier on the intercept path) and sets an "ignores Cloud Burster" flag read where Cloud Burster suppresses interception. The Leap/Pogo mutual exclusion is a roster constraint (no roster pairs them) — noted, not enforced in-match.

### 4. Pass-reaction triggers and intercept suppression

Add an `onOpponentPassDeclared` trigger fired after the target square is declared but before the Passing Ability Test: On the Ball moves up to 3 squares (a reacting-team decision + move, ending on a Fall Over). Dump-Off fires from the Block/targeting path (an `onTargeted` reaction) to enqueue a Quick Pass before the targeting action resolves. Cloud Burster and Hail Mary Pass set an intercept-suppression flag on the pass context (Very Long Legs ignores Cloud Burster's). Give and Go keeps the activation open after a no-turnover Quick Pass/Hand-off (same open-activation pattern as Quick Foul).

### 5. Special-action weapons are flow-queue operations with protocol + browser wiring

`ChainsawAttackOperation`, `ThrowBombOperation`, `BallAndChainMoveOperation`, and `PuntOperation` each follow `StabOperation`/`ThrowTeammateOperation`'s shape (a finish-or-continue operation queued on the flow), with a protocol command and an action-menu entry. Throw Bomb reuses `PassController` for the throw and adds an explosion resolver; Ball & Chain and Punt reuse the Throw-in Template direction/distance roll. Chainsaw's always-on +3-armour-against-me clause is an `onArmourBreak`-style modifier keyed on the wielder being the downed player.

### 6. Definition of done per skill (uniform)

Book text read from `skills.json` → rule file (one per family, parameter-aware via `getSkill`) → registered in `registerBuiltinSkills` → seeded catalog configuration(s) covering each distinct book clause (sandbox + CLI manual path) → headless test(s) locking the clause → `gate.test.ts` implemented-set + `cov.implemented` bumped. The gate makes a partial batch impossible to merge silently.

### 7. Interactions owned by the later-landing skill

Where a skill's text names another (Very Long Legs ignores Cloud Burster; Saboteur requires Secret Weapon; Bullseye requires Throw Team-mate; Lethal Flight requires Right Stuff; Ball & Chain ignores Shadowing/Tentacles/Foul Appearance), the interaction config is owned by whichever lands second and gets its own catalog outcome.

## Risks / Trade-offs

- **Fouling touches send-off/turnover flow, historically fragile** → the Devious batch gets extra scenario coverage around foul edge cases (double-not-broken send-off, foul-caused turnover, Pile Driver's forced-prone activation end); it lands after the passing/misc batches harden the loop.
- **Post-roll "apply after seeing the roll" modifiers** (Dirty Player, Lethal Flight) need a reacting decision, not a passive fold → reuse the existing armour/injury reacting-decision pattern (Mighty Blow-class) rather than inventing a channel.
- **Four new operations + a Jump mechanic is a lot of surface** → each is independent and lands as its own sub-batch; a stalled weapon operation blocks nothing else.
- **Ball & Chain is the most complex single trait** (template move + auto-dodge + forced block + off-pitch/crowd risk + bounce) → land it last of the weapons; if a clause proves out-of-scope it gets an explicit catalog note, not a silent omission.

## Migration Plan

Batch order (each = one PR-sized group, suite green + gate snapshot bumped after each):

1. **Misc leftovers** (no new seam): Diving Catch, Safe Pair of Hands, Hit and Run, Fumblerooski, Multiple Block, Bullseye, Lethal Flight. Rides existing catch/carry/block/throw-teammate rolls.
2. **Passing reactions**: Cloud Burster, Hail Mary Pass, Give and Go, Dump-Off, On the Ball, Leader, Punt. Adds pass-declared reaction + intercept-suppression + Leader reroll + the Punt operation.
3. **Jump family**: Leap, Pogo, Very Long Legs. Adds the Jump mechanic.
4. **Fouling / Devious + Secret Weapon**: Dirty Player, Lone Fouler, Sneaky Git, Put the Boot In, Eye Gouge, Quick Foul, Pile Driver, Violent Innovator, Secret Weapon, Saboteur. Adds foul-path folds + end-of-Drive send-off.
5. **Weapons**: Chainsaw, Bombardier, Ball & Chain (in that order of rising complexity).

## Open Questions

- Does the existing Foul path already expose enough state (fouler assists, natural-double detection, send-off point) or does `FoulOperation` need refactoring to host the folds? (Resolve at batch 4 start by reading `FoulOperation`.)
- Whether the Jump mechanic should reuse the Dodge Agility-Test plumbing or get its own roll path (book jump modifiers differ from dodge). (Resolve at batch 3.)
- Punt vs Ball & Chain vs Throw Bomb can share a Throw-in Template helper — extract one helper or inline per operation? (Decide when the second template-using operation lands.)
