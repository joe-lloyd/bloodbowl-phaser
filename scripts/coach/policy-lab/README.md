# Sevens policy lab

Run the current committed AI against a frozen incumbent on Daily Driver:

```sh
scripts/coach/policy-lab/daily-driver.sh full
```

The script exports immutable Git archives and installs their locked dependencies. It does not call a model during games. An offline outcome pass replays saved commands without re-running coach decisions; it records real Pass completions, same-turn receiver touchdowns and long late-half scoring runs. A handoff control prevents the engine's shared completion event from inflating passing counts. It runs 65 contract checks, a 192-game pilot with Vampire and special-action sentinels, a fresh 5,184-game confirmation, 1,296 persistent-context fixtures, a separate 432-game heuristic control and 16 deterministic Hard sentinels. Hard sentinels check different decisions on Vampire and thrower-team boards; 16 games do not estimate general playing strength. All matches use normal Sevens setup and the real command engine. There is no forced opening contact line. `pilot` runs only the contracts and first match stage.

Every match saves its initial state, commands and decision notes, then immediately replays them and reconciles event counters. Eight-game blocks balance physical side, which policy uses each build and first receiver. A partial or finding-bearing block cannot enter an estimate. The quality gate stops acquisition errors; confirmation also requires a naturally selected and accepted pass. That checks an exercised gameplay path, not a pass-rate fitness bonus.

See the [first measured results](../../../docs/technical/sevens-policy-lab-results.md) for the final source, passing outcomes and unresolved survival tradeoffs.

The frozen incumbent is `main` before the current branch, set in the script; `BB7_BASELINE=<full sha>` compares another. A `standard` stage plays the confirmation schedule with `--candidate standard`: the shipped Standard level, with its per-match game plan and close-call variety. It measures what players meet, while confirmation measures the planner at its best.

## Plays and moments

After confirmation, Standard and the pilot, `usage.ts` replays every saved game and names each declaration by its coach note: a carrier throw, a pass, a flank run, a launch setup and so on. For each play and policy it counts uses, scores that turn or the next, and turnovers during the activation. `moments.ts` writes `moments/index.html` with that table and the candidate's scoring moments, rarest plays first. Each moment links to a playback of its match opened at the declaration. Run them by hand on any stage:

```sh
pnpm exec tsx scripts/coach/policy-lab/usage.ts <stage directory>
pnpm exec tsx scripts/coach/policy-lab/moments.ts <stage directory>
```

A play's scores and turnovers describe what followed it, not what it was worth.

## Inspect evidence before changing policy

The remote path prints at completion. Its `reports/index.html` reads saved results offline. `contracts/gate.json` lists failing named contracts. Each stage has `stage-gate.json`, `summary.json`, `decision-receipts.json`, per-roster CSVs and a manifest. Raw traces stay under the acquisition's `traces/` directory. The lab page exposes all 108 catalogue entries, including open tactical gaps.

Legal declarations and proposals count repeated decision-state appearances. They are diagnostic denominators. They do not independently prove a pass was worthwhile. Public-entry tactical fixtures prove the useful case and the better-alternative control. Rule scripts prove mechanics. Natural skill triggers prove occurrence. None alone estimates an individual skill's contribution to winning.

The shared planner supplies movement, possession, combat and defence. `skillActivations.ts`, `gazeActivations.ts` and the feeding modules add capability proposals. Actual opponents, skills, available players and match context price those proposals. No roster-name switch makes an agile team refuse favourable hits against weak opponents.

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

Remove `--smoke --blocks 24` and use a fresh `--seed-base` for confirmation. Use `--league` for persistent-fixture context, `--base-only` to isolate base builds, and `--opponent heuristic|hard|legend` for frozen policy sentinels. Hard and Legend use deterministic trial counts without wall-clock cutoffs. They share planner ancestry and are not independent tactical oracles. Keep opponent acquisitions separate.

Rerunning an unchanged command resumes missing games. Source, opponent, context or schedule changes reject an existing directory. Candidate engine and legal actions are shared with the frozen decision policy. Behaviour changes require fresh confirmation. The driver derives fresh confirmation seeds from the committed revision, while the diagnostic pilot keeps fixed seeds. Report-only changes can rebuild from saved games without replaying acquisition. Source archives live beside the run; the report records source and results digests.

```sh
pnpm exec tsc -p scripts/coach/policy-lab/tsconfig.json
pnpm exec eslint scripts/coach/policy-lab scripts/coach/policy-study
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
