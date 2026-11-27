# Sevens policy lab

Run the current committed AI against a frozen incumbent on Daily Driver:

```sh
scripts/coach/policy-lab/daily-driver.sh full
```

The script exports immutable Git archives and installs their locked dependencies. It does not call a model during games. An offline outcome pass replays saved commands without re-running coach decisions; it records real Pass completions, same-turn receiver touchdowns and long late-half scoring runs. A handoff control prevents the engine's shared completion event from inflating passing counts. It runs 65 contract checks, a 192-game pilot with Vampire and special-action sentinels, a fresh 5,248-game confirmation, 1,312 persistent-context fixtures, a separate 432-game heuristic control and 16 deterministic Hard sentinels. Hard sentinels check different decisions on Vampire and thrower-team boards; 16 games do not estimate general playing strength. All matches use normal Sevens setup and the real command engine. There is no forced opening contact line. `pilot` runs only the contracts and first match stage.

Every match saves its initial state, commands and decision notes, then immediately replays them and reconciles event counters. Eight-game blocks balance physical side, which policy uses each build and first receiver. A partial or finding-bearing block cannot enter an estimate. The quality gate stops acquisition errors; confirmation also requires a naturally selected and accepted pass. That checks an exercised gameplay path, not a pass-rate fitness bonus.

See the [first measured results](../../../docs/technical/sevens-policy-lab-results.md) for the final source, passing outcomes and unresolved survival tradeoffs.

The frozen incumbent is `main` before the current branch, set in the script; `BB7_BASELINE=<full sha>` compares another. A `standard` stage plays the confirmation schedule with `--candidate standard`: the shipped Standard level, with its per-match game plan and close-call variety. It measures what players meet, while confirmation measures the planner at its best.

## Plays and moments

After confirmation, Standard and the pilot, `usage.ts` replays every saved game and names each declaration by its coach note: a carrier throw, a pass, a flank run, a launch setup and so on. For each play and policy it counts uses, scores that turn or the next, and turnovers during the activation. `moments.ts` writes `moments/index.html` with that table and the candidate's scoring moments, rarest plays first. Each moment links to a playback of its match opened at the declaration. `fouls.ts` writes `fouls-summary.json`, which counts each policy's Fouls by roster and fouler position. For each group it counts send-offs and how the target ended the activation: Stunned, out of the drive, or a casualty. `scorecard.ts` then writes `scorecard.html` and `scorecard.json` in the stage's report. It gives each roster its strength, how often it scores, touchdowns and casualties each way, Fouls, and the plays it makes more than the field. Strength is the points share it would take from an average opponent. The schedule pairs each roster with only a few others, so strength is fitted from all its games, and the raw share is shown beside it. When the schedule splits the rosters into groups that never meet, as the pilot's can, no strength can be fitted and rosters are judged on raw points. It holds each roster to the standard of its tier, set in `STANDARDS`. A roster's points bar is the lower of its tier's bar and the share of points people took with that race on FUMBBL, in `RACE_RATES`; the scorecard marks each bar that share capped. Each run draws a fresh schedule, so a strength moves by several points between runs. The change column, the roster's points under the candidate minus under the frozen policy in the same games, is what a change did for that roster. Confirmation pools both sides, because both play the best planner. Standard passes `--candidate-only`. Run them by hand on any stage:

```sh
pnpm exec tsx scripts/coach/policy-lab/usage.ts <stage directory>
pnpm exec tsx scripts/coach/policy-lab/moments.ts <stage directory>
pnpm exec tsx scripts/coach/policy-lab/fouls.ts <stage directory>
pnpm exec tsx scripts/coach/policy-lab/scorecard.ts <lab root> <stage> [--candidate-only]
```

A play's scores and turnovers describe what followed it, not what it was worth.

## Study one team

`drives.ts` replays a stage and counts each roster's turns with the ball: how far the ball went, and whether the turn scored, kept the ball or lost it. It splits them by whether the carrier started the turn marked, and counts halves that ended with the team still holding the ball. Pass `--shard i/n` to run shards side by side. A run filtered to one roster or one shard writes its own file, such as `drives-summary-dwarf-2-of-8.json`, and leaves `drives-summary.json` alone.

`defence.ts` replays a stage and counts each roster's turns that start with an opposing standing carrier: how often the turn won the ball back, whether its blocks hit the carrier, a player beside it or someone else, how the carrier was marked and screened when the turn ended, and whether the carrier's team scored next turn. It also counts every block by its dice, with a minus sign where the defender chooses. Its second argument, `i/n`, replays every nth game, and each shard writes `defence-i-of-n.json` in the stage directory.

`narrate.ts` replays one trace and prints every turn as a text board with each declaration, the coach's note, the dice and what followed. Uppercase players score at x=19, lowercase at x=0; `@` marks the ball carrier, `_` a prone player and `~` a stunned one. Replay a trace with the source that played it: the lab's `candidate` folder, not a newer checkout.

`run.ts --rosters "Dwarf,Nurgle"` keeps only the games where either side plays a named roster. A candidate `--weights` file against the same source then measures a change on those teams in a few minutes. The file may hold a `rosters` object, such as `{"rosters": {"Dwarf": {"safeMove": 0.82}}}`, which replaces `ROSTER_WEIGHTS` for the candidate. Read `rosters.csv` in the stage report for each roster's points under each policy. With no change at all the candidate and frozen AIs play identical games, so any difference comes from the change.

```sh
pnpm exec tsx scripts/coach/policy-lab/drives.ts <stage directory> [roster] [--shard i/n]
pnpm exec tsx scripts/coach/policy-lab/defence.ts <stage directory> [i/n]
pnpm exec tsx scripts/coach/policy-lab/narrate.ts <stage directory>/traces/<game>.json.gz
pnpm exec tsx scripts/coach/policy-study/run.ts --lab --baseline <frozen tree> --rosters "Dwarf,Nurgle" --weights <file.json> --out <run>
```

## Inspect evidence before changing policy

The remote path prints at completion. Its `reports/index.html` reads saved results offline. `contracts/gate.json` lists failing named contracts. Each stage has `stage-gate.json`, `summary.json`, `decision-receipts.json`, per-roster CSVs and a manifest. Raw traces stay under the acquisition's `traces/` directory. The lab page exposes all 108 catalogue entries, including open tactical gaps.

Legal declarations and proposals count repeated decision-state appearances. They are diagnostic denominators. They do not independently prove a pass was worthwhile. Public-entry tactical fixtures prove the useful case and the better-alternative control. Rule scripts prove mechanics. Natural skill triggers prove occurrence. None alone estimates an individual skill's contribution to winning.

The shared planner supplies movement, possession, combat and defence. `skillActivations.ts`, `gazeActivations.ts` and the feeding modules add capability proposals. Actual opponents, skills, available players and match context price those proposals. `ROSTER_WEIGHTS` in `weights.ts` gives a roster its own weight tweaks on top of the defaults. Each entry is kept only where a focused study measured that roster doing better with it.

Turn-five preparation includes necessary rushes into next-turn scoring reach. Turn-six scoring attempts lose the usual future-turn penalty when no reply remains. Incomplete distance gains and generic receiver preparation lose their final-turn attack value. Persistent injuries raise the cost of unnecessary exposure. The supported scoring horizon uses geometry and immediate transfers; it does not prove every multi-player miracle impossible.

## Team controls and estimates

The inventory retains base recipes and one frozen coverage replicate. It adds coherent roles and genuine Random Primary progression. Four distinct players each receive a 12 SPP budget. The coherent arm selects legal Primary skills by handler, passer, receiver and hitter roles. The random arm rolls the game's two candidates, then selects the better role fit. It pays actual random costs. Unspent SPP and actual team value remain in snapshots. Equal budgets do not imply equal team values. These arms compare policies on identical builds; they are not a causal chosen-versus-random strength comparison.

Reports resample whole eight-game blocks 2,000 times. They show both recipe-weighted and equal-roster estimates, plus separate build-method estimates. Persistent fixtures restart teams after each match. Their player-loss counts do not measure a whole season. Match score remains the primary policy outcome; roster-specific SPP objectives are descriptive.

## Run and resume locally

Export the frozen revision into a source directory with locked dependencies, then:

```sh
pnpm exec tsx scripts/coach/policy-lab/gate.ts sim-results/lab/contracts
pnpm exec tsx scripts/coach/policy-study/run.ts --lab \
  --baseline /path/to/frozen --baseline-revision <sha> --revision <sha> \
  --smoke --blocks 24 --workers 8 --out sim-results/lab/pilot
python3 scripts/coach/policy-study/report.py \
  --run sim-results/lab/pilot --out sim-results/lab/reports/pilot
python3 scripts/coach/policy-lab/check.py sim-results/lab/reports/pilot
python3 scripts/coach/policy-lab/report.py sim-results/lab
```

Remove `--smoke --blocks 24` and use a fresh `--seed-base` for confirmation. Every game is a friendly in which the lower-value team spends its petty cash as the computer coach would; `--no-inducements` skips those purchases, as runs before 20 November did. Inducements a game type hands out for free, such as Street Bowl's Magic Potion, are still granted.

`--game-type street-bowl|beach-bowl|gutter-bowl` drafts every team under that game type's rules and plays on its pitch. Gutter Bowl picks the Street or Sewer venue from each pairing's seed, so a `--rosters` subset replays the same venue; `--venue gutter-street|gutter-sewer` pins one. The frozen tree must have `src/game/variants/activeMatch.ts` for any game type other than Sevens. Use `--league` for persistent-fixture context, `--base-only` to isolate base builds, and `--opponent heuristic|hard|legend` for frozen policy sentinels. Hard and Legend use deterministic trial counts without wall-clock cutoffs. They share planner ancestry and are not independent tactical oracles. Keep opponent acquisitions separate.

Rerunning an unchanged command resumes missing games. Source, opponent, context or schedule changes reject an existing directory. Candidate engine and legal actions are shared with the frozen decision policy. Behaviour changes require fresh confirmation. The driver derives fresh confirmation seeds from the committed revision, while the diagnostic pilot keeps fixed seeds. Report-only changes can rebuild from saved games without replaying acquisition. Source archives live beside the run; the report records source and results digests.

```sh
pnpm exec tsrs -p scripts/coach/policy-lab/tsconfig.json
pnpm exec oxlint scripts/coach/policy-lab scripts/coach/policy-study
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/coach/policy-study -p 'test_*.py'
```

## Recover an instrumentation repair

The collector listens to live gameplay events. A suspended scoring command can emit its touchdown after a reply returns, so response-log polling is insufficient. The fixture `query-score.json.gz` reproduces the missed score while preserving the final game state.

For an instrumentation-only change, retain the original seed bases and reuse verified recordings:

```sh
BB7_REUSE_ROOT=/Users/joelloyd/tmp/bb7-policy-lab-76705927eefb \
BB7_CONFIRMATION_SEED_BASE=807200900 \
BB7_HEURISTIC_SEED_BASE=341000000 \
scripts/coach/policy-lab/daily-driver.sh full
```

Recovery validates the archived acquisition digest, identical engine and AI sources, locked dependencies, team builders, schedule and frozen opponent. It replays every imported command recording and verifies its final hash. It regenerates gameplay observations while retaining original decision measurements and source lineage. Missing games are played normally. Changed AI or match inputs reject reuse. Original artifacts remain intact; `recovery.json` and per-game parent digests describe the new acquisition.
