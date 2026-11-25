# Sprite factory

This folder turns model specs (small Python classes) into the game's pixel-art sprite atlases. It made
every player sprite in `public/sprites/bloodbowl/` (PR #164). It was built in a scratch folder and
restored here from that session's record; rendering `vampire_blitzer` again reproduces the shipped atlas
to within one pixel per frame.

    factory/
      lib/                the library: body plans, parts, palette, pixel pass, atlas packing, driver
      teams/              one Python file per team or batch; registers the models it owns
        vampire.py          the reference team: read this first
        vampire_looks.py    look variants of the Vampire positions (body, helmet, shoulder pads)
        _examples.py        demo_* models, one per body plan (loaded only with --examples)
      assumptions/        decisions the builders made without the owner
      make_reference.py   builds reference/ from git: rosters and the sprite heights models are sized to
      reference/          generated, not committed
      out/                generated, not committed
        sprites/<model>/{base,kit1,kit2}.png + .json, meta.json    the deliverable
        sheets/<model>.png, sheets/team_<Team>.png                 review images (3x, pitch green)
        preview/<model>.png                                        fast previews
        manifest.json                                              merged, in the game's format
        cache/                                                     resumable work files; safe to delete
      run.sh              runs the driver in Blender and filters its log (BLENDER sets the binary)

Run `python3 make_reference.py` once before the first render.

## Lab options

These change the look for review; the defaults are what shipped.

| Option | Effect |
|---|---|
| `--density N` | N times the pixels in each direction: frame and target height scale by N |
| `--dither D` | checker strength at tone edges; 0.1 shipped, 0 for flat tones |
| `--tones 2` | two tones per material (dark, mid) instead of three |
| `--frames N` | N frames for the looping animations (idle, run, cheer) instead of 8; `--frames run=12` sets one |

A look variant is registered as `<model>__<look>` and is sized and coloured like its model, so
`--models vampire_blitzer__f-bare-left` renders a female blitzer, no helmet, left shoulder pad only.

## Layered models (look options)

A model with look options (a `register_looks` entry, such as `teams/vampire_looks.py`) ships as layers
instead of one atlas, and the game builds each player's look when a team loads.

    ./run.sh --layers --models thrall,vampire_blitzer --dither 0 --density 2 --frames run=12 --verify 3
    python3 install_layered.py out/layered thrall vampire_blitzer

Per body the driver renders a base (no options) and, for every option value, the objects that value adds
or changes, with the rest of the figure hidden from the camera but still casting shadows. A second layer
per value (`<option>.<value>~shade`) keeps the base pixels that value's shadow darkens. Each pixel stores
its palette index, an object code (for inner lines) and its depth; the game keeps the nearest pixel of
the chosen layers, applies the shades where the base shows, then runs the finishing pass (speckle
removal, inner lines, outline) and the ramp kit tint. `--verify N` renders the position's own look and N
random looks whole and prints how many pixels differ from the composite per frame.

Every option needs an empty state and each value's layout must set every key the empty state clears
(see `SLOTS` in `teams/vampire_looks.py`). The driver warns when a value removes an object the base has;
fold that object into the option instead.

`install_layered.py` copies the layers to `public/sprites/bloodbowl/<model>/layered/`, removes the model's
flat atlases, writes its manifest entry (with the options and palette tables the game reads) and copies
a golden frame to `__tests__/fixtures/layered/` for the compositor's unit test.

## Models made by hand in Blender

`art/<model>.blend` holds a model made by hand, and a small class draws its parts; see `cave_maw` in
`teams/small_folk_squig.py`. Materials are named after palette keys and limbs turn about their object origins.
The file has no other copy, so save edits back to `art/` and render the model again. Copy `art/` to the render
machine with `lib/` and `teams/`.

## The acceptance checklist (every model)

1. Unique position: team-mates can be told apart by silhouette alone at about 42 px (headgear, build,
   gear, stance).
2. Team colour is clearly visible on every figure: both `kit1` (primary) and `kit2` (secondary),
   including big guys, monsters and machines.
3. **No ball in anyone's hands, ever.** The game draws the ball. Do not model anything round held in a
   hand, in any animation. `pass` is an empty-handed throw. The library has no ball part on purpose.
4. Detailed enough to be interesting at game size (see the Vampire sheets for the level).
5. Every model has its own idle personality (the `idle` hook below).
6. Plain races (humans) need deliberate stylistic choices per position.

Check each model's sheet against this list before you call it done, and view the team sheet for point 1.

## Quick start

    cd factory
    ./run.sh --list                                   # registered model keys
    ./run.sh --models my_model --preview              # ~3 s: 8 key poses -> out/preview/my_model.png
    ./run.sh --models a,b,c                           # full render: atlases + sheet (about 1.5-2.5 min each)
    ./run.sh --finish                                 # rebuild manifest.json and the team sheets
    ./run.sh --examples --preview --models demo_orc   # look at a demo model

`run.sh` is `$BLENDER -b --factory-startup --python lib/render.py -- <args>` with the log filtered to the
lines that matter (`PREVIEW`, `DONE`, `SKIP`, `FAILED`, `NO SPEC`, tracebacks). Other options:
`--anims idle,run`, `--facings se,e`, `--out DIR`, `--force`, `--all`.

- **Resumable:** every animation of a model is cached in `out/cache/<model>/`. A finished model is
  skipped. After an interruption, run the same command again.
- **You changed a spec:** preview does not use the cache. For a full render pass `--force`, otherwise
  the finished model is skipped and cached animations are reused.
- **Parallel:** a lock file per model stops two processes rendering the same model, so you can start
  two processes on overlapping lists. Run `--finish` once at the end: two processes finishing at the
  same time can leave `manifest.json` one model short.
- **A model that throws** is reported as `FAILED <key>` with the traceback and the run continues.
- **A team file that fails to import** is reported as `TEAM FILE ERROR` and its models show `NO SPEC`.

## Adding a model

    # teams/my_team.py
    from lib import Biped, register, palette, parts, core

    @register
    class OrcBlitzer(Biped):
        """One line saying what makes this position recognisable."""
        key = "orc_blitzer"            # the game's model key (see reference/rosters.json)
        race = "orc"                   # proportion preset + default skin/head (table below)
        knobs = dict(shoulders=1.35)   # optional proportion overrides
        layout = dict(jersey="kit1", legs="kit2", pads="football", pad_mat="kit1", pad_trim="kit2",
                      helm="skull", belt="leather", boots="boot")
        stance = dict(lean=6, legs={"l": (5, 14, 8), "r": (-4, 14, 8)},
                      arms={"l": (8, 34, 44), "r": (8, 34, 44)}, hands="fist")
        stride, jump = 32, 0.12        # heavier feel than the defaults (38, 0.2)
        height = 1.0                   # 0.9..1.1 of today's idle height

        def idle(self, ph, p, w):      # personality: pounds a fist into his palm
            p["arms"] = {"l": (30 + 30 * w["up"], 20, 80, -20), "r": (30 + 30 * w["up"], 20, 80, -20)}

        def extras(self, J, P, L, tag, pose):   # model-specific parts, drawn last
            parts.rod(J, "r", tag, length=0.8, head="club")     # never anything ball-like

Rules:

- `key` must be the model key from `reference/rosters.json`. Each key is registered by exactly one
  team file (registering a key twice from two files is an error).
- Geometry is in metres, standing on z = 0 at the origin, facing -Y. **Overall size does not matter**:
  the driver scales every model so its idle `se` height equals today's sprite times `height`.
  Only proportions matter.
- Shared parts for your team go in your team file (a function, or a base class your models inherit).

### Size calibration rule

The target is the height of `idle/se/0` in `reference/today/<model>/base.json`, times the spec's
`height` factor. Keep `height` within 0.9..1.1. The driver prints the result:
`DONE thrall ... idle=41px (today 42)`. If a model has no reference sprite, set `target_px` on the class.
The output frame is today's square frame size; it grows in steps of 32 only if a pose does not fit.
`CLIPPED` in the log means a pose is larger than the largest frame tried: make the pose smaller.

## Body plans

All are in `lib/plans.py`; the docstrings there are the full reference.

### Biped (`from lib import Biped`)

Class attributes: `race`, `sex` ("m"/"f"), `knobs`, `layout`, `stance`, `stride`, `arm_swing`,
`run_lean`, `jump`, `height`, `lie` (lift when lying, about half the body depth), `lie_shift`
(how far it slides forward while falling so the lying body stays on its square; about 0.75 for a human,
1.0 for a big guy).

Races (presets in `plans.RACES`): human, elf, dwarf, halfling, gnome, goblin, snotling, orc, black_orc,
ogre, troll, minotaur, rat_ogre, skaven, saurus, skink, kroxigor, beastman, skeleton, zombie, mummy,
ghoul, wight, flesh_golem, werewolf, yhetee, treeman. The Vargheist is a custom `build()` in
`teams/vampire.py` (an example of bypassing the generic dress entirely).
The presets are starting points, only spot-checked (orc, dwarf, skaven, saurus, skeleton, minotaur and
treeman were previewed); adjust with `knobs`.

Proportion knobs (factors relative to a human, default 1): `legs`, `arms` (length), `limb`, `arm`
(thickness), `shoulders`, `torso`, `belly`, `torso_len`, `head`, `hands`, `feet`, `hips`, `neck`,
`hunch` (degrees), `head_fwd` (metres), `digi` (True = digitigrade legs).

Layout keys (materials are palette keys; switches are True or a material):

| Area | Keys |
|---|---|
| Body materials | `skin`, `torso`, `arms`, `forearms`, `legs`, `gloves`, `boots`, `cuff` (boot cuff, None to drop) |
| Head | `head` ("human" default, "snout", "skull"), `eyes` ("red", "dark", None), `ears` ("human", "pointed"; snout heads: "bat", "rat", "wolf", "bull", "none"), `fangs`, `lip`, `brow`, `visor` |
| Snout head | `snout=(length, width)`, `eye_mat`, `snout_mat`, `nose_mat`, `crest` (material) |
| Hair | `hair` ("slick", "long" = high ponytail, "swept", "short", "braid", "bun", None), `hair_mat`, `tie`, `helm_tail`, `scarf` (material), `beard` (material), `beard_len` |
| Headgear | `helm` ("open", "kettle", "skull", "winged", "gridiron", "hood"), `helm_mat`, `helm_wings` (material), `plume` (material), `fins` ("bat", "swept", "crest"), `bars`, `maskfangs`, `hood_mat`, `trim` |
| Torso | `jersey`, `shorts`, `coat` ("frock", "tails", "gambeson", "robe"), `coat_mat`, `hem`, `lapels`, `tabard`, `tabard_trim`, `loin`, `loin_trim`, `breast` (material), `emblem`, `gorget`, `neckband`, `belt`, `buckle`, `collar`, `collar_mat`, `cape` ("long", "short"), `cape_mat`, `cape_lining` |
| Arms and legs | `pads` ("plate", "big", "leather", "football", "football_big", "football_small"), `pad_mat`, `pad_trim`, `pad_sides` (("l",) for one shoulder), `spikes` (1 or 2), `neckroll`, `gauntlets`, `bracers`, `wraps`, `arm_band`, `sleeve_cuff`, `greaves`, `kneecops`, `knee_mat`, `pant_stripe` |
| Race parts | `tail` (dict: len, r, mat, up, tip), `horns` ("bull", "ram", "goat", "small"), `horn_mat`, `tusks`, `wings`, `claws` (length), `finger` |
| Switches | `no_legs`, `no_arms` (hands only), `hunch` (extra stoop) |

Hooks: `idle(ph, pose, w)`, `adjust(name, i, pose)` (change any animation frame),
`extras(J, P, L, tag, pose)` (add parts). `J` is the joint dict: `J["head"]`, `J["neck"]`, `J["pelvis"]`,
`J["arms"]["l"]` = [shoulder, elbow, wrist, hand tip], `J["legs"]["r"]` = [hip, knee, ankle, toe],
axes `J["X"]` (side), `J["F"]` (forward), `J["B"]` (back), `J["u"]` (up the spine), and after the body is
built `J["grip_l"]`, `J["grip_r"]` (hand grip frames) and `J["head_R"]`, `J["head_s"]`.
Useful helpers: `core.surf(J, P, height, angle_deg, offset)` (a point on the torso surface, angle 0 =
front), `core.tband(name, J, P, [heights], material)` (a band around the torso).

### Quadruped, Centaur, Vehicle, Floating

- `Quadruped`: `body=(length, radius)`, `leg_len`, `leg_r`, `skin`, `head` (snout-head layout dict),
  `head_size`, `tail`, `coat` (kit blanket material), `collar`, hook `extras(J, tag, pose, centre)`.
  Pose keys: `legs4`, `nod`, `jaw`, `tail`.
- `Centaur(Biped)`: a biped torso mounted on a nested `Body(Centaur.Body)` quadruped. It falls onto
  its side.
- `Vehicle`: `size`, `drum`, `wheels`, `hull`, `trim`, `roof`, `funnel`, `driver` (a Biped class whose
  torso rides on the chassis), hook `extras(tag, pose, centre)`. It "falls" by tipping onto its side.
- `Floating(Biped)`: legless, robed, hovering. It glides for `run` and sinks into a heap for `fall`.

These four are working bases, each tested with one demo model in `teams/_examples.py`
(`demo_fox`, `demo_centaur`, `demo_roller`, `demo_wraith`). They are plainer than the biped; expect to
add detail in `extras()` or to subclass and override `build()`.

## Parts

- `lib/core.py` (from the approved concept): `helmet`, `crest`, `collar`, `cape`, `skirt`, `panel`,
  `lapels`, `belt`, `breastplate`, `gorget`, `pauldrons`, `wing`, plus the mesh helpers `ellipsoid`,
  `ball_at`, `cap` (a shell: helmets, plate rims), `cone`, `flat_cone` (blades, ears, fins), `box`,
  `tube`, `loft`, `sheet`.
- `lib/parts.py`: `snout_head`, `skull_head`, `tail`, `horns`, `tusks`, `beard`, `rod` (a held shaft:
  club, hammer, blade, pole), `foliage`, `cylinder`, `head_frame`.
- Materials are palette keys: see `lib/palette.py` (`RAMPS`, `FLAT`). Add your own with
  `palette.ramp(name, dark, mid, light)`, `palette.flat(name, hex)` or `palette.alias(name, existing)`
  at the top of your team file. Existing entries cannot be changed. Keep new colours few: every ramp
  adds to the shared master palette.

## Animations

Six animations, 8 frames each, 8 facings (`s, se, e, ne, n, nw, w, sw`; rotation follows `DIRECTIONS`
in `reference/blender_players.py`, so **`se` is the view facing the camera** and `e` is a three-quarter
view to screen right).

| Name | Played by the game | Default |
|---|---|---|
| `idle` | yes, loops | two-state breathing + your `idle` hook |
| `run` | yes, loops | run cycle from `stride`, `arm_swing`, `run_lean` |
| `fall` | yes; last frame is held for Prone / Stunned | staggers and ends lying on its back |
| `cheer` | yes, loops | arms up, hops by `jump` |
| `block` | not yet | wind back, shove with both palms, recover |
| `pass` | not yet | empty-handed wind-up, release, follow-through |

Pose keys are documented at the top of `lib/anim.py`. Whole-figure keys work for every plan:
`pitch`, `roll`, `hop`, `shift`, `squash`.

### The idle personality hook

    def idle(self, ph, p, w):
        ...

`ph` is the loop phase 0..1, `p` the default idle pose (change it in place), `w` periodic helpers:
`w["s1"]`, `w["c1"]`, `w["s2"]` (sines), `w["up"]`, `w["dn"]` (half waves), `w["breath"]` (0 or 1),
`w["a"]` (angle). Rules that keep the loop clean:

- Use only periodic terms, so frame 7 flows into frame 0.
- Move large body parts in **two states** (`w["breath"]`, or `1 if w["s1"] > 0 else -1`), not with a
  continuous sine: a continuous sub-pixel drift makes the whole figure crawl. Continuous motion is fine
  for limbs, heads, tails and jaws.
- One clear gesture reads better at 42 px than several small ones. Hands are 3-4 pixels.
- Per-hand shapes: `p["hand_modes"] = {"r": "fist"}`. Per-frame layout changes:
  `p["layout"] = {"wing_scale": 1.05}`.

## Layers and the kit rule

- Paint team-coloured areas with the materials `kit1` (primary) and `kit2` (secondary). Nothing else is
  tinted.
- The driver writes `base` (whole figure with outline; kit areas neutral grey), `kit1` and `kit2`
  (only those pixels, as a three-step grey ramp). The game multiplies the kit layers by the team colours,
  so shading survives tinting. The lit-side outline pixels next to a kit area are in the kit layer too.
- Review sheets tint the layers with a default colour pair per team (`palette.TEAM_COLOURS`); the game
  supplies the real colours.
- Check that both kit colours are visible in the `se` and `n` facings, not only from one side.

## The look (do not change)

Rendered at game size with no anti-aliasing and one sample per pixel. Each material is a three-tone ramp
picked from the lighting, with a one-pixel checker dither locked to the screen where tones meet, inner
lines where two large parts of the same colour overlap, and a one-pixel outline that is near-black on
the shadow side and a dark fill tone on the lit side. Every pixel is a master-palette colour.

## Performance

Measured on this machine with two Blender processes side by side: about 95-135 s per model for the
full set (five Vampire models took 330 s of wall time on two processes) (6 animations x 8 facings x 8 frames = 384 frames, each rendered twice), roughly 0.25-0.35 s
per frame; preview about 3 s. The larger and more detailed the model, the slower (the Vargheist is the
slowest). 130 models at about 2 minutes each is about 4.5 process-hours, or about 25 minutes of wall
time on 12 processes if the machine keeps up. If time runs short, render the four animations the game
plays first (`--anims idle,run,fall,cheer`, about two thirds of the time) and add `block,pass` later
with the same command without `--anims`.

## Known limits

- Rosters list model keys that the body plans cover only roughly; several races were never previewed.
- `fall` for bipeds always goes onto the back; override `pose()` or use `adjust()` for something else.
- The fallen figure is foreshortened in the `se` and `nw` facings (it lies along the view direction).
- Faces are still noisy at 42 px; headgear and hair read better than facial features.
- The quadruped, vehicle and floating plans have simple animation sets.
