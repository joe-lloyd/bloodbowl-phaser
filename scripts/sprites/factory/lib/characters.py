"""Characters: models written as JSON by the character studio (pnpm studio), in characters/<key>.json.

A character starts from a Python model (its base) and changes what it names: race, sex, proportion knobs,
layout, stance and motion. The base's pose hooks and, unless parts is "drop", its own part code stay. It is sized
against its base's reference sprite, times height. looks is {"kind": "base"} to keep the base's look options, or
{"kind": "own", "bodies": [...], "options": [...]}. The schema the studio checks these files with is
src/boundary/characterStudio.ts.
"""
import glob
import json
import os

from . import looks, registry
from .plans import Biped

STAND_INS = {"m": "Male", "f": "Female", "x": "Own build"}
# A body part always needs a material or a kind, so an option's empty state keeps the character's own.
BODY_KEYS = {"skin", "torso", "arms", "forearms", "legs", "gloves", "boots", "sole", "head", "eyes", "ears", "brow", "lip"}


def tupled(value):
    """Team files write tuples where JSON has lists."""
    if isinstance(value, list):
        return tuple(tupled(v) for v in value)
    if isinstance(value, dict):
        return {k: tupled(v) for k, v in value.items()}
    return value


def empty_state(values, layout):
    """The layout of an option with nothing chosen: every part key its values set is off."""
    keys = {k for v in values for k in (v["layout"] or {})}
    return {k: layout.get(k) if k in BODY_KEYS or k.endswith("_mat") else None for k in keys}


def own_looks(cls, spec, body):
    options = [["body", "Body", [[b, STAND_INS[b]] for b in spec["bodies"]]]]
    slots = {}
    for option in spec["options"]:
        values = option["values"]
        options.append([option["name"], option["label"], [[v["value"], v["label"]] for v in values]])
        slots[option["name"]] = (empty_state(values, cls.layout),
                                 {v["value"]: tupled(v["layout"]) or looks.EMPTY for v in values})
    return looks.Looks(cls, options, slots, body)


def character_class(spec):
    source = registry.get(spec["base"])
    base = type(source)
    if not isinstance(source, Biped):
        raise ValueError("%s: base %s is not a biped" % (spec["key"], spec["base"]))
    attrs = dict(key=spec["key"], ref_key=base.key, race=spec["race"], sex=spec["sex"], height=spec["height"],
                 knobs=dict(base.knobs, **spec["knobs"]), layout=dict(base.layout, **tupled(spec["layout"])),
                 stance=dict(base.stance, **tupled(spec["stance"])), **spec["motion"])
    if spec["parts"] == "drop":
        attrs.update(extras=Biped.extras, details=lambda self, J, P, L, tag, pose: None)
    return type("Character_" + spec["key"], (base,), attrs)


def body_layouts(inherited):
    """The base's per-body layout changes, for the bodies it has."""
    if inherited is None or inherited.body is None:
        return None
    known = {value for value, _ in inherited.options[0][2]}
    return lambda body: inherited.body(body) if body in known else {}


def register_character(spec):
    cls = character_class(spec)
    inherited = registry.LOOKS.get(spec["base"])
    registry.register(cls)
    kind = spec["looks"]["kind"]
    if kind == "own":
        registry.register_looks(cls.key, own_looks(cls, spec["looks"], body_layouts(inherited)))
    elif inherited:
        registry.register_looks(cls.key, looks.Looks(cls, inherited.options, inherited.slots, inherited.body))


def load(folder, errors):
    """Register every character of a folder; a later folder's character replaces an earlier one's."""
    for path in sorted(glob.glob(os.path.join(folder, "*.json"))):
        try:
            with open(path, encoding="utf-8") as fh:
                register_character(json.load(fh))
        except Exception as exc:      # one broken character must not stop the others
            errors[os.path.basename(path)] = repr(exc)
            print("CHARACTER ERROR", os.path.basename(path), repr(exc))
    return errors


def default_choice(key):
    """The first value of every look option: the model's own look."""
    spec = registry.LOOKS.get(key)
    return {name: values[0][0] for name, _, values in spec.options} if spec else None
