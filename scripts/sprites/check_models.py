"""Dry-run every model spec without Blender.

    python3 scripts/sprites/check_models.py

Runs each spec through the real rig and part builders against stand-in
Blender objects, so an unknown part, a bad argument or a missing joint fails
here instead of mid-render. Also checks that every position in
src/data/RosterTemplates.ts maps to a model.
"""

import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROSTERS = HERE.parents[1] / "src/data/RosterTemplates.ts"


class Fake(dict):
    """Stands in for a Blender object: holds location, scale and custom props."""

    def __init__(self, name):
        super().__init__()
        self.name = name
        self.location = (0, 0, 0)
        self.scale = (1, 1, 1)


def stubs():
    made = []

    def joint(name, parent, location):
        ob = Fake(name)
        ob.location = location
        ob["rest"] = list(location)
        return ob

    def mesh_object(name, build_fn, part, parent, location=(0, 0, 0), scale=(1, 1, 1), rotation=(0, 0, 0)):
        assert parent is not None, f"{name} has no parent joint"
        made.append((name, part))
        return Fake(name)

    shape = lambda *a, **k: None  # noqa: E731
    g = dict(joint=joint, mesh_object=mesh_object, sphere=shape, cylinder=shape, cone=shape, box=shape,
             STYLES={"neon": {}}, STATE={}, KIT_GREY=(0.8, 0.8, 0.8), OUT={"l": -1, "r": 1},
             R=lambda *a, **k: (0,) * 6, POSES={}, pose_idle=None)
    return g, made


def roster_positions():
    text = ROSTERS.read_text()
    out = {}
    for m in re.finditer(r"rosterName:\s*RosterName\.(\w+),(.*?)(?=\n(?:const|export) |\Z)", text, re.S):
        out[m.group(1)] = re.findall(r'positionName:\s*"([^"]+)"', m.group(2))
    return out


def main():
    g, made = stubs()
    exec((HERE / "model_kit.py").read_text(), g)
    exec((HERE / "team_models.py").read_text(), g)
    errors = []
    materials = set(g["BASE_COLORS"]) | set(g["FLAT_COLORS"]) | {"kit1", "kit2", "skin"}
    for name, spec in g["MODELS"].items():
        made.clear()
        b = dict(g["BODIES"][spec.get("body", "human")])
        b.update(spec.get("shape", {}))
        c = g["Ctx"](spec, b)
        try:
            g["RIGS"][spec.get("rig", "biped")](c)
            for token in spec["parts"]:
                part, *args = token.split(":")
                g["PARTS"][part](c, *args)
        except Exception as e:  # report every bad spec, not just the first
            errors.append(f"{name}: {type(e).__name__}: {e}")
            continue
        for mesh, mat in made:
            if mat not in materials:
                errors.append(f"{name}: mesh {mesh} uses unknown material {mat}")
        if not any(mat in ("kit1", "kit2") for _, mat in made):
            errors.append(f"{name}: nothing wears the team kit")

    for team, positions in roster_positions().items():
        mapped = dict(g["TEAMS"].get(team, []))
        if team not in g["KITS"]:
            errors.append(f"{team}: no kit colours")
        for pos in positions:
            if pos not in mapped:
                errors.append(f"{team}: position {pos!r} has no model")
            elif mapped[pos] not in g["MODELS"]:
                errors.append(f"{team}: {pos!r} maps to missing model {mapped[pos]}")
    used = {m for team in g["TEAMS"].values() for _, m in team}
    for name in g["MODELS"]:
        if name not in used:
            errors.append(f"{name}: no team uses this model")

    print(f"{len(g['MODELS'])} models, {sum(len(t) for t in g['TEAMS'].values())} positions, {len(errors)} problems")
    for e in errors:
        print(" ", e)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
