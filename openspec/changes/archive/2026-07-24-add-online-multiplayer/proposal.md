# Proposal: add-online-multiplayer

## Why

Today two people can only play at one machine, and teams live only in one browser's `localStorage`. Blood Bowl is turn-based, and the headless work already produced the three hard ingredients for networked play — a JSON command/response protocol (`src/headless/protocol.ts`), JSON-safe full-state snapshots (`src/headless/serialization.ts`), and per-seed deterministic dice. Adding Firebase (auth, Firestore, Functions) turns those into a real online game with accounts, cloud-saved teams, matchmaking lobbies, a fair synced clock, and chat — while staying in Firebase's free tier because a turn-based game writes rarely.

This change **supersedes the planning-only `add-p2p-multiplayer` change**. It keeps that change's best decisions (host-authoritative single engine, the headless protocol as the wire format, ownership gating by `activeTeamId`/`chooserTeamId`) but replaces WebRTC + manual copy-paste signaling with a Firestore message bus, and adds the auth, persistence, lobby, timer, and chat scope that were explicitly out of scope before.

## What Changes

- **Firebase integration**: add Firebase (Auth, Firestore, Functions) as project dependencies with a self-contained config module; nothing about single-machine hotseat play changes for signed-out users.
- **Google sign-in**: new login flow (Google OAuth via Firebase Auth). Signing in is required only for online play; local play and team building stay usable while signed out.
- **Cloud team library**: teams save to Firestore per user (with `localStorage` kept as the offline/signed-out fallback and a one-time migration of existing local teams).
- **Menu → Host / Join**: MainMenu gains **Host Game** and **Join Game** entries leading to a lobby.
- **Firestore lobby**: a temporary lobby/game document holds membership, each player's chosen team, ready state, host settings, and the message log. Host creates a short match code; the other player joins by code. The lobby waits until both players have joined, picked a team, and readied up before the match starts.
- **Per-player team selection**: each player picks which of *their own* saved teams to bring; a player controls only their own team and only sees their own team library.
- **Host-authoritative synced play**: the host runs the only live `GameService`; commands and results travel as protocol envelopes through Firestore. The non-acting player watches live and is input-locked until they own the current turn or decision (e.g. picking block dice on an uphill block belongs to the defender).
- **Cloud Function validation ("verify packets")**: a small callable Function validates lobby creation/join and team legality (membership, turn ownership at join, roster rules) — rare calls that stay free; it does **not** re-run the engine per command.
- **Synced turn timer**: a visible countdown per turn, synchronized off a server timestamp, host-adjustable in the lobby. On expiry the active player's turn auto-ends. Each player has a **5-minute timeout bank** they can spend to pause the clock and the game.
- **Match chat**: a new **Chat** tab in the dice-roller panel (alongside the dice log), relayed through the lobby document.

## Capabilities

### New Capabilities

- `online-auth-persistence`: Google sign-in via Firebase Auth, per-user Firestore team library, and the offline/`localStorage` fallback + migration.
- `online-lobby`: Firebase config/bootstrap, host/join by match code, per-player team selection, ready-up and "wait for everyone" gating, and host-controlled match settings.
- `game-sync-transport`: the Firestore message-bus envelope (command/response/broadcast/hello/heartbeat/resync), monotonic ordering + dedup, snapshot resync, and the Cloud Function validation boundary.
- `remote-play`: host-authoritative engine, decision-ownership gating, live spectating of the opponent, and disconnect/abandon/forfeit handling.
- `turn-timer`: server-synced per-turn countdown, host-adjustable duration, auto-end-turn on expiry, and the per-player timeout bank that pauses clock + game.
- `match-chat`: in-match text chat surfaced as a tab in the dice-roller panel.

### Modified Capabilities

<!-- The action-protocol and game-state-serialization capabilities from add-headless-engine are consumed as-is (they are the wire format); no requirement changes to them. -->

## Impact

- **New code**: `src/firebase/` (config, auth, Firestore accessors), `src/network/` (envelope, host/guest session, Firestore transport, ownership gate), `functions/` (Cloud Functions project for validation), lobby/host/join UI pages, waiting overlay, chat tab, timer HUD.
- **Reused as-is**: `src/headless/protocol.ts` (wire commands/responses), `src/headless/serialization.ts` (resync snapshots), seeded RNG (host-owned).
- **Modified code**: `TeamManager` (Firestore-backed with `localStorage` fallback), `MainMenu` (Host/Join entries), `DiceLog`/dice panel (Chat tab), `GameplayInteractionController` + HUD (input gating by ownership), `TurnManager` (timer + end-turn on expiry).
- **Dependencies**: `firebase` (client SDK); a `functions/` workspace using `firebase-functions`/`firebase-admin`. Requires a Firebase project + Google OAuth client (setup documented in tasks).
- **Cost posture**: turn-based write volume + rare Function calls stay within Firebase's free (Spark) tier; design avoids per-command Function invocations and high-frequency listeners.
- **Out of scope**: matchmaking/ranking, >2 players, spectators, voice chat, server-authoritative anti-cheat, TURN/relay infrastructure.
