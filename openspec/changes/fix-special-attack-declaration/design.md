## Context

`add-blitz-special-attacks` (archived 2026-07-26) added `BlockReplacement` — a stable wire identifier for the five block-replacing attacks — plus `Blitz (with <attack>)` declarations, `blitzBlockReplacements` in `actionAvailability`, and `activePlayer.blockReplacement` / `blockReplacementUsed` on the authoritative state. What it did not do is make the old direct declarations exclusive with movement, or teach the board-click path about the declared replacement.

Two concrete seams:

- `actionAvailability.ts:211-218` computes `directBlockReplacements` from `player.status === PlayerStatus.ACTIVE` and `legalBlockReplacementTargets(...)`, with no `hasMovedInAction` term. Every sibling attack in that file has one: `block` (line 180), `blitz` (155), `foul` (159), `multipleBlock` (184).
- `GameplayInteractionController.ts:1048-1095` — the "IT'S A BLOCK!" branch. It checks adjacency, the blitz-block guard, and the declared action, then calls `gameService.previewBlock(...)`. `activePlayer.blockReplacement` is never consulted, so a declared Stab resolves as a Block.

Both are single-point fixes; the rules and resolution operations behind them (`StabOperation`, the chainsaw/vomit paths, `legalBlockReplacementTargets`) are already correct and shared by browser, headless, and online.

## Goals / Non-Goals

**Goals:**
- A direct Special Action is legal only from a standing start, matching Block.
- A declared block-replacing attack is the thing that resolves when its target is clicked, on every client.
- Refusals name the declared attack and the legal alternative.

**Non-Goals:**
- Changing any attack's own targeting or resolution rules — `legalBlockReplacementTargets` stays the authority on what each attack can hit.
- Changing the Blitz action economy (one Blitz per turn, one attack per Blitz) — already specified and implemented.
- Re-opening whether a special attack may follow a Move under any house rule; it may not.

## Decisions

### 1. Gate the direct declarations in `actionAvailability`, and enforce in `declareAction`

Add `!input.hasMovedInAction` to `directBlockReplacements` so the five buttons disappear the moment a player has moved, and add the matching refusal in `GameService.declareAction` so a forged or stale command from headless/online cannot bypass the client-side gate. Alternative — gating only in the menu component — rejected: the menu is one of three front ends and the protocol accepts these actions directly.

`blitzBlockReplacements` already carries `!input.hasMovedInAction`; the two lists stay symmetric, one for "attack from here", one for "move then attack".

### 2. The board click reads the declared replacement, not the action name

In the click-to-block branch, resolve the effective attack once:

```
const declared = state.activePlayer?.id === selectedPlayer.id
  ? state.activePlayer.blockReplacement
  : undefined;
```

If `declared` is present and not yet used, target legality is checked with `legalBlockReplacementTargets(selectedPlayer, [clicked], declared)` and the click resolves that attack through the same call the action window uses. Only when there is no declared replacement does the branch fall through to `previewBlock`. Alternative — resolving the replacement inside `previewBlock` — rejected: `previewBlock` is the block-dice preview step, and the replacements do not roll block dice at all; overloading it would fold two unrelated resolutions into one function.

The implicit `declareAction(id, "block")` for an undeclared player stays exactly as it is: with nothing declared, a click on an adjacent opponent is still a Block.

### 3. An illegal target for a declared attack refuses, it does not downgrade

If a replacement is declared and the clicked player is not a legal target for it, emit a refusal naming the attack ("Stab cannot target a Prone player — keep moving or end the activation"). Downgrading to a normal Block would silently spend the Blitz's one attack on something the coach did not choose, which is the bug being fixed, in the other direction.

## Risks / Trade-offs

- [A player with a legal adjacent target loses the button after their first step, which may read as a regression] → the refusal text names the Blitz variant, and the Blitz variant is offered before the move begins.
- [Stale `blockReplacement` on `activePlayer` could hijack a later ordinary Block] → the read is guarded by `blockReplacementUsed` and by matching `activePlayer.id` to the clicked selection; the existing single-Block-per-Blitz guard already covers the second-click case.
- [Online guests could see a different set of buttons than the host resolves] → availability is computed from shared state in `actionAvailability`, and the target-click path emits the same declaration command as the action window, so both clients converge on one command shape.
