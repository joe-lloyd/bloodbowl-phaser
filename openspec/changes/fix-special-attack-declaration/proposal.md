## Why

The Blitz-with-special-attack declaration landed, but the direct Special Actions it was meant to replace were never gated behind it. `actionAvailability` computes `directBlockReplacements` from nothing but "the player is Active and has a legal adjacent target", so after a player spends most of their Move Action walking up to an opponent, Stab, Chainsaw, Breathe Fire, Monstrous Mouth and Projectile Vomit all appear in the menu — a free move-then-attack that the rules never allow. Every other attack in the game is gated on `!hasMovedInAction`; these five are not.

The other half is the reverse leak: `Blitz (with Stab)` is declared, the blockReplacement is stored on the active player, the coach moves into contact and clicks the target — and the board click path in `GameplayInteractionController` calls `previewBlock` directly, so the declared attack is ignored and an ordinary Block is thrown instead. The declaration is only honoured if the coach re-picks the attack from the action window.

## What Changes

- **A direct Special Action is a no-move declaration.** Stab, Chainsaw, Breathe Fire, Monstrous Mouth and Projectile Vomit SHALL be offered only to a player that has not moved in its activation, exactly like a standalone Block. A player who wants to move and then attack SHALL declare the Blitz variant.
- **The declared attack is what resolves.** Clicking a legal target while a block-replacing attack is declared SHALL resolve that attack. The board-click path SHALL NOT fall through to a normal Block while a replacement is declared and unused.
- **An illegal target refuses by name.** Clicking a player that the declared attack cannot legally target SHALL refuse and say which attack was declared, rather than silently converting the click into a Block.
- **The refusal to move-then-attack is legible.** A player who has already moved SHALL be told the direct Special Action requires a Blitz, instead of the button quietly disappearing mid-activation.

## Capabilities

### New Capabilities

### Modified Capabilities
- `skill-rules`: "Block-replacing attacks have direct declarations" gains the no-movement precondition; "Eligible attacks may replace the Block in a Blitz" gains the requirement that the declared replacement — not a Block — is what a target click resolves.

## Impact

- Availability: `src/game/rules/actionAvailability.ts` — `directBlockReplacements` (and the derived `stab`/`chainsaw`/`breatheFire`/`chomp`/`vomit` flags) gated on `!input.hasMovedInAction`.
- Declaration: `src/services/GameService.ts` `declareAction` — refuse a direct block replacement once movement has been used this activation, with a reason naming the Blitz variant.
- Board input: `src/game/controllers/GameplayInteractionController.ts` click-to-block path (~line 1040-1096) — route through the active player's `blockReplacement` before `previewBlock`.
- Menu: `src/ui/components/hud/PlayerActionMenu.tsx` — the special-attack buttons follow availability rather than adjacency alone.
- Online/headless: the same declaration is already carried in the command payload; the target-click resolution must produce the identical command on host, guest, and `HeadlessGame`.
- Tests: seeded scenarios in `src/data/ruleScenarios/traits.ts` for move-then-stab refusal and blitz-with-stab resolving on target click.
