"""Render the five sideline models with the match's Blender camera and kit masks.

    blender -b --factory-startup --python render_sideline.py -- OUT_DIR

Stationary crew need only the two dugout facings. Medics get all eight
facings for their carrying gait. Source .blend files are saved alongside
the renders. Pack with build_game_assets.py bloodbowl OUT_DIR -.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
g = {"__name__": "sideline_render"}
for name in ("blender_players.py", "model_kit.py", "team_models.py", "sideline_models.py", "render_models.py"):
    with open(os.path.join(HERE, name)) as fh:
        exec(fh.read(), g)

out = sys.argv[sys.argv.index("--") + 1]
os.makedirs(out, exist_ok=True)
for model, spec in g["SIDELINE_MODELS"].items():
    animations = ["idle", "run"] if model == "sideline_medic" else ["idle", "cheer"]
    directions = list(g["DIRECTIONS"]) if model == "sideline_medic" else ["s", "n"]
    g["build_model"](spec, "bloodbowl")
    frame = next((px for px in g["FRAME_STEPS"] if g["fits"](px, animations)), g["FRAME_STEPS"][-1])
    dest = os.path.join(out, model)
    g["render_all"](dest, "lo", animations=animations, directions=directions, frame=frame)
    g["bpy"].ops.wm.save_as_mainfile(filepath=os.path.join(dest, model + ".blend"))
    print("rendered", model, flush=True)
