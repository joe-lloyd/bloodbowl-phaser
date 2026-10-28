# Match art pipeline

Players and the stadium are pre-rendered in Blender, from the same camera the
game draws the board with, then packed into Phaser atlases. Blender runs on a
Windows machine with a GPU (Jellybingus); the packing runs anywhere with
Python 3 and Pillow.

## The camera

Orthographic, 30 degrees above the ground, turned 45 degrees, at 25 pixels
per metre ("lo", what the game uses; "hi" is 50 for review pages). A pitch
square is 2.8 m (`SQUARE_M` in `team_models.py`), so it is a 99 x 49.5 px
diamond. `src/game/elements/GridUtils.ts` uses the same numbers; change one
and you must change the other.

## Players

| File | What it does |
| --- | --- |
| `blender_players.py` | Materials, the rig of empties, poses (idle, run, block, fall), the render loop and the light styles (`neon`, `bloodbowl`). |
| `model_kit.py` | Body presets, rigs and around fifty parts (helmets, pads, horns, tails, weapons). |
| `team_models.py` | One spec per model (`MODELS`), each roster position's model (`TEAMS`) and review kits. |
| `check_models.py` | Builds every spec against stub Blender objects and checks every roster position has a model. Run it after editing specs. |
| `render_models.py` | Picks the smallest frame that holds a model in every facing and frame, then renders it. |
| `batch_render.py` | Headless batch with `--style`, `--anims` and `--sizes`; skips finished models, so it resumes. |

Each frame renders twice: a colour pass with kit in grey, and a mask pass
with primary kit red and secondary kit green. `build_sheets.py` splits them
into a figure layer and two kit layers; Phaser tints the kit layers with the
team's colours.

```sh
# on the Blender machine, once per style
blender -b --factory-startup --python batch_render.py -- OUT --style bloodbowl --anims idle,run,fall --sizes lo
```

## Stadium

`stadium.py` builds the bowl around the pitch: stands, crowd, corners,
boards, floodlights, scoreboard and both dugouts with their reserves, KO,
injured and sent-off boxes. It takes a layout (the game uses `corners`) and a
theme (`bloodbowl` or `neon`), and renders colour and mask passes plus a
`meta.json` with where square (0, 0) and every dugout square land.

```sh
blender -b --factory-startup --python stadium.py -- OUT corners bloodbowl
```

## Into the game

```sh
python3 scripts/sprites/build_game_assets.py bloodbowl RENDERS_DIR STADIUM_DIR/corners
python3 scripts/sprites/build_game_assets.py neon RENDERS_DIR STADIUM_DIR/corners
```

This writes `public/sprites/<style>/<model>/` atlases (quantised to 256
colours), `public/stadium/<style>/` layers, meta and a picker thumbnail, and
`src/game/presentation/spriteManifest.json`, which maps every roster position
to its model. The manifest is shared by both styles and the script refuses
to write one whose frames disagree with the other style's.

## Review pages

`build_roster_page.py`, `build_stadium_page.py` and the `team-roster/`,
`stadium-page/` and `match-ui/` folders build the static review pages used
while designing the look.
