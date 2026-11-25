"""Print what the character studio can build from, as JSON. Runs in plain Python: Blender's modules and numpy are
stood in for, because registering models needs none of them.

    python3 catalog.py [--characters DIR]

  races      proportion preset and default layout of each race
  materials  palette keys with their colours, dark to light
  fields     layout keys, with the values the models use; "generic" ones work on every biped
  models     every biped model and character: what it sets, its look options and the layout keys they control
"""
import contextlib
import inspect
import io
import json
import os
import sys
from unittest.mock import MagicMock

FACTORY = os.path.dirname(os.path.abspath(__file__))
KNOBS = ("legs", "arms", "limb", "arm", "shoulders", "torso", "belly", "torso_len", "head", "hands", "feet", "hips",
         "neck", "hunch", "head_fwd", "digi")
MOTION = ("stride", "arm_swing", "run_lean", "jump")
STANCE = ("lean", "twist", "nod", "hands")
# Values the library draws that no model may use yet; the rest come from the models themselves.
DRAWN = {"helm": ("open", "kettle", "skull", "winged", "gridiron", "hood"), "fins": ("bat", "swept", "crest"),
         "hair": ("slick", "long", "swept", "short", "braid", "bun"), "coat": ("frock", "tails", "gambeson", "robe"),
         "cape": ("long", "short"), "horns": ("bull", "ram", "goat", "small"), "head": ("human", "snout", "skull"),
         "pads": ("plate", "big", "leather", "football", "football_big", "football_small")}


def stand_in():
    sys.path.insert(0, FACTORY)
    for name in ("bpy", "mathutils", "numpy", "bmesh"):
        sys.modules[name] = MagicMock()


def own_source(cls):
    """Source of a model's classes below the library's body plans, with the team modules they come from."""
    modules = {c.__module__ for c in cls.__mro__ if c.__module__.startswith("teams.")}
    return "\n".join(inspect.getsource(sys.modules[m]) for m in sorted(modules))


def look_values(spec):
    """Every (key, value) the look options of a model can set."""
    if spec is None:
        return []
    bodies = [value for value, _ in spec.options[0][2]]
    found = []
    for slot, (empty, values) in spec.slots.items():
        found += list(empty.items())
        for value in values:
            for body in bodies:
                found += list((spec.part(slot, value, body) or {}).items())
    return found


def slot_keys(spec):
    return sorted({k for k, _ in look_values(spec)})


def scalars(layout):
    return {k: v for k, v in layout.items() if v is None or isinstance(v, (str, int, float))}


def model_entry(key, model, spec, generic, is_character):
    cls = type(model)
    from lib.characters import drawn_keys
    reads = drawn_keys(own_source(cls))
    used = set(model.layout) | set(slot_keys(spec))
    return dict(key=key, character=is_character, doc=(cls.__doc__ or "").strip().split("\n")[0], race=model.race,
                sex=model.sex, plan=model.plan, height=model.height, knobs=dict(model.knobs),
                layout=scalars(model.layout), stance={k: model.stance[k] for k in STANCE if k in model.stance},
                motion={k: getattr(model, k) for k in MOTION}, ownKeys=sorted((reads & used) - generic),
                bodies=[list(v) for v in spec.options[0][2]] if spec else [], lookKeys=slot_keys(spec),
                options=[dict(name=n, label=label, values=[dict(value=v, label=text) for v, text in vals])
                         for n, label, vals in (spec.options[1:] if spec else [])])


# Parts of the body itself: a layer can add to the base figure but cannot take these from it.
BODY_SWITCHES = {"no_arms", "no_legs"}


def fields(models, looks, races, materials, generic):
    seen = {}
    for race in races.values():
        for key, value in race["L"].items():
            seen.setdefault(key, []).append(value)
    for model in models.values():
        for key, value in model.layout.items():
            seen.setdefault(key, []).append(value)
    for spec in looks.values():
        for key, value in look_values(spec):
            seen.setdefault(key, []).append(value)
    for key, values in DRAWN.items():
        seen.setdefault(key, []).extend(values)
    for key in generic:
        seen.setdefault(key, [])
    from lib.characters import can_be_off
    out = []
    for key, values in sorted(seen.items()):
        field = field_kind([v for v in values if v is not None], materials)
        if field:
            part = can_be_off(key) and key not in BODY_SWITCHES
            out.append(dict(key=key, generic=key in generic, optional=can_be_off(key) or None in values,
                            layered=part or field["kind"] == "material", **field))
    return out


def field_kind(values, materials):
    if not values or any(isinstance(v, (dict, list, tuple)) for v in values):
        return None
    if all(isinstance(v, bool) for v in values):
        return dict(kind="toggle")
    if all(isinstance(v, (int, float)) for v in values):
        return dict(kind="number")
    words = sorted({v for v in values if isinstance(v, str)})
    if words and all(w in materials for w in words):
        return dict(kind="material")
    return dict(kind="choice", values=words)


def catalogue(folders):
    stand_in()
    from lib import characters, palette, plans, registry
    errors = registry.load_all(FACTORY)
    python_models = set(registry.MODELS)
    for folder in folders:
        characters.load(folder, errors)
    materials = {**{k: list(v) for k, v in palette.RAMPS.items()}, **{k: [v] for k, v in palette.FLAT.items()}}
    generic = characters.GENERIC
    bipeds = {k: m for k, m in registry.MODELS.items() if "__" not in k and isinstance(m, plans.Biped)}
    looks = {k: registry.LOOKS[k] for k in bipeds if k in registry.LOOKS}
    return dict(
        races=[dict(key=k, knobs={n: v for n, v in race.items() if n != "L"}, layout=scalars(race["L"])) for k, race in plans.RACES.items()],
        knobs=list(KNOBS), materials=[dict(key=k, colors=v) for k, v in sorted(materials.items())],
        fields=fields(bipeds, looks, plans.RACES, materials, generic), errors=errors,
        models=[model_entry(k, m, looks.get(k), generic, k not in python_models) for k, m in sorted(bipeds.items())])


def main(argv):
    folders = [os.path.join(FACTORY, "characters")]
    if argv[:1] == ["--characters"]:
        folders.append(argv[1])
    with contextlib.redirect_stdout(io.StringIO()):
        data = catalogue(folders)
    print(json.dumps(data))


main(sys.argv[1:])
