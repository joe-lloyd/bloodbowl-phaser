"""Build the vampire sprite lab review page from sprite factory renders.

    python3 build_page.py LAB OUT

LAB holds one folder per render set (base-d1, nodither-d2, looks-d1, ...), each a factory output folder
with sprites/<model>/{base,kit1,kit2}.{png,json}. Only the se facing is used. Every model becomes one
packed sheet: one row per animation and layer, cropped to the box that holds every frame of its group, so
switching between treatments or looks of one position never shifts the figure. A group is a position at
one density. OUT gets index.html, lab.js, names.js (the game's name generator, bundled), data.json and
sheets/.
"""

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
LAYERS = ("base", "kit1", "kit2")
FACING = "se"


def density(set_name):
    match = re.search(r"-d(\d)$", set_name)
    return int(match.group(1)) if match else 1


def frames(model_dir):
    """{anim: {layer: [full-size RGBA frame, ...]}} for the se facing."""
    out = {}
    for layer in LAYERS:
        atlas = json.loads((model_dir / f"{layer}.json").read_text())
        sheet = Image.open(model_dir / f"{layer}.png").convert("RGBA")
        for name, entry in atlas["frames"].items():
            anim, facing, index = name.split("/")
            if facing != FACING:
                continue
            f, src, size = entry["frame"], entry["spriteSourceSize"], entry["sourceSize"]
            full = Image.new("RGBA", (size["w"], size["h"]))
            full.paste(sheet.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"])), (src["x"], src["y"]))
            out.setdefault(anim, {}).setdefault(layer, {})[int(index)] = full
    return {anim: {layer: [byindex[i] for i in sorted(byindex)] for layer, byindex in layers.items()}
            for anim, layers in out.items()}


def union(a, b):
    if a is None or b is None:
        return a or b
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def content_box(model_frames):
    box = None
    for layers in model_frames.values():
        for strip in layers.values():
            for frame in strip:
                box = union(box, frame.getbbox())
    return box


def pack(model_frames, box, dest):
    x0, y0, x1, y1 = box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1
    cw, ch = x1 - x0, y1 - y0
    rows = [(anim, layer, strip) for anim, layers in model_frames.items() for layer, strip in layers.items()]
    widest = max(len(strip) for _, _, strip in rows)
    sheet = Image.new("RGBA", (widest * cw, len(rows) * ch))
    anims = {}
    for r, (anim, layer, strip) in enumerate(rows):
        for i, frame in enumerate(strip):
            sheet.paste(frame.crop((x0, y0, x1, y1)), (i * cw, r * ch))
        anims.setdefault(anim, {"frames": len(strip), "rows": {}})["rows"][layer] = r
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest, optimize=True)
    return {"w": cw, "h": ch, "anims": anims}


def main(lab, out):
    out.mkdir(parents=True, exist_ok=True)
    loaded = {}
    for set_dir in sorted(p for p in lab.iterdir() if (p / "sprites").is_dir()):
        for model_dir in sorted(p for p in (set_dir / "sprites").iterdir() if (p / "base.json").exists()):
            loaded[(set_dir.name, model_dir.name)] = frames(model_dir)
    boxes = {}
    for (set_name, key), model_frames in loaded.items():
        group = (key.split("__")[0], density(set_name))
        boxes[group] = union(boxes.get(group), content_box(model_frames))
    data = {}
    for (set_name, key), model_frames in loaded.items():
        rel = f"sheets/{set_name}/{key}.png"
        box = boxes[(key.split("__")[0], density(set_name))]
        data.setdefault(set_name, {})[key] = {"src": rel, **pack(model_frames, box, out / rel)}
        print(set_name, key, flush=True)
    (out / "data.json").write_text(json.dumps(data, separators=(",", ":")))
    for name in ("index.html", "lab.js"):
        shutil.copy(HERE / "page" / name, out / name)
    subprocess.run(["node", str(HERE / "bundle_names.mjs"), str(out / "names.js")], check=True, cwd=HERE.parents[2])


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
