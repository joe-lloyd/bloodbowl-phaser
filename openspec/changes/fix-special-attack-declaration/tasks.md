# Tasks: fix-special-attack-declaration

## 1. Gate direct Special Actions on no movement

- [x] 1.1 Add `!input.hasMovedInAction` to `directBlockReplacements` in `src/game/rules/actionAvailability.ts` so the derived `stab`/`chainsaw`/`breatheFire`/`chomp`/`vomit` flags all follow it
- [x] 1.2 Refuse a direct block-replacement declaration in `GameService.declareAction` when the player has movement used this activation, with a message naming the Blitz variant
- [x] 1.3 Confirm `PlayerActionMenu` renders the five buttons purely from availability, so they vanish on the first step of a Move

## 2. Resolve the declared attack on target click

- [x] 2.1 In the click-to-block branch of `GameplayInteractionController`, read `activePlayer.blockReplacement` (guarded by matching player id and `!blockReplacementUsed`) before any Block path
- [x] 2.2 Validate the clicked player with `legalBlockReplacementTargets` for the declared attack and resolve it through the same service call the action window uses
- [x] 2.3 Refuse an illegal target by name, preserving the declaration, remaining movement, and the unspent attack
- [x] 2.4 Leave the implicit `declareAction(id, "block")` path untouched for players with no declared replacement

## 3. Parity across clients

- [x] 3.1 Verify the target click emits the identical command as the action-window declaration for host, guest, and `HeadlessGame`
- [x] 3.2 Verify a guest's declared-replacement target click is proxied to the host and both boards show the attack, not a block

## 4. Verification

- [x] 4.1 Seeded scenario: a Stab player declares Move, steps into contact, and no direct Special Action is offered or accepted
- [x] 4.2 Seeded scenario: a Stab player declares Blitz with Stab, moves adjacent, target click resolves Stab with no block dice
- [x] 4.3 Seeded scenario: declared Chainsaw clicking an illegal target refuses and leaves the declaration and movement intact
- [ ] 4.4 Browser pass covering both flows plus one non-declared ordinary Block to prove the fallback still works
- [x] 4.5 Run the rule-scenario and unit suites headless and report the result
