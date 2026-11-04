# The computer coach

The computer coach plays one side of a local match. Choose "Versus
computer" for Player 2 on the team selection page. The same coach plays in
the simulator as `planner`:

```bash
pnpm sim bench --coach planner --vs heuristic --games 200
```

## How it decides

The coach sits behind the simulator's `Coach` seam
(`src/simulation/coach.ts`). It picks one of the candidates the engine
offers and never builds a command itself. Its code is in
`src/simulation/ai/`:

| File             | What it owns                                                         |
| ---------------- | -------------------------------------------------------------------- |
| `board.ts`       | One read of the engine per decision: players, ball, tackle zones     |
| `chance.ts`      | Dice maths: rolls, re-rolls, block dice                              |
| `routes.ts`      | The safest path to every reachable square                            |
| `activations.ts` | Whole activations in risk order, and what an acting player does next |
| `decisions.ts`   | Block dice, re-rolls, push squares, follow-ups and other decisions   |
| `weights.ts`     | Every number its judgement rests on, as one plain object             |
| `planner.ts`     | The `Coach`: maps the best activation onto a candidate               |
| `evaluate.ts`    | The score of an end position, for the lookahead                      |
| `search.ts`      | The lookahead: tries the planner's best few options on cloned games  |
| `difficulty.ts`  | The levels on the team selection page                                |

At each decision the coach re-reads the board and lists whole activations:
which player, which action, the target square, the full path and its value.
It sorts them in the order the scripted Bot Bowl winners play a turn:

1. Score, when the safest path is likely enough to succeed.
2. Hand off or pass to a team-mate who can score or carry the ball further.
3. Move the ball carrier to a safe square its team-mates can cage.
4. Sure blocks.
5. Pick up a loose ball.
6. Bring a free team-mate beside the opposing carrier if it adds a block die.
7. Blitz, the opposing carrier first.
8. Cage corners, receivers, markers, the screen and chasers.
9. Risky actions, if they are still worth it.
10. End the turn.

Nothing is stored between decisions. A player already acting continues
with the best activation its declared action still allows, re-planned from
the square it now stands on. A step that went to plan keeps the same
target. A surprise, such as a push or a bounce, picks a new one. Because
the coach keeps no plan, a cloned game in a worker can ask it the same
question and get the same answer, which the lookahead relies on.

Paths are searched by the chance of making every Dodge, Rush and Pick-up
on the way, not by distance. Positioning moves are judged without the team
re-roll, so a re-roll spent on a cage corner is still there for the
pick-up. Only a block on the ball carrier counts the re-roll.

## The lookahead

Hard and Legend run the planner, but check its next activation first. At each
new declaration the coach takes the planner's best few options. For each one
it clones the game, reseeds the dice so a playout cannot see the real ones,
plays out our turn and the opponent's reply with the planner, and scores the
end position with `evaluate`. Every option meets the same dice, sample for
sample, and weak options drop out between rounds. The planner's choice stands
unless a rival beats it.

Scoring at the end of our own turn lost to the plain planner, 3 won, 12 drawn,
9 lost in 24 games: it could not see what an exposed carrier would suffer.
The opponent's reply is what makes the lookahead pay.

| Level    | Options | Samples | Deadline | Measured over mirrored games                             |
| -------- | ------- | ------- | -------- | -------------------------------------------------------- |
| Standard | none    | none    | none     | The planner                                              |
| Hard     | 4       | 2       | 1.5 s    | Against the planner: 91 won, 55 drawn, 54 lost, +0.26 TD |
| Legend   | 6       | 4       | 4 s      | Against Hard: 16 won, 12 drawn, 12 lost, +0.23 TD        |

Legend's 40 games point the right way but do not prove it is stronger.

The bench plays `hard` and `legend` without the deadline, so its games can be
repeated. The browser applies it.

In the browser the search runs in a Web Worker
(`workerSearchCoach.ts` and `searchWorker.ts`), on a copy of the match. If the
worker crashes or overruns, the planner answers at once, so a match cannot
hang on it. On a machine under load, the median search took about a second,
and the page's long tasks were the same on Hard as on Standard.

## No odds on the screen

The coach works out how likely things are, internally. A coach never sees
a percentage. The coach's notes, written to sim recordings, name what it
did and the rolls it needed, such as "moves the ball carrier (Dodge: 3+)".
`__tests__/unit/noOdds.test.tsx` plays a planner match and fails if a note
holds anything but a roll target.

## In the browser

`src/network/ComputerMatch.ts` reuses the online match's wiring. The board
drives the engine through `NetworkedGameService`, so every human action
becomes a protocol command that a `HeadlessGame` runs on the one local
engine. The computer reads that engine, picks its commands, and runs them
through the same `HeadlessGame`, paced so a person can follow each step.
The HUD already hides controls from the coach who may not act, so the human
cannot move the computer's players or answer its decisions. The opening
runs locally: the intro, the weather and the coin toss. A toss the
computer wins, it receives.

A match against the computer is not saved for later, and league
progression is off for it.

## Measuring it

`pnpm sim bench` plays mirrored pairs of matches and also runs the
coaching puzzles (see [Simulations](../SIMULATION.md)). `--weights` loads
a weight set for the planner under test, which is how `pnpm sim tune` tries
candidates.

Ideas that lost or changed nothing over 800 to 1000 mirrored games were taken
out again, so they need new evidence to come back:

| Idea                                                                                                           | Result against the same planner without it        |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Fouling players on the ground                                                                                  | 255 won, 253 drawn, 292 lost                      |
| Taking pick-ups later in the turn                                                                              | 68 won, 59 drawn, 73 lost                         |
| The quickest player picks up the ball                                                                          | 275 won, 237 drawn, 288 lost                      |
| Four together: closing open runs, sideline push odds, earlier carrier blocks, re-rolling a Push on the carrier | 347 won, 307 drawn, 346 lost, with more turnovers |
