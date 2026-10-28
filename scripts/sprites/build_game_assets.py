"""Pack one style's renders into the game's public/ folder.

    python3 scripts/sprites/build_game_assets.py STYLE RENDERS_DIR STADIUM_DIR [model_id ...]

RENDERS_DIR holds batch_render.py output (one folder per model with idle,
run and fall at "lo"); STADIUM_DIR is one stadium.py layout folder. Writes:

    public/sprites/<style>/<model>/{base,kit1,kit2}.{png,json}   Phaser atlases
    src/game/presentation/spriteManifest.json   model frames and anchors, and
        the model for every roster position. The same for every style, since a
        style changes colours and light, not geometry; a mismatch is an error.
    public/stadium/<style>/{base,home,away}.webp, meta.json, preview.webp

Atlases are quantised to a 256-colour palette. The renders are flat toon
bands, so this is close to lossless and roughly a third of the size.
Naming models limits the rebuild to them; the manifest still covers all.
"""

import json
import runpy
import shutil
import sys
import tempfile
from multiprocessing import Pool
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
REPO = HERE.parents[1]
ROSTER = runpy.run_path(str(HERE / "build_roster_page.py"))
split_layers = runpy.run_path(str(HERE / "build_stadium_page.py"))["split_layers"]


def quantise(path):
    img = Image.open(path).convert("RGBA")
    img.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)


def pack_one(args):
    renders, out, model_id = args
    with tempfile.TemporaryDirectory() as tmp:
        ROSTER["SHEETS"]["main"](renders / model_id, Path(tmp))
        dest = out / model_id
        if dest.exists():
            shutil.rmtree(dest)
        ROSTER["ATLAS"]["main"](Path(tmp), dest)
    for png in dest.glob("*.png"):
        quantise(png)
    (dest / "meta.json").unlink(missing_ok=True)
    return model_id


def positions():
    """Roster display name -> position name -> model id, from team_models.TEAMS."""
    teams = ROSTER["load_models"]()["TEAMS"]
    names = {k: v["name"] for k, v in ROSTER["rosters"]().items()}
    return {names.get(key, key): {pos: model for pos, model in rows} for key, rows in teams.items()}


def stadium(src, out):
    out.mkdir(parents=True, exist_ok=True)
    color = Image.open(src / "lo_color.png")
    for name, layer in zip(("base", "home", "away"), split_layers(color, Image.open(src / "lo_mask.png"))):
        layer.save(out / f"{name}.webp", lossless=True, quality=100, method=4)
    meta = json.loads((src / "meta.json").read_text())
    shutil.copy(src / "meta.json", out / "meta.json")
    # Picker thumbnail: the pitch and both dugouts, from the untinted colour pass.
    lo = meta["sizes"]["lo"]
    ox, oy = lo["origin"]
    cx = ox + 10 * lo["gx"][0] + 5.5 * lo["gy"][0]  # pitch centre: grid (10, 5.5)
    cy = oy + 10 * lo["gx"][1] + 5.5 * lo["gy"][1]
    w, h = 1700, 956
    thumb = color.convert("RGB").crop((int(cx - w / 2), int(cy - h / 2 - 60), int(cx + w / 2), int(cy + h / 2 - 60)))
    thumb.resize((480, 270), Image.LANCZOS).save(out / "preview.webp", quality=88)


def main(style, renders, stadium_dir, only):
    out = REPO / "public" / "sprites" / style
    out.mkdir(parents=True, exist_ok=True)
    ids = only or sorted(p.name for p in renders.iterdir() if (p / "meta.json").exists())
    with Pool(8) as pool:
        for model_id in pool.imap_unordered(pack_one, [(renders, out, m) for m in ids]):
            print("packed", model_id)
    models = {}
    for p in sorted(renders.iterdir()):
        if (p / "meta.json").exists():
            m = json.loads((p / "meta.json").read_text())
            lo = m["sizes"]["lo"]
            models[p.name] = {"frame": lo["frame"], "anchor": lo["anchor"], "ppu": lo["px_per_unit"],
                              "animations": m["animations"]}
    manifest = {"directions": ["s", "se", "e", "ne", "n", "nw", "w", "sw"],
                "models": models, "positions": positions()}
    path = REPO / "src" / "game" / "presentation" / "spriteManifest.json"
    if path.exists():
        old = json.loads(path.read_text())["models"]
        clash = [m for m in models if m in old and old[m] != models[m]]
        if clash:
            sys.exit(f"{style} frames differ from the existing manifest for {clash}")
        models = {**old, **models}
        manifest["models"] = models
    path.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n")
    stadium(stadium_dir, REPO / "public" / "stadium" / style)
    missing = sorted({m for rows in manifest["positions"].values() for m in rows.values()} - set(models))
    print(f"{len(models)} models, missing renders: {missing or 'none'}")


if __name__ == "__main__":
    main(sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4:])
