## Why

Declaring an action commits the team's once-per-turn allowance immediately. `PlayerActionManager.updateTurnFlags` sets `turn.hasBlitzed` the instant Blitz is clicked, before a single square is moved or a single die is rolled. `cancelAction` already knows the correct commitment test — no movement used, no block replacement used, not yet activated — but it is only reachable from the action window's "Back" button. Selecting a different player instead simply abandons the declaration with the flag still set, so a coach who clicks Blitz, changes their mind, and activates someone else has lost the team's Blitz for the turn with nothing to show for it.

The genuine exception is an activation gate: Bone-head, Really Stupid, Take Root, Unchannelled Fury and Bloodlust roll a D6 the moment the action is declared, and the rulebook spends the action whether the roll passes or fails. Those declarations must stay binding — and today they do, but they also leave no visible trace. A player who fails Bone-head is given `PlayerCondition.DISTRACTED` and correctly loses their Tackle Zone everywhere the engine looks (`hasTackleZone`), yet the pitch still draws their eight tackle-zone squares — `GameplayInteractionController` builds that overlay from `op.status === "Active"` rather than from `hasTackleZone(op)` — and `PlayerSprite` has no treatment for conditions at all, only for status. So the board tells the coach a Distracted player is still marking, while the rules say otherwise.

## What Changes

- **A declaration is provisional until it is committed.** Declaring Blitz, Pass, Hand-off, or Foul SHALL NOT consume the team's once-per-turn allowance until the action commits — the first die rolled, the first square moved, or the activation being finalized.
- **Changing your mind releases the declaration.** Selecting another player, deselecting, or re-declaring a different action for the same player while nothing has committed SHALL release the previous declaration and restore the team's allowance, without marking anyone as activated.
- **An activation gate commits immediately.** When a declared action triggers an activation gate that rolls a die (Bone-head, Really Stupid, Take Root, Unchannelled Fury, Bloodlust), the declaration SHALL become binding at that roll — pass or fail — and SHALL NOT be releasable afterwards.
- **A refused release says why.** An attempt to change a committed declaration SHALL be refused with the reason (dice already rolled, movement already used, attack already spent).
- **Distracted is visible on the board.** A player that has lost their Tackle Zone SHALL NOT have tackle-zone squares drawn for them, and a Distracted player SHALL carry a distinct visual treatment on their model and in the player information panel for as long as the condition lasts.

## Capabilities

### New Capabilities
- `action-declaration-commitment`: when a declared action becomes binding, what releases it, and how the once-per-turn team allowances follow that boundary.

### Modified Capabilities
- `player-conditions`: the Distracted requirement gains the presentation obligation — no drawn tackle zone and a distinct model treatment while the condition lasts.

## Impact

- Turn flags: `src/game/managers/PlayerActionManager.ts` — `updateTurnFlags` moves from declaration time to commitment time; `cancelAction`'s commitment test becomes the shared predicate.
- Release paths: `src/game/controllers/GameplayInteractionController.ts` — selecting another player, deselecting, and re-declaring all attempt a release first; `src/services/GameService.ts` `declareAction` re-declares over an uncommitted action instead of refusing.
- Commitment point: `src/game/operations/ActivationGateOperation.ts` marks the activation committed before rolling, so a gated declaration is binding whichever way the die falls.
- Tackle-zone overlay: `src/game/controllers/GameplayInteractionController.ts` (~line 1615) uses `hasTackleZone(op)` from `src/types/Player.ts` instead of `op.status === "Active"`.
- Condition rendering: `src/game/elements/PlayerSprite.ts` gains a condition treatment alongside its status colours; `src/ui/components/hud/PlayerInfoPanel.tsx` names the active condition.
- Online/headless: release is a new coach intent that must be proxied like a declaration and reachable from `src/headless/protocol.ts`.
- Tests: seeded scenarios for release-and-redeclare, gate-commits-on-roll, and a Distracted player projecting no drawn tackle zone.
