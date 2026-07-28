## Context

Reported symptom: during online multiplayer team setup, dragging an already-placed
player from one legal pitch square to another legal pitch square makes the player's
sprite visibly flash back into the Reserves dugout box for a split second before
landing on the new square. The user correctly guessed this is a missing-optimistic-
update problem tied to the Firestore round trip, though the literal mechanism is
slightly different from "the UI clears the position while waiting."

### Root cause (traced end to end)

1. **Local drag path.** During setup, an already-placed player can be dragged to a
   new pitch square (`GameScene.applyPitchRepositioning`, `dragend` handler,
   `src/scenes/GameScene.ts`). On drop it calls
   `PlayerPlacementController.placePlayer(playerId, x, y)`.

2. **The controller splits one move into two events.**
   `PlayerPlacementController.placePlayer` (`src/game/controllers/PlayerPlacementController.ts`,
   lines ~228-240): if the player already has an entry in the controller's local
   `placedPlayers` map (true for a reposition), it emits `PlayerRemoved` for the old
   square *before* setting the new position and emitting `PlayerPlaced`. This
   `PlayerRemoved` emit exists purely to keep the controller's own bookkeeping
   consistent (`this.placedPlayers.set(...)` overwrites the entry immediately
   after) — it does not need to be observable outside the controller.

3. **GameScene forwards `PlayerRemoved` to the engine as a real removal.**
   `setupSceneSpecificListeners` in `GameScene.ts` treats `PlayerRemoved` as "take
   this player off the pitch": it calls `gameService.removePlayer(playerId)` and
   refreshes the dugouts. For the **host** (`SetupManager.removePlayer` →
   `returnToDogout` → `movePlayerToBox(player, { box: "reserves" })`), this sets
   `player.status = PlayerStatus.RESERVE` and clears `gridPosition` — a real,
   authoritative "send to Reserves." For the **guest**
   (`NetworkedGameService.removePlayer`), it optimistically clears
   `gridPosition` locally and fires a `remove-player` command at the host.
   Immediately afterward the same synchronous call emits `PlayerPlaced`, which
   calls `gameService.placePlayer(...)` and fires a *second*, separate
   `place-player` command.

4. **Two commands, two host responses, race on the wire.** The guest now has two
   in-flight commands for what the player experienced as one gesture: `remove-player`
   then `place-player`. The host processes them in order and returns two separate
   responses (via `GuestSession.onApply` / `onBroadcast` → `OnlineMatch.applyBundle`).
   By the time either response arrives, the guest's local optimistic state is
   *already* correct (both commands were dispatched synchronously, back-to-back,
   well before any network round trip resolves) — but `applyBundle` still applies
   each host snapshot to the shared `team1`/`team2` objects.

5. **The existing "preserve my setup" guard has a gap.** `applyBundle` already
   contains a guard (`preserveMySetup` in `src/network/OnlineMatch.ts`) built
   exactly for this class of problem: while it's still the guest's own setup turn,
   it snapshots each of the guest's own players' `gridPosition` *before*
   `applySnapshotToTeams` overwrites the team objects, then restores those
   positions afterward. This protects `gridPosition`. It does **not** protect
   `player.status`. When the `remove-player` response (host's intermediate,
   now-stale "player is in Reserves, `status = RESERVE`" state) is the one that
   happens to be applied, `applySnapshotToTeams` sets `status = RESERVE` on the
   shared player object; `preserveMySetup` then restores the correct
   `gridPosition` but leaves `status` at `RESERVE`.

6. **`playerBoxOf` checks `status` before `gridPosition`.**
   (`src/game/rules/playerLocation.ts`): a player with `status === RESERVE` is
   placed in the Reserves box *regardless of `gridPosition`*. So for the brief
   window between the `remove-player` response landing and the `place-player`
   response landing (which corrects `status` back to `ACTIVE`), the guest's own
   dugout (`Dugout.refresh()`, driven by `UI_SyncBoard` in
   `GameScene`) renders the player in the Reserves box even though `gridPosition`
   already (correctly) points at the new pitch square — the visible "flash to
   Reserves."

The host, who owns the real engine, hits the same split-into-two-events bug
locally: their own drag also fires `PlayerRemoved` then `PlayerPlaced` through the
same controller, and — while the host's own screen updates synchronously with no
network delay so it self-corrects almost immediately — the *opponent* watching the
host's board (via `onGuestApplied`/broadcast) can also observe two separate
`UI_SyncBoard`-driving updates for what should be one atomic move.

The fix therefore has two parts: stop generating the spurious intermediate
"removed" event/command at the source (the actual root cause), and harden the
existing optimistic-preserve guard so any other future split-command sequence
during a guest's own setup turn can't reintroduce this class of flash.

## Goals / Non-Goals

**Goals:**
- A legal pitch-square-to-pitch-square drag during setup never visually passes
  through the Reserves box, for either the dragging coach or their opponent
  watching, online or local.
- `PlayerRemoved` keeps its one real meaning: a player actually leaving the pitch
  (illegal drop, explicit removal, clear-all). No behavior change for that case.
- Reuse the existing optimistic-render guard in `OnlineMatch.applyBundle` rather
  than inventing a new one.

**Non-Goals:**
- No change to setup placement rules/validation (`SetupValidator`,
  `sevens-setup-rules`).
- No change to the wire protocol/command shapes — this is fixed by *not sending*
  the redundant `remove-player` command, not by adding a new "move" command.
- Not attempting to make every possible multi-command setup sequence atomic; only
  fixing the one real gap (reposition) and hardening the general guard as defense
  in depth.

## Decisions

1. **Remove the redundant `PlayerRemoved` emit in `PlayerPlacementController.placePlayer`
   instead of adding debouncing/animation-suppression.**
   Alternatives considered: (a) suppress the visual effect of `PlayerRemoved`
   specifically during setup reposition (e.g., a flag threaded through
   `GameScene`), (b) coalesce the two events with a microtask/debounce so only the
   final state renders. Both treat the symptom, not the cause, and both would keep
   sending an unnecessary `remove-player` network command that a slow/lossy
   connection could still race visibly. Removing the emit at the source is
   strictly simpler and also cuts guest traffic (one command instead of two per
   reposition).

2. **Keep `SetupManager.placePlayer` and `NetworkedGameService.placePlayer`
   unchanged.** Both already perform an atomic pitch-to-pitch move when the player
   is already placed (verified: `SetupManager.placePlayer` excludes the player's
   old position from validation and calls `movePlayerToBox(player, {box: "pitch",
   position})` directly, which clears the old square and sets the new one in one
   step without ever setting `status = RESERVE`). No engine change is needed —
   only the caller that was manufacturing a spurious extra "removal" needs to stop.

3. **Harden `preserveMySetup` in `OnlineMatch.applyBundle` to also snapshot/restore
   `player.status`**, not just `gridPosition`, for the guest's own team while
   `snapshot.phase === SETUP && snapshot.activeTeamId === myTeamId`. This is the
   same existing "trust my own in-flight optimistic setup state" mechanism,
   extended to cover the one field it was missing. This is defense in depth: with
   decision (1) in place there is no longer a second in-flight command to race
   against, but the guard should not silently rely on that being the *only* way a
   stale intermediate `status` could ever reach a snapshot mid-setup.

4. **Reuse, don't rebuild.** No new "optimistic update" abstraction is introduced;
   the fix is (a) deleting an incorrect emit and (b) extending the one field
   captured by the pattern that already exists for this exact purpose.

## Risks / Trade-offs

- [Risk] Some other code path relies on `PlayerRemoved` firing on every
  reposition (e.g., for a side effect like a sound or stat counter) →
  Mitigation: grepped all `PlayerRemoved`/`PlayerPlaced` listeners
  (`GameScene`, `KickoffPhaseHandler`, `GameplayInteractionController`,
  `MatchStats`, `KickoffEventOverlay`); none require removal-then-placement for a
  same-gesture reposition, and `PlayerPlaced` alone already drives
  `checkSetupCompleteness`/dugout refresh/stat tracking correctly for a move.
- [Risk] Widening `preserveMySetup` to restore `status` could mask a genuine
  status-changing event arriving mid-setup (e.g., an opponent action that knocks
  this player's status — not applicable during setup, but worth naming) →
  Mitigation: the guard is already scoped tightly to `phase === SETUP &&
  activeTeamId === myTeamId` (only the guest's own active setup turn, only their
  own team's players); no rules mutate an opposing/inactive team's player status
  during setup.
- [Trade-off] The fix relies on tracing an intermittent, timing-sensitive bug
  through two layers (controller event emission + network reconciliation). A
  seeded headless/network test is required to lock the fix in place, since the
  bug would otherwise be easy to silently reintroduce by re-adding a "remove
  before place" convenience call.

## Migration Plan

No data migration. Pure client-side rendering/event-emission fix; no protocol
version bump needed since no wire command shape changes (a command is removed
from the sequence, not altered).

## Open Questions

None — root cause is fully traced and the fix is scoped to two files plus tests.
