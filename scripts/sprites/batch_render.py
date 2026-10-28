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


def option(name, default):
    """Pop `--name value` from args."""
    if f"--{name}" not in args:
        return default
    i = args.index(f"--{name}")
    value = args[i + 1]
    del args[i:i + 2]
    return value


style = option("style", "neon")
animations = option("anims", "idle").split(",")
sizes = option("sizes", "lo,hi").split(",")
out, ids = args[0], args[1:] or list(g["MODELS"])
log = open(os.path.join(out, "progress.log"), "a")


def done(model_id):
    meta = os.path.join(out, model_id, "meta.json")
    if not os.path.exists(meta):
        return False
    m = json.load(open(meta))
    return set(sizes) <= set(m["sizes"]) and set(animations) <= set(m["animations"])


log.write(f"start {time.strftime('%H:%M:%S')} {len(ids)} models\n")
log.flush()
for model_id in ids:
    if done(model_id):
        continue
    try:
        r = g["render_models"]([model_id], out, sizes=sizes, style=style, animations=animations)[0]
        log.write(f"ok {model_id} frame={r['frame']} {r['seconds']}s\n")
    except Exception:
        log.write(f"FAIL {model_id}\n{traceback.format_exc()}\n")
    log.flush()
log.write(f"end {time.strftime('%H:%M:%S')}\n")
log.close()
