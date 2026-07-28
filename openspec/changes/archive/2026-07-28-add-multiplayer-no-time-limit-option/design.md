## Context

`LobbySettings.turnSeconds` (a plain positive number, host-picked from a fixed list: 60/90/120/180/240) drives the synced turn clock: on every `TurnStarted`, the host writes `timer.deadline = Date.now() + turnSeconds * 1000` to the shared Firestore lobby doc (`setTurnDeadline` in `src/firebase/lobby.ts`). Both host and guest `TurnClock` components derive their countdown purely from that stored `deadline`, and the host's enforcement effect force-ends the turn once it passes. `TurnClock` already treats `deadline == null` as "no active countdown" — the component renders nothing in that case, and the host's expiry check (`if (!isHost || !timer?.deadline ...) return;`) already no-ops when there's no deadline. This is existing behavior (used transiently between turns / phases), not something new to build.

## Goals / Non-Goals

**Goals:**
- Let the host pick a "No time limit" option in the lobby, alongside the existing durations.
- Guarantee neither client ever shows a countdown or gets force-ended for a no-limit match.
- Reuse the existing null-deadline code path rather than introducing a second "unlimited" rendering/enforcement branch.

**Non-Goals:**
- Changing the timeout-bank/pause feature. With no deadline, the clock UI (which hosts the pause button) simply doesn't render — that's acceptable since there's nothing to pause.
- Any Firestore schema or security-rules change — `timer.deadline` is already nullable.
- Per-turn variability (e.g. different limits for different phases) — out of scope, same as today.

## Decisions

**Represent "no limit" as `turnSeconds = 0`, not a new field or `null`.**
- Alternatives considered: (a) a separate `noTimeLimit: boolean` flag alongside `turnSeconds`, (b) making `turnSeconds` nullable.
- Chose the `0` sentinel because `turnSeconds` is already a plain `number` written straight into Firestore and read by a single call site (`TurnClock`'s host effect); a sentinel avoids adding a field that every other reader of `LobbySettings` would need to know to check first, and avoids widening the type to `number | null` (which would ripple through the `<select>`'s `Number(e.target.value)` handling and the `startMatch`/`DEFAULT_SETTINGS` call sites for no benefit). `0` is also naturally excluded from the existing option list, so there's no ambiguity with a real duration.
- `turnMs = turnSeconds * 1000` naturally becomes `0` too when unset, so the host's turn-start effect only needs one added branch: `turnSeconds > 0 ? Date.now() + turnMs : null`.

**Leave `TurnClock`'s render/enforcement logic untouched.**
- Both already key off `timer.deadline == null`. No new prop, no new "∞" display — the requirement explicitly asks for "never display a broken/frozen timer," and the simplest way to guarantee that is to never create a timer state to begin with.

## Risks / Trade-offs

- [A resumed/saved match started before this change has `turnSeconds` as one of the old fixed durations; a match started under the new "no limit" setting has `turnSeconds: 0`.] → No migration needed: `0` was never a valid duration before, so no existing data collides with the new sentinel, and old matches are unaffected (they keep their existing numeric value).
- [Host could theoretically set `turnSeconds` to `0` and still see `timeoutBankMs` configured, with no way to use it.] → The pause button simply never appears (no deadline ⇒ `TurnClock` returns `null`), so this is dead but harmless state; not worth blocking or hiding the bank selector for one host-only testing setting.

## Open Questions

None — scope is a single sentinel value threaded through one UI select and one write site.
