"""Keep a layer pixel's depth only where it decides anything, so the layer files compress better.

    python3 flat_depth.py [model ...]

The game keeps the nearest pixel of the layers it combines, starting from a depth no layer reaches, so a
pixel's depth matters only where two layers of the same folder can both cover it in the same frame.
Everywhere else this stores the depth of the kept pixel to its left, which delta-codes to 0, and zlib
packs the depth plane far smaller. Any set of layers still composes to the same pixels: the script
checks that every pixel two layers cover keeps its depth. Shade layers carry no depth and stay as they
are. install_layered.py runs it on the unpacked .json/.bin layers before writing the portrait copies and
packing them into .layer files, so it finds nothing to do on a packed model. Running it twice changes
nothing.
"""
import json
import sys
import zlib
from multiprocessing import Pool
from pathlib import Path

SPRITES = Path(__file__).resolve().parents[3] / "public" / "sprites" / "bloodbowl"
SHADE = "~shade"
WORKERS = 4


def read_layer(index):
    meta = json.loads(index.read_text())
    packed = index.with_suffix(".bin").read_bytes()
    planes = bytearray(zlib.decompress(packed))
    if len(planes) != meta["pixels"] * 3:
        raise SystemExit(f"{index}: {len(planes)} bytes, expected {meta['pixels'] * 3}")
    return meta, planes, packed


def coverage(layers):
    """Per frame, how many layers draw each pixel (capped at 2), on the union of their rectangles."""
    boxes = {}
    for meta, _, _ in layers:
        for name, (x, y, w, h, _) in meta["frames"].items():
            x0, y0, x1, y1 = boxes.get(name, (x, y, x + w, y + h))
            boxes[name] = (min(x0, x), min(y0, y), max(x1, x + w), max(y1, y + h))
    counts = {name: (x0, y0, x1 - x0, bytearray((x1 - x0) * (y1 - y0))) for name, (x0, y0, x1, y1) in boxes.items()}
    for meta, planes, _ in layers:
        for name, (x, y, w, h, offset) in meta["frames"].items():
            x0, y0, width, count = counts[name]
            for row in range(h):
                source = offset + row * w
                dest = (y + row - y0) * width + x - x0
                for i in range(w):
                    if planes[source + i] and count[dest + i] < 2:
                        count[dest + i] += 1
    return counts


def flatten_layer(meta, planes, counts):
    pixels = meta["pixels"]
    depth = 2 * pixels
    for name, (x, y, w, h, offset) in meta["frames"].items():
        x0, y0, width, count = counts[name]
        for row in range(h):
            source = offset + row * w
            dest = (y + row - y0) * width + x - x0
            actual = written = 0
            for i in range(w):
                actual = (actual + planes[depth + source + i]) & 255
                if planes[source + i] and count[dest + i] > 1:
                    planes[depth + source + i] = (actual - written) & 255
                    written = actual
                else:
                    planes[depth + source + i] = 0
    return planes


def check(meta, before, after, counts):
    """Every pixel two layers cover decodes to the same depth as before."""
    depth = 2 * meta["pixels"]
    for name, (x, y, w, h, offset) in meta["frames"].items():
        x0, y0, width, count = counts[name]
        for row in range(h):
            source = offset + row * w
            dest = (y + row - y0) * width + x - x0
            old = new = 0
            for i in range(w):
                old = (old + before[depth + source + i]) & 255
                new = (new + after[depth + source + i]) & 255
                if before[source + i] and count[dest + i] > 1 and old != new:
                    raise SystemExit(f"{name} row {row} pixel {i}: depth {old} became {new}")


def flatten_folder(folder):
    indexes = sorted(p for p in folder.glob("*.json") if SHADE not in p.name)
    layers = [read_layer(index) for index in indexes]
    counts = coverage(layers)
    before = after = 0
    for index, (meta, planes, packed) in zip(indexes, layers):
        original = bytes(planes)
        flat = flatten_layer(meta, planes, counts)
        check(meta, original, flat, counts)
        repacked = packed if flat == original else zlib.compress(bytes(flat), 9)
        if len(repacked) < len(packed):
            index.with_suffix(".bin").write_bytes(repacked)
        else:
            repacked = packed
        before += len(packed)
        after += len(repacked)
    return before, after


def folders(model_dir):
    return sorted(p.parent for p in (model_dir / "layered").glob("**/base.json"))


def flatten_model(model_dir):
    totals = [flatten_folder(folder) for folder in folders(model_dir)]
    return model_dir.name, sum(b for b, _ in totals), sum(a for _, a in totals)


def main(models):
    dirs = [SPRITES / m for m in models] if models else sorted(p for p in SPRITES.iterdir() if (p / "layered").is_dir())
    before = after = 0
    with Pool(WORKERS) as pool:
        for model, b, a in pool.imap_unordered(flatten_model, dirs):
            before += b
            after += a
            print(f"{model}: {b / 1e6:.2f} MB -> {a / 1e6:.2f} MB", flush=True)
    print(f"{len(dirs)} models: {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB")


if __name__ == "__main__":
    main(sys.argv[1:])
