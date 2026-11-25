"""Layered output: each model is rendered once per body without its look options (the base layer), then
every option value on its own, so the game can build any look by combining layers by depth when a team
loads, instead of shipping a full render of every combination.

  blender -b --factory-startup --python lib/render.py -- --layers --models thrall,vampire_blitzer [--verify 6]

Per model it writes out/layered/<model>/rig.json and, per body and layer, <body>/<layer>.json + .bin.

A layer frame stores, for each pixel, the palette index it rendered to (before speckle removal, inner lines
and the outline), a code for the object it belongs to (0 for small parts; used for inner lines) and its
depth along the view. The game keeps the nearest pixel of all layers (a later layer wins a tie, so an
option that recolours a body part replaces it), then runs the same finishing pass as pixel.Stage.finish.

.bin: zlib-compressed planes for all frames in the json's order: palette index + 1 (0 = empty), object
code, then depth as 1..255 (0 = empty) delta-coded along each row (each byte minus the one to its left,
mod 256). json: {"frames": {"anim/facing/i": [x, y, w, h, offset]}} with x, y inside the model's frame and
offset counted in pixels from the start of each plane.

A part that removes an object the base has (a hood that hides the ears, say) cannot be expressed as a
layer; the driver prints a warning, as it does when two options change one part differently, and --verify shows how far the composite is from a full render.
"""
import bpy, os, json, glob, itertools, pickle, random, zlib
import numpy as np
from . import pixel, registry, palette, atlas

SHADE = "~shade"
VERIFY_FRAMES = [("idle", 0, "se"), ("run", 3, "e"), ("block", 4, "n"), ("fall", 7, "sw")]


def signature():
    """Per mesh object: materials, vertex count and sum, and placement; equal signatures = the same part."""
    sig = {}
    for ob in bpy.data.objects:
        if ob.type != "MESH":
            continue
        me = ob.data
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get("co", co)
        m = ob.matrix_world
        sig[ob.name] = (tuple(x.name if x else "" for x in me.materials), len(me.vertices), round(float(co.sum(dtype=np.float64)), 3),
                        tuple(round(v, 4) for v in m.translation), tuple(round(v, 4) for v in m.to_quaternion()))
    return sig


def plan(key):
    """[(body, default model, base model, [(layer name, part model, choice)])] for a model key."""
    spec = registry.LOOKS.get(key)
    if spec is None:
        model = registry.get(key)
        return [(getattr(model, "sex", "x"), model, model, [])], []
    body_name, _, bodies = spec.options[0]
    slots = spec.options[1:]
    out = []
    for body, _ in bodies:
        default = spec.variant(dict({body_name: body}, **{s: vals[0][0] for s, _, vals in slots}))
        base = spec.variant({body_name: body})
        parts = [("%s.%s" % (s, v), spec.variant({body_name: body, s: v}), (s, v))
                 for s, _, vals in slots for v, _ in vals if spec.part(s, v, body) is not None]
        out.append((body, default, base, parts))
    return out, spec.options


def crop(res):
    idx, code, depth = res
    ys, xs = np.nonzero(idx >= 0)
    if len(ys) == 0:
        return None
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return (int(x0), int(y0), idx[y0:y1, x0:x1], code[y0:y1, x0:x1], depth[y0:y1, x0:x1])


def shade(base_res, shaded_res):
    """Base pixels that a part's shadow changes: the darker index there, -1 elsewhere."""
    b, s = base_res[0], shaded_res[0]
    changed = (b >= 0) & (s >= 0) & (b != s)
    idx = np.where(changed, s, -1).astype(np.int16)
    return idx, np.zeros_like(base_res[1]), np.where(changed, 0.0, np.inf).astype(np.float32)


def overlaps(changes):
    """{"a.x + b.y": message} for parts of two options that change one object differently. Only one copy can
    show in the game, and not always the one a full render of the look draws."""
    found = {}
    for (one, first, a), (other, second, b) in itertools.combinations(changes, 2):
        shared = sorted(k for k in a.keys() & b.keys() if a[k] != b[k])
        if one != other and shared:
            found["%s + %s" % (first, second)] = "both change %s" % shared[:6]
    return found


def render_body(stage, scale, default, base, parts, a, warnings):
    """{layer: {"anim/facing/i": cropped (x0, y0, idx, code, depth) or None}} for one body. Each part has a
    "<part>~shade" layer too: the base pixels its shadow darkens."""
    store = {"base": {}}
    store.update({name: {} for name, _, _ in parts})
    store.update({name + SHADE: {} for name, _, _ in parts})
    for name in a["anims"]:
        n = default.animations[name]
        for i in range(n):
            pose = default.pose(name, i, n)
            stage.build(base, pose, scale)
            base_sig = signature()
            base_res = stage.render_layer(a["facings"])
            for f, res in base_res.items():
                store["base"]["%s/%s/%d" % (name, f, i)] = crop(res)
            changes = []
            for lname, model, (slot, _) in parts:
                stage.build(model, pose, scale)
                sig = signature()
                keep = {k for k, v in sig.items() if base_sig.get(k) != v}
                gone = sorted(set(base_sig) - set(sig))
                if gone:
                    warnings.setdefault(lname, "removes base objects %s" % gone[:6])
                changes.append((slot, lname, {k: sig[k] for k in keep}))
                if not keep <= set(base_sig):    # a part that only recolours the base casts the base's shadows
                    unchanged = {k for k in sig if k not in keep}
                    for f, res in stage.render_layer(a["facings"], unchanged, data=False).items():
                        store[lname + SHADE]["%s/%s/%d" % (name, f, i)] = crop(shade(base_res[f], res))
                for f, res in stage.render_layer(a["facings"], keep).items():
                    store[lname]["%s/%s/%d" % (name, f, i)] = crop(res)
            warnings.update(overlaps(changes))
        print("LAYERS %s %s done" % (default.key, name), flush=True)
    return store


def depth_range(store):
    vals = [c[4][np.isfinite(c[4])] for name, frames in store.items() if not name.endswith(SHADE)
            for c in frames.values() if c is not None]
    vals = np.concatenate(vals)
    return float(vals.min()), float(vals.max())


def quantize(depth, rng):
    lo, hi = rng
    q = 1 + np.round((depth - lo) / max(hi - lo, 1e-6) * 254)
    return np.where(np.isfinite(depth), np.clip(q, 1, 255), 0).astype(np.uint8)


def composite(cells, shape, shades=()):
    """Nearest pixel of all layers (later layers win ties), on a full canvas, rows top-down; then each shade
    darkens the pixels where the base layer won. The base must be the first cell."""
    idx = np.full(shape, -1, np.int16)
    code = np.zeros(shape, np.int16)
    depth = np.full(shape, 256, np.int16)
    from_base = np.zeros(shape, bool)
    for n, (x0, y0, i, c, d) in enumerate(cells):
        h, w = i.shape
        sl = (slice(y0, y0 + h), slice(x0, x0 + w))
        take = (i >= 0) & (d <= depth[sl])
        idx[sl] = np.where(take, i, idx[sl])
        code[sl] = np.where(take, c, code[sl])
        depth[sl] = np.where(take, d, depth[sl])
        from_base[sl] = np.where(take, n == 0, from_base[sl])
    for x0, y0, i in shades:
        h, w = i.shape
        sl = (slice(y0, y0 + h), slice(x0, x0 + w))
        idx[sl] = np.where((i >= 0) & from_base[sl], i, idx[sl])
    return idx, code


def look_cells(store, names, frame, rng):
    """(cells, shades) of a frame for the given layer names, base first, as the game combines them."""
    cells = [(c[0], c[1], c[2], c[3], quantize(c[4], rng)) for c in (store[nm].get(frame) for nm in names) if c is not None]
    shades = [(c[0], c[1], c[2]) for c in (store.get(nm + SHADE, {}).get(frame) for nm in names[1:]) if c is not None]
    return cells, shades


def finished(stage, idx, code):
    return stage.finish(idx[::-1], code[::-1], (idx >= 0)[::-1])[::-1]


def verify(stage, scale, spec, body, default, store, rng, count, seed=7):
    """Render whole looks and compare them with layer composites; prints differing pixels per frame."""
    if spec is None:
        return
    body_name, _, _ = spec.options[0]
    slots = spec.options[1:]
    rnd = random.Random(seed)
    looks = [{s: vals[0][0] for s, _, vals in slots}] + [{s: rnd.choice(vals)[0] for s, _, vals in slots}
                                                          for _ in range(count)]
    shape = (stage.canvas, stage.canvas)
    worst, compared = 0, False
    for choice in looks:
        model = spec.variant(dict(choice, **{body_name: body}))
        names = ["base"] + ["%s.%s" % (s, v) for s, v in choice.items() if ("%s.%s" % (s, v)) in store]
        diffs = []
        for anim_name, i, f in VERIFY_FRAMES:
            if anim_name not in default.animations:
                continue
            n = default.animations[anim_name]
            k = "%s/%s/%d" % (anim_name, f, i % n)
            if k not in store["base"]:
                continue
            stage.build(model, default.pose(anim_name, i % n, n), scale)
            full = stage.render([f])[f]
            cells, shades = look_cells(store, names, k, rng)
            mine = finished(stage, *composite(cells, shape, shades))
            diffs.append(int((mine != full).sum()))
        worst = max([worst] + diffs)
        compared = compared or bool(diffs)
        print("VERIFY %s %s %s diff px %s" % (default.key, body, "-".join(choice.values()), diffs), flush=True)
    if compared:
        print("VERIFY %s %s worst %d px" % (default.key, body, worst), flush=True)
    else:
        print("VERIFY %s %s compared no frames: verify samples %s, and this run rendered none of them" % (
            default.key, body, ", ".join("%s/%s/%d" % (name, f, i) for name, i, f in VERIFY_FRAMES)), flush=True)


def tables(stage):
    pal = stage.pal
    return {"colors": pal, "keep": [int(i) for i in stage.keep], "darker": [int(i) for i in stage.darker],
            "rampDark": [int(i) for i in stage.ramp_dark], "outline": int(stage.out_i), "void": int(stage.void_i),
            "kit": {kit: [pal.index(h) for h in palette.KIT_MARKERS[kit] if h in pal] for kit in ("kit1", "kit2")}}


def write_layer(path, frames, window, rng):
    ox, oy, size = window
    order = sorted(k for k, c in frames.items() if c is not None)
    meta, planes, offset = {}, [[], [], []], 0
    for k in order:
        x0, y0, idx, code, depth = frames[k]
        x1, y1 = min(x0 + idx.shape[1], ox + size), min(y0 + idx.shape[0], oy + size)
        cx, cy = max(x0, ox), max(y0, oy)
        if x1 <= cx or y1 <= cy:
            continue
        sl = (slice(cy - y0, y1 - y0), slice(cx - x0, x1 - x0))
        i, c, q = (idx[sl] + 1).astype(np.uint8), code[sl].astype(np.uint8), quantize(depth[sl], rng)
        delta = q.copy()
        delta[:, 1:] = q[:, 1:] - q[:, :-1]
        for plane, arr in zip(planes, (i, c, delta)):
            plane.append(arr.ravel())
        meta[k] = [cx - ox, cy - oy, x1 - cx, y1 - cy, offset]
        offset += i.size
    blob = b"".join(np.concatenate(p).tobytes() if p else b"" for p in planes)
    with open(path + ".bin", "wb") as fh:
        fh.write(zlib.compress(blob, 9))
    with open(path + ".json", "w") as fh:
        json.dump({"frames": meta, "pixels": offset}, fh, separators=(",", ":"))
    return os.path.getsize(path + ".bin")


def golden(stage, store, rng, window, layers_used):
    """The finished frame "idle/se/0" of a look, cropped to the model's frame, run-length coded, for the
    game's unit test of its own compositor."""
    ox, oy, size = window
    name = "idle/se/0"
    cells, shades = look_cells(store, layers_used, name, rng)
    done = finished(stage, *composite(cells, (stage.canvas, stage.canvas), shades))[oy:oy + size, ox:ox + size].ravel()
    rle, last, count = [], None, 0
    for v in done.tolist():
        if v == last:
            count += 1
            continue
        if last is not None:
            rle.append([last, count])
        last, count = v, 1
    rle.append([last, count])
    return {"frame": name, "layers": layers_used, "rle": rle}


def run(key, a, make_stage, target_height, calibrate, pad):
    """Render a model's layers and write them, or with --stash render some bodies and animations into a
    stash folder, and with --pack merge a stash into the output (verification and goldens run there)."""
    bodies, options = plan(key)
    if a["bodies"]:
        bodies = [b for b in bodies if b[0] in a["bodies"]]
    for _, default, _, _ in bodies:
        default.animations = dict(default.animations, **{k: n for k, n in a["frames"].items() if k in default.animations})
    warnings = {}
    if a["pack"]:
        stores = unstash(a["pack"], key, warnings)
    else:
        stores = {}
        for body, default, base, parts in bodies:
            stage, frame, height = make_stage(key, a["out"])
            scale, got = calibrate(stage, default, target_height(default, height))
            stores[body] = render_body(stage, scale, default, base, parts, a, warnings)
            print("BODY %s %s idle=%dpx" % (key, body, got), flush=True)
    if a["stash"]:
        os.makedirs(a["stash"], exist_ok=True)
        tag = "-".join(a["anims"])
        for body, store in stores.items():
            path = os.path.join(a["stash"], "%s__%s__%s.pkl" % (key, body, tag))
            with open(path + ".part", "wb") as fh:
                pickle.dump({"store": store, "warnings": warnings}, fh, protocol=pickle.HIGHEST_PROTOCOL)
            os.replace(path + ".part", path)
        print("STASHED %s %s %s" % (key, sorted(stores), tag), flush=True)
        return
    finish_model(key, a, (bodies, options, stores, warnings), (make_stage, target_height, calibrate, pad))


def unstash(folder, key, warnings):
    stores = {}
    for path in sorted(glob.glob(os.path.join(folder, key + "__*.pkl"))):
        body = os.path.basename(path).split("__")[1]
        with open(path, "rb") as fh:
            chunk = pickle.load(fh)
        warnings.update(chunk["warnings"])
        store = stores.setdefault(body, {})
        for lname, frames in chunk["store"].items():
            store.setdefault(lname, {}).update(frames)
    return stores


def finish_model(key, a, rendered, helpers):
    bodies, options, stores, warnings = rendered
    make_stage, target_height, calibrate, pad = helpers
    spec = registry.LOOKS.get(key)
    ranges = {body: depth_range(store) for body, store in stores.items()}
    stage, frame = None, 0
    for body, default, _, _ in bodies:
        stage, frame, height = make_stage(key, a["out"])
        if a["verify"] and body in stores:
            scale, _ = calibrate(stage, default, target_height(default, height))
            verify(stage, scale, spec, body, default, stores[body], ranges[body], a["verify"])
    for lname, problem in warnings.items():
        print("WARN %s %s %s" % (key, lname, problem), flush=True)
    boxes = [(c[0], c[1], c[0] + c[2].shape[1], c[1] + c[2].shape[0])
             for store in stores.values() for frames in store.values() for c in frames.values() if c is not None]
    for body, _, _, parts in bodies:
        for lname, _, _ in parts:
            drawn = [c for suffix in ("", SHADE) for c in stores.get(body, {}).get(lname + suffix, {}).values()]
            if drawn and all(c is None for c in drawn):
                print("WARN %s %s draws nothing on body %s" % (key, lname, body), flush=True)
    frame, anchor, (ox, oy), clipped = atlas.choose_frame(boxes, stage.anchor, frame, pad)
    out = os.path.join(a["out"], "layered", key)
    sizes = {}
    for body in stores:
        stores[body] = {k: v for k, v in stores[body].items() if any(c is not None for c in v.values())}
    for body, store in stores.items():
        os.makedirs(os.path.join(out, body), exist_ok=True)
        for lname, frames in store.items():
            sizes["%s/%s" % (body, lname)] = write_layer(os.path.join(out, body, lname), frames, (ox, oy, frame), ranges[body])
    defaults = dict((o[0], o[2][0][0]) for o in options[1:])
    goldens = {}
    for body, _, _, parts in bodies:
        own = [name for name, _, (s, v) in parts if defaults.get(s) == v and name in stores[body]]
        goldens[body] = golden(stage, stores[body], ranges[body], (ox, oy, frame), ["base"] + own)
    with open(os.path.join(out, "golden.json"), "w") as fh:
        json.dump(goldens, fh, separators=(",", ":"))
    default = bodies[0][1]
    rig = {"version": 1, "density": a["density"], "frame": int(frame), "anchor": [float(anchor[0]), float(anchor[1])],
           "animations": {k: default.animations[k] for k in a["anims"]}, "facings": a["facings"],
           "options": options, "bodies": {body: sorted(store) for body, store in stores.items()},
           "palette": tables(stage), "clipped": bool(clipped)}
    with open(os.path.join(out, "rig.json"), "w") as fh:
        json.dump(rig, fh, separators=(",", ":"))
    total = sum(sizes.values())
    print("DONE %s layered frame=%d %d layers %.1f MB%s" % (key, frame, len(sizes), total / 1e6,
                                                           " CLIPPED" if clipped else ""), flush=True)
