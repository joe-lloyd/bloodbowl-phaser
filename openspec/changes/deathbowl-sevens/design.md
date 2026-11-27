## Context

Rules: [docs/DEATHBOWL_SEVENS.md](../../../docs/DEATHBOWL_SEVENS.md), with IDs DB-D, DB-P, DB-S, DB-F, DB-A, DB-B and DB-R.

Where the engine assumes two teams, one ball and one axis today:

- Teams: `GameParts { team1, team2 }` (`services/gameService/parts.ts`), `TurnManager` picks "the other id" (`beginNextTurn`), `roster.ts` `opponentsOf`, and about 45 more `x === team1.id ? team2 : team1` sites in managers and operations. Players already carry `teamId`, and validators mostly treat any other team as an opponent (`AssistValidator`), so tackle zones and marking already work for four teams. Per-team state in `GameState` is keyed by team id.
- Ball: `GameState.ballPosition` is the only ball. Possession is a player standing on it (`BallManager.hasBall`, `rules/ballInTheAir.ts`). 127 non-test lines read or write it, 22 of them bypassing `GameService.setBallPosition`.
- Direction: `isInEndZone(pos, width, side)` with `side = team1 ? 1 : 2`, `getSevensSetupZone(isTeam1)`, `PitchLayout.lineOfScrimmage { team1, team2 }`, and the coach's `board.dir` and `toGoal`, which has 42 call sites.
- Turn limits: `TurnData.hasBlitzed`, `hasPassed`, `hasHandedOff`, `hasFouled`, read at 121 sites.
- Coach: `ai/board.ts` reads one `them` and one `dir`. Evaluation weights are fitted by `scripts/coach/positions.ts` and `fit-evaluation.ts`.
- UI: `GamePage` and `GameScene` take `team1` and `team2`. `matchKits(home, away)`, two dugouts, a two-sided scoreboard and a pairwise results screen.

## Goals / Non-Goals

**Goals:** a playable, tested Deathbowl Sevens match against three computer coaches, reachable only by admins. One engine where each rule is written once for every format. Two-team matches unchanged, proven by hash. A coach that plays any seat at every difficulty, with its own fitted weights.

**Non-Goals:** online four-player play, though nothing here blocks it because decisions already route by `chooserTeamId`. Inducements and Star Players. SPP, injuries or results written back to teams, leagues or Firestore. A Blender venue render for the plus pitch.

## Decisions

### Seats in the core

The engine becomes N-seat. This was candidate 1 in an architecture arena of two candidates and an independent judge.

- `Frame { heading, arm }` (`game/rules/frames.ts`) answers every direction question in the seat's own coordinates: `scoresAt`, `squaresToScore`, `onScrimmage`, `inSetupSection`, `wideZoneOf` and `scrimmageRows`. The layout owns its frames (`PitchLayout.frames`). `pairFrames` builds the two rectangle frames, and `plusFrames` builds North (+y), East (-x), South (-y) and West (+x). `across` is never mirrored, so the Sevens wide zones keep their names for both teams. The old geometry fields and helpers are deleted.
- `Seating = PairSeating | FourSeating` (`game/seating.ts`): seats in clockwise order, which is also the order of `snapshot.teams`. `seatTeams` is the only constructor and validates team count against frame count. Code that is honestly two-team, such as kick-off, inducements, the coin flip and extra time, takes `PairSeating`, so the types prove Deathbowl never reaches it. Helpers: `seatOf`, `rivalsOf`, `opponentsOf`, `teammatesOf`, `everyone` in seat order, and `playOrderAfter(seating, current, rotation)`.
- `MatchFlow = DrivesFlow | DeathbowlFlow` (`services/gameService/matchFlow.ts`): `begin`, `touchdown(scorer, ball)`, `halfOver`, `standings`, and the constant `scoreRun: "stop" | "continue"`. Today's kick-off and drive code moves into `DrivesFlow` unchanged.
- `Balls = [BallSlot] | [BallSlot, BallSlot]` (`game/rules/balls.ts`). `placeBall(state, ball, at)` is the only write path, and an ESLint rule bans direct writes. Operations that move a ball in flight or on the bounce carry a `BallId`. Possession stays "a player on the ball's square". Two balls never rest on one square: a landing on the other ball bounces again (DB-F3), and a simulation invariant checks it after every command. On the wire, `ballPosition` stays as written today and `extraBalls` appears only when there are two balls.
- `TurnSpend` (`game/rules/turnSpend.ts`): Blitz and Foul are recorded per target team. Pass and Hand-off are counted against the number of balls, with the ids of balls and players already thrown (DB-A1). `maySpend`, `openTargets` and `spend` replace the four booleans. On the wire the four booleans stay, and `spend` appears only beyond two seats.
- Format: `MatchType = GameType | "deathbowl"` and `MatchFormat` ties the `plus` venue to Deathbowl. Deathbowl stays out of `GAME_TYPES`, so leagues, clubs, pickers and Firestore never list it. `FormatRules` carries `turnsPerHalf`, `rerollsRefillAtHalf`, `teamMateThrowUsesPass` and `ballCount`.
- Score: `state.score` stays touchdowns in every format. Deathbowl adds `state.points`, written by an event observer like `MatchStats`. Contact events gain the id of the player who caused them, so points only go to a rival who did something (DB-R1).
- Re-rolls: Leader re-rolls are keyed per half in `RerollArbiter` today. Deathbowl keys them per match, and nothing refills at half time (DB-D2).
- Cross-team assists: a `cross-assist` decision routed by `chooserTeamId` asks each third team in clockwise order before the dice. `AssistValidator` takes the pledged players and computes their markers without the attacker and defender (DB-A4).
- Interception: candidates are grouped by team, nearest first, ties rolled off, one attempt per team (DB-B3). Two-team passes form one group, so their dice do not change.
- Coach: `readBoard(game, seatTeamId)` reads rivals, balls and frames, and `toGoal` reads the team's frame. The two-team features and weights stay as they are. Deathbowl gets its own feature set and fitted weights (`evaluationWeights.deathbowl.ts`) with features for each ball, distance to the points leader and centre control. Hard and Legend run four-seat playouts.
- UI: a procedurally drawn plus pitch, four kits, corner dugouts, sprites facing each seat's heading, two ball sprites, a scoreboard row per seat with points and touchdowns, per-team Blitz and Foul in the action menu, a cross-assist prompt, a placings screen, and an admin-only entry. The save goes to a separate local slot with no cloud copy, so it never overwrites a Sevens save.

### Synthesis decision

Candidate 1 (seats in the core) is the base. Candidate 2 kept `team1` and `team2` as West and East, reached Deathbowl through about 22 `if (table)` guards, and ran each computer seat in a rotated copy of the game. The judge scored candidate 2 higher on delivery (8,750 against 13,850 lines) and two-team safety, and recommended it. We chose candidate 1 for these reasons:

- The arena picks the base a maintainer can extend without breaking invariants. The judge scored maintainability 4 against 2.
- The judge found that candidate 2's rotated copy turns squares but not seat labels, so its coach scores in the wrong end zones.
- Candidate 2 stores the two balls asymmetrically, so illegal states can be written.
- Candidate 2 drops Hard and Legend difficulty for Deathbowl.
- The owner asked to go big on this mode.

Grafted from candidate 2: the ban on direct ball writes, the invariant that two balls never share a square, a feature set for each ball and for the points leader, and the separate save slot. Grafted from the judge: `points` kept apart from `score`, causer ids on contact events, Leader re-rolls once per match, and no deflection points.

### Rule readings taken

- A carrier pushed into its end zone on another team's turn scores, its ball re-enters, and the active turn goes on (DB-F2).
- The scored ball leaves at once. Knock-out rolls and reserve moves wait until the turn ends (DB-F2, DB-F4).
- Pass and Hand-off are two of each per turn, with no ball and no player thrown twice (DB-A1).
- The 2025 rulebook has no deflection, so DB-R1 pays nothing for one.
- Points need a rival who caused them.
- A human seat answers each cross-assist prompt with the players it offers.

## Risks / Trade-offs

- About 5,000 lines of refactor land before the first Deathbowl rule. In exchange, every later rule is written once. Each refactor PR must merge quickly because it touches files other work edits (`TurnManager`, `BallManager`, `PassOperation`, `ai/board.ts`).
- A slip in iteration order or dice order changes two-team results far from its cause. `pnpm parity` names the first match that differs. The frames table test is written against today's functions before frames exist.
- The planner's plans assume one ball and one opponent. If four-seat play stays weak after the weight fit, the next lever is a plan per ball.
- The plus pitch has no venue render until Blender work resumes.

## Parity gate

Every engine PR runs `heavy sim pnpm parity record sim-results/parity-head.json` on its head. It also records the same file from its merge base in a frozen copy, and `pnpm parity compare` must report that parity holds. Each PR body states the result.
