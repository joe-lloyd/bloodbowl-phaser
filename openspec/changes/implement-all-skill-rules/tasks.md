# Tasks: implement-all-skill-rules

Every remaining catalog skill appears in exactly one task below (pre-reconciliation names; collapsed families noted). Definition of done per skill: book text from `skills.json` → rule file → registered → catalog configs → generated tests green → gate snapshot updated. Batch membership may shift after `reconcile-skill-catalog`; the union must stay complete.

## 1. Movement & agility (adds rush-reroll seam)

- [ ] 1.1 Wire rush (GFI) rolls through `withRerollOffer` (new rollKind `rush`); interception rollKind while in the dice paths.
- [ ] 1.2 Sure Feet, Sprint, Break Tackle, Two Heads, Very Long Legs (dodge/rush modifiers + rerolls).
- [ ] 1.3 Leap, Jump Up, Give and Go, Steady Footing, Portal Navigator.

## 2. Ball handling

- [ ] 2.1 Extra Arms, Big Hand, Monstrous Mouth (pickup/catch modifiers).
- [ ] 2.2 Diving Catch, Safe Pair of Hands, My Ball, No Ball.

## 3. Passing

- [ ] 3.1 Accuracy modifiers: Accurate, Cannoneer, Strong Arm, Cloud Burster, Wall Thrower, Portal Passer.
- [ ] 3.2 Failure/interception handling: Safe Pass, Safe Throw, Fumblerooski ("Fumbleoskie"), Hail Mary Pass, Punt, Running Pass.
- [ ] 3.3 Reactions & team effects: Dump-Off, Nerves of Steel, On The Ball, Leader (adds a team reroll while on pitch — extends RerollArbiter bank handling).

## 4. Block: armour & injury (adds injury trigger + modifier seam)

- [ ] 4.1 `onArmourRoll`/`onInjuryRoll` modifier plumbing incl. post-roll choice decisions where the book allows.
- [ ] 4.2 Mighty Blow (+ collapsed +2 variant), Claws, Thick Skull, Iron Hard Skin, Bullseye.
- [ ] 4.3 Pile Driver / Piling On (reconcile as one), Decay, Plague Ridden, Regeneration (casualty response roll).

## 5. Block: dice & flow (adds assist seam)

- [ ] 5.1 Assist hook in `BlockValidator` (`onCountAssists`): Guard, Defensive.
- [ ] 5.2 Pre/post block rolls & dice: Dauntless, Horns, Brawler, Foul Appearance.
- [ ] 5.3 Push/result flow: Fend, Arm Bar, Grab, Juggernaut (owns Wrestle/Fend/Stand Firm interaction configs), Strip Ball, Hit and Run.
- [ ] 5.4 Flow-queue block effects: Frenzy (second block), Multiple Block.

## 6. Marking reactions (adds opponent-movement trigger)

- [ ] 6.1 Opponent-movement trigger point (per-step, marked-square gather) exercised by this batch.
- [ ] 6.2 Diving Tackle, Shadowing, Tentacles, Prehensile Tail.
- [ ] 6.3 Side Step, Taunt, Disturbing Presence (aura also affects pass/catch — coordinate with batch 3).
- [ ] 6.4 Size/marking passives: Stunty (dodge + injury table), Titchy, Insignificant, Unsteady.

## 7. Negatraits & activation (adds activation-declared trigger)

- [ ] 7.1 `onActivationDeclared` trigger + lost-activation/Rooted effects through existing status paths; extra scenario coverage for activation/turnover edge cases.
- [ ] 7.2 Bone Head, Really Stupid, Animal Savagery, Unchannelled Fury ("Unchained Fury"), Take Root, Timm-ber ("Timmm Ber").
- [ ] 7.3 Loner (collapsed 3+/4+/5+), Pro (die-level reroll — resolve open question), Drunkard, Always Hungry.
- [ ] 7.4 Bloodlust (collapsed), Animosity (collapsed ×7), Hatred, Trickster, Swarming, Pick Me Up.
- [ ] 7.5 Special activation actions: Hypnotic Gaze, Breathe Fire, Projectile Vomit.

## 8. Fouling & Devious (adds foul-path triggers)

- [ ] 8.1 Foul trigger points in `FoulOperation` (armour/injury modifiers, send-off effects).
- [ ] 8.2 Dirty Player (collapsed +2), Sneaky Git, Lone Fouler, Put the Boot In, Quick Foul.
- [ ] 8.3 Violent Innovator, Saboteur, Eye Gouge, Stab, Lethal Flight, Secret Weapon (send-off path exists).

## 9. Subsystems (one flow-queue operation set each, own protocol commands)

- [ ] 9.1 Throw Team-mate + Right Stuff + Swoop + Kick Team-Mate (throw/landing/scatter chain).
- [ ] 9.2 Kick (kickoff deviation control).
- [ ] 9.3 Chainsaw (special block action + kickback).
- [ ] 9.4 Bombardier (bomb throw/explosion chain).
- [ ] 9.5 Ball and Chain (random movement action).
- [ ] 9.6 Pogo Stick (leap-style movement).

## 10. Completion

- [ ] 10.1 Coverage report shows zero inert catalog skills (or an explicit, justified allowlist); inert-list snapshot emptied; full suite green; sandbox rule explorer spot-check of one skill per batch.
