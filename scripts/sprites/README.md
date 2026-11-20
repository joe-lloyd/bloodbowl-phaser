# Match art pipeline

Players and the stadium are pre-rendered in Blender, from the same camera the
game draws the board with, then packed into Phaser atlases. Blender runs on a
Windows machine with a GPU (Jellybingus). The sideline crew were also rendered
in Blender 5.1 on Daily Driver, which gives the same frames. The packing runs
anywhere with Python 3 and Pillow.

The player atlases shipped today are a separate pixel-art pass (#164, from
Conveyor), not this pipeline's output, so the sideline crew still have the
Blender toon look.

## The camera

Orthographic, 30 degrees above the ground, turned 45 degrees, at 25 pixels
per metre ("lo", what the game uses; "hi" is 50 for review pages). A pitch
square is 2.8 m (`SQUARE_M` in `team_models.py`), so it is a 99 x 49.5 px
diamond. `src/game/elements/GridUtils.ts` uses the same numbers; change one
and you must change the other.

## Players

| File | What it does |
| --- | --- |
| `blender_players.py` | Materials, the rig of empties, poses (idle, run, block, fall, cheer), the render loop and the Blood Bowl light style (`bloodbowl`). |
| `model_kit.py` | Body presets, rigs and around fifty parts (helmets, pads, horns, tails, weapons). |
| `team_models.py` | One spec per model (`MODELS`), each roster position's model (`TEAMS`) and review kits. |
| `sideline_models.py` | Seated assistant coaches and apothecaries, cheerleaders with pom-poms, scarf-wearing fans and goblin stretcher bearers, using the match rigs and kit masks. |
| `render_sideline.py` | Renders sideline crew in the two dugout facings and medics in all eight walking facings, and saves their source `.blend` files. |
| `check_models.py` | Builds every spec against stub Blender objects and checks every roster position has a model. Run it after editing specs. |
| `render_models.py` | Picks the smallest frame that holds a model in every facing and frame, then renders it. |
| `batch_render.py` | Headless batch with `--style`, `--anims` and `--sizes`; skips finished models, so it resumes. |

Each frame renders twice: a colour pass with kit in grey, and a mask pass
with primary kit red and secondary kit green. `build_sheets.py` splits them
into a figure layer and two kit layers; Phaser tints the kit layers with the
team's colours.

```sh
# on the Blender machine
blender -b --factory-startup --python batch_render.py -- OUT --style bloodbowl --anims idle,run,fall,cheer --sizes lo
```

To render just the sideline models, run `render_sideline.py -- OUT` inside
Blender, then pack them with
`python3 scripts/sprites/build_game_assets.py bloodbowl OUT -`. This adds the
crew to the existing manifest and preserves the player and stadium assets.
Their dedicated staff terraces are drawn by `SidelineTerrace` alongside the
reserve boxes, leaving the touchline exit lane and all player slots clear.

## Stadium

`stadium.py` builds the bowl around the pitch: stands, crowd, corners,
boards, floodlights, scoreboard and both dugouts with their reserves, KO,
injured and sent-off boxes. It takes a layout (the game uses `corners`) and
renders colour and mask passes plus a `meta.json` with where square (0, 0)
and every dugout square land.

```sh
blender -b --factory-startup --python stadium.py -- OUT corners
```

## Street, Beach and Gutter Bowl venues

`venues.py` builds the other four venues (street, beach, gutter-street,
gutter-sewer) with the stadium's camera, light style, materials and colour
and mask passes. It reads the pitch from the game rather than its own
numbers: `venue_layouts.ts` prints every venue's pitch layout, dugout squares
and wall gates from `src/game/variants/pitchLayouts.ts`. Each venue takes a
few seconds on Daily Driver.

```sh
pnpm exec tsx scripts/sprites/venue_layouts.ts > layouts.json
# on the Blender machine, one venue per run
blender -b --factory-startup --python venues.py -- OUT layouts.json street
# back in the repo
python3 scripts/sprites/build_game_assets.py venues OUT
```

The last step writes `public/venues/<venue>/`. Then run
`python3 scripts/sprites/venue_cards.py` to rebuild the `card.webp` each game
type card shows: the venue's layers tinted in kit colours and cropped to the
pitch. `venueSidelines.test.ts`
checks each venue's `meta.json` against the rules layout, so a change to a
pitch layout fails the tests until the venue is rendered again.

## Into the game

```sh
python3 scripts/sprites/build_game_assets.py bloodbowl RENDERS_DIR STADIUM_DIR/corners
```

This writes `public/sprites/bloodbowl/<model>/` atlases (quantised to 256
colours), `public/stadium/bloodbowl/` layers, meta and the thumbnail behind
the loading screen, and `src/game/presentation/spriteManifest.json`, which
maps every roster position to its model. The script refuses to write a
manifest whose frames disagree with the existing one.

Pass `-` for the stadium folder to rebuild the players alone. A change that
moves frames, such as a pose that reaches higher, also changes the manifest:
delete `spriteManifest.json` before building, so the new frames are not
checked against the old ones.

## Review pages

`build_roster_page.py`, `build_stadium_page.py`, `build_theme_assets.py` and the `team-roster/`,
`stadium-page/` and `match-ui/` folders build the static review pages used
while designing the look. They are a record of that work, including the Neon
direction the game no longer ships, and are not loaded by the game.
