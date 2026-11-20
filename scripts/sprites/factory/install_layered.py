"""Install layered renders into the game.

    python3 install_layered.py LAYERED_DIR [model ...]

LAYERED_DIR is the factory's out/layered folder (render.py --layers). For each model it:
- copies <body>/<layer>.{json,bin} to public/sprites/bloodbowl/<model>/layered/,
- removes the model's flat atlases (base, kit1, kit2), which the game no longer loads for it,
- writes the model's entry in src/game/presentation/spriteManifest.json with a "layered" block
  (density, look options, layers per body, palette tables),
- copies golden.json to __tests__/fixtures/layered/<model>.golden.json for the compositor's unit test.
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SPRITES = ROOT / "public" / "sprites" / "bloodbowl"
MANIFEST = ROOT / "src" / "game" / "presentation" / "spriteManifest.json"
FIXTURES = ROOT / "__tests__" / "fixtures" / "layered"
PPU = 25


def install(source, manifest):
    model = source.name
    rig = json.loads((source / "rig.json").read_text())
    dest = SPRITES / model / "layered"
    if dest.exists():
        shutil.rmtree(dest)
    for body in rig["bodies"]:
        shutil.copytree(source / body, dest / body)
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


def main(layered, models):
    manifest = json.loads(MANIFEST.read_text())
    sources = [layered / m for m in models] if models else sorted(p for p in layered.iterdir() if (p / "rig.json").exists())
    for source in sources:
        install(source, manifest)
    MANIFEST.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n")


if __name__ == "__main__":
    main(Path(sys.argv[1]), sys.argv[2:])
