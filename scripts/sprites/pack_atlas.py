"""Pack build_sheets.py output into trimmed Phaser atlases.

    python3 scripts/sprites/pack_atlas.py SHEETS_DIR OUT_DIR

SHEETS_DIR is one player's build_sheets output (it holds meta.json and a
folder per size). For each size and layer (base, kit1, kit2) this writes
OUT_DIR/<layer>.png and OUT_DIR/<layer>.json in Phaser's JSON-hash atlas
format. With more than one size, each size gets its own OUT_DIR/<size>/.
Every frame is cropped to its visible pixels and keeps its offset in
spriteSourceSize, so a sprite's origin stays on the feet. Frame names are
"<anim>/<direction>/<frame>".
"""

import json
import sys
from pathlib import Path

from PIL import Image

ATLAS_WIDTH = 2048
PAD = 1


def frames(sheets, layer, size):
    meta = json.loads((sheets / "meta.json").read_text())
    px = meta["sizes"][size]["frame"]
    for anim, n in meta["animations"].items():
        sheet = Image.open(sheets / size / f"{anim}_{layer}.png")
        for row, d in enumerate(meta["directions"]):
            for f in range(n):
                cell = sheet.crop((f * px, row * px, f * px + px, row * px + px))
                box = cell.getbbox() or (0, 0, 1, 1)
                yield f"{anim}/{d}/{f}", cell.crop(box), box, px


def pack(items):
    """Shelf packing, tallest first. Returns placements and atlas height."""
    items = sorted(items, key=lambda it: -it[1].height)
    x = y = shelf = 0
    placed = []
    for name, img, box, px in items:
        if x + img.width > ATLAS_WIDTH:
            x, y, shelf = 0, y + shelf + PAD, 0
        placed.append((name, img, box, px, x, y))
        x += img.width + PAD
        shelf = max(shelf, img.height)
    return placed, y + shelf


def main(sheets, out):
    meta = json.loads((sheets / "meta.json").read_text())
    for size in meta["sizes"]:
        pack_size(sheets, out / size if len(meta["sizes"]) > 1 else out, size)
    (out / "meta.json").write_text(json.dumps(meta, indent=2))


def pack_size(sheets, out, size):
    out.mkdir(parents=True, exist_ok=True)
    for layer in ("base", "kit1", "kit2"):
        placed, height = pack(list(frames(sheets, layer, size)))
        atlas = Image.new("RGBA", (ATLAS_WIDTH, height))
        data = {}
        for name, img, box, px, x, y in placed:
            atlas.paste(img, (x, y))
            data[name] = {
                "frame": {"x": x, "y": y, "w": img.width, "h": img.height},
                "rotated": False,
                "trimmed": True,
                "spriteSourceSize": {"x": box[0], "y": box[1], "w": img.width, "h": img.height},
                "sourceSize": {"w": px, "h": px},
            }
        atlas.save(out / f"{layer}.png", optimize=True)
        (out / f"{layer}.json").write_text(json.dumps({"frames": data, "meta": {"image": f"{layer}.png", "scale": "1"}}))


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
