## Why

Online play is host-authoritative: the host's browser runs the only engine, and the guest sends every action to it and waits for the answer. So the guest waits on the network for every step of their own turn, and that felt laggy. Every reply also carries the whole game state, 19-50 KB per message and over a thousand messages a match. At half time the burst of messages pushed delivery out to 5-20 seconds in the two-machine test.

Blood Bowl is turn-based. At any moment exactly one coach may act: the active team's coach, or whoever owns a pending decision such as uphill block dice, a reaction or the Apothecary. That coach can run the engine on their own machine and feel no delay, as long as the other machine can reproduce the result exactly. The owner accepts that this lets either coach cheat, for example by reading the seed and predicting dice. The aim is that the acting coach never waits on the network.

## What Changes

- **BREAKING** Both browsers run the full engine. Neither is the host for rules. Each starts from the same state and the same seed.
- **BREAKING** The seed is generated jointly: each side commits to a hash of a random secret, then both reveal, and the seed is a hash of both secrets. Neither coach can choose it; both know it afterwards. This replaces the host-only seed document added in PR #44.
- Every state change, on both sides, goes through an action-protocol command executed on the local engine. The scene renders the local engine's events on both sides. Today only the guest works that way; the host plays by calling the engine directly.
- The coach who may act runs the command locally and immediately. They then send only the command, its sequence number and a short checksum of the resulting state.
- The other side runs the same command on its own engine and compares checksums. On a mismatch it asks for a resync, and the side whose turn it is (the driver) sends one full snapshot.
- Full state travels only on join, on rejoin and on a mismatch.
- The driver saves the match (snapshot, RNG state, match stats) at every change of turn, for resume.
- The driver issues the turn clock's forced end of turn.
- Kept from PR #44: Firestore as the transport, server-timestamped messages loaded only from page load onward, the hello/resync handshake on reload, and the ownership gate, now run as a local check on both sides.

## Capabilities

### New Capabilities

(none: this changes how existing online capabilities work)

### Modified Capabilities

- `remote-play`: the host-authoritative engine becomes lockstep play driven by whoever may act; spectating comes from replaying the other coach's commands; desyncs are detected by checksum and healed by the driver's snapshot.
- `game-sync-transport`: the hello carries a jointly generated seed (commit, then reveal) instead of a host-supplied one; envelopes carry commands with a state checksum rather than full snapshots; resync is sent by the driver.
- `turn-timer`: the forced end of turn on expiry is issued by the driving side as a normal command.
- `online-lobby`: save and resume is written by whichever side is driving at the change of turn, and both members can resume it.

## Impact

- `src/network/OnlineMatch.ts`: one code path for both roles; the host-only engine path and the guest's snapshot-applying path become a single lockstep match.
- `src/network/HostSession.ts`, `src/network/GuestSession.ts`: replaced by one symmetric session that sends commands and applies the peer's.
- `src/network/NetworkedGameService.ts`: becomes the facade both sides use; its dispatch runs the command locally and sends it.
- `src/network/envelope.ts`: new command envelope with checksum; `PROTOCOL_VERSION` bump.
- `src/headless/HeadlessGame.ts`: a stable state checksum; flow steps the scene drives today must be reachable as commands or run inside the engine.
- `src/firebase/lobby.ts`, `firestore.rules`: commit-reveal seed fields; save writable by either member; the host-only `host/state` document is removed.
- `src/ui/pages/TurnClock.tsx`: expiry issued by the driver.
- `e2e/online-match/`: log message sizes and the acting coach's command-to-render latency.
- Every match in progress when this ships cannot resume (protocol version bump).
