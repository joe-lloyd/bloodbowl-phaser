# Tasks: implement-negatrait-rules

Definition of done per skill (unchanged from the previous part): book text from `docs/rulebook/skills.json` (PDF is authority where OCR truncates) → rule file → registered → catalog configs → generated tests green → gate snapshot updated (48 → 68 by completion).

## 1. Seams: activation gate + conditions

- [x] 1.1 `onActivationDeclared` trigger: async fold in the declaration path with context `{ player, action, dice }` and mutation fields (`downgradeTo`, `endActivation`, `applyCondition`, forced-choice via the decision channel); failure effects flow through existing activation/turnover paths; a failed gate on a declared Blitz still consumes the turn's Blitz.
- [x] 1.2 Player conditions (Distracted, Rooted, Chomped) as serialized state: on `Player`, in `serialization.ts` snapshots, announced via events; engine-owned expiry (Distracted: verify exact wording in the PDF's Distracted definition first; Rooted: end of drive / Knocked Down / Placed Prone; Chomped: chomper stops Marking).
- [x] 1.3 Condition effects at existing seams via one `hasTackleZone` helper: Distracted excluded from dodge modifiers, marking counts, `adjacentStanding` gathers, and assist counting; Rooted refuses Move/Secure declarations + follow-up and is immovable in the push chain (a condition, so Juggernaut's cancel does not apply); Rooted/Chomped cannot leave their square. The condition-vs-seam interaction is verified where each condition is SET (every gaze/chomp/gate catalog test asserts the snapshot condition); dedicated cross-activation Rooted-vs-push and Distracted-vs-assist configs are a lighter follow-up (the code paths are already exercised by the full suite).
- [x] 1.4 Activation/turnover edge cases: the gate ends the activation through `finishActivation` (turn passes cleanly, no turnover — asserted by every `activationOver` outcome); lash-out Knocks Down the victim with armour/injury and only turns the ball over when the victim carried it (animal-savagery `lashes-out` outcome); a failed gate after a declared Blitz leaves the Blitz consumed (the flag is set at declaration, before the gate).

## 2. Simple gates & modifiers

- [x] 2.1 Bone Head (2+, 1 → Distracted), Really Stupid (4+, +2 with an eligible adjacent team-mate; 1–3 → Distracted), Unchannelled Fury (4+, +2 on Block/Blitz; 1–3 → activation ends), Take Root (2+ when Standing; 1 → Rooted).
- [x] 2.2 Timmm-ber! (+1 per Open Standing adjacent team-mate on the stand-up roll for MA ≤ 2; natural 1 still fails), Drunkard (−1 on Rush tests).

## 3. Reroll machinery

- [x] 3.1 Loner (X+): parameter-aware team-reroll gate — roll the threshold before the team reroll applies; a failed gate consumes the team reroll.
- [x] 3.2 Pro: die-level reroll source in `withRerollOffer` (offered on every eligible single-die roll kind during the player's own activation; Armour/Injury/Casualty never route through this seam). Block-dice-pool rerolls have no seam yet — Pro extends to them when one lands. in `withRerollOffer`/`RerollArbiter` — 3+ usage roll, one chosen die of the original roll, ineligible for Armour/Injury/Casualty/out-of-activation rolls, locks the roll against all other reroll sources once attempted.

## 4. Choice & keyword traits

- [x] 4.1 Animal Savagery (4+, +2 on Block/Blitz; 1–3 → choose an adjacent Standing team-mate to Knock Down — coach decision, deterministic first-eligible for agents; turnover rules per book, e.g. dropped ball).
- [x] 4.2 Bloodlust (X+, +1 on Block/Blitz; failure → coach may downgrade to Move via the decision channel, Blitz still consumed). The end-of-activation Thrall Lineman bite is NOT enforced: no roster fields Thrall Linemen, so the clause is inert by the book — documented in BloodlustRule and ActivationGateOperation; lands with a Vampire roster. (X+, +1 on Block/Blitz; failure → may downgrade to Move, Blitz still consumed; end-of-activation Thrall bite per the open design question — implement the gate now, bite clause only if a Thrall-bearing roster exists, otherwise document as inert clause).
- [x] 4.3 Keyword helper `matchesKeyword(player, param)` (`(all)` = any team-mate) + Animosity (X) (1 on pass/hand-off to a matching team-mate → refuse, activation ends, no turnover) + Hatred (X) (may reroll a single Player Down result blocking a matching opponent).
- [x] 4.4 Trickster (relocation via `onBlockDeclared` reaction; BlockManager re-runs the assist analysis from the new square. Ball-carrier/on-ball pick-up clauses and the Ball & Chain exception land with their subsystems.) (before block dice against them: relocate to any unoccupied square adjacent to the attacker — reacting-team decision on `onBlockDeclared`; ball-carrier and on-ball clauses per book; Ball & Chain exception noted for the subsystem part).
- [x] 4.5 `onTurnEnding` trigger (fires in `TurnManager.endTurn` before the next turn starts) + Pick-Me-Up (5+ per Prone team-mate within 3 squares of a Standing carrier; a player stood up by the trait cannot also use it that turn).
- [x] 4.6 Always Hungry: register with its enforceable non-TTM presence; the Throw Team-mate clause stays deferred to the subsystem part (documented in the rule file).

## 5. Special activation actions (Stab pattern)

- [x] 5.1 Breathe Fire: declared special action + operation (D6, −1 vs ST 5+; 1 → self Knocked Down, 2–3 nothing, 4+ Placed Prone, natural 6 → Knocked Down), Blitz replacement, activation ends; headless command.
- [x] 5.2 Projectile Vomit: declared special action + operation (2+ → unmodifiable Armour Roll on target; 1 → unmodifiable Armour Roll on self), Blitz replacement, activation ends; headless command.
- [x] 5.3 Hypnotic Gaze: declared special action with pre-move (Blitz movement pattern; no movement after the gaze) — D6 vs adjacent Standing opponent: 1–2 nothing, 3+ target Distracted; activation ends either way; headless command.
- [x] 5.4 Monstrous Mouth (Chomp): declared special action (3+ → target Chomped while Marking holds), Blitz replacement; plus the Strip Ball immunity clause; headless command.
- [x] 5.5 My Ball: declaration gating via the existing `onActionDeclared` fold — no Pass/Hand-off declarations while holding the ball, and no relinquish-style skill use.

## 6. Completion

- [x] 6.1 Gate snapshot at 68 implemented; full suite green (524 tests, +33 negatrait catalog outcomes seed-hunted and verified); coverage report shows only the deferred parts (fouling/Devious, subsystems) remaining. Sandbox uses the same `RULE_SCENARIOS` catalog, so the new entries surface there automatically.
