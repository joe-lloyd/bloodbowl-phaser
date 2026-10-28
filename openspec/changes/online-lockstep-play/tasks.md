## 1. Determinism proof (do first; stop if it fails)

- [ ] 1.1 Add `stateChecksum(game)` to `HeadlessGame`: FNV-1a over the canonical (sorted-key) snapshot plus RNG state, turn-manager state and match stats.
- [ ] 1.2 Test: play simulation matches across at least 50 seeds on engine A, recording each command; feed the same commands to engine B built from the same seed and teams; assert equal checksums after every command, including commands that stop on a pending decision (re-roll, reaction, block dice, push, follow-up, Apothecary, kickoff events).
- [ ] 1.3 Run the same test with real delays (the browser's `realTimeDelay`) rather than zero delays, to catch timer-driven flow such as the 500 ms automatic end of turn.
- [ ] 1.4 Fix every divergence at its cause. Record any unseeded randomness or time dependency found.

## 2. Engine drives its own flow

- [ ] 2.1 List every engine flow method the host's scene and orchestrator call today (`rollInitialWeather`, `startGame`, `startKickoff`, `rollKickoff`, `startTurn`, `endDrive`, `rollKORecovery` and others), with what triggers each one.
- [ ] 2.2 For each, make it happen inside the engine as a consequence of a command (as in the simulation), or add an explicit command for it. Steps that only pace animation stay in the scene.
- [ ] 2.3 Test in a headless browser: the local-play scene renders a match driven purely by commands with no flow calls from the scene.

## 3. Joint seed

- [ ] 3.1 Lobby: `seedCommit` and `seedReveal` per player; generate the secret with `crypto.getRandomValues` and hash it with `crypto.subtle`; keep the secret in session storage so a reload in the lobby can still reveal.
- [ ] 3.2 Derive the seed from both secrets once both reveals check out; Start Match stays disabled until then; a bad reveal shows an error to both coaches.
- [ ] 3.3 Rules: each player may write only their own commit and reveal, and a reveal only after both commits exist. Remove the `games/{code}/host/state` document and its rule.
- [ ] 3.4 Unit tests for derivation and checking; an emulator check that one coach cannot overwrite the other's commit.

## 4. Lockstep session

- [ ] 4.1 One symmetric session class replacing `HostSession`/`GuestSession`: sends command envelopes `{seq, ts, from, command, before, after}`, applies the peer's commands in order, and keeps the PR #44 hello, reload and orphan-release behaviour.
- [ ] 4.2 Checksum handling per design D5: a mismatch stops application, requests a resync, and logs both values.
- [ ] 4.3 Resync per design D6, with RNG, turn-manager state and match stats; the receiver rebuilds its engine and redraws the board (reuse the `positions` board sync).
- [ ] 4.4 `PROTOCOL_VERSION` 3.
- [ ] 4.5 Session tests over the in-memory transport: a full simulated match where commands alternate sides with no resyncs; a dropped command heals via resync; a tampered state is caught by the checksum.

## 5. One online match path

- [ ] 5.1 `OnlineMatch`: both roles build a real engine and `HeadlessGame`; the container's `gameService` is the `NetworkedGameService` facade whose dispatch executes locally, then sends. Remove the host-native path, the guest snapshot path and the `replica` flag's online use.
- [ ] 5.2 Input gating: `mayAct` from design D4 on both sides; the driver is exposed for resync, saves and the clock.
- [ ] 5.3 Saves: the driver writes snapshot, RNG and match stats at each change of turn; resume on both sides loads the newest save, then runs the hello/resync handshake.
- [ ] 5.4 Turn clock per design D9.
- [ ] 5.5 Remove code made dead by this change: the event broadcaster, bundle application and `shouldPreserveOwnSetup`/setup placement restore, if nothing still needs them.

## 6. Verification

- [ ] 6.1 Full unit suite, engine cases, `pnpm sim`, and the typecheck baseline.
- [ ] 6.2 Two-machine harness (`pnpm e2e:online-match`, host on old-mac, guest on Hasaki, fresh emulator): a full match plus all `DISRUPT` scenarios with no divergences and no resyncs other than those the disruptions cause.
- [ ] 6.3 The harness logs envelope sizes (expect under 1 KB during play) and the acting coach's command-to-render time (expect no network component), and compares both with the PR #44 numbers in the report.
- [ ] 6.4 Update `e2e/online-match/README.md` and the online-play memory note.
