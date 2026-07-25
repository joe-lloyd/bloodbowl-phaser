## Context

`GameplayInteractionController.onSquareClicked` resolves a click by walking a list of mode-specific branches in order and, when none of them claim the click, falling through to a generic "PLAY PHASE" branch. That last branch contains an *implicit Block declaration*: if the selected player is adjacent to a clicked opponent, it declares and previews a Block. Any mode whose branch fails to match — because `currentActionMode`/`currentStepId` are not exactly the expected pair — silently becomes a Block. This is what the Foul report describes.

Jump is the opposite problem: the pure engine helper `jumpTargets` (`src/game/rules/jump.ts`) already enumerates every adjacent jumpable player crossed with each of their legal push-back landing squares. The loss happens downstream, where targeting keeps a single chosen jump rather than the full set keyed by landing square.

The Jump Up refusal comes from `GameService.blitzBlockUsed`, a `Set<string>` of player ids consulted by `hasUsedBlitzBlock`. It is cleared in `finishActivation`, so any path that ends an activation without going through `finishActivation` leaves the id set and poisons that player for the rest of the drive.

## Goals / Non-Goals

**Goals:**
- A declared action resolves as that action; no declared action can decay into a Block.
- Jump targeting is total: every legal `(over, dest)` pair from the engine is offered and individually selectable.
- Jump Up grants the rulebook exception — declare Block while Prone, stand for free, block.
- Each fix is reproducible headlessly from a seeded scenario.

**Non-Goals:**
- Redesigning `GameplayInteractionController` into a state machine. That god-object refactor is tracked separately; this change only makes the guard explicit.
- Changing Foul mechanics themselves (armour/injury modifiers, Sneaky Git, Dirty Player) — only which code path a foul click reaches.
- Online (host-native/guest-proxy) reconciliation beyond keeping the existing declaration envelopes valid.

## Decisions

**1. Guard the implicit Block behind "no action is declared", not behind mode fall-through.**
The generic Block branch SHALL run only when the selected player has no declared action *and* the current action mode is null. Alternative considered: adding `currentActionMode !== "foul"` to the branch. Rejected — it fixes one symptom and leaves every future action mode able to decay into a Block. Making the precondition positive ("nothing declared") is the ruthless simplification: one guard covers foul, special actions, TTM, and anything added later.

**2. Keep jump targets as a keyed collection, resolve by landing square.**
Targeting SHALL hold the full `JumpTarget[]` from `jumpTargets(...)` and index it by `dest` (`"x,y"`). A click on a highlighted landing square looks up its pair and executes exactly that `(over, dest)`. Alternative considered: asking the coach to first pick the player to jump over, then the landing. Rejected — it adds a click for the common single-target case; the landing square already uniquely identifies the pair in ordinary geometry, and where two jump-overs share a landing square the nearer/first is chosen deterministically and the amber jump-over node is drawn for both.

**3. Scope the Blitz block guard to the activation, and clear it defensively.**
`blitzBlockUsed` SHALL be cleared on every activation boundary (`finishActivation`, turn start, drive reset), not only the happy path. The refusal SHALL additionally require that the player's *currently declared action* is `blitz` — a stale id can then never refuse a plain Block. Alternative considered: moving the flag onto the declared-action record so it dies with the declaration. That is the cleaner model and is the direction of travel, but it touches the online declaration envelope; the guard-plus-clear is equivalent in behavior and far cheaper here.

**4. Jump Up's Block exception lives in the skill rule, not in the click handler.**
`declareAction(playerId, "block")` SHALL consult the skill registry: a Prone player with Jump Up may declare it. The 2025 entry has two clauses — standing up for free during a movement action (already implemented via `standUpCost`), and declaring a Block while Prone, which is gated on an **Agility test with a `+1` modifier**. Passed: stand without spending MA, then Block. Failed: stay Prone, action wasted, no turnover. Any other Prone player is still refused with the existing "down players must Blitz" message. Keeping it in `JumpUpRule` means the headless protocol and the browser get it from one place.

The original draft of this design said the stand-up required no Agility test. That was wrong — it conflated clause 1 (free stand-up during a Move) with clause 2 (the Prone Block declaration), and contradicted the deferred-work note already recorded in `JumpUpRule.ts`. Corrected to the rulebook on the user's decision.

## Risks / Trade-offs

- **[Tightening the implicit-Block guard removes a shortcut coaches rely on]** → The common case (select a player with nothing declared, click an adjacent opponent) still declares a Block, because that path has no declared action. Only clicks made *while another action is mid-declaration* stop becoming Blocks, which is the bug.
- **[Two jump-over players sharing one landing square]** → Deterministic tie-break (first in engine order) plus both amber jump-over nodes drawn; a scenario asserts the chosen pair so the tie-break is pinned rather than incidental.
- **[Clearing `blitzBlockUsed` too eagerly could allow two blocks in one Blitz]** → The guard keeps its meaning inside the activation; a seeded scenario asserts that a second Blitz block is still refused.
- **[Jump Up free stand-up interacting with Blitz]** → A Jump Up player declaring a Blitz still stands for free and retains the Blitz's single block; covered by an explicit scenario so the two exceptions do not compound.

## Migration Plan

No data or save-format change. The fixes are behavioral and land behind existing code paths; the seeded scenarios are additive. `gate.test.ts` skill-coverage snapshot may need its count re-baselined only if Jump Up's coverage classification changes.

## Open Questions

- When two adjacent jumpable players share a landing square, is "first in engine order" acceptable, or should the amber jump-over node be individually clickable to disambiguate? Defaulting to the deterministic tie-break; revisit if playtesting finds it confusing.
