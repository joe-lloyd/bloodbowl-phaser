## 1. Foul action routing

- [ ] 1.1 In `GameplayInteractionController`, change the play-phase implicit-Block branch so it runs only when the selected player has no declared action AND `currentActionMode` is null
- [ ] 1.2 Verify the Foul branch in `onSquareClicked` claims every click while `currentActionMode === "foul"`, including clicks on empty squares and team-mates, and returns without falling through
- [ ] 1.3 Confirm `handlePlayerClick` routes a foul-mode player click to `onSquareClicked` before any selection change, and that `currentStepId` is set to `"foul"` when the Foul action is declared from `PlayerActionMenu`
- [ ] 1.4 Verify the same guard holds for the other targeted modes (special actions, Throw Team-mate, Throw Bomb, Multiple Block) so none can decay into a Block

## 2. Jump targeting

- [ ] 2.1 Keep the full `JumpTarget[]` from `jumpTargets(...)` in the controller's jump targeting state, indexed by landing square `"x,y"`
- [ ] 2.2 Draw every jump-over node and every landing node from that full set in `Pitch.drawJumpTargets`
- [ ] 2.3 Resolve a landing-square click to its stored `(over, dest)` pair and execute that specific Jump; pin the tie-break for a shared landing square to engine order
- [ ] 2.4 Confirm `actionAvailability` gates the Jump action on the same full target set so the action is offered whenever any legal jump exists

## 3. Jump Up and the Blitz block guard

- [ ] 3.1 Make `GameService.declareAction(playerId, "block")` legal for a Prone player with Jump Up, standing them up for free (0 MA, no Agility roll) via `JumpUpRule`
- [ ] 3.2 Scope the `hasUsedBlitzBlock` refusal to a player whose currently declared action is `blitz`
- [ ] 3.3 Clear `blitzBlockUsed` at every activation boundary — `finishActivation`, turn start, and `resetDriveState` — not only the happy path
- [ ] 3.4 Apply the same guard scoping to the headless `block` command so protocol and browser agree

## 4. Rule scenarios and tests

- [ ] 4.1 Add a seeded scenario: Foul declared against an adjacent Prone opponent resolves armour + injury, asserting no block dice were rolled
- [ ] 4.2 Add a seeded scenario: three adjacent Prone opponents all appear as jump-over targets and the clicked landing determines which is crossed
- [ ] 4.3 Add a seeded scenario: Prone Jump Up player declares a Block, stands for free, and the Block resolves
- [ ] 4.4 Add a seeded scenario: a second Blitz Block in the same activation is still refused, and a plain Block in a later activation is allowed
- [ ] 4.5 Run the scenarios through the headless CLI and add them to the rule-scenario registry
- [ ] 4.6 Re-baseline `gate.test.ts` only if the Jump Up coverage classification changes; otherwise confirm the snapshot is unchanged

## 5. Verification

- [ ] 5.1 Run the full unit and headless test suites
- [ ] 5.2 Play a browser match: foul a downed player, jump with multiple downed neighbours, and Jump-Up-into-Block, confirming each behaves as specified
- [ ] 5.3 Mark the three items fixed in `ai_notes.md` with dated notes
