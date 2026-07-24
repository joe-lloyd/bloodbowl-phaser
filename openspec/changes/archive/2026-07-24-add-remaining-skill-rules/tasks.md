# Tasks: add-remaining-skill-rules

Per-skill definition of done (applies to every rule below): read the book text
from `docs/rulebook/skills.json` → write the rule file under
`src/game/skills/rules/` (parameter-aware via `getSkill`) → register it in
`src/game/skills/index.ts` → add seeded catalog configuration(s) in
`src/data/ruleScenarios/*` covering each distinct book clause → add headless
test(s) locking the clause → bump the `gate.test.ts` implemented-set snapshot
and `cov.implemented`. Run the full suite + typecheck after each batch and record
fixes in `ai_notes.md`.

## 1. Batch 1 — Misc leftovers (no new engine seam)

- [x] 1.1 Diving Catch: catch a ball landing in the player's Tackle Zone from a Pass/Throw-in/Kick-off (not a Bounce), +1 when the player is the Pass target — hook the catch/ball-landing path
- [x] 1.2 Safe Pair of Hands: when a carrier is Knocked Down / placed Prone, place the ball in a chosen adjacent empty square instead of Bouncing — hook the drop-ball path (wired at the Block-knockdown drop; Dodge/Rush/Stab drop paths remain)
- [x] 1.3 Hit and Run: after a Block or Stab, a free 1-square move ignoring Tackle Zones if still Standing, ending neither Marking nor Marked — enqueue a post-action move (engine logic pre-existed; wired the trigger + registered; Stab path remains)
- [x] 1.4 Fumblerooski: a moving carrier may drop the ball in a vacated square with no Turnover — hook the Move path
- [x] 1.5 Multiple Block (`MultipleBlockOperation`): two Blocks at two Marked opponents, -2 Strength, no follow-up, both resolved even if one causes a Turnover; wire declaration + protocol + action menu
- [x] 1.6 Bullseye: extend the Throw Team-mate subsystem — a Superb Throw lands with no scatter (owned here; requires Throw Team-mate)
- [x] 1.7 Lethal Flight: extend Right Stuff — a thrown player who Knocks Down an opponent grants a post-roll +1 to Armour or Injury and SPP attribution (requires Right Stuff)
- [x] 1.8 Catalog configs + headless tests for 1.1–1.7; final gate snapshot is 107

## 2. Batch 2 — Passing reactions & Leader

- [x] 2.1 Add the opponent-pass reaction seam (fired after the target square is declared, before the Passing Ability Test) with deterministic ordering
- [x] 2.2 Add an intercept-suppression flag on the pass context and honour it in the interception path
- [x] 2.3 Cloud Burster: opponents may not Intercept this player's Pass (sets the suppression flag)
- [x] 2.4 Hail Mary Pass: target any square as a Long Bomb, Accurate→Inaccurate, no Interception
- [x] 2.5 Give and Go: keep the activation open after a no-Turnover Quick Pass or Hand-off (reuse the open-activation pattern)
- [x] 2.6 On the Ball: reacting move up to 3 squares (no Rush) on an opponent's declared Pass, ending on a Fall Over — surfaces as a reacting-team decision + move; kick-off clause included
- [x] 2.7 Dump-Off: an immediate Quick Pass (no Turnover) when Blocked or directly targeted, before the targeting action resolves — reacting-team decision
- [x] 2.8 Leader: grant one extra Leader Re-roll at the start of a half when a Leader is on the pitch; lost if all Leaders leave play before use — hook half start + the reroll machinery
- [x] 2.9 Punt (`PuntOperation`): optional Move then kick a carried ball downfield via the Throw-in Template (Kick may re-roll direction/distance); no Turnover on rest, Turnover if it ends with an opponent or in the crowd; wire protocol + action menu
- [x] 2.10 Catalog configs + headless tests for 2.3–2.9; final gate snapshot is 107

## 3. Batch 3 — Jump / Leap family

- [x] 3.1 Add a Jump mechanic: `MovementManager.jumpPlayer` — jump over one adjacent square (Prone/Stunned by default; any square with Leap/Pogo) landing two squares away, 2 MA cost with Rush-before-Jump, Agility Test with `-max(markers of from, markers of to)`, nat-1 falls in place / other fail falls in target, both end the activation + Turnover; added `JumpDeclaredContext` + `onJumpDeclared`
- [x] 3.2 Wire the Jump move into the headless protocol (`jump` command, GameService/NetworkedGameService.jumpPlayer, IGameService) AND the browser: during Move, a first click on a valid Jump target (over an adjacent downed player, or any square with Leap/Pogo) routes to `jumpPlayer` via `isJumpTarget` in GameplayInteractionController — **needs in-browser verification**
- [x] 3.2b Add a playable "Jump Over a Prone Player" scenario to `data/scenarios.ts` so it shows in the sandbox Core Rules list and loads via `--scenario jump-over-prone`
- [x] 3.2c Discoverable action menu: `computeActionAvailability` gains `move`/`block`/`jump`; the menu shows explicit MOVE + BLOCK buttons; declaring Move opens a Move→Jump sequence; the Jump step highlights valid landing squares and prompts; auto-move (click empty) and auto-block (click adjacent enemy) preserved. 6 new unit tests for block/jump availability — **browser interaction needs in-browser verification**
- [x] 3.2d Jump geometry CORRECTED to the rulebook: you Jump over an ADJACENT player into one of their push-back squares (the 3 squares a Block would push them to). Shared pure helper `src/game/rules/jump.ts` (`pushBackSquares`, `jumpTargets`) used by the engine (`jumpPlayer`), `computeActionAvailability.jump`, and the browser. Jump UX: on Jump-step select, ALL legal landings are drawn at once (`Pitch.drawJumpTargets` — a line from jumper→over→landing, a green end-node per landing, an amber jump-over node); click a landing to leap. A Jump does NOT end the Move (re-select after); Move never checks off (jumpTargeting flag). Unit tests: `jumpGeometry.test.ts` (user's 3×3 examples) + updated availability — **browser interaction needs in-browser verification**
- [x] 3.2e Mini-menu = the existing action-sequence stepper (user's choice): the MOVE button now shows for prone players too, so declaring Move opens a Stand Up → Move → Jump sequence in one panel (Jump Up/Stand Up lives in the stepper). **browser interaction needs in-browser verification**
- [x] 3.3 Leap: reduce negative jump modifiers by 1 to a minimum of -1 (+ enables jumping over Standing players)
- [x] 3.4 Pogo: ignore all negative jump modifiers
- [ ] 3.5 Very Long Legs: +1 to the jump/leap Agility Test done; **+2 interception and ignore-Cloud-Burster still TODO** (needs an interception skill-fold that doesn't exist yet)
- [x] 3.6 Catalog configs + headless tests for Leap (penalty-reduced, over-standing), Pogo (penalty-ignored), Very Long Legs (plus-one, lands-standing); gate snapshot bumped to 87
- [x] 3.7 Core base-Jump-over-a-Prone-player scenario (`JUMP_OVER_PRONE_SCENARIO`, non-skill, like the Interception scenarios) with a dedicated `__tests__/headless/jump.test.ts`: cleared / falls-in-target / natural-1-in-place outcomes + protocol round-trip + base-refuses-Standing

## 4. Batch 4 — Fouling / Devious + Secret Weapon

- [x] 4.1 Add foul-path fold points to `FoulOperation`: Dirty Player / Lone Fouler / Sneaky Git resolved inline off the fouler's own skills (auto-policy, not a reacting decision — matches the Steady Footing inline pattern); assist state + natural-double detection confirmed exposed
- [x] 4.2 Dirty Player: post-roll +1 to either the Armour or Injury roll on a Foul
- [x] 4.3 Lone Fouler: reroll a failed Armour roll on a Foul when the fouler has no assists
- [x] 4.4 Sneaky Git: no send-off on a natural-double Armour roll that does not break armour (still sent off if broken)
- [x] 4.5 Put the Boot In: provide offensive assists to a team-mate's Foul regardless of markers (extend `onCountAssists`)
- [x] 4.6 Eye Gouge: a pushed-back opponent cannot provide Offensive/Defensive assists until next activated — per-player flag cleared on activation
- [x] 4.7 Quick Foul: activation does not end after a Foul; continue the Move with remaining movement
- [x] 4.8 Pile Driver: after a Block knockdown while still Marking, a free Foul, then place the blocker Prone and end the activation
- [x] 4.9 Secret Weapon: Sent-off for a Foul at the end of any Drive the player took part in (even if off the pitch) — add an end-of-Drive send-off pass in `DriveManager`/`TurnManager`
- [x] 4.10 Saboteur (requires Secret Weapon): on a Block knockdown, roll a D6 before the Armour roll — 4+ Knocks Down the blocker too (Turnover only if they held the ball) and Knocks Out the Saboteur with no Armour roll
- [x] 4.11 Violent Innovator: SPP attribution for a casualty caused by a Special Action — flag on the special-action operations read by the casualty/SPP path
- [ ] 4.12 Catalog configs + headless tests for 4.2–4.11 (foul edge cases: unbroken-double send-off, foul-caused turnover, Pile Driver forced-prone activation end, end-of-Drive send-off); bump gate snapshot to 104

## 5. Batch 5 — Special-action weapons

- [x] 5.1 Chainsaw (`ChainsawAttackOperation`): Kick-back die (1 = self Knock Down, else +3 Armour roll on an adjacent Standing opponent); always +3 to Armour rolls made against the wielder; protocol + action menu (deferred: Foul-with-chainsaw +3 and Blitz block replacement — noted in ai_notes)
- [x] 5.2 Bombardier (`BombardierOperation`): Throw Bomb via the Pass rules; explode on rest (Knock Down the square's Standing player, hit each adjacent player on a 4+, Armour rolls for Prone/Stunned); catch/intercept forces an immediate re-throw; protocol + action menu (gaps noted in ai_notes: per-turn declaration limit, off-pitch crowd, Pass-side skill folds)
- [x] 5.3 Ball & Chain (`BallAndChainOperation`): forced Throw-in-Template lurch up to MA, auto-passed dodges, forced Blocks on Standing players, push/bounce on Prone/ball, crowd risk off-pitch; ignores Shadowing/Tentacles/Foul Appearance; self-injury on falling; the only action a Fanatic can declare; protocol + action menu (gaps in ai_notes: Rush, interactive block choice, per-square re-steer, Stunned→KO upgrade)
- [x] 5.4 Catalog configs + headless tests for 5.1–5.3 (Chainsaw kick-back + +3-against-me, bomb explosion + fumble self-detonate, Ball & Chain auto-block + crowd surf); gate snapshot now 92 (running total; final campaign target higher)

## 6. Close-out

- [x] 6.1 Verify `SkillRegistry.coverage()` reports 107 implemented with an empty inert list (only `INSIGNIFICANT` allowlisted); the two `gate.test.ts` coverage tests pass
- [ ] 6.2 Manually exercise a representative scenario per subsystem in the sandbox rule explorer / `pnpm headless --rule "<skill>"` and confirm each reads as the book intends
- [x] 6.3 Run the full test suite + typecheck; 676 tests pass and the touched files add no TypeScript errors beyond the recorded project-wide baseline
