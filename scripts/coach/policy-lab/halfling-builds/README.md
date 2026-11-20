# Halfling build matches, 20 November 2026

`scripts/coach/policy-lab/builds.ts` plays every Halfling computer team against every other computer team, on both sides, with the planner coaching both teams.

- `first/`: Best stuff, Legendary mode and Two re-rolls, 2 seeds per pairing (316 games per build per mode).
- `second/`: Best stuff with a re-roll, 4 seeds per pairing (632 games per mode).

Each folder has one JSON line per game for three modes:

- `none.jsonl`: no inducements, as the policy lab plays.
- `petty.jsonl`: the lower-value team gets the team-value gap as petty cash and spends it in the computer's old order (Extra Team Training, Blitzer's Best Kegs, Part-time Assistant Coaches, Temp Agency Cheerleaders).
- `chef.jsonl`: the same petty cash, with the Halfling Master Chef bought first.

The same seeds play in every mode, so a build's difference between two modes is paired game by game.

Commands, run on the Daily Driver from this branch:

```sh
pnpm exec tsx scripts/coach/policy-lab/builds.ts <none|petty|chef> <shard>/3 2 <out.jsonl>
pnpm exec tsx scripts/coach/policy-lab/builds.ts <none|petty|chef> <shard>/3 4 <out.jsonl> Halfling halfling-best-stuff-reroll
python3 scripts/coach/policy-lab/builds-report.py scripts/coach/policy-lab/halfling-builds/first
```
