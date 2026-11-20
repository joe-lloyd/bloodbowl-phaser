# Advanced skill evaluation

Evaluate developed public teams using the frozen planner, with an offline dashboard and a tactical roadmap for every skill. This evaluates policies; it does not automatically train or promote them.

```sh
pnpm exec tsx scripts/coach/advanced-study/run.ts \
  --workers 8 --revision <engine-base-sha> --out sim-results/advanced-study
pnpm exec tsx scripts/coach/advanced-study/probes.ts \
  sim-results/advanced-study/probes 32

PYTHONDONTWRITEBYTECODE=1 python3 scripts/coach/advanced-study/report.py \
  --run sim-results/advanced-study \
  --baseline sim-results/catalogue-study/report/summary.json \
  --out sim-results/advanced-study/dashboard
```

The default catalogue creates 410 snapshots: 82 original recipes and 328 advanced variants, covering all 30 rosters. Each recipe has two focused and two randomized builds. Each advanced build has six legal chosen advancements, at most two per player, granted through the existing progression API. The focused builder balances plausible player roles with coverage across all 72 learnable skills. Its packages are coverage-oriented, not optimized development advice.

The randomized allocation uses the same player, skill category, primary/secondary access and elite value band as each focused allocation. Team value and SPP cost match for each recipe and replicate. Randomness comes from a separate deterministic coach RNG. This is an allocation control using chosen-advancement pricing, not the application's cheaper two-roll random-primary mode. Traits are retained on their native players and are never rolled as advancements.

The schedule has 1,968 matches: focused versus original, randomized versus original, and focused versus randomized, each over two build replicates and two cyclic opponent offsets. Every seed has two legs with reversed physical sides. Native rerolls remain; no free inducements or persistent growth are added. Comparisons against originals intentionally include the added development value. Each full match is immediately replayed from its actual initial save; its final state hash and authoritative event counters must match before the result is saved.

Scenario probes remove the focal skill from every holder before replaying the existing rule script over 32 seeds. They count events directly on the event bus. Comparable endpoints require a focal holder, accepted commands and the same pending-decision type. The number of reaction commands can differ: removing a reroll skill can remove a prompt. Capability losses, rejected scripts and exceptions are retained separately. Endpoint changes include possession, position, player status, injuries, rerolls and score. They are not skill win values or AI-selected actions. Opening-choice diagnostics describe which scripted declaration was available and what the current planner selected; they do not certify the scripted action was optimal.

Probe output includes a script SHA-256 and an exact `probe-source.ts` copy. Opening diagnostics preserve the expected and chosen `blockReplacement`, so an ordinary Blitz stays distinct from a special-attack Blitz; availability also checks that discriminator. The final probe pass additionally requires an Active player for the endpoint possession flag; it is acquired separately from the frozen full-match source snapshot. The raw probe JSON and corresponding script are bundled together.

The report accepts `--allow-partial` for provisional progress. It validates game identity, schedule fields, replay markers and event reconciliation. Intervals use 2,000 resamples of complete mirrored pairs and are suppressed if any valid leg is unmatched. Detailed CSVs, the full roadmap and raw probe outcomes accompany the offline HTML. If the baseline ZIP is beside its summary, the download includes it. An optional `acquisition-source.tar.gz` in the run directory is also bundled; full natural-match traces remain in `traces/` outside the spreadsheet ZIP.

To reproduce the published acquisition exactly, use its frozen source archive and manifest. The resume fingerprint includes engine sources, catalogue TypeScript, the acquisition runner/builders, dependencies and TypeScript configuration; report, dashboard, documentation and probe edits do not invalidate a new acquisition. Paths use forward slashes in the digest on every host. Acquisition source changes still require a fresh output directory even when they preserve every variant and job. Older manifests retain the fingerprint algorithm in their archived source. No user library or public template is edited.

```sh
pnpm exec vitest run __tests__/simulation/advanced-study.test.ts \
  __tests__/simulation/catalogue-study.test.ts
pnpm exec tsc -p scripts/coach/advanced-study/tsconfig.json
pnpm exec eslint scripts/coach/advanced-study __tests__/simulation/advanced-study.test.ts
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/coach/advanced-study -p 'test_*.py'
```
