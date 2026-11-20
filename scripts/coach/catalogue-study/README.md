# Computer-team catalogue study

Run actual public computer templates through the existing headless engine.
No browser, saved-team library writes, paid model calls, or automatic AI changes.

```sh
pnpm exec tsx scripts/coach/catalogue-study.ts --workers 10 --out sim-results/catalogue-study
pnpm exec tsx scripts/coach/catalogue-study/rules.ts sim-results/catalogue-rules
pnpm exec tsx scripts/coach/catalogue-study/audit.ts sim-results/candidate-audit.json
```

The default GW Sevens catalogue currently has 82 legal templates from 30 rosters.
The inventory records the reason any bundled recipe is unavailable. Teams keep
their actual players, veteran and reroll bank. No free simulation inducements are
granted, but the lower-value team spends its petty cash as the computer coach
would; `--no-inducements` turns that off. Every match starts fresh; this
evaluates play rather than career growth.

The schedule contains 6,480 planner league games, 972 old-heuristic calibration
games, 162 Hard games and 162 Legend games. League opponents play at home and
away. Cross-coach pairs keep the two templates and seed fixed and swap coaches.
Each template gets equal exposure on both physical sides. Hard/Legend keep their
full sample budgets and omit wall-clock deadlines for deterministic decisions.

Use `--cohorts league,calibration` to separate cheap matches from search matches,
`--limit 4` for a smoke run, and `--revision <git SHA>` to record the source
revision. Outputs are resumable: source and schedule fingerprints must match.
Use a different output directory when changing code, recipes, or the schedule.

Each result is written atomically under `games/`. Compressed traces under
`traces/` contain the **actual initial MatchSave**, commands, final hash and
observations. This is necessary because the generic simulator recording does
not preserve custom teams or unequal reroll banks.

```sh
pnpm exec tsx scripts/coach/catalogue-study/replay.ts <trace.json.gz>
```

Telemetry excludes lookahead clones and ignores read-only query responses,
which repeat the preceding command's event log. A skill trigger is an announced
engine effect; it is not a unique activation. Roster presence is exposure, and
zero announced effects cannot establish that a passive mechanic was unused.
The rule runner separately verifies all named controlled outcomes, rather than
counting forced scenarios as natural AI use. `audit.ts` compares engine-legal
actions with the simulator's candidate seam and checks captain preparation.

Older acquisitions with query-duplicated observations can be recounted without
running coach search again. Each replay must match its recorded final hash;
results and traces receive observation version 2, with a pipeline fingerprint.
Run the repair with the source that wrote the traces: runs made before
20 November 2026 hash their final state in key order.

```sh
pnpm exec tsx scripts/coach/catalogue-study/repair.ts <run-dir> 2
```

Build the offline HTML workbook and CSV archive (Python standard library only):

```sh
pnpm exec vitest run __tests__/unit/rules __tests__/unit/inducements/rules.test.ts \
  __tests__/unit/computerTeamTemplates.test.ts __tests__/headless/swarming.test.ts \
  __tests__/headless/rules --reporter=json --outputFile=sim-results/supplementary-tests.json

python3 scripts/coach/catalogue-study/report/build.py \
  --runs sim-results/catalogue-study \
  --rules sim-results/catalogue-rules/rules.json \
  --audit sim-results/candidate-audit.json \
  --supplementary sim-results/supplementary-tests.json \
  --out sim-results/catalogue-report
```

Multiple `--runs` directories can combine non-overlapping cohorts from the same
source snapshot. The report rejects missing scheduled games, duplicate IDs,
manifest mismatches, and legacy observations. `--allow-partial` is explicitly
provisional. A coach cohort with any unmatched valid games retains its descriptive
points estimate but omits the paired confidence interval. Scores, team and skill contexts, action selection, roster standards,
negative-trait contexts, all rule outcomes and event totals are available as CSV.
The HTML embeds its tables and requires no server or network connection.

Validate changes with the focused integration tests, ESLint, and the study's
TypeScript project:

```sh
pnpm exec vitest run __tests__/simulation/catalogue-study.test.ts
pnpm exec eslint scripts/coach/catalogue-study.ts scripts/coach/catalogue-study
pnpm exec tsc -p scripts/coach/catalogue-study/tsconfig.json
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/coach/catalogue-study/report -p 'test_*.py'
```
