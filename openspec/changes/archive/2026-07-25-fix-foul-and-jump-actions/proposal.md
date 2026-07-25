## Why

Three declared actions misbehave in the browser and make legal Sevens play impossible (recorded in `ai_notes.md`): declaring a **Foul** and clicking a downed opponent opens the Block dice window instead of resolving a Foul; a **Jump** with several adjacent downed players only ever offers one of them as a jump-over target; and a Prone player with **Jump Up** is refused a Block with "this Blitz has already used its Block". All three are correctness defects against the 2025 rulebook — a coach cannot foul, cannot choose which body to hurdle, and cannot use the skill they paid for.

## What Changes

- **Foul resolves as a Foul.** With a Foul action declared, clicking a Prone or Stunned opponent SHALL run the Foul sequence (armour roll, injury roll, referee/sending-off check) and SHALL NOT fall through to the implicit Block path that opens the block dice dialog.
- **Jump offers every jumpable neighbour.** Jump targeting SHALL present every adjacent jumpable player together with each of that player's legal landing squares, not just the first one found. The engine's `jumpTargets` already returns the full set; the browser targeting SHALL consume all of it, and a click SHALL resolve the specific (jump-over, landing) pair the coach picked.
- **Jump Up allows a Block.** A Prone player with Jump Up SHALL be able to declare a Block action. Per the 2025 entry's second clause this is gated on an Agility test with a `+1` modifier: passed, they stand up without spending movement and Block an adjacent opponent; failed, they stay Prone and the action is wasted (not a turnover).
- **The one-block-per-Blitz guard is scoped to the Blitz.** The "already used its Block" refusal SHALL only apply within the Blitz activation that spent it, and SHALL be cleared when that activation ends — it SHALL NOT leak into a later activation or into a non-Blitz Block declaration.
- Each fix is locked by a seeded rule scenario runnable from the headless CLI so it cannot silently regress.

## Capabilities

### New Capabilities
- `foul-action-flow`: declaring a Foul and selecting a downed opponent resolves the Foul sequence rather than a Block, in both the browser and the JSON action protocol.
- `jump-action-targeting`: Jump presents every legal jump-over target and landing square, and resolves the pair the coach selected.

### Modified Capabilities
- `skill-rules`: Jump Up lets a Prone player declare and perform a Block after standing up for free; the Blitz single-block guard is scoped to the activation that used it.

## Impact

- Interaction: `src/game/controllers/GameplayInteractionController.ts` (foul mode routing vs. the implicit BLOCK CHECK path at the play-phase click handler, jump targeting/`computeJumpTargets`, the `hasUsedBlitzBlock` refusal), `src/game/controllers/FoulController.ts`.
- Engine: `src/services/GameService.ts` (`blitzBlockUsed` lifetime, `declareAction` for a Prone Jump Up player), `src/game/skills/rules/JumpUpRule.ts`, `src/game/rules/jump.ts` (already correct — verify only), `src/game/rules/actionAvailability.ts`.
- Presentation: `Pitch.drawJumpTargets` highlighting for multiple jump-over nodes.
- Protocol/headless: `src/headless/HeadlessGame.ts` block guard, `src/game/operations/FoulOperation.ts`.
- Tests: new seeded scenarios in `src/data/ruleScenarios/` plus the headless CLI runs that assert them.
