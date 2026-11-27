"""Install layered renders into the game.

    python3 install_layered.py LAYERED_DIR [--characters DIR] [model ...]

LAYERED_DIR is the factory's out/layered folder (render.py --layers). For each model it:
- copies <body>/<layer>.{json,bin} to public/sprites/bloodbowl/<model>/layered/,
- keeps depth only where two layers overlap, with flat_depth.py, so the files compress smaller,
- writes idle/se portrait copies of those layers with portrait_layers.py,
- packs each layer's .json index and .bin planes into one zstd .layer file (scripts/sprites/packLayers.ts),
- removes the model's flat atlases (base, kit1, kit2), which the game no longer loads for it,
- writes the model's entry in src/game/presentation/spriteManifest.json with a "layered" block
  (density, look options, layers per body, palette tables),
- points the positions a character (<model>.json in characters/ or DIR) is used by at its model,
- copies golden.json to __tests__/fixtures/layered/<model>.golden.json for the compositor's unit test.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

from flat_depth import flatten_model
from portrait_layers import write_model

ROOT = Path(__file__).resolve().parents[3]
SPRITES = ROOT / "public" / "sprites" / "bloodbowl"
MANIFEST = ROOT / "src" / "game" / "presentation" / "spriteManifest.json"
FIXTURES = ROOT / "__tests__" / "fixtures" / "layered"
CHARACTERS = Path(__file__).resolve().parent / "characters"
PPU = 25


def install(source, manifest):
    model = source.name
    rig = json.loads((source / "rig.json").read_text())
    dest = SPRITES / model / "layered"
    if dest.exists():
        shutil.rmtree(dest)
    for body in rig["bodies"]:
        shutil.copytree(source / body, dest / body)
    flatten_model(SPRITES / model)
    write_model(SPRITES / model)
    subprocess.run(["pnpm", "sprites:pack-layers", model], cwd=ROOT, check=True)
    for layer in ("base", "kit1", "kit2"):
        for ext in ("png", "json"):
            (SPRITES / model / f"{layer}.{ext}").unlink(missing_ok=True)
    manifest["models"][model] = {
        "anchor": rig["anchor"],
        "animations": rig["animations"],
        "frame": rig["frame"],
        "ppu": PPU,
        "layered": {"density": rig["density"], "options": rig["options"], "bodies": rig["bodies"],
                    "palette": rig["palette"]},
    }
    FIXTURES.mkdir(parents=True, exist_ok=True)
    shutil.copy(source / "golden.json", FIXTURES / f"{model}.golden.json")
    size = sum(p.stat().st_size for p in dest.rglob("*") if p.is_file())
    print(f"{model}: {len(rig['bodies'])} bodies, {size / 1e6:.1f} MB")


def assign(model, manifest, characters):
    """Point the roster positions a character is used by at its model."""
    path = characters / f"{model}.json"
    if not path.exists():
        return
    for use in json.loads(path.read_text())["usedBy"]:
        roster = manifest["positions"].get(use["roster"])
        if roster is None or use["position"] not in roster:
            raise SystemExit(f"{model}: no position {use['position']!r} in roster {use['roster']!r}")
        roster[use["position"]] = model
        print(f"{model}: plays as {use['roster']} {use['position']}")


def main(layered, models, characters=CHARACTERS):
    manifest = json.loads(MANIFEST.read_text())
    sources = [layered / m for m in models] if models else sorted(p for p in layered.iterdir() if (p / "rig.json").exists())
    for source in sources:
        assign(source.name, manifest, characters)
        install(source, manifest)
    MANIFEST.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n")


if __name__ == "__main__":
    rest = sys.argv[2:]
    if rest[:1] == ["--characters"]:
        main(Path(sys.argv[1]), rest[2:], Path(rest[1]))
    else:
        main(Path(sys.argv[1]), rest)
