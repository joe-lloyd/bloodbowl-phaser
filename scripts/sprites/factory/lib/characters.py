"""Characters: models written as JSON by the character studio (pnpm studio), in characters/<key>.json.

A character starts from a Python model (its base) and changes what it names: race, sex, proportion knobs,
layout, stance and motion. The base's pose hooks and, unless parts is "drop", its own part code stay. It is sized
against its base's reference sprite, times height. looks is {"kind": "base"} to keep the base's look options, or
{"kind": "own", "bodies": [...], "options": [...]}. The schema the studio checks these files with is
studio/boundary/studio.ts.
"""
import glob
import inspect
import json
import os
import re

from . import core, looks, parts, plans, registry
from .plans import Biped

MOTION = ("stride", "arm_swing", "run_lean", "jump")
STAND_INS = {"m": "Male", "f": "Female", "x": "Own build"}


def generic_source():
    return "\n".join(inspect.getsource(module) for module in (core, parts, plans))


def drawn_keys(source):
    """Layout keys a piece of drawing code reads from its layout L."""
    return set(re.findall(r'\bL(?:\.get\(|\[)"([a-z]\w*)"', source))


def drawn_by_get(source):
    return set(re.findall(r'\bL\.get\("([a-z]\w*)"', source))


def optional_keys(source):
    """Keys the code asks for without a default, so None turns them off. The others need a value."""
    return set(re.findall(r'\bL\.get\("([a-z]\w*)"\)', source))


def team_source():
    files = glob.glob(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "teams", "*.py"))
    return "\n".join(open(path, encoding="utf-8").read() for path in sorted(files))


GENERIC = drawn_keys(generic_source())
OPTIONAL = optional_keys(generic_source())
TEAM_NEEDS = set(re.findall(r'\bL\["([a-z]\w*)"\]', team_source())) - drawn_by_get(team_source()) - GENERIC


def can_be_off(key):
    """Whether a layout key may be None; a key only a team's own parts read may, unless they never check it."""
    return key in OPTIONAL or (key not in GENERIC and key not in TEAM_NEEDS)


def tupled(value):
    """Team files write tuples where JSON has lists."""
    if isinstance(value, list):
        return tuple(tupled(v) for v in value)
    if isinstance(value, dict):
        return {k: tupled(v) for k, v in value.items()}
    return value


def empty_state(values):
    """The layout of an option with nothing chosen: every part its values set is off.
    Keys that always need a value keep the character's own."""
    keys = {k for v in values for k in (v["layout"] or {})}
    return {k: None for k in keys if can_be_off(k)}


def own_looks(cls, spec, body):
    options = [["body", "Body", [[b, STAND_INS[b]] for b in spec["bodies"]]]]
    slots = {}
    for option in spec["options"]:
        values = option["values"]
        options.append([option["name"], option["label"], [[v["value"], v["label"]] for v in values]])
        slots[option["name"]] = (empty_state(values),
                                 {v["value"]: tupled(v["layout"]) or looks.EMPTY for v in values})
    return looks.Looks(cls, options, slots, body)


def character_class(spec):
    unknown = set(spec["motion"]) - set(MOTION)
    if unknown:
        raise ValueError("%s: unknown motion %s" % (spec["key"], ", ".join(sorted(unknown))))
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
    registry.LOOKS.pop(cls.key, None)      # a draft without look options replaces a saved character with them
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
