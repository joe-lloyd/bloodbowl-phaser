"""Build the vampire sprite lab review page.

    python3 build_page.py SHIPPED OUT

SHIPPED is shipped_pass.py's output. Every treatment folder becomes one
packed sheet: one row per animation and layer, cropped to the box that holds
every frame. OUT gets index.html, lab.js, names.js (the game's name
generator, bundled), data.json and sheets/.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
LAYERS = ("base", "kit1", "kit2")


def strips(folder):
    """{anim: {layer: Image}} for every <anim>_se_<layer>.png in a folder."""
    out = {}
    for path in sorted(folder.glob("*_se_*.png")):
        anim, _, layer = path.stem.split("_")
        out.setdefault(anim, {})[layer] = Image.open(path).convert("RGBA")
    return out


def frame_box(strip, frame):
    """Union of every frame's bounding box, in frame coordinates."""
    box = None
    for i in range(strip.width // frame):
        bb = strip.crop((i * frame, 0, i * frame + frame, frame)).getbbox()
        if bb:
            box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3]))
    return box


def union(a, b):
    if a is None or b is None:
        return a or b
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def group_box(folders, frame):
    box = None
    for folder in folders:
        for layers in strips(folder).values():
            for strip in layers.values():
                box = union(box, frame_box(strip, frame))
    return (max(box[0] - 1, 0), max(box[1] - 1, 0), min(box[2] + 1, frame), min(box[3] + 1, frame))


def pack(folder, frame, box, dest):
    """Write one sheet and return its layout."""
    cw, ch = box[2] - box[0], box[3] - box[1]
    rows = []
    for anim, layers in strips(folder).items():
        for layer in LAYERS:
            if layer in layers:
                rows.append((anim, layer, layers[layer]))
    widest = max(strip.width // frame for _, _, strip in rows)
    sheet = Image.new("RGBA", (widest * cw, len(rows) * ch))
    anims = {}
    for r, (anim, layer, strip) in enumerate(rows):
        n = strip.width // frame
        for i in range(n):
            cell = strip.crop((i * frame + box[0], box[1], i * frame + box[2], box[3]))
            sheet.paste(cell, (i * cw, r * ch))
        entry = anims.setdefault(anim, {"frames": n, "rows": {}})
        entry["rows"][layer] = r
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest, optimize=True)
    return {"w": cw, "h": ch, "anims": anims}


def build_shipped(shipped, out):
    entries = {}
    for model in sorted(p for p in shipped.iterdir() if p.is_dir()):
        for folder in sorted(p for p in model.iterdir() if p.is_dir()):
            frame = Image.open(next(folder.glob("idle_se_base.png"))).height
            box = group_box([folder], frame)
            rel = f"sheets/shipped/{model.name}/{folder.name}.png"
            entries.setdefault(model.name, {})[folder.name] = {"src": rel, **pack(folder, frame, box, out / rel)}
        print("shipped", model.name, flush=True)
    return entries


def main(shipped, out):
    out.mkdir(parents=True, exist_ok=True)
    data = {"shipped": build_shipped(shipped, out)}
    (out / "data.json").write_text(json.dumps(data, separators=(",", ":")))
    for name in ("index.html", "lab.js"):
        shutil.copy(HERE / "page" / name, out / name)
    subprocess.run(["node", str(HERE / "bundle_names.mjs"), str(out / "names.js")], check=True, cwd=HERE.parents[2])


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
