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
question and get the same answer, which the lookahead in step 3 relies on.

Paths are searched by the chance of making every Dodge, Rush and Pick-up
on the way, not by distance. Positioning moves are judged without the team
re-roll, so a re-roll spent on a cage corner is still there for the
pick-up. Only a block on the ball carrier counts the re-roll.

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
