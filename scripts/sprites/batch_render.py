"""Headless batch: render the idle of every model, or the ones named.

    blender.exe -b --factory-startup --python batch_render.py -- OUT_DIR [model_id ...]

Skips a model whose meta.json already lists both sizes, so a rerun resumes.
Progress goes to OUT_DIR/progress.log, one line per model.
"""

import json
import os
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
g = {"__name__": "bbmodels"}
for name in ("blender_players.py", "model_kit.py", "team_models.py", "render_models.py"):
    with open(os.path.join(HERE, name)) as fh:
        exec(fh.read(), g)

args = sys.argv[sys.argv.index("--") + 1:]
out, ids = args[0], args[1:] or list(g["MODELS"])
log = open(os.path.join(out, "progress.log"), "a")


def done(model_id):
    meta = os.path.join(out, model_id, "meta.json")
    return os.path.exists(meta) and {"lo", "hi"} <= set(json.load(open(meta))["sizes"])


log.write(f"start {time.strftime('%H:%M:%S')} {len(ids)} models\n")
log.flush()
for model_id in ids:
    if done(model_id):
        continue
    try:
        r = g["render_models"]([model_id], out)[0]
        log.write(f"ok {model_id} frame={r['frame']} {r['seconds']}s\n")
    except Exception:
        log.write(f"FAIL {model_id}\n{traceback.format_exc()}\n")
    log.flush()
log.write(f"end {time.strftime('%H:%M:%S')}\n")
log.close()
