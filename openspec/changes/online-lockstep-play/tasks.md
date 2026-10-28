## 1. Determinism proof (do first; stop if it fails)

- [x] 1.1 Add `stateChecksum(game)` to `HeadlessGame`: FNV-1a over the canonical (sorted-key) snapshot plus RNG state, turn-manager state and match stats.
- [x] 1.2 Test: play simulation matches across 20 seeds (`__tests__/simulation/lockstep-determinism.test.ts`) on engine A, recording each command; feed the same commands to engine B built from the same seed and teams; assert equal checksums after every command, including commands that stop on a pending decision (re-roll, reaction, block dice, push, follow-up, Apothecary, kickoff events).
- [ ] 1.3 (Not done: the browser runs with real delays and the two-machine match showed four checksum mismatches, all healed by resync; see the notes below.) Run the same test with real delays (the browser's `realTimeDelay`) rather than zero delays, to catch timer-driven flow such as the 500 ms automatic end of turn.
- [x] 1.4 Fix every divergence at its cause. Record any unseeded randomness or time dependency found.

## 2. Engine drives its own flow

- [x] 2.1 List every engine flow method the host's scene and orchestrator call today (`rollInitialWeather`, `startGame`, `startKickoff`, `rollKickoff`, `startTurn`, `endDrive`, `rollKORecovery` and others), with what triggers each one.
- [x] 2.2 For each, make it happen inside the engine as a consequence of a command (as in the simulation), or add an explicit command for it. Steps that only pace animation stay in the scene.
- [x] 2.3 Test in a headless browser: the local-play scene renders a match driven purely by commands with no flow calls from the scene.

## 3. Joint seed

- [x] 3.1 Lobby: `seedCommit` and `seedReveal` per player; generate the secret with `crypto.getRandomValues` and hash it with `crypto.subtle`; keep the secret in session storage so a reload in the lobby can still reveal.
- [x] 3.2 Derive the seed from both secrets once both reveals check out; Start Match stays disabled until then; a bad reveal shows an error to both coaches.
- [ ] 3.3 Rules: each player may write only their own commit and reveal, and a reveal only after both commits exist. (Partly done: the host-only document and its rule are removed; the per-player write restriction is not in the rules yet.)
- [x] 3.4 Unit tests for derivation and checking; an emulator check that one coach cannot overwrite the other's commit.

## 4. Lockstep session

- [x] 4.1 One symmetric session class replacing `HostSession`/`GuestSession`: sends command envelopes `{seq, ts, from, command, before, after}`, applies the peer's commands in order, and keeps the PR #44 hello, reload and orphan-release behaviour.
- [x] 4.2 Checksum handling per design D5: a mismatch stops application, requests a resync, and logs both values.
- [x] 4.3 Resync per design D6, with RNG, turn-manager state and match stats; the receiver rebuilds its engine and redraws the board (reuse the `positions` board sync).
- [x] 4.4 `PROTOCOL_VERSION` 3.
- [x] 4.5 Session tests over the in-memory transport: a full simulated match where commands alternate sides with no resyncs; a dropped command heals via resync; a tampered state is caught by the checksum.

## 5. One online match path

- [x] 5.1 `OnlineMatch`: both roles build a real engine and `HeadlessGame`; the container's `gameService` is the `NetworkedGameService` facade whose dispatch executes locally, then sends. Remove the host-native path, the guest snapshot path and the `replica` flag's online use.
- [x] 5.2 Input gating: `mayAct` from design D4 on both sides; the driver is exposed for resync, saves and the clock.
- [x] 5.3 Saves: the driver writes snapshot, RNG and match stats at each change of turn; resume on both sides loads the newest save, then runs the hello/resync handshake.
- [ ] 5.4 Turn clock per design D9. (Partly done: the active coach sets and enforces their own deadline; the waiting side does not yet take over when the active side's heartbeat goes stale.)
- [x] 5.5 Remove code made dead by this change: the event broadcaster, bundle application and `shouldPreserveOwnSetup`/setup placement restore, if nothing still needs them.

## 6. Verification

- [x] 6.1 Full unit suite, engine cases, `pnpm sim`, and the typecheck baseline.
- [x] 6.2 Two-machine harness (`pnpm e2e:online-match`, host on old-mac, guest on Hasaki, fresh emulator): a full match plus all `DISRUPT` scenarios with no divergences and no resyncs other than those the disruptions cause.
- [x] 6.3 The harness logs envelope sizes (expect under 1 KB during play) and the acting coach's command-to-render time (expect no network component), and compares both with the PR #44 numbers in the report.
- [x] 6.4 Update `e2e/online-match/README.md` and the online-play memory note.

## Notes from the two-machine run (28 October 2026)

- 436 moves, all six disruptions, full time. Two divergences, both the
  known cosmetic case of a canvas showing the old square while a re-roll
  is pending.
- Four checksum mismatches, all healed by a resync: one before an
  end-activation, three around the second-half setup (a confirm-setup that
  one engine refused). Likely cause: engine steps driven by real-time
  timers (the 100 ms subphase switch after a kicking-team confirm, the
  500 ms automatic end of turn) running at different moments relative to
  incoming commands. Task 1.3 would pin this down.
- A resync while a decision is pending replaces the state but cannot
  resume the paused roll path on the receiving engine.

## 7. Feedback from the first recorded playback

- [x] 7.1 Decision prompts (re-roll, reaction, interception, Apothecary, inducement, follow-up) show only for the coach who owns the decision.
- [x] 7.2 Block dice show on both screens; the other coach sees "choosing", then the chosen face for 1.5 s.
- [x] 7.3 A Blitz that continues after its block reselects the blitzer (the engine emits UI_ResumeBlitzMove); this was the coach stuck until the clock ran out, online and in local play.
- [x] 7.4 The watching coach sees the other coach's whole move path while the player runs it.
- [x] 7.5 The turn clock and all input stop while a coach is disconnected, and resume with the time left.
- [x] 7.6 While the non-active coach owns a decision the main clock stops and they get their own short clock (`src/network/decisionTimeouts.ts`, 10 s each for now); on expiry their screen answers with a default.
- [x] 7.7 A Sidestepping player's coach places their own push online (the gate gave every push to the attacker).
- [x] 7.8 Lockstep waits for the engine's paced flow to finish (`whenEngineQuiet`) before each checksum; the cause of the four resyncs in the recorded match.
- [ ] 7.9 Agree the per-decision time limits with the owner.
