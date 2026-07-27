## Context

Two facts sit next to each other in `PlayerActionManager`: `updateTurnFlags` (line ~128) sets the once-per-turn flag at declaration, and `cancelAction` (line ~51) already encodes exactly when that is safe to undo — `movementUsed === 0`, `!blockReplacementUsed`, and not in `activatedPlayerIds`. The bug is not a missing rule; it is that the undo is reachable from one button and nothing else, while the flag is set unconditionally at the earliest possible moment.

The activation gates are the reason the flag exists at declaration in the first place: `skill-rules` already requires that "a declared once-per-Turn action (e.g. Blitz) SHALL still count as used when the gate fails, where the book says so". That requirement is about the *gate*, not about declaration in general, and it is preserved here by committing at the roll.

Separately, `hasTackleZone(player)` in `src/types/Player.ts` is the single predicate the whole engine uses — dodges, assists, marking, interceptions, catch. Exactly one place re-implements it wrongly: the pitch overlay's `op.status === "Active"`. That is a one-line correction, and it is what makes the Distracted condition finally visible where the coach makes decisions.

## Goals / Non-Goals

**Goals:**
- Move the commitment boundary from "declared" to "committed", with one predicate that every path consults.
- Keep gated declarations binding at the roll.
- Make a lost Tackle Zone visible on the board and on the model.

**Non-Goals:**
- Undoing anything after a die is rolled or a square is moved — this change never adds an undo of resolved rules.
- Changing which actions are once-per-turn, or the negatrait gates' own rolls and effects.
- Reworking the action window's stepper UI.

## Decisions

### 1. One `isActionCommitted(playerId)` predicate, consulted everywhere

Promote `cancelAction`'s inline test to a named predicate on the action manager: an action is committed once any of `movementUsed > 0`, `blockReplacementUsed`, `activatedPlayerIds.has(id)`, or an explicit `committed` flag set by the activation gate. `cancelAction` uses it, the board's selection-change path uses it, `declareAction` uses it to decide whether a re-declaration is legal, and the refusal message is derived from which term was true. Alternative — checking the individual conditions at each call site — rejected: three call sites drifting apart is how the current bug got in.

### 2. Turn flags are set at commitment, not declaration

`updateTurnFlags` moves out of `declareAction` and into the commit transition. Releasing an uncommitted declaration clears `activePlayer` and, because the flag was never set, needs no per-action undo — deleting the `if (action === 'blitz') hasBlitzed = false` ladder in `cancelAction`. This is a net simplification: one place sets the flags, and nothing has to remember to unset them.

The team's Blitz is therefore visibly spent the moment the blitzing player takes their first step or rolls their gate, which is when a coach would say it was spent.

### 3. The activation gate commits before it rolls

`ActivationGateOperation` sets the commitment flag as its first act, so the declaration is binding whether the D6 passes or fails and whether the failure ends the activation or applies a condition. This keeps `skill-rules`' existing requirement true, and it is the rule the note calls out: "this should really only happen with Bone-head or other big guys that roll as soon as their action is declared."

### 4. Selection change is a release attempt, not a silent abandon

When the coach selects a different player (or deselects) while a declaration is live, the controller calls the release. If it succeeds, the declaration disappears and the allowance returns. If it is refused, the selection change is refused too, with the reason — a committed player stays the active player rather than leaving a half-abandoned activation behind. This also removes the current state where `activePlayer` points at a player the coach has visually moved on from.

### 5. Distracted is drawn from `hasTackleZone`, not invented a second time

The overlay filter becomes `hasTackleZone(op) && op.gridPosition`. The model treatment is a condition layer on `PlayerSprite` distinct from the status colours (white/yellow/orange), so a Standing-but-Distracted player is not confused with a Prone one, and the info panel names the condition. Alternative — a new `PlayerStatus.DISTRACTED` — rejected outright: status and condition are deliberately separate axes in this codebase, and a Distracted player is still Standing for every other rule.

## Risks / Trade-offs

- [Deferring the flag could let two players hold a live Blitz declaration at once] → only one `activePlayer` exists at a time, and declaring for a new player must release or refuse first, so the invariant is enforced at the single declaration seam.
- [Online guests could release a declaration the host has already committed] → release is an intent proxied to the host, and the host's predicate is authoritative; a stale release is refused with a reason rather than applied.
- [A saved match written mid-declaration may carry an uncommitted `activePlayer` and a flag set under the old rules] → serialization already carries the turn flags and `activePlayer`; restoring an uncommitted declaration with a stale flag is harmless because the flag is re-derived at commitment, and a resume regression scenario covers it.
- [Coaches may expect the released Blitz to also un-mark the player as activated] → it does; nothing was activated, which is precisely why the release is legal.
