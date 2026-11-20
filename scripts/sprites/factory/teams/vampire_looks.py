"""Look options of the Vampire positions. Each position has its own options, listed with their labels in
vampire_looks.json; the first value of every option is the position's own look.

The layered renderer draws each position once per body without any option (the base), then each option
value on its own. So every option has an empty state, and each value's layout sets every key its empty
state clears. Whole-figure variants are also registered as <model>__<value>-<value>-... for full renders,
which the layered renderer checks its composites against."""
import itertools
import json
import os

from lib import registry
from teams.vampire import Thrall, Runner, Thrower, Blitzer

OPTIONS = json.load(open(os.path.join(os.path.dirname(__file__), "vampire_looks.json")))
BASES = {base.key: base for base in (Thrall, Runner, Thrower, Blitzer)}
EMPTY = None


def hair(sex, men="slick"):
    if sex == "f":
        return dict(hair="long", hair_mat="hair", tie="kit2")
    return dict(hair=men, hair_mat="hair")


LIPS = {"f": dict(lip="lip_f"), "m": dict(lip="lip")}
BODY = {
    "thrall": lambda sex: LIPS[sex],
    "vampire_runner": lambda sex: LIPS[sex],
    "vampire_thrower": lambda sex: dict(LIPS[sex], hair="bun" if sex == "f" else "slick"),
    "vampire_blitzer": lambda sex: LIPS[sex],
}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "thrall": {
        "head": (dict(helm=None, hair=None), {
            "cap": lambda sex: dict(hair(sex, "short"), helm="skull"),
            "hood": lambda sex: dict(hair(sex, "short"), helm="hood", hood_mat="kit2"),
            "bare": lambda sex: dict(hair(sex, "short"), helm=None)}),
        "chest": (dict(coat=None, tabard=None), {
            "gambeson": dict(coat="gambeson"), "tabard": dict(tabard="kit1", tabard_trim="kit2"),
            "apron": dict(tabard="leather", tabard_trim=None)}),
        "feet": (dict(boots="leather", cuff=None), {
            "boots": dict(cuff="rags"), "wraps": dict(boots="rags")}),
    },
    "vampire_runner": {
        "hair": (dict(hair=None), {
            "ponytail": dict(hair="long", hair_mat="hair", tie="kit2"), "braid": dict(hair="braid", hair_mat="hair", tie="kit2"),
            "short": dict(hair="short", hair_mat="hair")}),
        "legs": (dict(legs="skin"), {"bare": dict(legs="skin"), "leggings": dict(legs="kit2")}),
        "arms": (dict(arms="skin"), {"bare": dict(arms="skin"), "sleeves": dict(arms="kit1")}),
    },
    "vampire_thrower": {
        "coat": (dict(coat=None), {"frock": dict(coat="frock"), "tails": dict(coat="tails"), "none": EMPTY}),
        "cape": (dict(cape=None), {"long": dict(cape="long"), "short": dict(cape="short"), "none": EMPTY}),
    },
    "vampire_blitzer": {
        "helmet": (dict(helm=None, helm_wings=None, hair=None), {
            "winged": lambda sex: dict(hair(sex), helm="open", helm_wings="kit1"),
            "cap": lambda sex: dict(hair(sex), helm="skull"),
            "bare": lambda sex: hair(sex)}),
        "pads": (dict(pads=None), {
            "both": dict(pads="big", pad_sides=("l", "r")), "left": dict(pads="big", pad_sides=("l",)),
            "right": dict(pads="big", pad_sides=("r",))}),
        "cape": (dict(cape=None), {"short": dict(cape="short"), "long": dict(cape="long"), "none": EMPTY}),
    },
}


def value_layout(model, slot, value, sex):
    """The layout a value adds, or EMPTY when the value draws nothing."""
    layout = SLOTS[model][slot][1][value]
    return layout(sex) if callable(layout) else layout


def layout_for(model, choice):
    """A position's layout for a choice {"body": sex, option: value or EMPTY}; a missing option is empty."""
    sex = choice["body"]
    layout = dict(BASES[model].layout)
    layout.update(BODY[model](sex))
    for slot, (empty, _) in SLOTS[model].items():
        value = choice.get(slot, EMPTY)
        part = EMPTY if value is EMPTY else value_layout(model, slot, value, sex)
        layout.update(empty if part is EMPTY else dict(empty, **part))
    return layout


def variant(model, choice, key=None):
    """A model instance for a choice. Without a key it keeps the position's key, so its scene objects get the
    same names as every other layer of that position."""
    base = BASES[model]
    cls = type(base.__name__ + "Look", (base,), dict(key=key or base.key, sex=choice["body"],
                                                     layout=layout_for(model, choice)))
    return cls()


def full_key(model, values):
    return "%s__%s" % (model, "-".join(values))


class Looks:
    def __init__(self, model):
        self.model = model
        self.options = OPTIONS[model]

    def part(self, slot, value, body):
        return value_layout(self.model, slot, value, body)

    def variant(self, choice):
        return variant(self.model, choice)


for model, options in OPTIONS.items():
    registry.register_looks(model, Looks(model))
    names = [name for name, _, _ in options]
    for values in itertools.product(*([v for v, _ in vals] for _, _, vals in options)):
        registry.register(type(variant(model, dict(zip(names, values)), full_key(model, values))))
