## 1. Match log

- [ ] 1.1 In `BlockManager.requestPushDecision` (`src/game/managers/BlockManager.ts`), when `anyAdjacent.length > 0` produced the option set, include "Grab" (or "Side Step", matching whichever flag was set) in the log/notification emitted for the push decision

## 2. Scenarios

- [ ] 2.1 Add a `chain-push-grab-open` scenario to `src/data/scenarios.ts`: a Black Orc attacker (Grab by default) blocking a defender with at least one of the eight adjacent squares open but all three traditional behind-squares occupied
- [ ] 2.2 Add a `chain-push-grab-boxed` scenario to `src/data/scenarios.ts`: the same Black Orc attacker blocking a defender who is fully boxed in on all eight adjacent squares, forcing a normal three-square chain push
- [ ] 2.3 Set `team1Roster`/`team2Roster` explicitly on both new scenarios (Black Orc roster for the attacking side) since `createHeadlessGame.ts` otherwise defaults to Human

## 3. Tests

- [ ] 3.1 Add a headless test in `__tests__/headless/push-chain.test.ts` asserting `chain-push-grab-open` offers the wider Grab square set as `tier: "open"`
- [ ] 3.2 Add a headless test asserting `chain-push-grab-boxed` still resolves as `tier: "chain"` over the normal three squares
- [ ] 3.3 Add a headless test asserting the match log names Grab for the `chain-push-grab-open` case
- [ ] 3.4 Run the existing `chain-push` scenario test to confirm it is unaffected (no Grab on Human roster)
- [ ] 3.5 Run the full unit/headless suite and confirm no regressions
