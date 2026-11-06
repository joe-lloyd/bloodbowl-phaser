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
| `evaluate.ts`    | The trained score of an end position, for the lookahead              |
| `search.ts`      | The lookahead: tries the planner's choices against others on copies  |
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
pick-up. Only a block on the ball carrier counts the re-roll, and only
while the team has one left this half. Counting the re-rolls left rather than the
ones bought took 51.1% of the points against the planner that counted the
bought ones, ±0.8 over 1000 mirrored seed pairs, and cut its turnovers from
25.3% of turns to 23.1%.

### Playing to its roster

The coach reads its own team at every decision, beyond the skills and
characteristics that set the odds of each roll:

- A square of progress counts six over the team's mean MA, because a square
  is a share of a turn's move. Dwarfs value a square about 1.4 times as much
  as a team of MA 6, and Skaven about 0.85 times.
- A block adds its chance of causing a casualty, times 40 points. The chance
  comes from the target's armour, Mighty Blow, Claws, Stunty and
  Regeneration, on the Sevens injury table.
- A Brawlin' Brutes team earns 3 SPP for a Casualty and 2 for a Touchdown,
  so it values a casualty 2.25 times as much as other teams do.

## The lookahead

Hard and Legend run the planner, but check its next activation first. At each
new declaration the coach takes the planner's best few options. For each one
it clones the game, reseeds the dice so a playout cannot see the real ones,
plays out our turn and the opponent's reply with the planner, and scores the
end position with `evaluate` (see [the position score](#the-position-score)).
Every option meets the same dice, sample for
sample, and weak options drop out between rounds. The planner's choice stands
unless a rival beats it.

Scoring at the end of our own turn lost to the plain planner, 3 won, 12 drawn,
9 lost in 24 games: it could not see what an exposed carrier would suffer.
The opponent's reply is what makes the lookahead pay.

### Choices inside an action

Block dice, re-rolls, push squares, follow-ups, reactions and the other
choices an action raises are searched the same way: the planner's answer
against up to three others, on the same dice. The planner's rules for them
are fixed, such as always taking a re-roll, and the playouts can tell when a
rule is wrong for the position.

A save cannot hold a command paused on a choice, so the coach forks the match
instead. Once asked, `HeadlessGame` keeps a save from the last quiet moment
between activations and every command played since. Replaying those on the
save reaches the same choice with the same dice already rolled, because the
engine is deterministic. The dice are reseeded after the replay, so a playout
never sees what is coming. A fork whose checksum differs from the live game's
is never searched, and the planner answers. `__tests__/simulation/fork.test.ts`
replays the fork at every choice of six matches and requires the checksum.

The fork found a bug the declaration search had lived with. The turn's spent
Team Re-roll and once-a-turn skill re-rolls were kept outside the game state,
so a playout, or a match resumed mid-turn, could spend them a second time.
They now live in the state as `turnUsage`.

In one match in headless Chromium with 7 workers, 35 choices inside actions
took 65 ms at the median and 283 ms at the slowest, against 174 ms for a
declaration. In three headless matches against the planner, Hard searched
33 to 43 such choices a game and overruled the planner at 8 to 12 of them.

| Level    | Options | Samples | Deadline | Measured over mirrored games                               |
| -------- | ------- | ------- | -------- | ---------------------------------------------------------- |
| Standard | none    | none    | none     | The planner                                                |
| Hard     | 4       | 8       | 1.5 s    | Against Hard with 2 samples: 54.7% ±3.8 over 400, +0.16 TD |
| Legend   | 4       | 16      | 4 s      | Against Hard with 8 samples: 52.7% ±5.1 over 200, +0.10 TD |

Each doubling of the samples buys less. Hard with 2 samples beat the planner,
91 won, 55 drawn and 54 lost; four times the samples gained another 4.7
points, and twice that about 2.7, inside the noise. Six options with four
samples did no better than four options, 21 won, 20 drawn, 19 lost over 60
games: more playouts per option helped more than more options. A deadline
stops a search on a slow machine with fewer samples rather than keeping the
player waiting.

The whole climb, measured on 6 November: Hard as it now is played Hard as it
was at commit 32287fc, before the fitted position score, the re-roll count
fix and 8 samples. It won 174, drew 110 and lost 116 of 400 mirrored games,
57.3% of the points with ±3.7 over the seed pairs, and scored 1.00
touchdowns a game against 0.72.

The bench plays `hard` and `legend` without the deadline, so its games can be
repeated. The browser applies it.

In the browser the search runs on the page and shares its playouts over a
pool of Web Workers, one for each core but the page's, up to eight
(`workerSearchCoach.ts` and `searchWorker.ts`). Each worker scores the
candidates and seeds it is dealt on a copy of the match. A playout depends
on nothing but its candidate and its seed, so the pool chooses exactly what
one thread would. A worker that crashes or overruns scores nothing, and with
nothing scored the planner's plan stands, so a match cannot hang on it.

A search's time in headless Chromium on a Mac whose page saw 8 cores,
median and slowest over 17 declarations of one match:

| Samples per option | 1 worker       | 4 workers      | 8 workers      |
| ------------------ | -------------- | -------------- | -------------- |
| 2                  | 245 ms, 766 ms | 89 ms, 315 ms  | 67 ms, 254 ms  |
| 8                  | 820 ms, 1.6 s  | 259 ms, 608 ms | 247 ms, 623 ms |
| 16                 | 1.6 s, 3.3 s   | 507 ms, 915 ms | 350 ms, 882 ms |

### The position score

`evaluate` gives the touchdowns a team is likely to finish ahead by: the
score so far plus a weighted sum of 22 features of the board. They cover
who holds the ball, how far it is from the end zone, whether the carrier
can reach it next turn, the marks and cage corners around it, who is on
their feet and out of the game, and the team re-rolls left. The weights in
`evaluationWeights.ts` are a ridge regression on positions from planner
self-play, each read at the start of a team turn against the touchdowns
that side went on to score or concede.

It replaced a score whose weights were set by hand. On held-out games the
hand-set score explained 4.5% of the variance in the touchdowns still to
come, and the first fit 8.8%. Of two positions from one game that went on
differently, the fit ranked the better one higher 62.8% of the time, the
hand-set score 60.2%. Hard with the fit won 239, drew 181 and lost 180
against Hard with the hand-set score over 600 mirrored games: 54.9% of the
points, ±3.0 at 95% over seed pairs, and 0.12 more touchdowns a game.

With the re-roll fix and a refit on 4,200 new games, Hard won 448, drew 330
and lost 422 against the Hard before both, which had the hand-set score and
counted the re-rolls bought. That is 51.1% of the points, ±2.0, over 1200
games from seeds 1001 and 2001, with 0.06 more touchdowns a game and
turnovers down from 24.8% of turns to 22.9%. The gain is about a point,
inside the noise. These games tested the refit, not the first fit, so they
say nothing about its 54.9%.

The score is linear, so it misses what depends on two things at once. It
values a loose ball beside our player at the start of our turn below the
opponent holding the ball far from their end zone.

To refit it, after changing the planner or the features:

```bash
for i in $(seq 0 13); do
  pnpm exec tsx scripts/coach/positions.ts $((200000 + i * 1000)) 300 > positions-$i.jsonl &
done; wait
pnpm exec tsx scripts/coach/fit-evaluation.ts positions-*.jsonl > weights.ts
```

That is 4,200 games, about ten minutes on 14 cores. The fit prints how it
and the committed weights do on held-out games. Keep the new weights only if
they rank positions better, then bench Hard against a frozen copy of main.

### Looking wider pays, looking further does not

Hard checks one activation and lets the planner play the rest of the turn.
Two ways to spend four times its search, each over mirrored games against
Hard as it was:

| Spent on                                          | Games | Points share | TD a game |
| ------------------------------------------------- | ----- | ------------ | --------- |
| 8 samples per option, not 2                       | 400   | 54.7% ±3.8   | +0.16     |
| The planner's best 3 answers after the activation | 200   | 43.8% ±5.4   | −0.18     |

The answers were tried where our next declaration came up, each picked on
one roll of the dice and scored on another. A first try that picked and
scored on the same dice lost too: 69 won, 54 drawn and 77 lost over 200
games, 48.0% of the points, with more turnovers, because it chose the
answer that happened to come off. The likely reason both lost: an answer
picked on one roll is often worse than the one the planner would play, so
the option it follows looks worse than it is.

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

A match against the computer autosaves from the coin toss on, in the same
single slot as a local match, so starting one replaces the other. Resume it
from the main menu, or by reloading its page. League progression is off for
it.

## Measuring it

`pnpm sim bench` plays mirrored pairs of matches and also runs the
coaching puzzles (see [Simulations](../SIMULATION.md)). `--weights` loads
a weight set for the planner under test, which is how `pnpm sim tune` tries
candidates.

### Against each roster's standard

`pnpm sim bench --standards` judges the planner against a standard for each
roster: two touchdowns a game on average, shared out by each race's real
scoring rate and counted in SPP. Brawlin' Brutes casualties count too, at 3
SPP each (see
[Simulations](../SIMULATION.md#judge-each-roster-against-its-standard)). Over
1200 games against the heuristic from seed 1:

|                                 | The planner in #92         | Now                          |
| ------------------------------- | -------------------------- | ---------------------------- |
| Result                          | 995 won, 196 drawn, 9 lost | 1029 won, 157 drawn, 14 lost |
| Touchdowns a game, over rosters | 1.51                       | 1.60                         |
| Blocks a game                   | 11.2                       | 13.6                         |
| Casualties a game               | 0.61                       | 0.67                         |
| Share of the standards          | 0.773                      | 0.825                        |
| Rosters at their standard       | 5 of 30                    | 3 of 30                      |
| Turnovers per turn              | 24.0%                      | 24.6%                        |

Against the planner from #92 it won 382, drew 293 and lost 325 over 1000
mirrored games, 52.8% of the points, within the noise of an even match. The
puzzles did not change.

Ogres, Khorne and Dark Elves meet their standard. Lizardmen and Underworld
Denizens sit at it, so the count moves between seed sets. Snotlings are
furthest, at 0.41 of their aim. A share moves by about 0.015 between seed
sets over 1200 games, so smaller changes are noise.

These changed the share by less than that, or cost more than they gained,
and were taken out again:

| Idea                                                     | Share of the standards                           |
| -------------------------------------------------------- | ------------------------------------------------ |
| Doubling progress for every team, not by team speed      | 0.798 against 0.809                              |
| A casualty worth 80 points, not 40                       | 0.805 against 0.809                              |
| Pick-ups only at 60% or better                           | 0.819 against 0.809                              |
| Safe moves at 85%, not 92%                               | 0.797 against 0.809                              |
| Scoring runs from 55%, not 70%                           | 0.806 against 0.809                              |
| A bonus for knocking down a player marking our carrier   | 0.803 against 0.809                              |
| Scoring passes before the carrier moves, from 50%        | 0.810 against 0.809, with 0.002 passes a game    |
| Half the weight on threats to the carrier and on corners | 0.844 against 0.809, but cage-up fell to 0 of 50 |
| A sure block at 70%, not 80%                             | 0.823 against 0.825                              |
| Scoring at once when ahead, not waiting to score last    | 0.845 against 0.844, the same games              |
| Hurrying the ball as if a half had 2 or 3 turns left     | 0.849 and 0.843 against 0.844                    |

The last two were measured with the halved carrier weights in place.

Hard overrules the planner's first choice at about a third of declarations,
most often a sure block in favour of the Blitz, a scoring run in favour of a
block first, and one pick-up for another. Three ordering rules drawn from
that did no better against the planner from #92 over 1000 games, against
52.8% for the planner as it is:

| Rule                                                                 | Points share |
| -------------------------------------------------------------------- | ------------ |
| With a touchdown to take, blocks that keep the attacker up 97% first | 52.6%        |
| Those blocks first on every turn                                     | 53.1%        |
| Within a tier, rank by value over the turnover it risks              | 51.0%        |

Ideas that lost or changed nothing over 800 to 1000 mirrored games were taken
out again, so they need new evidence to come back:

| Idea                                                                                                           | Result against the same planner without it        |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Fouling players on the ground                                                                                  | 255 won, 253 drawn, 292 lost                      |
| Taking pick-ups later in the turn                                                                              | 68 won, 59 drawn, 73 lost                         |
| The quickest player picks up the ball                                                                          | 275 won, 237 drawn, 288 lost                      |
| Four together: closing open runs, sideline push odds, earlier carrier blocks, re-rolling a Push on the carrier | 347 won, 307 drawn, 346 lost, with more turnovers |
