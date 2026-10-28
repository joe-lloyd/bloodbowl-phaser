"""Pack one theme's stadium and players for the match UI mockup.

    python3 scripts/sprites/build_theme_assets.py STADIUM_LAYOUT_DIR PLAYERS_DIR OUT_DIR HOME_KIT AWAY_KIT

STADIUM_LAYOUT_DIR is one stadium.py layout folder; PLAYERS_DIR is
style_render.py output with idle/ and falls/. Kits are two hex colours
each, like 3a6ee8,e8dcc0. OUT_DIR gets the same shape the neon stadium page
has, so match.js reads either theme the same way: stadium/<layout>/lo/,
idle/<id>/lo/, falls/<id>/lo/ and data.json.
"""

import json
import runpy
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
SHEETS = runpy.run_path(str(HERE / "build_sheets.py"))
ATLAS = runpy.run_path(str(HERE / "pack_atlas.py"))
split_layers = runpy.run_path(str(HERE / "build_stadium_page.py"))["split_layers"]


def pack_models(src, dst, tmp):
    metas = {}
    for model in sorted(p for p in src.iterdir() if (p / "meta.json").exists()):
        sheets = tmp / src.name / model.name
        SHEETS["main"](model, sheets)
        ATLAS["main"](sheets, dst / model.name / "lo")
        metas[model.name] = json.loads((model / "meta.json").read_text())["sizes"]
    return metas


def main(stadium, players, out, home, away):
    meta = json.loads((stadium / "meta.json").read_text())
    lay = out / "stadium" / meta["layout"] / "lo"
    lay.mkdir(parents=True, exist_ok=True)
    layers = split_layers(Image.open(stadium / "lo_color.png"), Image.open(stadium / "lo_mask.png"))
    for name, layer in zip(("base", "home", "away"), layers):
        layer.save(lay / f"{name}.webp", lossless=True, quality=100, method=4)
    with tempfile.TemporaryDirectory() as tmp:
        idle = pack_models(players / "idle", out / "idle", Path(tmp))
        falls = pack_models(players / "falls", out / "falls", Path(tmp))
    kit = lambda s: [int(c, 16) for c in s.split(",")]
    data = {"layouts": [meta], "kits": {"home": kit(home), "away": kit(away)},
            "idle_root": "idle", "idle": idle, "falls": falls}
    (out / "data.json").write_text(json.dumps(data))


if __name__ == "__main__":
    a = sys.argv[1:]
    main(Path(a[0]), Path(a[1]), Path(a[2]), a[3], a[4])
