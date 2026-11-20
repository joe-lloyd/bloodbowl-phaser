"""Look options of the Vampire positions, listed with their labels in vampire_looks.json. See lib/looks.py
for how options, empty states and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.vampire import Thrall, Runner, Thrower, Blitzer

BASES = {base.key: base for base in (Thrall, Runner, Thrower, Blitzer)}


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


looks.define(os.path.join(os.path.dirname(__file__), "vampire_looks.json"), BASES, SLOTS, BODY)
