# Assumptions: elves batch

Teams: Dark Elf, High Elf, Elven Union, Wood Elf (18 models). Files: `teams/elves_common.py`,
`teams/elves_dark.py`, `teams/elves_high.py`, `teams/elves_union.py`, `teams/elves_wood.py`.

## Design decisions

- **High Elf shared models.** The roster reuses three models for two positions each. Each model is dressed as
  the grander of its two roles so it is strong enough for both:
  - `he_blitzer` = Blitzer and Dragon Prince: dragon-crested helm, gold horns, long kit2 cape.
  - `he_thrower` = Thrower and Phoenix Warrior: flame-feather plume, feathered kit2 collar, long robe.
  - `he_catcher` = Catcher and White Lion: bare-headed, white fur pelt with hanging paws.
  On the High Elf team sheet those pairs are therefore identical figures. Telling them apart needs separate
  model keys in the roster, which is outside this batch.
- **Four team identities.** Dark Elf = pale skin, white hair, spiked dark steel. High Elf = bright plate, gold
  trim, tall helms, robes. Elven Union = modern sportswear, bare limbs, white trainers, styled hair, almost no
  armour. Wood Elf = leather, leaf and bark, hoods, feathers, antlers, red and brown hair.
- **No weapons in hands.** Dark Elf figures carry no blades; the Assassin has an empty sheath only.
- **Wardancer kit colour.** Warpaint alone was too thin to show kit1 at game size, so the trousers are kit1
  with kit2 garters; the warpaint stays kit1.
- **Union Thrower kit colour.** Shoulder caps changed to kit1 with kit2 trim so kit1 dominates the torso; kit2
  is on the trousers and the throwing-arm sleeve.
- **Loren Forest Treeman** is a pale birch giant, deliberately different from the oak Treeman of the small-folk
  batch. Kit1 is on forearm pennants, a back standard and the loincloth; kit2 on ribbons, belt and neckband.
- **Dark Elf kit2.** The default review colour for Dark Elf kit2 is near-black, so kit2 areas (Assassin hood,
  Runner scarf) look dark on the sheets. They are real kit2 pixels and will take the team's colour in game.
- **Two palette ramps added:** `elf_pink` (Union dyed hair) and `elf_birch` (Loren treeman bark).
- **Sizes.** All models are within 0.94..1.09 of today's idle height. `he_blitzer` renders 56 px against a
  target of 54 px (today 52) because the horns and crest add height.

## Library notes (worked around locally, `lib/` untouched)

- `coat="tails"` always uses the default red `lining` material; there is no layout key to change it (the
  `robe` coat has `robe_lining`, `gambeson` uses the coat material). The Wood Elf Thrower draws its tails
  with `core.skirt(..., lining="kit2")` in `extras()` instead.
- `run.sh` pipes through `grep`, so nothing reaches a redirected log until the run ends. Progress has to be
  read from `out/cache/<model>/timing.json` or `out/sheets/`.

## Render

- All 18 models: 6 animations x 8 facings x 8 frames, complete atlases (`base`, `kit1`, `kit2` + json, `meta.json`).
- Per model 117-326 s (the treeman is the slowest); 3618 s of process time in total, about 32 minutes of wall
  time on two processes while the machine was heavily loaded by the other builders.
- `wardancer`, `we_thrower` and `union_thrower` were re-rendered with `--force` after the changes above.
