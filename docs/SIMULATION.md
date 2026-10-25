# Mass match simulation

`pnpm sim` plays whole Sevens matches with no browser, hundreds at a time,
and checks the rules after every command. Scenario cases prove that one rule
works in one set-up. Simulation finds what breaks when the rules meet each
other in real play.

A match takes about 0.4 seconds. Every match is recorded and can be replayed
exactly, inspected step by step, opened on the real board, or committed as a
regression test.

## Run a batch

```bash
pnpm sim --games 200                          # heuristic coaches, every roster
pnpm sim --games 500 --coach random           # the fuzzer
pnpm sim --home heuristic --away random       # mix coaches
pnpm sim --rosters Human,Orc --games 50       # one matchup
pnpm sim --games 4 --coach jev --concurrency 4  # Jev, see below
```

Match `i` uses seed `--seed + i`, and rosters are drawn from that seed, so a
batch is repeatable. Run several seeds as separate processes to use more
cores.

The run writes `summary.json` and one recording per match that had a finding
to `sim-results/<timestamp>/` (`--record all` keeps every match). It prints
the findings grouped by kind, with a replay command for the first example:

```text
60/60 matches reached full time, 35 touchdowns, 566 commands and 391 ms per match on average.
Commands exercised: move 12131, declare-action 7662, block 1212, ...

Findings (blocking first):
  FAIL invariant:downed-player-holds-ball: 13x in 1 matches
       team2-player-3 (Bloodborn Marauder) at (9,7) is Prone with the ball
       pnpm sim:replay sim-results/.../1018-goblin-vs-khorne.json --step 516
```

The exit code is 1 when any blocking finding appears, so a batch can gate CI.

## The coaches

A coach only ever picks from candidates that the engine's own legality
checks produced (`src/simulation/candidates.ts`). It never builds a command.

| Coach | What it is for |
| --- | --- |
| `heuristic` | Plays recognisable Blood Bowl: carries the ball forward, blocks with the stronger player, chases the opposing carrier. Scores about one touchdown every two matches, so it reaches drive resets, scoring and kick-offs. |
| `random` | The fuzzer. Picks a command type at random, then a target. Reaches passes, hand-offs, fouls, special actions and odd sequences no sensible coach would try. |
| `jev` | Asks Jev, TypeSafe's System One model, which player should act next and how. Everything else falls back to the heuristic. |

### Jev

Jev answers a typed Choice question over the heuristic's eight best legal
options plus "end the turn", given the board as JSON. It needs an API key:

```bash
TYPESAFE_API_KEY=... pnpm sim --home jev --away heuristic --games 10 --concurrency 4
```

A match makes about 35 calls at around 190 ms each, roughly 60,000 input
tokens. Calls overlap across matches with `--concurrency`. A failed call
falls back to the heuristic and is counted in the summary. Recordings store
commands, not Jev's answers, so replaying a Jev match needs no key.
Jev's reasoning for each pick (probability and confidence) is kept in the
recording's `note` field.

Jev's confidence on these picks is modest, 0.3 to 0.5, and it ends turns
early more often than a good coach would. Treat it as a source of
human-like variety, not as a strong player. The heuristic and random coaches
find most bugs.

## What is checked

After every accepted command (`src/simulation/invariants.ts`):

- one player per square, players and ball on the pitch;
- on-pitch players are Standing, Prone or Stunned; no Prone or Stunned player
  off the pitch during play;
- at most seven players per side on the pitch;
- re-rolls never negative;
- scores never fall and never rise by more than one in a single command;
- no Prone or Stunned player holds the ball once the command has settled;
- the active player belongs to the team whose turn it is;
- turn and half counters stay in range.

Also recorded as findings:

- `engine-error`: the engine threw an exception;
- `rejected-candidate`: the engine refused a command its own legality checks
  offered (a warning; `--strict` makes it blocking);
- `no-candidates`: the game waits but offers nothing legal;
- `budget-exhausted`: the match did not finish within the command budget;
- at full time, every touchdown on the scoreboard is credited to a scorer in
  the match statistics, so progression awards the SPP.

## Investigate a finding

```bash
pnpm sim:replay <recording.json>                   # replay, verify the final state
pnpm sim:replay <recording.json> --step 516        # the six steps up to 516, and the state
pnpm sim:replay <recording.json> --step 516 --save-out save.json
```

A replay re-runs the recorded commands against a fresh engine with the same
seed, and checks the invariants again. It reports the first step that behaves
differently from the recording.

`--save-out` writes a match save at that step. To look at it on the real
board, run `pnpm dev`, open the browser console on the app, paste the
contents of `save.json` after `const save =`, and run:

```js
const save = /* paste save.json here */;
localStorage.setItem("bloodbowl_local_match_save", JSON.stringify(save));
```

Then open `/play`. The game resumes at that exact step.
`e2e/browser/sim-recording.e2e.ts` proves the resumed board matches the
engine's.

## Turn a finding into a regression test

1. Trim the recording to the step that exposed the bug:

   ```bash
   pnpm sim:replay <recording.json> --step 516 \
     --trim-out __tests__/simulation/recordings/<what-broke>.json
   ```

2. Add an entry for the file in `__tests__/simulation/recordings.test.ts`
   that asserts what the last step must now produce.
3. Fix the engine. The test replays every committed recording, fails on any
   broken invariant, and checks the expected end state.

If an engine change alters the order of dice rolls, a committed recording
stops matching and the test names the first step that differs. Re-record it
on purpose, as with committed seeds.

## Where things live

| Path | Contents |
| --- | --- |
| `src/simulation/candidates.ts` | Legal candidates at any decision point |
| `src/simulation/coaches/` | The three coaches |
| `src/simulation/runMatch.ts` | One match, its findings and its recording |
| `src/simulation/invariants.ts` | Rules checked after every command |
| `src/simulation/replay.ts` | Replay, trim, and match-save export |
| `src/simulation/cli.ts` | `pnpm sim` and `pnpm sim:replay` |
| `__tests__/simulation/` | Harness test and committed recordings |
