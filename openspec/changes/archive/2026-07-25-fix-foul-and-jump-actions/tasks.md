## 1. Foul action routing

- [x] 1.1 In `GameplayInteractionController`, change the play-phase implicit-Block branch so it runs only when the selected player has no declared action AND `currentActionMode` is null
- [x] 1.2 Verify the Foul branch in `onSquareClicked` claims every click while `currentActionMode === "foul"`, including clicks on empty squares and team-mates, and returns without falling through
- [x] 1.3 Confirm `handlePlayerClick` routes a foul-mode player click to `onSquareClicked` before any selection change, and that `currentStepId` is set to `"foul"` when the Foul action is declared from `PlayerActionMenu`
- [x] 1.4 Verify the same guard holds for the other targeted modes (special actions, Throw Team-mate, Throw Bomb, Multiple Block) so none can decay into a Block

## 2. Jump targeting

> Scope revised after investigation: the multi-target path was found to be
> already correct end to end (verified by probe: 3 adjacent prone → 3 distinct
> jump-overs; 8-player ring → 8). No behavior change was made. Group 2 is
> verification plus a sandbox scenario for in-app confirmation.

- [x] 2.1 Verify the full `JumpTarget[]` from `jumpTargets(...)` reaches targeting — `computeJumpTargets` returns the complete set and `isJumpTarget` tests against all of it
- [x] 2.2 Verify `Pitch.drawJumpTargets` draws every jump-over ring and every landing dot from that full set
- [x] 2.3 Verify a landing-square click resolves to its `(over, dest)` pair in `MovementManager.jumpPlayer`, with a shared landing square tie-breaking deterministically to engine order
- [x] 2.4 Verify `actionAvailability` gates the Jump action on the same full target set
- [x] 2.5 Add the `jump-multiple-prone` sandbox scenario: four adjacent Prone defenders plus a Standing one that must not be offered, including two deliberately shared landing squares
- [x] 2.6 Confirm the scenario's stated geometry against the engine (4 jump-overs, 12 options, 10 distinct landings, shared at (10,4) and (9,3))

## 3. Jump Up and the Blitz block guard

- [x] 3.1 Make `GameService.declareAction(playerId, "block")` legal for a Prone player with Jump Up, with standing up gated on an Agility test (+1) resolved in the stand-up step; a failed test wastes the Action without a turnover
- [x] 3.2 Scope the `hasUsedBlitzBlock` refusal to a player whose currently declared action is `blitz`
- [x] 3.3 Clear `blitzBlockUsed` at every activation boundary — `finishActivation`, turn start, and `resetDriveState` — not only the happy path
- [x] 3.4 Apply the same guard scoping to the headless `block` command so protocol and browser agree

## 4. Rule scenarios and tests

> Locked in `__tests__/headless/foul-and-jump-actions.test.ts` (10 tests). The
> foul and Blitz-guard cases are not skill-scoped, so they live in the headless
> suite rather than the skill-keyed rule-scenario registry; the multi-target
> Jump case is additionally verifiable in-app via the new sandbox scenario.

- [x] 4.1 Seeded test: a declared Foul against an adjacent Prone opponent rolls armour and rolls no block dice, and offers no block decision
- [x] 4.2 Seeded test: three adjacent Prone opponents all enumerate as jump-over targets; Standing players are excluded without Leap/Pogo and included with it; the clicked landing determines which player is crossed
- [x] 4.3 Seeded tests: a Prone Jump Up player may declare a Block (and one without the skill may not), the stand-up test carries `+1`, a pass stands them for free and the Block resolves, and a failure wastes the Action without a turnover
- [x] 4.4 Seeded test: a stale Blitz-block flag does not refuse a plain Block. The "second Blitz block refused" half was already covered by `blitzMoveBlockMove.test.ts` and still passes
- [x] 4.5 Confirm the new sandbox scenario loads and plays through the headless CLI (`--scenario jump-multiple-prone`)
- [x] 4.6 Confirm the `gate.test.ts` snapshot is unchanged — Jump Up's coverage classification did not move
- [x] 4.8 Add the `jump-up-prone-block` config to the rule catalog under Agility → Jump Up, with four seed-searched variants: failed test (not a turnover, proven by an idle team-mate who can still act), stands-and-pushes, stands-and-knocks-down, and stands-then-goes-back-down (which IS a turnover)
- [x] 4.9 Verify every variant finds a seed and passes its assertions — `--rule "Jump Up"` resolves all five outcomes (seeds 7, 11, 5, 1 for the new ones)
- [x] 4.7 Fix `armourRolls` in `rules-lab/matchers.ts`, which matched "Armour" while the engine emits "Armor Check", so every `armourRolls(r) === 0` assertion had been passing vacuously

## 5. Verification

- [x] 5.1 Run the full unit and headless test suites — 73 files / 718 tests passing
- [ ] 5.2 Play a browser match: foul a downed player, jump with multiple downed neighbours (sandbox scenario `jump-multiple-prone`), and Jump-Up-into-Block, confirming each behaves as specified — **left for the user; cannot be verified from here**
- [x] 5.3 Mark the three items fixed in `ai_notes.md` with dated notes
