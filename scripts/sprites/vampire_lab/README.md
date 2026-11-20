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

`build_page.py` packs those strips into a dark review page: the sharpen
comparison with today's multiply tint against the proposed ramp tint, the
upscalers, and a player page mock that rolls names with the game's own
generator. `bundle_names.mjs` bundles that generator for the page.

```sh
python3 scripts/sprites/vampire_lab/shipped_pass.py OUT
python3 scripts/sprites/vampire_lab/build_page.py OUT PAGE
```

Higher pixel density and look variants need the 3D models that the shipped
pixel art was rendered from. Those models are not in this repository.
