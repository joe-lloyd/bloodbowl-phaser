"""Clean up and upscale the shipped vampire atlases, for side-by-side review.

    python3 shipped_pass.py OUT

Reads public/sprites/bloodbowl/<model>/{base,kit1,kit2} and writes strips in
the same shape pixel_pass.py writes, one per animation, layer and treatment:

    OUT/<model>/<treatment>/<anim>_se_<layer>.png

Treatments:

- current: the shipped pixels, untouched.
- clean: near-duplicate colours merged, lone pixels removed, and a dark line
  on the shadow side where kit meets the rest of the figure.
- clean-x2, clean-x3, clean-x4: clean, scaled with Scale2x and Scale3x. The
  scaler picks every new pixel from one source neighbour, decided on the
  composite and applied to each layer, so the layers stay aligned.
"""

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3] / "public/sprites/bloodbowl"
MODELS = ("thrall", "vampire_thrower", "vampire_blitzer", "vampire_runner")
ANIMS = ("idle", "run", "block", "pass", "cheer", "fall")
LAYERS = ("base", "kit1", "kit2")
PREVIEW = {"kit1": (139, 0, 0), "kit2": (60, 54, 66)}
MERGE_DISTANCE = 14
INNER = 0.6
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


def load_frames(model, layer, anim):
    meta = json.loads((ROOT / model / f"{layer}.json").read_text())["frames"]
    sheet = Image.open(ROOT / model / f"{layer}.png").convert("RGBA")
    frames = []
    for f in range(8):
        entry = meta.get(f"{anim}/se/{f}")
        if not entry:
            break
        r, s = entry["frame"], entry["spriteSourceSize"]
        out = Image.new("RGBA", (128, 128))
        out.paste(sheet.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])), (s["x"], s["y"]))
        frames.append(out)
    return frames


def merge_map(images):
    """Map each colour to a more common one within MERGE_DISTANCE, chaining to the most common."""
    counts = {}
    for im in images:
        for n, c in im.getcolors(1 << 16) or []:
            if c[3]:
                counts[c] = counts.get(c, 0) + n
    order = sorted(counts, key=lambda c: -counts[c])
    target = {}
    for c in order:
        near = next((k for k in order if k in target and target[k] == k and dist(c, k) < MERGE_DISTANCE), None)
        target[c] = near or c
    return target


def dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a[:3], b[:3])) ** 0.5


def recolour(im, mapping):
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            p = px[x, y]
            if p[3]:
                px[x, y] = mapping.get(p, p)
    return out


def composite(layers):
    out = layers["base"].copy()
    for name in ("kit1", "kit2"):
        out.alpha_composite(tint(layers[name], PREVIEW[name]))
    return out


def tint(im, rgb):
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (r * rgb[0] // 255, g * rgb[1] // 255, b * rgb[2] // 255, a)
    return out


def owner(layers, x, y):
    for name in ("kit2", "kit1"):
        if layers[name].getpixel((x, y))[3]:
            return name
    return "base" if layers["base"].getpixel((x, y))[3] else None


def clean_frame(layers):
    """Despeckle on the composite, then line the shadow side of kit edges."""
    comp = composite(layers)
    w, h = comp.size
    c = comp.load()
    out = {name: im.copy() for name, im in layers.items()}
    px = {name: im.load() for name, im in out.items()}
    src = {name: im.load() for name, im in layers.items()}
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if not c[x, y][3]:
                continue
            around = [c[x + dx, y + dy] for dx, dy in N4]
            if around[0][3] and around[0] != c[x, y] and all(n == around[0] for n in around):
                for name in LAYERS:
                    px[name][x, y] = src[name][x, y + 1]
    comp = composite(out)
    c = comp.load()
    for y in range(h):
        for x in range(w):
            here = owner(out, x, y)
            if here is None:
                continue
            for dx, dy in N4:
                nx, ny = x + dx, y + dy
                if not (0 <= nx < w and 0 <= ny < h):
                    continue
                there = owner(out, nx, ny)
                if there and there != here and luma(c[x, y]) < luma(c[nx, ny]):
                    p = px[here][x, y]
                    px[here][x, y] = (*(round(v * INNER) for v in p[:3]), p[3])
                    break
    return out


def luma(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def scale_map(comp, factor):
    """Scale2x or Scale3x on the composite, returning the source pixel for every output pixel."""
    w, h = comp.size
    c = comp.load()

    def at(x, y):
        return c[min(max(x, 0), w - 1), min(max(y, 0), h - 1)]

    src = {}
    for y in range(h):
        for x in range(w):
            B, D, E, F, H = at(x, y - 1), at(x - 1, y), at(x, y), at(x + 1, y), at(x, y + 1)
            up, left, right, down = (x, y - 1), (x - 1, y), (x + 1, y), (x, y + 1)
            if factor == 2:
                pick = [[(x, y)] * 2 for _ in range(2)]
                if B != H and D != F:
                    if D == B:
                        pick[0][0] = left
                    if B == F:
                        pick[0][1] = right
                    if D == H:
                        pick[1][0] = left
                    if H == F:
                        pick[1][1] = right
            else:
                A, C, G, I = at(x - 1, y - 1), at(x + 1, y - 1), at(x - 1, y + 1), at(x + 1, y + 1)
                pick = [[(x, y)] * 3 for _ in range(3)]
                if B != H and D != F:
                    if D == B:
                        pick[0][0] = left
                    if (D == B and E != C) or (B == F and E != A):
                        pick[0][1] = up
                    if B == F:
                        pick[0][2] = right
                    if (D == B and E != G) or (D == H and E != A):
                        pick[1][0] = left
                    if (B == F and E != I) or (H == F and E != C):
                        pick[1][2] = right
                    if D == H:
                        pick[2][0] = left
                    if (D == H and E != I) or (H == F and E != G):
                        pick[2][1] = down
                    if H == F:
                        pick[2][2] = right
            for j in range(factor):
                for i in range(factor):
                    sx, sy = pick[j][i]
                    src[(x * factor + i, y * factor + j)] = (min(max(sx, 0), w - 1), min(max(sy, 0), h - 1))
    return src


def apply_scale(layers, factor):
    mapping = scale_map(composite(layers), factor)
    w, h = layers["base"].size
    out = {}
    for name, im in layers.items():
        s = im.load()
        big = Image.new("RGBA", (w * factor, h * factor))
        b = big.load()
        for (x, y), (sx, sy) in mapping.items():
            b[x, y] = s[sx, sy]
        out[name] = big
    return out


def treatments(frames):
    clean = [clean_frame(f) for f in frames]
    x2 = [apply_scale(f, 2) for f in clean]
    return {
        "current": frames,
        "clean": clean,
        "clean-x2": x2,
        "clean-x3": [apply_scale(f, 3) for f in clean],
        "clean-x4": [apply_scale(f, 2) for f in x2],
    }


def save_strips(dest, anim, frames):
    dest.mkdir(parents=True, exist_ok=True)
    px = frames[0]["base"].width
    for name in LAYERS:
        strip = Image.new("RGBA", (px * len(frames), px))
        for i, f in enumerate(frames):
            strip.paste(f[name], (i * px, 0))
        strip.save(dest / f"{anim}_se_{name}.png", optimize=True)


def main(out):
    for model in MODELS:
        mapping = {name: merge_map([Image.open(ROOT / model / f"{name}.png").convert("RGBA")]) for name in LAYERS}
        for anim in ANIMS:
            raw = {name: load_frames(model, name, anim) for name in LAYERS}
            frames = [{name: recolour(raw[name][i], mapping[name]) for name in LAYERS} for i in range(len(raw["base"]))]
            for name, result in treatments(frames).items():
                if name == "current":
                    result = [{n: raw[n][i] for n in LAYERS} for i in range(len(raw["base"]))]
                save_strips(out / model / name, anim, result)
        print("done", model, flush=True)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
