"""Headless driver.

  blender -b --factory-startup --python factory/lib/render.py -- --models a,b [options]

  --models a,b      model keys            --batch NAME   every model of a batch in batches.json
  --all             every registered model
  --anims idle,run  subset of animations  (default: all six)
  --facings se,e    subset of facings     (default: all eight)
  --out DIR         output root           (default: factory/out)
  --preview         fast look at a design: 8 key poses on one strip, out/preview/<model>.png; nothing cached
  --force           re-render even if cached / finished
  --finish          only rebuild manifest.json and the team sheets from the finished atlases
  --list            print the registered model keys
  --examples        also load teams/_examples.py (demo_* models showing every body plan)

Resumable and safe to run in parallel: each animation of a model is cached in out/cache/<model>/, a
finished model (sprites/<model>/meta.json) is skipped, and a lock file stops two processes rendering the
same model. After an interrupted run just start the same command again.
"""
import bpy, sys, os, json, time, shutil
import numpy as np

FACTORY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if FACTORY not in sys.path:
    sys.path.insert(0, FACTORY)
from lib import pixel, atlas, registry, palette, anim, layers

PAD = 48                    # spare canvas around today's frame, so wide poses are measured before framing
REF = os.path.join(FACTORY, "reference")
ROSTERS = json.load(open(os.path.join(REF, "rosters.json")))

def parse(argv):
    a = dict(models=[], anims=list(anim.ANIMS), facings=list(pixel.FACINGS), out=os.path.join(FACTORY, "out"),
             preview=False, force=False, finish=False, list=False, all=False, batch=None, examples=False,
             density=1, frames={}, dither=None, tones=None, layers=False, verify=0, stash=None, pack=None, bodies=[])
    it = iter(argv)
    for tok in it:
        if tok == "--models":
            a["models"] = [m for m in next(it).split(",") if m]
        elif tok == "--anims":
            a["anims"] = next(it).split(",")
        elif tok == "--facings":
            a["facings"] = next(it).split(",")
        elif tok == "--out":
            a["out"] = os.path.abspath(next(it))
        elif tok == "--batch":
            a["batch"] = next(it)
        elif tok in ("--stash", "--pack"):
            a[tok[2:]] = os.path.abspath(next(it))
        elif tok == "--bodies":
            a["bodies"] = next(it).split(",")
        elif tok in ("--density", "--tones", "--verify"):
            a[tok[2:]] = int(next(it))
        elif tok == "--frames":
            a["frames"] = frame_counts(next(it))
        elif tok == "--dither":
            a["dither"] = float(next(it))
        elif tok in ("--preview", "--force", "--finish", "--list", "--all", "--examples", "--layers"):
            a[tok[2:]] = True
        else:
            raise SystemExit("unknown argument " + tok)
    return a

def frame_counts(spec):
    """"12" sets every looping animation to 12 frames; "run=12,cheer=10" sets only those."""
    if "=" not in spec:
        return {name: int(spec) for name in anim.LOOPS}
    return {name: int(n) for name, n in (part.split("=") for part in spec.split(","))}

def today(key):
    """Today's frame size and idle height (px) for a model key, from the reference atlases."""
    key = base_key(key)
    frame = ROSTERS["models"].get(key, {}).get("frame", 128)
    height = None
    p = os.path.join(REF, "today", key, "base.json")
    if os.path.exists(p):
        fr = json.load(open(p))["frames"]
        if "idle/se/0" in fr:
            height = fr["idle/se/0"]["frame"]["h"]
    n = DENSITY[0]
    return frame * n, (height * n if height else height)

DENSITY = [1]

def base_key(key):
    """A look variant is named <model>__<look>; it is sized and coloured like its model."""
    return key.split("__")[0]

def team_colours(key):
    used = ROSTERS["models"].get(base_key(key), {}).get("used_by", [])
    team = used[0].split(" / ")[0] if used else "Human"
    return palette.TEAM_COLOURS.get(team, ("#2a4ac8", "#e8e8e8"))

def make_stage(key, out):
    frame, height = today(key)
    canvas = frame + 2 * PAD
    anchor = (canvas // 2, int(round(frame * 0.605)) + PAD)
    tmp = os.path.join(out, "cache", "_tmp", "%s_%d" % (key, os.getpid()))
    return pixel.Stage(canvas, anchor, tmp), frame, height

def calibrate(stage, model, target):
    """Scale the model so its idle se height matches today's sprite (times model.height)."""
    n = model.animations["idle"]
    pose = model.pose("idle", 0, n)
    scale = 1.0
    for _ in range(2):
        stage.build(model, pose, scale)
        b = pixel.bbox(stage.render(["se"])["se"])
        h = b[3] - b[1]
        if abs(h - target) <= 1:
            break
        scale *= (target - 2.0) / max(h - 2.0, 1.0)       # the outline adds two pixels at any scale
    return scale, h

def target_height(model, height):
    if height is None:
        height = getattr(model, "target_px", None)
        if height is None:
            raise SystemExit("model %s has no reference sprite; set target_px on its spec" % model.key)
    return height * model.height

def lock(path):
    if os.path.exists(path):
        try:
            pid = int(open(path).read() or 0)
            os.kill(pid, 0)
            return False                      # another live process owns it
        except (ValueError, ProcessLookupError, PermissionError):
            os.remove(path)                   # stale lock
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        return False
    os.write(fd, str(os.getpid()).encode())
    os.close(fd)
    return True

def remap(idx, old, cur):
    """Cached indices refer to the palette they were rendered with; convert to the current palette."""
    if list(old) == list(cur):
        return idx
    table = np.array([cur.index(h) for h in old] + [-1], dtype=np.int16)
    return table[idx]

def render_model(key, a):
    out = a["out"]
    model = registry.get(key)
    cdir = os.path.join(out, "cache", key)
    os.makedirs(cdir, exist_ok=True)
    meta_path = os.path.join(out, "sprites", key, "meta.json")
    full = set(a["anims"]) == set(model.animations) and set(a["facings"]) == set(pixel.FACINGS)
    if os.path.exists(meta_path) and not a["force"] and full:
        print("SKIP %s (finished; use --force to redo)" % key)
        return
    lk = os.path.join(cdir, ".lock")
    if not lock(lk):
        print("SKIP %s (another process is rendering it)" % key)
        return
    t0 = time.time()
    try:
        stage, frame, height = make_stage(key, out)
        target = target_height(model, height)
        scale, got = calibrate(stage, model, target)
        frames = {}
        pal = stage.pal
        for name in a["anims"]:
            n = model.animations[name]
            cpath = os.path.join(cdir, name + ".npz")
            if os.path.exists(cpath) and not a["force"]:
                z = np.load(cpath, allow_pickle=False)
                have = {k.replace("__", "/"): z[k] for k in z.files if k != "pal"}
                if all(("%s/%s/%d" % (name, f, i)) in have for f in a["facings"] for i in range(n)):
                    old = [str(h) for h in z["pal"]]
                    frames.update({k: remap(v, old, pal) for k, v in have.items()})
                    continue
            got_frames = {}
            for i in range(n):
                stage.build(model, model.pose(name, i, n), scale)
                for f, idx in stage.render(a["facings"]).items():
                    got_frames["%s/%s/%d" % (name, f, i)] = idx
            np.savez_compressed(cpath, pal=np.array(pal), **{k.replace("/", "__"): v for k, v in got_frames.items()})
            frames.update(got_frames)
        anims = {name: model.animations[name] for name in a["anims"]}
        meta = atlas.pack(out, key, frames, pal, stage.anchor, frame, PAD, anims)
        atlas.model_sheet(out, key, frames, pal, team_colours(key), anims, a["facings"])
        secs = round(time.time() - t0, 1)
        info = dict(model=key, seconds=secs, frames=len(frames), scale=round(scale, 4), idle_height=int(got),
                    today_height=height, target=round(target, 1), frame=meta["frame"], today_frame=frame, clipped=meta["clipped"])
        with open(os.path.join(cdir, "timing.json"), "w") as fh:
            json.dump(info, fh)
        print("DONE %s %ss frames=%d idle=%dpx (today %s) frame=%d%s" % (
            key, secs, len(frames), got, height, meta["frame"], " CLIPPED: content exceeds the frame" if meta["clipped"] else ""))
        shutil.rmtree(stage.tmp, ignore_errors=True)
    finally:
        if os.path.exists(lk):
            os.remove(lk)

PREVIEW = [("idle", 0, "se"), ("idle", 0, "e"), ("idle", 0, "n"), ("run", 2, "e"), ("cheer", 2, "se"), ("block", 3, "e"),
           ("pass", 4, "e"), ("fall", 7, "se")]

def preview(key, a):
    t0 = time.time()
    model = registry.get(key)
    stage, frame, height = make_stage(key, a["out"])
    target = target_height(model, height)
    scale, got = calibrate(stage, model, target)
    cells = []
    for name, i, f in PREVIEW:
        stage.build(model, model.pose(name, i, model.animations[name]), scale)
        cells.append(stage.render([f])[f])
    ys = np.concatenate([np.nonzero(c >= 0)[0] for c in cells]); xs = np.concatenate([np.nonzero(c >= 0)[1] for c in cells])
    y0, y1, x0, x1 = ys.min() - 2, ys.max() + 3, xs.min() - 2, xs.max() + 3
    strip = np.concatenate([atlas.tinted(atlas.layers(c[y0:y1, x0:x1], stage.pal), team_colours(key)) for c in cells], axis=1)
    img = atlas.on_green(strip)
    for j, (name, i, f) in enumerate(PREVIEW):
        atlas.text(img, j * (x1 - x0) * 3 + 2, 2, "%s %s" % (name, f))
    os.makedirs(os.path.join(a["out"], "preview"), exist_ok=True)
    path = os.path.join(a["out"], "preview", key + ".png")
    atlas.save_png(img, path)
    shutil.rmtree(stage.tmp, ignore_errors=True)
    print("PREVIEW %s %.1fs idle=%dpx (today %s, target %.0f) -> %s" % (key, time.time() - t0, got, height, target, path))

def finish(a):
    n, missing = atlas.write_manifest(a["out"], ROSTERS, pixel.FACINGS)
    made = 0
    for team, plist in ROSTERS["teams"].items():
        cols = palette.TEAM_COLOURS.get(team, ("#2a4ac8", "#e8e8e8"))
        made += bool(atlas.team_sheet(a["out"], team, [(p["position"], p["model"]) for p in plist], cols))
    print("FINISH manifest: %d models, %d still missing; %d team sheets" % (n, len(missing), made))

def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    a = parse(argv)
    errors = registry.load_all(FACTORY, private=a["examples"])
    if a["list"]:
        print("MODELS", " ".join(registry.keys()))
        return
    keys = list(a["models"])
    if a["batch"]:
        keys += json.load(open(os.path.join(FACTORY, "batches.json")))[a["batch"]]["models"]
    if a["all"]:
        keys += registry.keys()
    DENSITY[0] = palette.STYLE["density"] = a["density"]
    if a["dither"] is not None:
        palette.STYLE["dither"] = a["dither"]
    if a["tones"] is not None:
        palette.STYLE["tones"] = a["tones"]
    for key in keys:
        if a["frames"] and key in registry.MODELS:
            model = registry.get(key)
            model.animations = dict(model.animations, **{k: n for k, n in a["frames"].items() if k in model.animations})
        if key not in registry.MODELS:
            print("NO SPEC %s (not registered%s)" % (key, "; a team file failed to import" if errors else ""))
            continue
        try:
            if a["layers"]:
                layers.run(key, a, make_stage, target_height, calibrate, PAD)
            elif a["preview"]:
                preview(key, a)
            else:
                render_model(key, a)
        except Exception as exc:              # one broken model must not stop the batch
            import traceback
            traceback.print_exc()
            print("FAILED %s %r" % (key, exc))
    if a["finish"] or (keys and not a["preview"] and not a["layers"]):
        finish(a)

main()
