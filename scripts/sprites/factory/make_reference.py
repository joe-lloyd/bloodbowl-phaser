"""Build reference/ from git: the sprites the factory sizes its models against.

    python3 make_reference.py [COMMIT]

COMMIT defaults to the commit before the pixel-art players landed, whose atlases set every model's
height. Writes reference/rosters.json (each team's positions and models, and each model's frame size
and teams) and reference/today/<model>/base.json.
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
COMMIT = sys.argv[1] if len(sys.argv) > 1 else "7e4d6993^"


def show(path):
    return subprocess.run(["git", "show", f"{COMMIT}:{path}"], cwd=HERE, check=True, capture_output=True, text=True).stdout


def main():
    manifest = json.loads(show("src/game/presentation/spriteManifest.json"))
    teams = {team: [{"position": p, "model": m} for p, m in positions.items()]
             for team, positions in manifest["positions"].items()}
    models = {}
    for team, plist in teams.items():
        for entry in plist:
            key = entry["model"]
            info = models.setdefault(key, {"frame": manifest["models"][key]["frame"], "used_by": []})
            info["used_by"].append(f"{team} / {entry['position']}")
    ref = HERE / "reference"
    (ref / "today").mkdir(parents=True, exist_ok=True)
    (ref / "rosters.json").write_text(json.dumps({"teams": teams, "models": models}, indent=1))
    for key in models:
        dest = ref / "today" / key
        dest.mkdir(exist_ok=True)
        (dest / "base.json").write_text(show(f"public/sprites/bloodbowl/{key}/base.json"))
    print(f"{len(teams)} teams, {len(models)} models from {COMMIT}")


if __name__ == "__main__":
    main()
