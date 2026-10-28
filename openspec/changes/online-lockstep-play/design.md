## Context

Online play today (after PR #44):

- The host's browser runs the engine natively: the scene and HUD call `GameService` directly, and the scene orchestrator drives the flow (coin flip, weather, kickoff, turn starts). A passive `HeadlessGame` on the same services executes the guest's commands and tracks pending decisions.
- The guest's browser runs a `GameService` copy behind `NetworkedGameService`, which turns every mutation into an action-protocol command. Its copy runs no rules (`replica = true`). It renders the host's events and overwrites its state with the snapshot in every message.
- Every host message carries the full `GameSnapshot`, 19-50 KB. Measured in the two-machine harness: median delivery 0.5 s on a quiet emulator, 5-20 s during the half-time burst.
- The seed is random and stored in `games/{code}/host/state`, readable only by the host.

Two facts make lockstep practical:

- The engine is deterministic under command replay. The simulation records seed plus command list, and `src/simulation/replay.ts` reproduces the final state exactly.
- The guest path proves the scene can render an engine it does not drive: it plays from events plus state, and this week's two-machine runs fixed its rough edges (stale dialogs, push lock, resync redraw).

## Goals / Non-Goals

**Goals:**
- The coach who may act sees the result of their action with no network wait.
- Messages are small: a command, a sequence number and a checksum. Full state only on join, rejoin and mismatch.
- Neither coach can choose the seed.
- Any desync is detected at the command that caused it and healed automatically.

**Non-Goals:**
- Preventing cheating. Either coach can read the seed, predict dice or run a modified client. The owner accepts this.
- A game server or Cloud Functions. Firestore stays the only backend.
- Changing the rules engine's behaviour.

## Decisions

**D1 Lockstep, not compact host diffs.** Shrinking the host's messages would cut bandwidth but still make the guest wait on the host for each of its own steps, which is the lag the owner noticed. Server-authoritative play (a Cloud Function or a per-match server running the engine) fixes cheating, which is a non-goal, and adds cost and latency. Lockstep gives the acting coach a local engine on both sides.

**D2 The command is the unit of sync.** Every state change on either side is an action-protocol command run through `HeadlessGame.execute` on the local engine. The peer runs the identical command. Both sides use the `NetworkedGameService` facade over their real engine: its dispatch executes the command locally, then sends it. The guest-only snapshot-applying path goes away.

**D3 The engine drives its own flow.** Today the host's scene orchestrator calls flow methods (`rollInitialWeather`, `startGame`, `startKickoff`, `startTurn`) at moments set by animations. Two scenes would call them at different moments relative to incoming commands, which risks divergence. Flow must instead run inside the engine as a consequence of commands, as it does in the simulation (`HeadlessGame` with auto-start). The scene only renders. Task group 2 confirms how much of this already holds before any network change.

**D4 Who may act, and who drives.** The existing ownership rules decide who may act: `decisionOwner` for a pending decision, otherwise the active team (or the kicking team during kickoff). The UI only accepts input from that side, and the gate also runs on the receiving side as a check. The *driver* is the side that may act right now. It answers resync requests, saves at the change of turn and issues the clock's expiry. Control passes back and forth with the turn and with decisions. Because one side acts at a time, the two command streams do not interleave.

**D5 Checksums.** A checksum is a 32-bit FNV-1a hash of the canonical snapshot (sorted keys) plus the RNG state, after the command runs. Each command envelope carries the checksum before and after. The receiver checks the "before" value against its own state. A mismatch means a missed or reordered command, or divergence, and triggers a resync. It then runs the command and checks the "after" value; a mismatch means the engines diverged, which also triggers a resync and is logged with both values for debugging.

**D6 Resync.** The requester sends `resync-request`. The driver replies with snapshot, RNG state, turn-manager state, match stats and any pending decision. The receiver restores its engine from it, the same way a local save is restored (`createHeadlessGame` with a `MatchSave`), and redraws the board. The PR #44 rules stay: a hello resets the peer's sequence tracking and is answered with a resync.

**D7 Joint seed by commit and reveal.** In the lobby each coach writes `seedCommit[uid] = SHA-256(secret)` with a 32-byte random secret kept in memory and session storage. When both commits exist, each writes `seedReveal[uid] = secret`. Each side checks every reveal against its commit; then `seed = first 31 bits of SHA-256(hostSecret ‖ guestSecret)`. Start Match requires both valid reveals. This uses `crypto.subtle`, so the app needs a secure origin, which it already needs for sign-in. Neither side can steer the seed, because each commits before seeing the other's secret.

**D8 Saving.** At every change of turn the driver writes snapshot, RNG state and match stats to the lobby document. Both members can read it, which is fine because both already know the seed. The `games/{code}/host/state` document and its rule are removed. Resume loads the newest save on both sides and then runs a hello/resync handshake.

**D9 Turn clock.** The driver issues `end-turn` when its own clock expires. If the driver's heartbeat has gone stale past the grace period, the waiting side may issue it instead, so a vanished coach cannot freeze the match.

**D10 Message shape.** `{ seq, ts, from, kind: "command", command, before, after }`, about 200-400 bytes. `hello`, `resync-request`, `resync`, `chat` and `selection` keep their current shapes. `PROTOCOL_VERSION` goes to 3.

## Risks / Trade-offs

- **Hidden nondeterminism** in the browser engine: timers such as the 500 ms automatic end of turn, the flow manager's real delays, `Date.now`, iteration order, IDs from `Math.random`. Mitigation: the determinism proof (task group 1) runs in Node with real delays, the checksum catches any remaining case at once, and resync heals it.
- **The scene drives the flow on the host today** (D3). This is the largest piece of work and the least certain. Task group 2 maps it before anything else changes.
- **Both sides can predict dice.** Accepted.
- **A command from a coach whose state is stale**, for example clicking during the handoff, is rejected locally by the gate, or remotely by the "before" check followed by a resync. It cannot fork the game silently.
- **Matches in progress at release cannot resume.** Accepted at this stage of the project.

## Migration Plan

Ship behind the protocol version bump. Older clients get the existing "incompatible game versions" message. Lobby documents gain the seed commit and reveal fields; old saved matches are not migrated.

## Open Questions

- Can every flow step the host's scene drives today run inside the engine, or do some need to become explicit commands, such as acknowledging a kickoff event? Task 2.1 answers this.
- Does each side animate its own commands the same way it animates replayed ones? Guest rendering today handles bundles of events, not live engine events; this needs a check in the browser.
