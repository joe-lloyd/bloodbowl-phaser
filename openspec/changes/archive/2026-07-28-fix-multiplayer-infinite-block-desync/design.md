## Context

The bug report was a raw browser console log (`NOTES_FOR_AI.md`, "new multiplayer items" section, 6th bullet) pasted from a live online match. The user's summary: "something fell out of sync and ended up causing infinite roll for a block and skipped the bloodlust roll on the vampire." The log itself is mostly noise (React DevTools banner, a browser extension's "Extension context invalidated" spam, pointer-down coordinates), but four lines are load-bearing, in order:

```
NetworkedGameService.ts:45 [Networked] host rejected cancel-action: command-failed: action-already-committed   (× 5, interleaved with pointer-downs)
NetworkedGameService.ts:45 [Networked] host rejected declare-action: command-failed: illegal-action-declaration
GameplayInteractionController.ts:349 Switched action step to: block
NetworkedGameService.ts:45 [Networked] host rejected block: command-failed: block-not-declared
```

No Bloodlust roll, dice-log entry, or skill-triggered event appears anywhere in the captured log — consistent with "the Bloodlust roll was skipped," but the log does not directly show *why*. The investigation below reconstructs the mechanism from first principles by reading the actual host/guest code paths, and distinguishes what was **confirmed by reading the code (and reproduced in a test)** from what remains a **plausible but unverified reconstruction of the exact user session**.

### Architecture recap (host-authoritative online play)

- The host runs one real `HeadlessGame` over the real `GameService`. Guest commands arrive as protocol envelopes (`HostSession.handleGuestCommand`), execute through `HeadlessGame.execute()`, and the response (success or rejection) always carries the host's current authoritative snapshot (`HostSession.rejection()` includes `snapshot: this.options.game.snapshot()`).
- The guest's `IGameService` is `NetworkedGameService`: reads come from a passive replica (`GameService` instance that never runs rules), writes become protocol commands sent to the host.
- `GuestSession.sendCommand()` resolves the command's own promise **and** always calls `onApply(response)` — which, in `OnlineMatch.ts`'s `applyBundle`, overwrites the replica from `response.snapshot` — for every response, ok or not. **The passive replica's data self-heals on every round trip, including rejections.** This was confirmed by reading `GuestSession.receive()` (case `"response"`) and `OnlineMatch.ts`'s `applyBundle`.

## Goals / Non-Goals

**Goals:**
- Identify why the guest's local state and the host's authoritative state can diverge badly enough to produce the exact `action-already-committed` → `illegal-action-declaration` → `block-not-declared` sequence, and why that leaves the guest UI stuck.
- Fix the divergence mechanism at its root (the interaction controller trusting an optimistic return value it shouldn't), not by masking symptoms (no blanket retry, no swallowing the rejection).
- Lock the fix in with regression tests at every layer touched.

**Non-Goals:**
- Re-deriving the exact sequence of clicks/actions the reporting user made in their real session. The log doesn't contain enough information (no player names, no action types, no UI state) to reconstruct that with certainty — see "Open Questions."
- Changing any host-side rule/commit logic (`PlayerActionManager`, `GameService.declareAction`, `ActivationGateOperation`). That logic was audited and found internally consistent (see "Decisions" below); the bug is entirely in how the guest's UI reacts to it.
- General-purpose reconciliation for every optimistic `NetworkedGameService` method (team-reroll, push direction, follow-up, etc.). Those are lower-consequence (they don't drive a durable local step-machine the way declare/cancel-action do) and are left for a follow-up if a similar report surfaces for them.

## Decisions

### 1. Root cause: `NetworkedGameService.declareAction()`/`cancelAction()` are unconditionally optimistic, and nothing ever corrects the interaction controller when they're wrong

Read directly from `src/network/NetworkedGameService.ts` (before this fix):

```ts
declareAction(playerId, action, blockReplacement): boolean {
  this.send({ type: "declare-action", playerId, action, blockReplacement });
  return true;   // <-- always true, before the host has even seen the command
}
cancelAction(playerId): boolean {
  this.send({ type: "cancel-action", playerId });
  return true;   // <-- same
}
private send(command): void {
  void this.dispatch(command).then((response) => {
    if (!response.ok) console.warn(`[Networked] host rejected ${command.type}: ${response.reason}`);
    // (before this fix: nothing else happens on rejection)
  });
}
```

`GameplayInteractionController` (`onActionSelected`, `onCancelAction`) drives its own **local, un-synced step-machine** (`currentActionMode`, `actionSteps`, `currentStepId`, `hasMovedInAction`) directly off these return values:

- `onActionSelected`: `const success = this.gameService.declareAction(...)`; if `success` (always true for the guest), it immediately sets `currentActionMode = data.action` and builds `actionSteps` for that action (e.g. Blitz → `[Move, Block]`), before the host has replied at all.
- `onCancelAction`: `if (!this.gameService.cancelAction(...))` — since this is always `false`-guarded-to-never-trigger for the guest, it unconditionally resets `currentActionMode`/`actionSteps` to null/empty and re-opens the action menu, as if the cancel had genuinely been accepted.

Critically, **the passive replica's data is not the problem** — it re-syncs correctly on every response via `applyBundle`. The problem is that `currentActionMode`/`actionSteps`/`currentStepId` live entirely in the controller instance and are never read back against the replica after the fact. They are write-once from the optimistic return value and only ever change on the next local UI event.

### 2. How this produces the exact three-rejection sequence in the log

Confirmed by reading `PlayerActionManager` and `ActivationGateOperation`, and locked in by a new headless/network test (`sessions.test.ts`, "keeps a Bloodlust-committed declaration intact..."):

- Bloodlust's `onActivationDeclared` hook (`src/game/skills/rules/BloodlustRule.ts`) fires for **any** declared action, not just Block/Blitz (only the roll's modifier depends on the action). `ActivationGateOperation.execute()` calls `gameService.commitAction(playerId)` **before** rolling the die — "the declaration becomes binding here, before the die is even thrown" (existing comment in the code, confirmed correct). So a Bloodlust-skilled player's declaration is committed within the same tick it's declared, win or lose the roll.
- `PlayerActionManager.cancelAction()` refuses once `isActionCommitted()` is true. A stale guest "Back" click sends `cancel-action` after this commit and is correctly refused with `action-already-committed`.
- `GameService.declareAction()`'s once-per-turn guard (`ONCE_PER_TURN_ACTIONS = {blitz, pass, handoff, foul, throwTeamMate}`) only re-checks commitment **when the currently-declared action is itself in that set** — Move, Block, and the special actions have no team allowance at stake and are deliberately left freely re-declarable per the existing `defer-action-commitment` design. So a stale redeclare is refused with `illegal-action-declaration` specifically when the original committed action was once-per-turn (confirmed with a Hand-off-then-Blitz repro); redeclaring over a committed Move/Block would actually *succeed* silently on the host (a separate, narrower gap noted under Open Questions, not exercised by the captured log).
- Because the guest's `declareAction()` already returned `true` locally regardless, `onActionSelected` already switched `currentActionMode` to the newly-attempted action (e.g. Blitz, whose steps include `block`) and rendered its action steps — matching the log's `Switched action step to: block`, which is `onStepSelected` reacting to a **pure local step-tab click** (no network round trip) inside actionSteps the controller had already (wrongly) built.
- The eventual `block` command is evaluated against the host's real `state.activePlayer`, which never changed — it's still whatever the original committed declaration was, and if that's neither `"block"` nor `"blitz"`, `HeadlessGame`'s block handler throws `block-not-declared`, matching the log exactly. Every further click from the coach repeats this same rejected `block` command forever (nothing in the controller ever un-sticks `currentStepId = "block"`) — this is the "infinite roll for a block."
- The Bloodlust roll the user expected for *this* (rejected) declaration never happens, because the host never actually held that declaration — `ActivationGateOperation` only ever ran once, for the original (different, already-committed) action. From the coach's point of view this reads as "the Bloodlust roll was skipped."

### 3. Fix: surface the rejection, reconcile the controller, don't touch host logic

`NetworkedGameService` gains an optional `IEventBus` and emits `GameEventNames.NetworkCommandRejected` (`{ commandType, playerId, action, reason }`) whenever `send()`'s response comes back `!ok`. `GameplayInteractionController` subscribes and, when the rejection matches its current optimistic state (`declare-action` whose `action` equals `currentActionMode`, or any `cancel-action` for the currently selected player — both are exactly the cases that already blindly mutated local state), calls `deselectPlayer()` then `selectPlayer(playerId)` to force a clean rebuild of the action menu against the replica (already correct, per point 1) plus a `UI_Notification` explaining the resync.

Alternatives considered:
- **Make `declareAction`/`cancelAction` return a `Promise<boolean>` and await the real host verdict before mutating controller state.** Rejected: `IGameService` is a shared, synchronous-by-contract interface implemented identically by the host's real `GameService`; changing the signature ripples through every call site (host, guest, headless tests) for a guest-only problem. The event-based correction is guest-only and additive.
- **Reconstruct the controller's full action-step state from `state.activePlayer.action` on every rejection**, so a coach whose original declaration is still alive sees it continue rather than being kicked back to the menu. Rejected for this change: correct in principle, but duplicating `onActionSelected`'s action→steps switch as a second reconciliation path (rather than reusing it verbatim) is a meaningfully larger, riskier surgery than the codebase's existing "optimistic write, snapshot-correct on response" pattern (see `placePlayer`'s handling in the same file) already uses elsewhere. Deselect-and-reselect is strictly simpler, converges in one round trip, and reuses the exact code path a coach already exercises by clicking a player. Flagged as a possible follow-up under Open Questions.
- **Silently retry the rejected command.** Rejected outright — the host's rejections here are *correct, rules-driven refusals* (the action really is committed elsewhere); retrying would just reproduce the same rejection forever, which is the bug, not a fix.

## Risks / Trade-offs

- [The reconciliation deselects the player rather than restoring their in-progress declared action] → Acceptable: it converges (no more infinite loop) and is honest about what happened ("out of sync, please reselect"); a coach with a genuinely still-live declaration just needs one extra click to see it again via the normal action menu. Flagged as a possible future improvement, not shipped here to keep the change narrowly scoped to the confirmed defect.
- [The event fires for every rejected fire-and-forget command, not just declare/cancel-action] → The controller's handler filters to the two command types it actually has optimistic state for, so other rejections (e.g. a rejected team-reroll) currently do nothing new. This is intentionally conservative — extending reconciliation to those paths is out of scope (see Non-Goals).
- [`eventBus` on `NetworkedGameService` is optional] → Kept optional so the existing direct-construction test (`defer-action-commitment.test.ts`, "a guest's release is proxied...") and any other caller that doesn't need reconciliation don't have to change. `OnlineMatch.ts` (the only real runtime caller) always supplies it.

## Migration Plan

Pure additive fix, no data migration. Deploys like any other client-code change; both peers should be on the same build (the existing protocol-version hello already gates that generally). No rollback concerns beyond reverting the commit.

## Open Questions

- The exact action(s) the real user declared are not recoverable from the captured log — the regression test reproduces the *mechanism* (via Hand-off → Blitz, chosen because it's the smallest scenario that trips every one of the three logged rejection reasons in order) rather than the literal session. If a fuller log or repro steps become available, the scenario should be tightened to match.

### Addendum: review-round fixes (post-initial-implementation)

A review pass on the first version of this change found two real gaps, both closed in a follow-up commit on the same branch:

1. **`cancel-action` reconciliation had no staleness guard.** `onNetworkCommandRejected`'s `declare-action` branch correctly compared the rejection against current state (`this.currentActionMode === data.action`) before reconciling, but the `cancel-action` branch reconciled unconditionally for any rejected cancel matching the selected player — regardless of what the coach had done locally since sending it (e.g. already declared a new, host-accepted action for the same player). That's precisely the "stale response resets newer state" hazard this design already calls out as a risk to avoid. Fixed by giving `cancelAction`'s optimistic path the same kind of self-check: `onCancelAction` now stamps a monotonic `interactionSeq` (bumped by every local action-mode/selection change) onto a `pendingCancelSeqByPlayer` map at the moment it optimistically resets local state; `onNetworkCommandRejected` only reconciles a `cancel-action` rejection if `interactionSeq` is still exactly what it was at that moment — i.e. nothing local happened for that player in between. Covered by two new tests: a stale cancel rejection is correctly ignored once the coach has declared a new action for the same player, and once they've deselected/reselected.

2. **The once-per-turn redeclare guard (`GameService.declareAction()`) had a real, if narrow, host-side gap**, independent of anything guest-side: it only re-checks commitment when the *existing* declared action itself carries a once-per-turn allowance (`ONCE_PER_TURN_ACTIONS`). A gate-committed Move/Block/special-action declaration (e.g. Bloodlust already resolved, `active.committed === true`, no `pendingDecision` blocking further commands) had **no** guard at all — a duplicate `declare-action` for the same player would silently overwrite it with no rejection whatsoever, which is arguably worse than this bug's original symptom (there's nothing to reconcile against). Initially scoped out as "host-internal, not guest-visible" — on reflection this was too dismissive: it's reachable by exactly the kind of duplicate/racy command this PR's fire-and-forget optimism can produce, it's a two-line fix with no behavioral trade-off once precisely scoped, and leaving a rules violation unpatched next to a PR specifically about declaration-commitment integrity would be an odd place to draw the line. Fixed: `GameService.declareAction()` now also refuses any redeclare for a player whose live declaration's commit reason is specifically `"gate"` (an activation-gate roll fired), regardless of the once-per-turn allowance. This is deliberately narrower than "any committed declaration blocks any redeclare" — `isActionCommitted()` reports `"movement"` instead of `"gate"` the instant real movement is spent, so the intentional Move-then-Block free-redeclaration carve-out (documented inline at `GameService.ts` — "Move-then-Block for the same player is not changing your mind about anything") is untouched; a new test pins that this still works. Per Bloodlust's own rules text, the *only* sanctioned way to change a gate-committed declaration is its own downgrade-to-Move reaction (resolved inline by `ActivationGateOperation`, never a fresh `declare-action`), so refusing every other redeclare after a gate commit is the rules-correct behavior, not just a defensive tightening.
