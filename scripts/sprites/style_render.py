"""Headless: render idles, and falls for players lying in the dugout, in one style.

    blender.exe -b --factory-startup --python style_render.py -- OUT STYLE idle_id ... [--falls fall_id ...]

Idles go to OUT/idle/<id> at the smallest frame that fits, as render_models.py
does. Falls go to OUT/falls/<id>, in a wider frame since the body ends up
lying along the ground; they get their own root because render_all's
meta.json lists only the animations it rendered.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
g = {"__name__": "bbstyle"}
for name in ("blender_players.py", "model_kit.py", "team_models.py", "render_models.py"):
    with open(os.path.join(HERE, name)) as fh:
        exec(fh.read(), g)

FALL_FRAME_LO = 160

args = sys.argv[sys.argv.index("--") + 1:]
out, style, rest = args[0], args[1], args[2:]
idle_ids = rest[:rest.index("--falls")] if "--falls" in rest else rest
fall_ids = rest[rest.index("--falls") + 1:] if "--falls" in rest else []
for r in g["render_models"](idle_ids, os.path.join(out, "idle"), sizes=("lo",), style=style):
    print("idle ok", r["id"])
for model_id in fall_ids:
    g["build_model"](g["MODELS"][model_id], style)
    g["render_all"](os.path.join(out, "falls", model_id), "lo", animations=["fall"], frame=FALL_FRAME_LO)
    print("fall ok", model_id)
