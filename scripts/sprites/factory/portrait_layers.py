"""Write the small layer files the roster portraits load.

    python3 portrait_layers.py [model ...]

A portrait only draws the idle animation facing south-east, about 2% of a layer's pixels, but a layer file
holds every animation and facing. For each <body>/<layer>.{json,bin} of an installed model this writes
<body>/portrait/<layer>.{json,bin} in the same format with only the idle/se frames, so a team page
downloads kilobytes per player instead of megabytes. install_layered.py calls it for every model it
installs, on the unpacked .json/.bin layers before packing them into .layer files; re-install a model
to rebuild its portraits.
"""
import json
import sys
import zlib
from pathlib import Path

SPRITES = Path(__file__).resolve().parents[3] / "public" / "sprites" / "bloodbowl"
PORTRAIT = "portrait"
FRAMES = "idle/se/"


def portrait_layer(meta, planes):
    pixels = meta["pixels"]
    names = sorted(name for name in meta["frames"] if name.startswith(FRAMES))
    frames, chunks, offset = {}, [[], [], []], 0
    for name in names:
        x, y, w, h, start = meta["frames"][name]
        for plane, chunk in enumerate(chunks):
            base = plane * pixels + start
            chunk.append(planes[base:base + w * h])
        frames[name] = [x, y, w, h, offset]
        offset += w * h
    return {"frames": frames, "pixels": offset}, b"".join(b"".join(chunk) for chunk in chunks)


def write_portraits(body_dir):
    out = body_dir / PORTRAIT
    out.mkdir(exist_ok=True)
    for index in sorted(body_dir.glob("*.json")):
        meta = json.loads(index.read_text())
        planes = zlib.decompress(index.with_suffix(".bin").read_bytes())
        if len(planes) != meta["pixels"] * 3:
            raise SystemExit(f"{index}: {len(planes)} bytes, expected {meta['pixels'] * 3}")
        small, blob = portrait_layer(meta, planes)
        (out / index.name).write_text(json.dumps(small, separators=(",", ":")))
        (out / index.with_suffix(".bin").name).write_bytes(zlib.compress(blob, 9))


def write_model(model_dir):
    for body_dir in sorted(p for p in (model_dir / "layered").iterdir() if p.is_dir()):
        write_portraits(body_dir)


def main(models):
    dirs = [SPRITES / m for m in models] if models else sorted(p for p in SPRITES.iterdir() if (p / "layered").is_dir())
    for model_dir in dirs:
        write_model(model_dir)
    print(f"portrait layers written for {len(dirs)} models")


if __name__ == "__main__":
    main(sys.argv[1:])
