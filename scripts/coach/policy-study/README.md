# Skill-aware policy comparison

This compares a frozen modular planner candidate with archived pre-change decision code. The published confirmation predates feeding-valuation review corrections in the final PR; see [the results and provenance limits](RESULTS.md#review-corrections-after-acquisition). It does not tune weights during acquisition or treat skill trigger counts as win value. The archived planner uses the same current engine, legal candidates and team snapshots as the candidate.

The first modules cover Secure the Ball, Hypnotic Gaze, Multiple Block and native Thrall feeding support. `createPlannerCoach({ skillPlans: false })` disables the modules for diagnosis; the experiment imports the actual old planner instead of relying on that switch as its control.

## Run on Daily Driver

Freeze a full source export containing `src`, `scripts/coach`, `package.json`, `pnpm-lock.yaml` and `tsconfig.json`. Give the frozen baseline its full original `src` tree and dependencies as well. Do not modify acquisition sources while a run is in progress.

```sh
pnpm exec tsx scripts/coach/policy-study/run.ts \
  --baseline frozen --baseline-revision c55748321ee15d16a4060181c0818e35640f66ac \
  --revision YOUR_CANDIDATE_REVISION --smoke --workers 8 \
  --out sim-results/smoke

pnpm exec tsx scripts/coach/policy-study/run.ts \
  --baseline frozen --baseline-revision c55748321ee15d16a4060181c0818e35640f66ac \
  --revision YOUR_CANDIDATE_REVISION --seed-base 14000000 --workers 8 \
  --out sim-results/confirmation
```

The schedule includes all 410 snapshots: 82 native public recipes, 164 focused advanced builds and 164 cost-matched randomized builds across 30 rosters. All 72 learnable skills are assigned in the advanced inventory; traits remain native. Each development/replicate group uses cyclic opponent offsets 11 and 37.

Each seed block has four games. The candidate uses team A on both physical sides, then team B on both sides, against the archived opponent. The full run has 3,280 matches and 820 blocks. The smoke run takes 24 whole blocks involving Vampire or Multiple Block builds on a separate 12-million seed range. Confirmation defaults to 13 million; `--seed-base` permits a disjoint range after a correction. This is a balanced sample, not a round-robin of every possible pair.

The worker saves initial teams and command traces, immediately replays each game, and compares its final state hash and all authoritative event counters. Results use atomic writes. Resume requires identical source digests, baseline digests and jobs; changing report or dashboard files is allowed. A failed worker fails the pool. Engine findings remain in results and block promotion.

## Publish evidence

Place `candidate-source.tar.gz` and `frozen-source.tar.gz` in the run directory to include the exact exports. An optional `smoke-summary.json` retains smoke evidence.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/coach/policy-study/report.py \
  --run sim-results/confirmation --out sim-results/policy-report \
  --skill-plan sim-results/advanced-study/dashboard/skill-plan.csv
```

The report requires every scheduled result. It validates identities, schedule balance, replay markers and event reconciliation. If a result has findings or did not finish, its entire four-game block is excluded from performance estimates. Both the point estimate and 95% interval use exactly those included blocks. The interval resamples whole block means 2,000 times; individual games are not independent samples. Every excluded block and every finding remains auditable in `games.csv` and the manifest.

The offline HTML includes development cohorts, total TD/CAS/turnovers, per-roster results for both policies and deltas, natural action selection, all 108 skill/trait event totals, and optional per-skill guidance from the earlier study. That guidance remains a tactical hypothesis, not an optimal-use claim. Roster deltas and the equal-roster mean are descriptive, without individual confidence intervals. Retained bash objectives are 2 TD / 3 CAS SPP, versus 3 TD / 2 CAS normally.

The ZIP contains CSVs, provenance, manifest, optional source archives and the HTML. Detailed skill and roll contexts use command-entry position; they do not establish endpoint feeding support. Selected declarations are distinct from completed gaze or multiple-block commands. Unfed Bloodlust and bite events are counts, not comparable success-rate denominators. Full traces and game JSON stay beside the acquisition and are not bundled in the spreadsheet ZIP.

Limitations: one frozen scripted opponent, fixed skill inventories, no induced league growth and no Hard/Legend exploitability comparison yet. A confidence interval spanning 50% is inconclusive. More activations or fewer turnovers alone do not establish a higher win rate. The first modules model bounded tactical opportunities rather than an exhaustive multi-turn search.

## Checks

```sh
pnpm exec vitest run __tests__/simulation/skill-plans.test.ts \
  __tests__/simulation/policy-study.test.ts \
  __tests__/headless/frenzy-second-block.test.ts
pnpm exec tsc --noEmit -p scripts/coach/policy-study/tsconfig.json
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/coach/policy-study -p test_report.py
```

## Follow-up modules

1. Throw Team-mate, Right Stuff, Lethal Flight, Strong Arm and Bullseye: scoring and damaging throws, legal targets, landing risk and possession cost.
2. Fouls and weapons: ejection/bribe costs, armour and injury, allies in danger and ordinary block alternatives.
3. Punt, jump and reactive choices: beneficial, irrelevant and harmful boards for each context.
4. Opponent modules, including Vampire support denial, and fresh Hard/Legend/exploiter confirmation.

Every module must supply accepted declarations and continuations, useful and harmful tactical evidence, and a held-out comparison. Passive skills need outcome measurement instead of forced selection. The earlier 108-row skill plan is the detailed inventory for these milestones.
