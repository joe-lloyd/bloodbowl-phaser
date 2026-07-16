# Tasks: add-online-multiplayer

## 1. Firebase project & config

- [ ] 1.1 Create a Firebase project; enable Google sign-in provider, Firestore, and Cloud Functions; record free-tier (Spark) quota headroom for expected match volume in the setup notes.
- [x] 1.2 Add `firebase` to dependencies; create `src/firebase/config.ts` reading the (publishable) client config from env, with a guard so the app still runs for local/signed-out play if config is absent.
- [x] 1.3 Add a `functions/` workspace (`firebase-functions`, `firebase-admin`) and `firebase.json` wiring emulators for local dev; document that Firebase client config is not a secret and security is enforced by rules + Functions.

## 2. Auth & cloud team library

- [x] 2.1 Implement `src/firebase/auth.ts`: Google sign-in, sign-out, and a subscribable current-user state exposing a stable uid.
- [x] 2.2 Add sign-in/sign-out UI (menu affordance) and gate Host/Join behind sign-in while leaving team building and local play open when signed out.
- [x] 2.3 Make `TeamManager` storage-agnostic: signed-in → Firestore `users/{uid}/teams`; signed-out → existing `localStorage`. Preserve the current save/load API surface.
- [x] 2.4 Implement first-sign-in migration: offer to upload existing `localStorage` teams; do not overwrite existing cloud teams; leave locals intact on decline.
- [x] 2.5 Tests: signed-out uses localStorage, signed-in reads/writes only own library, migration uploads once and is idempotent.

## 3. Envelope & ownership gate (transport-agnostic core)

- [x] 3.1 Define the message envelope in `src/network/envelope.ts`: `{ kind: "hello"|"command"|"response"|"broadcast"|"chat"|"heartbeat"|"resync", payload, seq, from, ts }`; payloads reuse `HeadlessCommand`/`CommandResponse`/`GameSnapshot` from `src/headless`.
- [x] 3.2 Implement `OwnershipGate` deciding acceptance from `activeTeamId` (normal commands) and `pendingDecision.chooserTeamId` (decision replies); return typed reject reasons, never throw.
- [x] 3.3 Implement host session (`src/network/HostSession.ts`): owns the single `GameService`, validates via `OwnershipGate`, applies commands, broadcasts responses; and guest session (`GuestSession.ts`): sends commands, renders responses/broadcasts, holds no engine.
- [x] 3.4 Add sequence ordering + duplicate/gap detection; a gap requests a resync.
- [x] 3.5 Tests: two in-process sessions over an in-memory transport play a full scripted match; out-of-turn commands are rejected; opponent-owned decision (uphill block dice) accepted only from the defender; gap triggers resync.

## 4. Firestore transport & lobby

- [x] 4.1 Define the `Transport` interface (send envelope / subscribe to envelopes) and implement `FirestoreTransport` over `games/{code}` + `messages` subcollection with a single `onSnapshot` listener.
- [x] 4.2 Implement lobby lifecycle: create (host, short match code, seed placeholder), join by code (membership/capacity), `status` progression `lobby → active → finished/abandoned`.
- [x] 4.3 Build Host and Join menu entries + lobby UI page showing both players, presence, and status.
- [x] 4.4 Per-player team selection in the lobby from the player's own Firestore library; show both chosen teams; no control over the opponent's team.
- [x] 4.5 Ready-up + wait-for-everyone gating; host starts the match (writes `status: active` + seed) only when both players have a team and are ready.
- [x] 4.6 Scheduled/TTL cleanup of finished/stale game docs to keep storage near zero.

## 5. Host-authoritative match wiring & spectating

- [x] 5.1 Wire `hello` exchange (protocol version; teams + seed travel in the lobby doc, which supersedes design decision 6's hello-borne teams); abort on version mismatch.
- [x] 5.2 On match start, host constructs the engine from both teams + seed; guest renders from the first snapshot.
- [x] 5.3 Route guest input through `GuestSession` (NetworkedGameService proxy behind ServiceContainer); host plays natively with an event-batch broadcaster + protocol-routed decision replies, so the guest sees everything live.
- [x] 5.4 Add input gating in `GameplayInteractionController` + HUD via a single ownership check; add a waiting overlay naming whose action/decision is awaited.
- [ ] 5.5 Verify live spectating: opponent moves, dice, pushes, and score animate on the waiting player's board within the same exchange.

## 6. Cloud Functions & security rules

> Note (2026-07-16): deploying Cloud Functions requires the Blaze plan, which the
> user is deliberately avoiding. The working path is client-side transactional
> join enforced by firestore.rules (implemented in 4.2). Task 6.1 is OPTIONAL
> hardening, deferred until/unless Blaze is enabled.

- [ ] 6.1 (Optional, Blaze-gated) Callable Function to validate lobby create/join (membership, capacity) and roster legality of each submitted team; reject illegal entries; no per-command engine execution.
- [ ] 6.2 Firestore security rules: only match members may read/write the game doc and messages; a message's `from` must equal the authenticated uid; team library readable/writable only by its owner.
- [ ] 6.3 Tests against the Firestore emulator: non-member write denied, spoofed-sender message denied, illegal roster rejected at join.

## 7. Synced turn timer & timeout bank

- [ ] 7.1 On turn start, store a server-timestamp-anchored `deadline` (= start + host `turnSeconds`); clients derive the countdown locally with no per-second writes.
- [ ] 7.2 Auto end-turn on expiry from the active client; host enforces end-of-turn if the active client is unresponsive (integrate with `TurnManager`).
- [ ] 7.3 Per-player timeout bank (default 5 min): pause sets `timer.pausedBy`/`pausedAt`, freezes countdown, blocks commands for both sides; resume deducts elapsed from the bank; bank exhaustion auto-resumes and disables further pausing.
- [ ] 7.4 Host lobby controls for `turnSeconds` and initial bank; apply equally to both players (read-only for guest).
- [ ] 7.5 Timer HUD showing countdown, who paused, and each player's remaining bank. Tests for expiry, pause/resume deduction, and exhaustion.

## 8. Match chat

- [x] 8.1 Add a Chat tab to the dice-roller panel (`DiceLog`), keeping the dice log on its own tab.
- [x] 8.2 Send/receive chat as `kind: "chat"` envelopes over the same message stream, attributed to sender, allowed regardless of ownership.
- [x] 8.3 Unread indicator on the Chat tab that clears when viewed. Send/receive covered by the sessions test; badge behavior verified in the 10.1 playtest (no React component-test infra in repo).

## 9. Resilience

- [ ] 9.1 Heartbeat envelopes + disconnect detection surfacing a disconnected state within seconds.
- [ ] 9.2 Rejoin same match by code → host sends `resync` (snapshot + pending decision); guest rebuilds view wholesale.
- [ ] 9.3 Abandon/forfeit: after grace period, remaining player can end the match cleanly to a final result screen.
- [ ] 9.4 Periodic host snapshot into the game doc + guest localStorage cache (stretch: rehost from last snapshot if host tab closes).

## 10. Wrap-up

- [ ] 10.1 End-to-end manual playtest across two browsers: sign in, host/join, pick teams, ready, play a full match with timer, pause, chat, and a mid-match reload/resync.
- [ ] 10.2 Confirm signed-out local hotseat play is unchanged.
- [ ] 10.3 Update docs/README with Firebase setup, env vars, emulator usage, and the free-tier cost note; remove the superseded `add-p2p-multiplayer` change (archive) once this lands.
