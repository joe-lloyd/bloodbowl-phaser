"""Build the all-teams model review page from render_models.py output.

    python3 scripts/sprites/build_roster_page.py RENDERS_DIR PAGE_DIR [model_id ...]

For each rendered model it splits kit layers (build_sheets.py) and packs
trimmed atlases (pack_atlas.py) into PAGE_DIR/sprites/<id>/. Then it writes
PAGE_DIR/data.json: every team from src/data/RosterTemplates.ts with its
positions, stats, kit colours and model ids, plus the square size. Finally it
copies the page source from scripts/sprites/team-roster/.
"""

import json
import re
import runpy
import shutil
import sys
import tempfile
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).parent
REPO = HERE.parents[1]
SHEETS = runpy.run_path(str(HERE / "build_sheets.py"))
ATLAS = runpy.run_path(str(HERE / "pack_atlas.py"))


def load_models():
    g = {}
    exec((HERE / "model_kit.py").read_text().split("SIDES =")[0], g)
    exec((HERE / "team_models.py").read_text(), g)
    return g


def rosters():
    """Team display names and per-position stats, parsed from the game's data."""
    names = dict(re.findall(r'(\w+) = "([^"]+)"', re.search(r"enum RosterName \{(.*?)\}", (REPO / "src/types/Team.ts").read_text(), re.S).group(1)))
    text = (REPO / "src/data/RosterTemplates.ts").read_text()
    out = {}
    for m in re.finditer(r"rosterName:\s*RosterName\.(\w+),(.*?)(?=\n(?:const|export) |\Z)", text, re.S):
        positions = {}
        for p in re.finditer(r'positionName:\s*"([^"]+)",\s*keywords:\s*\[([^\]]*)\].*?stats:\s*\{([^}]*)\}.*?maxAllowed:\s*(\d+)', m.group(2), re.S):
            stats = dict((k, int(v)) for k, v in re.findall(r"(\w+):\s*(\d+)", p.group(3)))
            role = next((k.split(".")[1] for k in re.findall(r"(?:PositionKeyWord|TraitKeyWord)\.\w+", p.group(2))), "")
            positions[p.group(1)] = dict(stats=stats, role=role.replace("_", " ").title(), max=int(p.group(4)))
        out[m.group(1)] = dict(name=names.get(m.group(1), m.group(1)), positions=positions)
    return out


def pack_one(args):
    renders, page, model_id = args
    with tempfile.TemporaryDirectory() as tmp:
        SHEETS["main"](renders / model_id, Path(tmp))
        dest = page / "sprites" / model_id
        if dest.exists():
            shutil.rmtree(dest)
        ATLAS["main"](Path(tmp), dest)
    return model_id


def main(renders, page, only):
    page.mkdir(parents=True, exist_ok=True)
    d = load_models()
    rendered = [m for m in d["MODELS"] if (renders / m / "meta.json").exists()]
    todo = [m for m in rendered if not only or m in only]
    with Pool(8) as pool:
        for model_id in pool.imap_unordered(pack_one, [(renders, page, m) for m in todo]):
            print("packed", model_id, flush=True)

    data = rosters()
    teams = []
    for key, team in sorted(data.items(), key=lambda kv: kv[1]["name"]):
        kit = d["KITS"][key]
        positions = []
        for pos, model in d["TEAMS"][key]:
            info = team["positions"].get(pos, {})
            positions.append(dict(name=pos, model=model, ready=model in rendered, **info))
        teams.append(dict(key=key, name=team["name"], kit=list(kit), positions=positions))
    models = {m: json.loads((page / "sprites" / m / "meta.json").read_text())["sizes"]
              for m in rendered if (page / "sprites" / m / "meta.json").exists()}
    (page / "data.json").write_text(json.dumps(dict(square_m=d["SQUARE_M"], teams=teams, models=models)))
    for f in (HERE / "team-roster").iterdir():
        shutil.copy(f, page / f.name)
    print(f"{len(models)} models on the page, {sum(len(t['positions']) for t in teams)} positions")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), set(sys.argv[3:]))
