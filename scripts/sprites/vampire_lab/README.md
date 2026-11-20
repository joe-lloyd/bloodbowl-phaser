# Vampire sprite lab

A review page for sharper player sprites, the Vampire team only. Every image is rendered by the sprite
factory (`scripts/sprites/factory`), the pipeline that made the shipped art. Nothing here changes the game.

The page has four sections:

1. The new default: the shipped look next to no dither, the ramp tint, 2× pixels and a 12-frame run.
2. Male and female: each position's own look next to the other body.
3. Options per position: the options in `teams/vampire_looks.json`, one row per option.
4. Player page: a roster with names from `src/game/names`, rename, and a control per option.

## Build it

Render the sets with the factory, one output folder per set, then pack them into the page:

```sh
cd scripts/sprites/factory && python3 make_reference.py
V=thrall,vampire_runner,vampire_thrower,vampire_blitzer
NEW="--facings se --dither 0 --frames run=12"
./run.sh --models $V --facings se --out LAB/base-d1                  # as shipped, from commit 521db374
./run.sh --models $V $NEW --out LAB/new-d1
./run.sh --models $V $NEW --density 2 --out LAB/new-d2
./run.sh --models <every look key> $NEW --anims idle,run --out LAB/looks-d1
./run.sh --models <every look key> $NEW --anims idle,run --density 2 --out LAB/looks-d2
cd ../vampire_lab && python3 build_page.py LAB PAGE
```

`base-d1` is the shipped look, so render it from commit 521db374, before the stronger bodies and fine
details in `teams/vampire.py`. The look keys are `<model>__<value>-<value>-...` for every combination in
`vampire_looks.json`. A set name ends in its density.
