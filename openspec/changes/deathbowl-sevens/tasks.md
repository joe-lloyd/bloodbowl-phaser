## 0. The lever

- [x] 0.1 `pnpm parity` records and compares the final-state hashes of 330 planner matches; the rules spec and this change land with it.

## 1. The engine becomes N-seat (two-team results unchanged; every PR passes parity)

- [x] 1.1 Frames: `game/rules/frames.ts`, `PitchLayout.frames`, geometry callers moved onto frames, old geometry helpers deleted. A table test written first against today's functions covers every square of every layout for both teams.
- [x] 1.2 Seating in the rules core: `game/seating.ts`, `GameParts.seating`, services, `TurnManager`, `BallManager` and `SetupManager` moved by meaning; `roster.ts` deleted.
- [x] 1.3 Seating in managers, operations, validators and controllers; kick-off, inducements, Master Chef and extra time take `PairSeating`.
- [x] 1.4 A match is built from a list of teams: `GameParts`, `GameService`, `HeadlessGameContext.teams`, `getTeams(): readonly Team[]`, and a committed codemod for tests. UI and network code that is honestly two-team moves with the Deathbowl board and HUD (task 4). Landed in [#362](https://github.com/joe-lloyd/bloodbowl-phaser/pull/362).
- [x] 1.5 `MatchFlow` with `DrivesFlow` holding today's code; `TurnManager` turns through `playOrderAfter` with a rotation. Landed in [#374](https://github.com/joe-lloyd/bloodbowl-phaser/pull/374).
- [x] 1.6 Balls as a list: `GameState.balls`, `placeBall` as the only write path, the lint ban, `BallId` on in-flight operations, wire `extraBalls`. Landed in [#375](https://github.com/joe-lloyd/bloodbowl-phaser/pull/375).
- [x] 1.7 Turn spend ledger in place of the four booleans, with `against` on declarations.

## 1b. The pitch first (the owner asked to see it before more engine work)

- [x] 1b.1 The plus layout: `plusFrames()` with headings along y, the `deathbowl` venue with its corners off the pitch, one shared on-pitch test. Landed in [#361](https://github.com/joe-lloyd/bloodbowl-phaser/pull/361).
- [x] 1b.2 The Deathbowl arena rendered in Blender on Jellybingus like the other venues, with a dugout and a colour layer per seat. Landed in [#363](https://github.com/joe-lloyd/bloodbowl-phaser/pull/363) and [#368](https://github.com/joe-lloyd/bloodbowl-phaser/pull/368).
- [x] 1b.3 The arena in the sandbox with four teams set up on their lines (pulls forward the board part of task 4.1). Landed in [#372](https://github.com/joe-lloyd/bloodbowl-phaser/pull/372).

## 2. Deathbowl rules, headless

- [x] 2.1 Format and team entry: `MatchType`, the pass-path rule, DB-D1 to DB-D5, four-team `createHeadlessGame`. Landed in [#376](https://github.com/joe-lloyd/bloodbowl-phaser/pull/376).
- [x] 2.2 Deathbowl flow: set-up in turn order (DB-S1), opening balls (DB-S2), roll-off and rotation (DB-S3), halves (DB-F1, DB-F5), once-per-match re-rolls including Leader (DB-D2), placings (DB-R2). Landed in [#377](https://github.com/joe-lloyd/bloodbowl-phaser/pull/377).
- [x] 2.3 Continuous touchdowns: re-entry (DB-F2, DB-F3), Knock-out rolls and reserve moves (DB-F4), Secret Weapons (DB-F6). Landed in [#379](https://github.com/joe-lloyd/bloodbowl-phaser/pull/379).
- [x] 2.4 Contact and ball rules across teams: cross-team assists (DB-A4), per-team Blitz and Foul (DB-A1, DB-A2), Pass and Hand-off limits, No Hands for the other ball (DB-B1), pass targets and paths (DB-B2), interception order (DB-B3). Landed in [#381](https://github.com/joe-lloyd/bloodbowl-phaser/pull/381), [#382](https://github.com/joe-lloyd/bloodbowl-phaser/pull/382) and [#386](https://github.com/joe-lloyd/bloodbowl-phaser/pull/386).
- [x] 2.5 Points: causer ids on contact events, `state.points`, the observer (DB-R1). Landed in [#385](https://github.com/joe-lloyd/bloodbowl-phaser/pull/385).
- [ ] 2.6 Four-seat simulation: `pnpm sim --game-type deathbowl`, invariants for two balls and four seats, random-coach fuzz with zero findings.

## 3. Computer coach

- [x] 3.1 N-seat board and evaluation; Deathbowl features; two-team planner choices unchanged. Landed in [#378](https://github.com/joe-lloyd/bloodbowl-phaser/pull/378).
- [x] 3.2 Planner on the plus: per-ball candidates, Blitz and Foul targets, cross-assist answers, set-up, reserve moves; four-seat search for Hard and Legend. Landed in [#388](https://github.com/joe-lloyd/bloodbowl-phaser/pull/388).
- [ ] 3.3 Fitted Deathbowl weights from four-seat self-play, benched against hand-set weights on hasaki.

## 4. Browser

- [x] 4.1 Board: plus pitch drawing, markings, two ball sprites, seat facings, four kits, corner dugouts. Landed in [#389](https://github.com/joe-lloyd/bloodbowl-phaser/pull/389) and [#390](https://github.com/joe-lloyd/bloodbowl-phaser/pull/390).
- [x] 4.2 HUD: scoreboard rows per seat, turn order, per-team Blitz and Foul, cross-assist prompt, placings screen, dice log, phone layout. Landed in [#389](https://github.com/joe-lloyd/bloodbowl-phaser/pull/389) and [#390](https://github.com/joe-lloyd/bloodbowl-phaser/pull/390).
- [x] 4.3 Entry: admin row and route, lobby with the admin's team and three computer teams, local runtime, separate save slot and resume. Landed in [#383](https://github.com/joe-lloyd/bloodbowl-phaser/pull/383) and [#384](https://github.com/joe-lloyd/bloodbowl-phaser/pull/384).
- [ ] 4.4 A whole match played through the UI and recorded; `docs/GAME_TYPES.md` and `docs/DEATHBOWL_SEVENS.md` statuses updated.
