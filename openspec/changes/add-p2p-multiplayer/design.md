# Design: add-p2p-multiplayer

## Context

The add-headless-engine change produced the three hard ingredients: a JSON command/response protocol covering every game interaction including mid-action decisions (`src/headless/protocol.ts`), JSON-safe full-state snapshots (`serialization.ts`), and per-seed deterministic dice. Multiplayer therefore reduces to: transport (WebRTC), authority (who runs the engine), ownership (who may send which command when), and failure handling.

## Goals / Non-Goals

**Goals:**

- Two browsers, two machines, no game server; either player can host.
- The non-acting player is always watching a live, faithful view — never a stale board.
- Disconnects are survivable: rejoin and resync without losing the match.
- The wire protocol is the existing action protocol — one protocol for AI, CLI, and network.

**Non-Goals:**

- Matchmaking/lobbies beyond a single host/join flow; spectators; >2 players.
- Cheat-proofing beyond host authority (friends-play trust model).
- Mobile/NAT-hostile network heroics beyond a STUN server default.

## Decisions

### 1. Host-authoritative single engine

Only the host runs `GameService`. The guest is a thin client: renders snapshots/events, sends protocol commands. Rejected alternative — lockstep dual simulation on the shared seed: cheaper bandwidth but reintroduces desync risk for zero benefit at this scale; the response envelope (events + snapshot) is small.

### 2. The wire format is the headless protocol

Guest→host: `HeadlessCommand` JSON. Host→guest: `CommandResponse` (ok, events, snapshot, pendingDecision) plus pushed broadcasts for host-initiated actions so the guest sees the host's moves live. One envelope wraps both: `{kind: "command"|"response"|"broadcast"|"hello"|"heartbeat"|"resync", payload, seq}` with a monotonically increasing `seq` for ordering/dedup. Rejected: bespoke network messages — would duplicate the protocol the AI/CLI already exercise and test.

### 3. Ownership = activeTeamId + chooserTeamId

A command is accepted only from the connection that owns the deciding side: normal commands require `activeTeamId === yourTeam`; decision replies require `pendingDecision.chooserTeamId === yourTeam` (uphill block dice and Wrestle-style choices can belong to the non-active player — the machinery already models this). The host enforces; guests also gate their UI locally for responsiveness. The waiting overlay shows whose decision the game is waiting on.

### 4. Signaling: manual code exchange first, pluggable later

Default flow needs no server: host generates an offer code (compressed SDP), sends it over any channel (Discord/WhatsApp), guest pastes it, replies with an answer code. A `Signaler` interface isolates this so a tiny free-tier signaling service (or copy-paste QR) can slot in later without touching session code. STUN: public Google STUN by default; no TURN (documented limitation: symmetric-NAT pairs may fail).

### 5. Resync via snapshot, not replay

On rejoin (or `seq` gap), host sends `resync` with a fresh `GameSnapshot` + current `pendingDecision`; guest rebuilds its view wholesale. Rejected: event-log replay — snapshots already round-trip (spec'd and tested) and are unconditionally correct.

### 6. Team exchange at hello

`hello` carries protocol version + the joining player's serialized team; host validates (roster legality can lean on existing team validation) and replies with its own team + match seed. Version mismatch fails fast with a clear message.

## Risks / Trade-offs

- [NAT traversal failures without TURN] → documented; Signaler abstraction leaves room for a TURN/relay option later.
- [Host tab closes = match dies] → snapshot-on-interval into localStorage on both sides; a rehosting flow can restore from the guest's last snapshot (stretch task).
- [UI input gating spread across HUD + GameplayInteractionController] → single `OwnershipGate` consulted by both; the god-controller breakup (future change) will consolidate further.
- [Browser-only WebRTC vs. future AI-vs-remote-human] → envelope is transport-agnostic JSON; a Node peer could use wrtc/websocket later — explicitly out of scope now.

## Migration Plan

Additive; single-machine play untouched. Order: envelope + ownership gate (testable headlessly with two in-process sessions) → WebRTC transport + manual signaling → lobby/waiting UI → resilience (heartbeat, resync, rejoin). Each stage lands green on `main`.

## Open Questions

- Offer/answer code UX: raw copy-paste vs. QR vs. tiny signaling service — decide during lobby UI task.
- Forfeit rules on prolonged disconnect (auto-forfeit timer vs. host discretion).
- Whether kickoff-time weather/coin events should display synchronized animations or just results on the guest.
