# Design: add-online-multiplayer

## Context

`add-headless-engine` produced a JSON command/response protocol covering every interaction including mid-action decisions (`src/headless/protocol.ts`: `HeadlessCommand`, `CommandResponse`, `PendingDecision`), JSON-safe full-state snapshots (`serialization.ts`), and per-seed deterministic dice. Networked play therefore reduces to transport, authority, ownership, timing, and failure handling — plus the account/persistence/lobby/chat surface a real online game needs.

This change supersedes the planning-only `add-p2p-multiplayer`. That change chose WebRTC + manual copy-paste signaling and put auth, lobbies, and chat out of scope. Per the user's decisions (2026-07-16) we instead use **Firestore as the message bus** (no WebRTC, no NAT/signaling problems), keep the engine **host-authoritative**, and add Google auth, cloud team saves, lobbies, a synced timer, and chat. The overriding constraint is cost: everything must stay inside Firebase's free (Spark) tier, so the design minimizes Firestore writes and Cloud Function invocations and avoids any per-frame or per-command server work.

Teams currently persist only to `localStorage` via `TeamManager` (`saveTeams`/`loadTeams`). Menu entry is `src/ui/components/pages/MainMenu.tsx`; the dice-roller panel is `src/ui/components/hud/DiceLog.tsx`.

## Goals / Non-Goals

**Goals:**

- Two players on two machines play a full match; either can host.
- Signed-in users have a cloud team library; local/hotseat play still works signed-out.
- One engine, host-authoritative — no dual simulation, no desync class of bugs.
- The non-acting player always sees a live, faithful board and is input-locked until they own the turn/decision.
- A fair, server-synced clock nobody can game, with a bounded per-player pause budget.
- Stay within the Firebase free tier for a friends-play volume of matches.

**Non-Goals:**

- Matchmaking, ranking, spectators, >2 players.
- Server-authoritative anti-cheat (engine does not run in a Function); friends-play trust model.
- Voice chat; rich media chat.
- Real-time twitch netcode — the game is turn-based, latency of ~1s per exchange is acceptable.

## Decisions

### 1. Firestore as the message bus (not WebRTC)

Each match has a Firestore game document plus a `messages` subcollection. Both clients subscribe with a single `onSnapshot` listener; sending a message is one document write. Rationale: turn-based play produces a handful of writes per turn, well inside free-tier quotas; no signaling server, no NAT traversal, no TURN. Rejected — WebRTC data channels (the old p2p design): lower per-message cost but fragile NAT traversal and a whole signaling flow for no benefit at this volume. The `Transport` interface is kept abstract (send envelope / subscribe to envelopes) so WebRTC could slot in later without touching session logic.

### 2. The wire format is the headless protocol

Guest→host messages carry a `HeadlessCommand`; host→guest carry a `CommandResponse` (ok, events, snapshot, pendingDecision) plus pushed broadcasts for host-initiated actions so the guest sees the host's play live. One envelope wraps everything: `{ kind: "hello"|"command"|"response"|"broadcast"|"heartbeat"|"resync", payload, seq, from, ts }` with a monotonic `seq` per sender for ordering/dedup. Rejected — bespoke network messages: would duplicate the protocol the AI/CLI already exercise and test.

### 3. Host-authoritative single engine, rules validate the edges

Only the host runs `GameService`. The guest is a thin client: render snapshots/events, send commands. Firestore security rules enforce the security-relevant edges: only lobby members may write to the game doc (a non-member may only claim the empty guest seat as themselves), and a player may only write messages `from` themselves; joining is a client-side transaction those rules police. A callable Cloud Function for create/join/roster validation is **optional hardening only** — discovered during setup (2026-07-16): deploying any Cloud Function requires the Blaze plan, which we're avoiding, so the game must be fully playable without Functions. Rejected — Function-as-referee: real anti-cheat but one invocation per command (cost + latency), a second engine to maintain, and a mandatory paid plan; overkill for friends-play.

### 4. Ownership = activeTeamId + chooserTeamId

A command is accepted only from the connection that owns the deciding side: normal commands require `activeTeamId === yourTeam`; decision replies require `pendingDecision.chooserTeamId === yourTeam` (uphill block dice / Wrestle choices can belong to the non-active player — the engine already models `chooserTeamId`). A single `OwnershipGate` is consulted by the host (authoritative reject) and by each client's UI (local input lock for responsiveness). The waiting overlay names whose action/decision the game awaits.

### 5. Resync via snapshot, not replay

On rejoin or a detected `seq` gap, the host writes a `resync` envelope carrying a fresh `GameSnapshot` + current `pendingDecision`; the guest rebuilds its view wholesale. Snapshots already round-trip (spec'd and tested), so this is unconditionally correct. Rejected — event-log replay: more moving parts for no gain.

### 6. Auth and persistence: Google-only, Firestore with localStorage fallback

Firebase Auth with the Google provider only (simplest OAuth, no password management). `TeamManager` becomes storage-agnostic: signed-in → Firestore `users/{uid}/teams`; signed-out → existing `localStorage`. On first sign-in, existing local teams are offered for one-time migration/upload. Online play requires sign-in; team building and local play do not. A player only ever reads their own team library and brings only their own team.

### 7. Lobby lifecycle in one document

`games/{code}` holds `{ hostUid, guestUid, status, seed, settings, players: { host: {uid, team, ready}, guest: {…} }, timer, createdAt }` plus a `messages` subcollection. Flow: host creates (short human code) → guest joins by code → each picks a team and readies → when both ready the host writes `status: "active"` + seed and the match starts. `status` drives the UI (`lobby` → `active` → `finished`/`abandoned`). The doc is transient: a scheduled cleanup (or TTL) removes stale/finished games so storage stays near-zero.

### 8. Server-synced turn timer with a pause bank

The active turn has a deadline computed from a Firestore server timestamp (`serverTimestamp()` at turn start) + host-configured `turnSeconds`, so both clients count down against the same wall clock rather than drifting local timers. On expiry the active player's client auto-issues end-turn (host enforces; if the active client is gone the host ends it). Each player has a `timeoutRemainingMs` bank (default 5 min); spending it sets `timer.pausedBy` + `pausedAt`, which freezes the countdown and blocks commands for both sides until resumed or the bank drains. Host adjusts `turnSeconds` (and initial bank) in the lobby before start. Rationale: timestamp-anchored deadlines are cheap (no per-second writes — clients derive the countdown locally from `deadline`) and tamper-evident.

### 9. Chat as a dice-panel tab, over the same bus

The dice-roller panel gains a **Chat** tab beside the dice log. Messages are envelopes (`kind: "chat"` variant) written to the same `messages` subcollection, so chat, commands, and system events share one ordered stream and one listener. Chat is allowed at any time regardless of ownership.

## Risks / Trade-offs

- **Free-tier overrun if writes balloon** → keep the timer client-derived from a stored `deadline` (no per-second writes); batch nothing high-frequency; one listener per client; scheduled cleanup of finished games. Document the quota math in the setup task.
- **Host tab closes = match dies (host holds the only engine)** → periodic snapshot into the game doc; a rehost path can restore from the last snapshot (stretch). Guest also caches last snapshot in `localStorage`.
- **Firestore relay latency (~200ms–1s per exchange)** → acceptable for turn-based play; UI shows optimistic local input lock + "sending…" so it never feels frozen.
- **Trust model: host can still cheat dice** → accepted (friends-play). Function edge-validation + security rules stop the cheap attacks (joining others' games, illegal rosters, spoofed sender); true anti-cheat is an explicit non-goal.
- **UI input gating spread across HUD + GameplayInteractionController** → funnel through one `OwnershipGate`; the god-controller breakup (future change) consolidates further.
- **Firebase config secrets** → client Firebase config is publishable (not secret); security enforced by rules + Function, not by hiding config. Document this so keys aren't treated as leaked.

## Migration Plan

Additive; signed-out single-machine play is untouched throughout. Sequence (each stage lands green on `main`):

1. Firebase project + config module + Google auth + Firestore-backed `TeamManager` (with localStorage fallback + migration).
2. Envelope + `OwnershipGate` + in-process two-session harness (testable headlessly, no Firestore).
3. Firestore `Transport` + lobby document + host/join UI + per-player team selection + ready gating.
4. Host-authoritative session wiring (guest command → host engine → broadcast) + waiting overlay + live spectating.
5. Cloud Functions validation + Firestore security rules.
6. Synced turn timer + pause bank.
7. Chat tab.
8. Resilience: heartbeat, disconnect detection, snapshot resync, abandon/forfeit.

Rollback: the feature is reachable only via the new Host/Join menu entries; removing those entries (or a feature flag) disables online play without affecting local play.

## Open Questions

- Match-code scheme: short random code vs. Firestore auto-id shared via link — decide during lobby UI task.
- Whether kickoff weather/coin events show synchronized animations on the guest or just results.
- Exact free-tier headroom: confirm write/read counts per average match against Spark limits during the Firebase setup task.
- Forfeit-on-disconnect policy: auto-forfeit timer vs. remaining player's discretion (spec leans to discretion).
