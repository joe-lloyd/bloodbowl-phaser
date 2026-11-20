# Vampire sprite lab

A review page for sharper player sprites, the Vampire team only. Every image is rendered by the sprite
factory (`scripts/sprites/factory`), the pipeline that made the shipped art. Nothing here changes the game.

The page has five sections:

1. Dither and tones: the shipped shader next to no dither and two tones.
2. Density: the same models at 1×, 2×, 3× and 4× the pixels.
3. Smoother loops: idle, run and cheer at 12 frames instead of 8.
4. Looks: body, helmet and shoulder pads for each position (`teams/vampire_looks.py`).
5. Player page: a roster with names from `src/game/names`, rename, and cyclers for each look.

## Build it

Render the sets with the factory, one output folder per set, then pack them into the page:

```sh
cd scripts/sprites/factory && python3 make_reference.py
V=thrall,vampire_runner,vampire_thrower,vampire_blitzer
./run.sh --models $V --facings se --out LAB/base-d1
./run.sh --models $V --facings se --density 2 --out LAB/base-d2      # and d3, d4
./run.sh --models $V --facings se --dither 0 --out LAB/nodither-d1   # and --density 2 for -d2
./run.sh --models $V --facings se --dither 0 --tones 2 --out LAB/twotone-d1
./run.sh --models $V --facings se --density 2 --frames 12 --anims idle,run,cheer --out LAB/frames12-d2
./run.sh --models <every vampire look key> --facings se --anims idle,run --out LAB/looks-d1  # and -d2
cd ../vampire_lab && python3 build_page.py LAB PAGE
```

The page reads these sets: `base-d1` to `base-d4`, `nodither-d1`, `nodither-d2`, `twotone-d1`,
`twotone-d2`, `frames12-d2`, `looks-d1` and `looks-d2`. A set name ends in its density.
