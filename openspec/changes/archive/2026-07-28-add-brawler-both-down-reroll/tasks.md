## 1. Engine: Brawler rule and BlockManager

- [x] 1.1 Replace `BrawlerRule.onBlockDiceRolled` with an inert marker rule (`{}`), mirroring `ProRule`, so `SkillRegistry.has(BRAWLER)` still reports implemented.
- [x] 1.2 Add `brawlerAvailable?: boolean` to `BlockRollData` (`BlockResolutionService.ts`).
- [x] 1.3 Extend `BlockManager.blockRerollAvailability` to accept the current `results` and compute `brawlerAvailable` (attacker has Brawler, a die currently reads Both Down).
- [x] 1.4 Add `BlockManager.brawlerRerollBlockDie(attackerId)`: re-rolls the single Both Down die in place, emits a `SkillTriggered` event, clears `brawlerAvailable`, and re-emits `BlockDiceRolled`.
- [x] 1.5 Extend `teamRerollBlock` and `proRerollBlockDie` to also clear `brawlerAvailable` (mutual exclusion across all three sources).

## 2. Protocol, service, and network plumbing

- [x] 2.1 Add `brawler-reroll-block` to `HeadlessCommand` and `brawlerAvailable?: boolean` to the `block-dice` pending decision (`headless/protocol.ts`).
- [x] 2.2 Wire the command in `HeadlessGame.ts`: shape validation, `DECISION_REPLIES` mapping, the `case` dispatch, and surfacing `brawlerAvailable` on the pending decision.
- [x] 2.3 Add `brawlerRerollBlockDie(attackerId)` to `IGameService`, `GameService` (delegates to `BlockManager`), and `NetworkedGameService` (sends the `brawler-reroll-block` command).
- [x] 2.4 Add `UI_BrawlerRerollBlockDie` to `GameEventNames` and its payload type in `types/events.ts`.
- [x] 2.5 Register the event in `PlayPhaseHandler` to call `gameService.brawlerRerollBlockDie`.

## 3. Browser UI

- [x] 3.1 Add a "BRAWLER: RE-ROLL 1 BOTH DOWN" button to `BlockDiceDialog`, shown whenever `rollData.brawlerAvailable` is true, alongside the existing Team Re-roll / Pro controls.
- [x] 3.2 Wire the button to emit `UI_BrawlerRerollBlockDie`; confirm no separate confirmation dialog is ever raised for Brawler (the old `reaction`-based flow is gone).

## 4. Tests

- [x] 4.1 Update the `brawler-rerolls-both-down` rule-catalog scenario (`data/ruleScenarios/general.ts`) to drive the new `brawler-reroll-block` command via `decisionPolicy.custom` instead of accepting a `reaction` decision.
- [x] 4.2 Confirm the committed seed (9) for `brawler-rerolls-both-down/both-down-rerolled` still produces the outcome (RNG draw order unchanged) — verified via `gate.test.ts`.
- [x] 4.3 Update the stale `runInjuryChain` comment in `__tests__/headless/scenario-rules.test.ts` (the auto-offered reaction it declines is now Hatred's, not Brawler's).
- [x] 4.4 Add a component test (`__tests__/unit/blockDiceDialogBrawler.test.tsx`) covering: the block popup shows the roll immediately with no separate reaction popup; the button emits the right event; the popup refreshes in place after a re-roll; no button when Brawler is unavailable.
- [x] 4.5 Run the headless/coverage/network/component test suites and confirm no regressions.

## 5. OpenSpec

- [x] 5.1 Author proposal.md, design.md, specs deltas (`block-dice-rerolls` new, `skill-rules` modified), and this tasks.md.
- [x] 5.2 After PR review feedback (if any) is addressed, run `opsx:sync` to fold the delta specs into `openspec/specs/`, then `opsx:archive`.

## 6. PR review follow-ups

- [x] 6.1 Add a headless rule-catalog test for two block dice simultaneously reading Both Down (`brawler-double-both-down` in `data/ruleScenarios/general.ts`), confirming only the first die is re-rolled, the second is untouched, exactly one extra die is drawn, and `brawlerAvailable` goes false afterward; committed seed discovered via `pnpm e2e:seeds --config brawler-double-both-down`.
- [x] 6.2 Add `brawler-reroll-block` to the coverage/validation tracking lists `pro-reroll-block`/`team-reroll-block` are already in (`testing/coverage/inventory.ts`, `testing/scenarioCase/validate.ts`).
- [x] 6.3 Investigate the `activePlayer` check asymmetry between `proAvailable` and `brawlerAvailable`; add the same check to `brawlerAvailable` and `brawlerRerollBlockDie` for consistency/defense-in-depth, documented with a comment (attacker is always the active player during a block's own dice window by construction, so this was not a live bug).
