"""Build the stadium review page from stadium.py and fall_render.py output.

    python3 scripts/sprites/build_stadium_page.py STADIUM_DIR FALLS_DIR ROSTER_PAGE PAGE_DIR

STADIUM_DIR holds one folder per layout with {lo,hi}_{color,mask}.png and
meta.json. Each render becomes three lossless WebP layers: the backdrop, and
the home and away kit pixels on their own for Phaser to tint.

FALLS_DIR holds fall renders per model; they are packed like the idles.
Standing players come from the all-teams page already published at
ROSTER_PAGE, which this page links to by relative path rather than copying.
"""

import json
import runpy
import shutil
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
SHEETS = runpy.run_path(str(HERE / "build_sheets.py"))
ATLAS = runpy.run_path(str(HERE / "pack_atlas.py"))
STANDING = ["human_lineman", "human_thrower", "human_catcher", "human_blitzer", "halfling_hopeful", "ogre",
            "orc_lineman", "orc_thrower", "orc_blitzer", "big_un", "goblin_lineman", "troll"]


def split_layers(color, mask):
    """Backdrop, home kit and away kit layers from one colour and mask render."""
    color = color.convert("RGBA")
    r, g, _ = mask.convert("RGB").split()
    layers = []
    for channel in (r, g):
        alpha = channel.point(lambda v: 255 if v > 127 else 0)
        layer = color.copy()
        layer.putalpha(alpha)
        layers.append(layer)
    return [color.convert("RGB"), *layers]


def main(stadium, falls, roster, page):
    page.mkdir(parents=True, exist_ok=True)
    layouts = []
    for lay_dir in sorted(p for p in stadium.iterdir() if (p / "meta.json").exists()):
        meta = json.loads((lay_dir / "meta.json").read_text())
        for size in meta["sizes"]:
            out = page / "stadium" / meta["layout"] / size
            out.mkdir(parents=True, exist_ok=True)
            color = Image.open(lay_dir / f"{size}_color.png")
            mask = Image.open(lay_dir / f"{size}_mask.png")
            for name, layer in zip(("base", "home", "away"), split_layers(color, mask)):
                layer.save(out / f"{name}.webp", lossless=True, quality=100, method=4)
        layouts.append(meta)

    fall_meta = {}
    with tempfile.TemporaryDirectory() as tmp:
        for model in sorted(p for p in falls.iterdir() if (p / "meta.json").exists()):
            sheets = Path(tmp) / model.name
            SHEETS["main"](model, sheets)
            ATLAS["main"](sheets, page / "falls" / model.name)
            fall_meta[model.name] = json.loads((model / "meta.json").read_text())["sizes"]

    roster_data = json.loads((roster / "data.json").read_text())
    data = {
        "layouts": layouts,
        "kits": {"home": next(t["kit"] for t in roster_data["teams"] if t["key"] == "HUMAN"),
                 "away": next(t["kit"] for t in roster_data["teams"] if t["key"] == "ORC")},
        "idle_root": f"../{roster.name}/sprites",
        "idle": {m: roster_data["models"][m] for m in STANDING},
        "falls": fall_meta,
    }
    (page / "data.json").write_text(json.dumps(data))
    for f in ("index.html", "stadium.js"):
        shutil.copy(HERE / "stadium-page" / f, page / f)
    shutil.copy(roster / "phaser.min.js", page / "phaser.min.js")


if __name__ == "__main__":
    main(*(Path(a) for a in sys.argv[1:5]))
