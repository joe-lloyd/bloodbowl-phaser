"""Headless: render the fall of a few models, for players lying in the dugout.

    blender.exe -b --factory-startup --python fall_render.py -- OUT_DIR model_id ...

A separate render root from the idles, because render_all's meta.json lists
only the animations it rendered. The frame is wider than an idle's since the
body ends up lying along the ground.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
g = {"__name__": "bbfall"}
for name in ("blender_players.py", "model_kit.py", "team_models.py"):
    with open(os.path.join(HERE, name)) as fh:
        exec(fh.read(), g)

FRAME_LO = 160

args = sys.argv[sys.argv.index("--") + 1:]
out, ids = args[0], args[1:]
for model_id in ids:
    g["build_model"](g["MODELS"][model_id])
    for size, px in (("lo", FRAME_LO), ("hi", FRAME_LO * 2)):
        g["render_all"](os.path.join(out, model_id), size, animations=["fall"], frame=px)
    print("fall ok", model_id)
