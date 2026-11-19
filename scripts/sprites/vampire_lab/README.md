# Vampire sprite lab

Review tools for sharper player sprites, built on the shipped pixel art
(#164) for the vampire team only. Nothing here changes the game.

`shipped_pass.py` reads `public/sprites/bloodbowl/<model>/` for the thrall
and the three vampire models and writes one strip per animation, layer and
treatment:

- `current`: the shipped pixels, untouched.
- `clean`: near-duplicate colours merged, lone pixels removed, and a dark
  line on the shadow side where kit meets the rest of the figure.
- `clean-x2`, `clean-x3`, `clean-x4`: `clean` scaled with Scale2x and
  Scale3x. Each new pixel is picked from one source neighbour, decided on the
  composite and applied to every layer, so the layers stay aligned.

```sh
python3 scripts/sprites/vampire_lab/shipped_pass.py OUT
```

Higher pixel density and look variants need the 3D models that the shipped
pixel art was rendered from. Those models are not in this repository.
