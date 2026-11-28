# Action and skill coverage

Plays planner-against-planner matches over every roster of one game type and counts, per roster, how often each action and skill came up and how often the coach used it.

```sh
pnpm exec tsx scripts/coach/action-coverage/run.ts --game-type sevens --games 640 --seed 992 --out sim-results/coverage/sevens.json
pnpm exec tsx scripts/coach/action-coverage/merge.ts sim-results/coverage/merged.json sim-results/coverage/*.json
pnpm exec tsx scripts/coach/action-coverage/report.ts sim-results/coverage/merged.json sim-results/coverage/report.html
```

`--game-type` takes `sevens`, `street-bowl`, `beach-bowl`, `gutter-bowl` or `deathbowl`. Deathbowl plays four seats through the four-seat runner. `--workers` sets the processes on one machine, 4 by default. A run writes one file per match under `<out>.parts/` and folds them into `<out>` at the end, so a stopped run resumes where it left off.

The seed picks the rosters, so shards of one seed range add up to the same matches as one long run. For two teams, seed `s` puts roster `s mod 32` at home against a different roster that changes each time the home roster comes round again; every ordered pair plays once in 992 seeds. Deathbowl seats rosters by `rostersFor` in `src/simulation/commands/fourSeat.ts`. Every roster plays 40 matches in 640 two-team seeds that start at a multiple of 32, or in any 320 Deathbowl seeds.

The fleet script takes the same shape. Merge refuses a seed that appears in two shards.

```sh
/Users/joe/.t3/deathbowl-plan/fleet/fleet.sh run coverage-sevens 640 992 -- scripts/coach/action-coverage/run.ts --game-type sevens
```

## What it counts

The counts come from `src/simulation/telemetry.ts`, which every runner uses.

- An action is offered once per decision point at which the coach could declare it, and chosen when the coach declared it. Block replacements count by name, such as `declare:blitz:stab`.
- A skill is held in each match where a player on the roster has it, and triggered each time the engine announces its effect with `SkillTriggered`. A skill whose effect the engine never announces shows zero triggers even when it changed a roll.
- Re-rolls count by source and skill, such as `skill:Sure Feet` or `team`.
- Rushes and Dodges count every roll, re-rolls included, and the failed ones. Passes count throws; completions count caught passes and hand-offs count caught hand-offs.

The report lists, per game type, the actions offered but never chosen and the skills held but never triggered, then those used under 5 times per 100 matches, then one row per roster.
