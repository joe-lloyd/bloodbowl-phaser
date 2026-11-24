# Do weights depend on the team?

`collect.ts` plays planner self-play games in which each side's weights are
shifted at random and every setup is picked at random. It records the two
teams' traits, the shifts, the score and what each drive scored. Games come in
pairs with opposite shifts. `fit.py` reads them.

```sh
pnpm exec tsx scripts/coach/trait-weights/collect.ts sim-results/traits/a.jsonl 0 20000
pnpm exec tsx scripts/coach/trait-weights/collect.ts sim-results/traits/b.jsonl 0 4000 street-bowl
pnpm exec tsx -e 'import { SHIFTED } from "./scripts/coach/trait-weights/weightShift"; console.log(JSON.stringify(SHIFTED))' > names.json
python3 scripts/coach/trait-weights/fit.py 'sim-results/traits/a.jsonl' names.json
```

The first argument after the file is the first game number and the second is
how many to play. Give each parallel process its own range. `fit.py` needs
numpy.

## What it found, 24 November 2026

21,158 Sevens games and 11,443 on Street, Beach and Gutter Bowl.

- **Weights:** a team's traits are its mean pace, strength, agility and armour,
  and how many hitting and ball-handling skills it holds. Over 42 weights and
  both teams' traits, 504 combinations, the mean squared z was 0.94 where
  chance is 1. A shift of about half in any weight moves the result by under a
  point of points share, whatever the teams. The planner already prices every
  Dodge, Block and throw from the players' own statistics, so a weight for a
  roster or a race has nothing left to add.
- **Setups:** the Blitz line and the Press kick best and the Full line receives
  best, for every team and on every game type, within the noise. Fitting the
  choice to the teams did not beat one fixed order in cross-validation.

So one weight set serves every roster, including one added tomorrow.
`src/simulation/ai/setupChoice.ts` holds the setup values, pooled over the game
types.
