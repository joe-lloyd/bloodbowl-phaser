# Tasks: implement-all-skill-rules

Every remaining catalog skill appears in exactly one task below. Definition of done per skill: book text from `skills.json` → rule file → registered → catalog configs → generated tests green → gate snapshot updated.

**Scoping (Joe, 2026-07-18): standard rules first; subsystem-heavy work (batch 9, special actions, and rules needing missing engine features) is deferred to a follow-up part.** Reconciliation removed Portal Navigator/Passer, Wall Thrower, Running Pass, Swarming, Safe Throw (→Safe Pass) and merged Piling On into Pile Driver — those names are dropped from the batches below.

Progress: **48/108 catalog skills implemented** (gate snapshot in `__tests__/headless/rules/gate.test.ts` is the source of truth).

## 1. Movement & agility (rush-reroll seam DONE)

- [x] 1.1 Rush (GFI) rolls wired through `withRerollOffer` (rollKind `rush`) in both the move loop and the Blitz block; `moveAllowance`/`rushAllowance`/`standUpCost` helpers replace every scattered `MA + 2` site. (Interception rollKind deferred until an interception flow exists.)
- [x] 1.2 Sure Feet, Sprint, Break Tackle (once-per-turn via arbiter ledger, ST-gated +1/+3), Two Heads. Very Long Legs deferred (its clauses — Leap/Jump/Intercept/Cloud Burster — all need missing subsystems).
- [x] 1.3 DONE: Jump Up (free stand-up; the prone-Block clause deferred to the action-system part). DEFERRED: Leap (jump movement subsystem), Give and Go (activation-continues-after-pass flow), Steady Footing (cancellable-knockdown trigger).

## 2. Ball handling

- [x] 2.1 `onPickup`/`onCatch` trigger points (modifiers + auto-fail) wired in Pickup/Catch operations: Extra Arms (+1 pickup/catch), Big Hand (ignore negative pickup modifiers). Monstrous Mouth deferred (its 2025 rule is the Chomp Special Action).
- [x] 2.2 DONE: No Ball (auto-fail pickup/catch as a natural 1). DEFERRED: Diving Catch (adjacent-square catch subsystem), Safe Pair of Hands (ball-placement choice on knockdown), My Ball (action-declaration gating — negatrait seam).

## 3. Passing

- [x] 3.1 DONE: Accurate (+1 Quick/Short), Cannoneer (+1 Long/Bomb) via the `onPassDeclared` trigger. DEFERRED: Strong Arm (2025: Throw Team-mate clause — subsystem part), Cloud Burster (needs interception flow).
- [x] 3.2 DONE: Safe Pass (natural-1 fumble cancelled via `onPassResult`: ball held, activation ends, no turnover). DEFERRED: Fumblerooski (drop-ball-during-move subsystem), Hail Mary Pass, Punt (special actions).
- [x] 3.3 DONE: Nerves of Steel (ignore marking on pass + catch). DEFERRED: Dump-Off (interrupt pass), On the Ball (pre-pass/kickoff moves), Leader (per-half reroll bank semantics in RerollArbiter).

## 4. Block: armour & injury (seams DONE)

- [x] 4.1 Armour/injury/casualty trigger plumbing: `causedBy` threaded from blocks, causer-first fold order, injury modifier carried from the armour fold, `dice` on trigger contexts for rules that roll (Regeneration). Mighty Blow's post-roll armour-or-injury choice is auto-optimized (armour when it flips the break, else injury).
- [x] 4.2 Mighty Blow (parameter-aware, legacy +2 works), Claws (natural 8+ vs any AV), Thick Skull (8 → Stunned; Stunty interplay lands with Stunty), Iron Hard Skin (cancels armour modifiers + Claws, folds after the causer). Bullseye deferred (rulebook text extraction empty — fix extraction first).
- [x] 4.3 DONE: Decay (+1 casualty), Regeneration (D6 4+ ignores the casualty → Reserves). DEFERRED: Pile Driver (free Foul flow — Devious batch), Plague Ridden (roster-add subsystem).

## 5. Block: dice & flow (adds assist seam)

- [x] 5.1 Assist hook in `BlockValidator` (`onCountAssists`): Guard, Defensive.
- [x] 5.2 Pre/post block rolls & dice: Dauntless, Horns, Brawler, Foul Appearance.
- [x] 5.3 DONE: Fend (denies follow-up; honours the Juggernaut-blitz cancel via a `blockerIgnoresReactions` push flag), Strip Ball (pushed carrier drops the ball, which bounces), Grab (any-adjacent push-square choice via `getGrabPushOptions`; the Sidestep-cancel clause lands with Sidestep in batch 6), Juggernaut (Both Down→Push on a Blitz via `beginPush`; cancels Fend/Stand Firm through the push flag and Wrestle via `suppressReactions` on the result fold), Arm Bar (failed-dodge armour/injury +1: `ArmourOperation` now carries `cause: "dodge"` + `vacatedSquare` and gathers that square's markers; auto-optimized like Mighty Blow). DEFERRED: Hit and Run (needs a post-Block free-move coach decision — an interactive 1-square move ignoring tackle zones that must end unmarked; a new decision type + activation-end interception, subsystem-level).
- [x] 5.4 DEFERRED (needs re-entrant flow subsystems, not modifier rules): Frenzy (forced follow-up + a second full interactive Block Action re-driven through the flow queue, plus the Blitz second-block movement/Rush cost — spans the UI/headless/online block drivers) and Multiple Block (a new two-target simultaneous block declaration with a −2 ST duration effect). Both qualify as "rules needing missing engine features" under the batch-5 scoping note; land them with the subsystem work.

## 6. Marking reactions (adds opponent-movement trigger)

- [x] 6.1 Opponent-movement seam complete: the per-step marked-square gather on `onDodgeDeclared` (folds the dodger + opponents adjacent to the vacated square — Prehensile Tail) plus the richer reactions — (a) react after the dodge roll (Diving Tackle), (b) cancel the move and end the activation (Tentacles), (c) follow into the vacated square (Shadowing).
- [x] 6.2 Prehensile Tail (-1 to a dodge out of its tackle zone, once even with several tails), Diving Tackle (post-roll -2 + go prone), Shadowing (D6 4+ follow into the vacated square), Tentacles (D6 + ST vs ST to stop the dodge and end the activation) — all on the opponent-movement seam.
- [x] 6.3 Sidestep, Taunt, Disturbing Presence (aura also affects pass/catch — coordinate with batch 3).
- [x] 6.4 Size/marking passives: Stunty (dodge + injury table, incl. Thick Skull interplay), Titchy, Unsteady. Insignificant allowlisted as draft-list-only (2025 p.129 — nothing to enforce in-game; justified in the gate test).

## 7. Negatraits & activation (adds activation-declared trigger) — DEFERRED PART

- [ ] 7.1 `onActivationDeclared` trigger + lost-activation/Rooted effects; extra scenario coverage for activation/turnover edge cases.
- [ ] 7.2 Bone Head, Really Stupid, Animal Savagery, Unchannelled Fury, Take Root, Timmm-ber!.
- [ ] 7.3 Loner (parameter-aware), Pro (die-level reroll — resolve open question), Drunkard, Always Hungry.
- [ ] 7.4 Bloodlust (parameter-aware), Animosity (parameter-aware), Hatred, Trickster, Pick-Me-Up.
- [ ] 7.5 Special activation actions: Hypnotic Gaze, Breathe Fire, Projectile Vomit, Monstrous Mouth (Chomp), My Ball (declaration gating).

## 8. Fouling & Devious (adds foul-path triggers) — DEFERRED PART

- [ ] 8.1 Foul trigger points in `FoulOperation` (armour/injury modifiers, send-off effects).
- [ ] 8.2 Dirty Player (parameter-aware), Sneaky Git, Lone Fouler, Put the Boot In, Quick Foul.
- [ ] 8.3 Violent Innovator, Saboteur, Eye Gouge, Lethal Flight, Secret Weapon, Pile Driver. (Stab landed early: StabOperation + `stab` protocol command + trait catalog configs.)

## 9. Subsystems — DEFERRED PART (per scoping decision)

- [ ] 9.1 Throw Team-mate + Right Stuff + Swoop + Kick Team-Mate + Always Hungry TTM clause + Strong Arm + Cannoneer's Superb Throw clause (throw/landing/scatter chain).
- [ ] 9.2 Kick (kickoff deviation control) + Punt.
- [ ] 9.3 Chainsaw (special block action + kickback).
- [ ] 9.4 Bombardier (bomb throw/explosion chain) + Hail Mary's Throw Bomb clause.
- [ ] 9.5 Ball & Chain (random movement action).
- [ ] 9.6 Pogo (leap-style movement) + Leap + Very Long Legs + Diving Catch + interception flow (Cloud Burster, Extra Arms/VLL intercept clauses, Safe Pair of Hands, Fumblerooski, Dump-Off, On the Ball, Leader, Give and Go, Steady Footing, Jump Up's prone block, Bullseye).

## 10. Completion

- [ ] 10.1 Coverage report shows zero inert catalog skills (or an explicit, justified allowlist); inert-list snapshot emptied; full suite green; sandbox rule explorer spot-check of one skill per batch.
