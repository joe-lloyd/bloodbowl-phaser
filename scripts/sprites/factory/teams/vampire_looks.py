"""Look variants of the Vampire positions, for the player page. Each position has its own options, listed
with their labels in vampire_looks.json; the first value of every option is the position's own look. A
variant is registered as <model>__<value>-<value>-..., in the order of its options, so the driver sizes
and colours it like its model."""
import itertools
import json
import os

from lib import registry
from teams.vampire import Thrall, Runner, Thrower, Blitzer

OPTIONS = json.load(open(os.path.join(os.path.dirname(__file__), "vampire_looks.json")))
BASES = {base.key: base for base in (Thrall, Runner, Thrower, Blitzer)}


def hair(sex, bald_men=False):
    if sex == "f":
        return dict(hair="long", hair_mat="hair", lip="lip_f", tie="kit2")
    return dict(hair="short" if bald_men else "slick", hair_mat="hair", lip="lip")


LAYOUTS = {
    "thrall": {
        "head": {"cap": dict(helm="skull"), "hood": dict(helm="hood", hood_mat="kit2"), "bare": dict(helm=None)},
        "chest": {"gambeson": {}, "tabard": dict(coat=None, tabard="kit1", tabard_trim="kit2"),
                  "apron": dict(coat=None, tabard="leather", tabard_trim=None)},
        "feet": {"boots": {}, "wraps": dict(boots="rags", cuff=None)},
    },
    "vampire_runner": {
        "hair": {"ponytail": dict(hair="long"), "braid": dict(hair="braid"), "short": dict(hair="short")},
        "legs": {"bare": {}, "leggings": dict(legs="kit2")},
        "arms": {"bare": {}, "sleeves": dict(arms="kit1")},
    },
    "vampire_thrower": {
        "coat": {"frock": {}, "tails": dict(coat="tails"), "none": dict(coat=None)},
        "cape": {"long": {}, "short": dict(cape="short"), "none": dict(cape=None)},
    },
    "vampire_blitzer": {
        "helmet": {"winged": {}, "cap": dict(helm="skull", helm_wings=None), "bare": dict(helm=None, helm_wings=None)},
        "pads": {"both": {}, "left": dict(pad_sides=("l",)), "right": dict(pad_sides=("r",))},
        "cape": {"short": {}, "long": dict(cape="long"), "none": dict(cape=None)},
    },
}
BODY_HAIR = {"thrall": True, "vampire_thrower": False, "vampire_blitzer": False}
THROWER_HAIR = {"f": dict(hair="bun"), "m": dict(hair="slick", lip="lip")}


def look(base, values):
    choice = dict(zip((name for name, _, _ in OPTIONS[base.key]), values))
    sex = choice["body"]
    layout = dict(base.layout)
    if base.key in BODY_HAIR:
        layout.update(hair(sex, BODY_HAIR[base.key]))
    if base.key == "vampire_thrower":
        layout.update(THROWER_HAIR[sex])
    if base.key == "vampire_runner" and sex == "m":
        layout.update(lip="lip", tie=None)
    for name, value in choice.items():
        layout.update(LAYOUTS[base.key].get(name, {}).get(value, {}))
    key = "%s__%s" % (base.key, "-".join(values))
    return type(base.__name__ + "Look", (base,), dict(key=key, sex=sex, layout=layout, __doc__="Look variant of " + base.key))


for model, options in OPTIONS.items():
    for values in itertools.product(*([v for v, _ in vals] for _, _, vals in options)):
        registry.register(look(BASES[model], values))
