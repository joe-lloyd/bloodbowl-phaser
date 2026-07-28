## Why

Brawler's Both Down re-roll used to interrupt the coach with a separate yes/no
confirmation popup ("...re-roll it?") *before* the block-dice popup ever
showed the roll. The coach could not see the dice they were being asked about.
The user wants the normal block-dice popup to show as usual, with a "Brawler:
re-roll 1 both down" button inside it; clicking it re-rolls that one die in
place and the popup updates to show the new result — matching how Team
Re-roll and Pro already work on a block.

## What Changes

- **BREAKING** (engine/browser/headless/online protocol, internal only — no
  save-data impact): Brawler's Both Down re-roll is no longer offered as a
  `reaction` pending decision raised automatically when the block dice land.
  It is instead an optional control on the `block-dice` pending decision
  itself, spent explicitly by the coach — the same shape Team Re-roll and Pro
  already use on a block.
- `BrawlerRule.onBlockDiceRolled` is removed; `BrawlerRule` becomes an inert
  marker registration (mirrors `ProRule`) so the skill still counts as
  implemented for the coverage gate.
- `BlockRollData` (and the headless `block-dice` pending decision) gains
  `brawlerAvailable`: true whenever the attacker has Brawler and a rolled die
  currently reads Both Down.
- `BlockManager.brawlerRerollBlockDie(attackerId)` re-rolls the single Both
  Down die in place and re-emits `BlockDiceRolled` — mirroring
  `teamRerollBlock` / `proRerollBlockDie`, including their mutual-exclusion
  (using any one of Team Re-roll, Pro, or Brawler on a block locks out the
  other two for that block).
- New protocol command `brawler-reroll-block` (headless/online), new UI event
  `UI_BrawlerRerollBlockDie`, and full plumbing through `IGameService` /
  `GameService` / `NetworkedGameService` / `PlayPhaseHandler`.
- `BlockDiceDialog` (the block popup) gains a "BRAWLER: RE-ROLL 1 BOTH DOWN"
  button, shown whenever `brawlerAvailable` is true, right alongside the
  existing Team Re-roll / Pro controls. No separate confirmation dialog is
  ever raised for Brawler.
- The `brawler-rerolls-both-down` rule-catalog scenario is updated to drive
  the new button via the protocol instead of accepting a `reaction` decision.

## Capabilities

### New Capabilities

- `block-dice-rerolls`: The block-dice popup's in-place re-roll controls
  (Team Re-roll, Pro, Brawler) — availability rules, mutual exclusion, and
  that they surface as buttons on the existing `block-dice` decision rather
  than as separate confirmation prompts. This behavior already existed for
  Team Re-roll/Pro but was never captured as a spec; Brawler's move onto the
  same mechanism is the trigger to document it.

### Modified Capabilities

- `skill-rules`: Brawler is called out as an exception to "Reactions surface
  as reacting-team decisions" — its Both Down re-roll resolves through the
  `block-dice-rerolls` capability instead of a reacting-team `reaction`
  decision, even though declaring a Block Action is otherwise exactly the
  kind of trigger that requirement describes.

## Impact

- Engine: `src/game/skills/rules/BrawlerRule.ts`, `src/game/managers/BlockManager.ts`,
  `src/services/BlockResolutionService.ts`.
- Service/network plumbing: `src/services/interfaces/IGameService.ts`,
  `src/services/GameService.ts`, `src/network/NetworkedGameService.ts`,
  `src/headless/protocol.ts`, `src/headless/HeadlessGame.ts`,
  `src/types/events.ts`, `src/game/controllers/handlers/PlayPhaseHandler.ts`.
- UI: `src/ui/components/hud/BlockDiceDialog.tsx`.
- Tests: `src/data/ruleScenarios/general.ts` (brawler-rerolls-both-down
  scenario), `__tests__/headless/scenario-rules.test.ts` (comment accuracy),
  new `__tests__/unit/blockDiceDialogBrawler.test.tsx`.
- No save-data or persisted-state changes — this only changes which decision
  channel carries the re-roll offer mid-block, not any stored state shape.
