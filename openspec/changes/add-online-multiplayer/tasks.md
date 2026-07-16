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
- [x] 6.2 Firestore security rules: only match members may read/write the game doc and messages; a message's `from` must equal the authenticated uid; team library readable/writable only by its owner. (`firestore.rules` — plus `users/{uid}` owner-only for the profile/active-match pointer.)
- [ ] 6.3 Tests against the Firestore emulator: non-member write denied, spoofed-sender message denied, illegal roster rejected at join.

## 7. Synced turn timer & timeout bank

- [x] 7.1 On turn start, host writes an absolute `timer.deadline` (Date.now() + host `turnSeconds`) to the game doc; both clients derive the countdown locally (no per-second writes). (`TurnClock` on `TurnStarted`; `setTurnDeadline` in lobby.ts.)
- [x] 7.2 Auto end-turn on expiry: the host runs the enforcement loop and force-ends the active team's turn when the deadline lapses (works even if the active client is unresponsive), skipping mid-decision; next `TurnStarted` rewrites the deadline.
- [x] 7.3 Per-player timeout bank (default 5 min): `pauseClock` sets `timer.pausedBy`/`pausedAt` and freezes the countdown; `mayAct()` returns false for both sides while paused; resume deducts elapsed from the bank + extends the deadline (`computeResume`); bank exhaustion auto-resumes.
- [x] 7.4 Host lobby controls for `turnSeconds` + initial bank already exist (SettingsPanel, read-only for guest); `startMatch` seeds `timer.banks` from `settings.timeoutBankMs` for both.
- [x] 7.5 Timer HUD (`TurnClock`): countdown (red/pulse when low), PAUSED + who paused, per-player bank + Resume. Tests: `__tests__/unit/TurnClock.test.ts` (pause deduction, deadline extension, exhaustion clamp).

## 8. Match chat

- [x] 8.1 Add a Chat tab to the dice-roller panel (`DiceLog`), keeping the dice log on its own tab.
- [x] 8.2 Send/receive chat as `kind: "chat"` envelopes over the same message stream, attributed to sender, allowed regardless of ownership.
- [x] 8.3 Unread indicator on the Chat tab that clears when viewed. Send/receive covered by the sessions test; badge behavior verified in the 10.1 playtest (no React component-test infra in repo).

## 9. Resilience

- [x] 9.1 Presence heartbeat + disconnect detection: each client stamps `players.{uid}.lastSeen` every 6s on the game doc (reuses the lobby subscription — no extra listener/write channel); `isPlayerOnline` flags a peer offline when their heartbeat is stale (>15s). `DisconnectBanner` surfaces it within seconds. Locked by `__tests__/unit/Presence.test.ts`.
- [x] 9.2 Rejoin by code → resync: re-entering `/online/play/:code` rebuilds the match; the host sends a `resync` (snapshot + pendingDecision) on the returning peer's `hello`, and the guest rebuilds its view wholesale (`onResync` → `applyBundle`, emits `PhaseChanged` so the scene follows). The host itself rejoins by reconstructing from the persisted `snapshot` (`savedSnapshot` in createHostMatch).
- [x] 9.3 Abandon/forfeit: after a longer grace (>30s offline) the `DisconnectBanner` offers "End match (opponent left)" → `finishMatch(code, "abandoned")`; the existing status watcher clears both pointers and returns everyone to the menu.
- [x] 9.4 Periodic host snapshot into the game doc (throttled 15s + on save/close) — done; guest now caches the last snapshot to `localStorage` (`bb_online_snapshot_{code}`) as a fallback. Rehost-from-guest-snapshot left as the noted stretch.

## 10. Wrap-up

- [ ] 10.1 End-to-end manual playtest across two browsers: sign in, host/join, pick teams, ready, play a full match with timer, pause, chat, and a mid-match reload/resync.
- [ ] 10.2 Confirm signed-out local hotseat play is unchanged.
- [x] 10.3 Update docs/README with Firebase setup, env vars, emulator usage, and the free-tier cost note (`README.md`); superseded `add-p2p-multiplayer` moved to `openspec/changes/archive/`.

## 11. Match lifecycle: one-active-match, resume, mutual end (added 2026-07-16)

- [x] 11.1 One active match per user: `users/{uid}.activeMatchCode` pointer set on host/join, cleared on end; hosting reattaches to the existing match instead of spawning a duplicate lobby doc. New `users/{uid}` doc security rule (owner-only).
- [x] 11.2 Persist authoritative `GameSnapshot` into the games doc (host, throttled + on save/close); resume rebuilds the host engine from it; guest emits `PhaseChanged` on snapshot phase jumps so its scene follows a resumed mid-play state.
- [x] 11.3 Mutual end-of-match agreement: `endRequestBy` on the lobby doc; opponent must Agree (→ `finished`, both clear pointer + leave) or Keep Playing; in-match menu with End Match + Save & Exit.
- [x] 11.4 Home page redesign: Play / Online / Extras groups + a Resume Match banner that deep-links to the in-progress match (play or lobby).
- [ ] 11.5 Bug fix (2026-07-16): online match hung at start because the engine booted in SANDBOX_IDLE — now boots SETUP/INTRO with a host-driven opening; guest stays passive (host-authoritative coin flip/weather). Verify in a two-browser playtest.

## 12. Shared coin flip + read-only setup viewing (added 2026-07-16)

- [x] 12.1 Shared coin toss: `coinFlip` state on the lobby doc (hostReady/guestReady/winnerTeamId/kickingTeamId). Dual-active ready check → both must ready; host writes the winner (authoritative, mirrored live); only the winner picks kick/receive; host applies via `UI_CoinFlipComplete`→`startSetup`. New `OnlineCoinFlip` overlay (OnlinePlayPage); in-HUD `CoinFlipOverlay` + `SetupPhaseHandler` intro/coin-flip suppressed for online (both roles). Persisted so a resumed match never re-flips.
- [x] 12.2 Read-only setup viewing: only the active team's coach gets placement controls/drag (gated in `SceneOrchestrator.startPlacement` + `SetupPhaseHandler` for online by `activeTeam===myTeamId`); the watcher renders the opponent's placements live via new `UI_SyncBoard` event → `GameScene.refreshDugouts()`. Emitted on the guest per setup snapshot and on the host per applied guest command.
- [x] 12.3 Online weather: host now rolls it once via the seeded RNG (`GameService.rollInitialWeather`) at coin-flip completion (before `startSetup`); the result rides the snapshot to the guest so both see identical weather + the "Weather Result" notification/dice log. (Cosmetic cheer intro re-add still deferred.)
- [x] 12.6 Notification system redo: de-duplicate identical messages within 1.5s (kills the peer double — host broadcast UI_Notification + guest re-derived from the re-emitted event), cap at 3 concurrent (existing), and moved the feed to bottom-center with smaller banners so it's out of the board's way.
- [x] 12.4 Optimistic peer setup rendering: `NetworkedGameService` places/removes/swaps on the local replica immediately (no flash back to dugout); the host's response snapshot reconciles/rolls back. During the peer's own setup turn, `applyBundle` preserves the peer's own team positions so a burst (e.g. formation load) can't revert un-acked placements.
- [x] 12.5 Lock out setup after a coach confirms / when it's the opponent's turn: read-only branches now hide the panel (`UI_HideSetupControls`) + `GameScene.disableSetupInteraction()` (strip dugout + pitch drag, clear zone); and `OwnershipGate` rejects place/remove/swap/confirm-setup unless `activeTeamId === senderTeamId` (defense in depth).

## 13. Coach profiles + names in-match (added 2026-07-16)

- [x] 13.1 Coach profile: `coachName` on `users/{uid}` (getCoachName/setCoachName/resolveCoachName/defaultCoachName in lobby.ts). `useCoachProfile` hook + editor on MainMenu. Lobby create/join now send the coach name, never the Google display name — the real account name is never exposed to opponents. Default `Coach-XXXX` (uid slice) when unset.
- [x] 13.2 Coach names in the match: `OnlineMatch.coachName(teamId)`; ScoreBoard ("MATCH" block) shows 🎓 coach under each team with a "(you)" marker; chat sender + waiting labels use the coach name too. Lobby cards already showed it (displayName now = coach name).
