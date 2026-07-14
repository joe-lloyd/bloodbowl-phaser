# Proposal: add-p2p-multiplayer

## Why

Two people can only play at one machine today. A peer-to-peer connection lets two players play from their own machines with no game server to host or pay for — and the groundwork is unusually cheap now: the headless work produced a complete JSON command protocol, serializable snapshots, and a deterministic seeded engine, which together are exactly a network wire format, resync mechanism, and consistency guarantee.

## What Changes

- Add a **peer-to-peer connection** between two browsers via WebRTC data channels: one player hosts (creates a match code / offer), the other joins; no dedicated game server.
- **Host-authoritative engine**: the host runs the only live `GameService`; the guest sends protocol commands (the same JSON commands the headless CLI uses) and receives responses/snapshots. No dual-simulation, no desync class of bugs.
- Add a **turn ownership & waiting system**: each side may only act when it owns the current decision — the active team's turn, or a `pendingDecision` whose `chooserTeamId` is theirs (e.g. choosing a die on an uphill block). The other side sees a clear "waiting for opponent" state with live updates of everything the opponent does (moves, dice, events animate as they happen).
- **Resilience**: heartbeat + disconnect detection, rejoin with full state resync from a `GameSnapshot`, and graceful abandon handling.
- **Team selection across the wire**: both players bring/pick their team before kickoff; teams are exchanged at connection time.

## Capabilities

### New Capabilities

- `p2p-connection`: WebRTC pairing (host/join with match code or copy-paste signaling), data channel message envelope, heartbeat/disconnect detection, and reconnection with snapshot resync.
- `remote-play`: Turn/decision ownership rules, command relay (guest command → host engine → both UIs), spectating the opponent's actions live, waiting-state UI, and abandon/forfeit handling.

### Modified Capabilities

<!-- none in openspec/specs yet; remote-play consumes the action-protocol and game-state-serialization capabilities from add-headless-engine as-is (no requirement changes) -->

## Impact

- **New code**: `src/network/` (peer connection, message envelope, host/guest session), lobby/connect UI pages, waiting overlay.
- **Reused as-is**: `src/headless/protocol.ts` (wire commands/responses), `src/headless/serialization.ts` (resync snapshots), seeded RNG (host-owned).
- **Modified code**: UI input gating by ownership (`GameplayInteractionController`/HUD honor a "not your decision" lock); `pendingDecision` already carries `chooserTeamId`.
- **Dependencies**: WebRTC is browser-native; optionally a tiny signaling helper (see design — default is serverless copy-paste/manual code exchange).
- **Out of scope**: matchmaking, >2 players, chat/voice, hosting infrastructure.
