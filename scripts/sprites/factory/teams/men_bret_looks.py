"""Look options of the Bretonnian positions, listed with their labels in men_bret_looks.json. See lib/looks.py
for how options, empty states and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams import men_common as mc
from teams.men_bret import Squire, KnightCatcher, KnightThrower, GrailKnight

BASES = {base.key: base for base in (Squire, KnightCatcher, KnightThrower, GrailKnight)}

BODY = {
    "bret_squire": mc.lips,
    "bret_catcher": mc.lips,
    "bret_thrower": lambda sex: mc.shaven(sex, "hair", 0.25),
    "grail_knight": mc.lips,
}

HEAD = dict(helm=None, hair=None, helm_tail=None)
CAPE = (dict(cape=None), {"long": dict(cape="long"), "short": dict(cape="short"), "none": EMPTY})


def braid(sex):
    return "braid" if sex == "f" else None


SLOTS = {
    "bret_squire": {
        "head": (dict(HEAD, hoodcape=None, strawhat=None), {
            "hood": lambda sex: dict(helm="hood", hood_mat="kit1", hoodcape=True, hair=braid(sex)),
            "hat": lambda sex: mc.hair(sex, "short", "braid", strawhat=True),
            "bare": lambda sex: mc.hair(sex, "short", "braid")}),
        "legs": (dict(legs="skin_fair"), {"bare": dict(legs="skin_fair"), "hose": dict(legs="kit2")}),
    },
    "bret_catcher": {
        "helm": (dict(HEAD, mantle=None), {
            "mantled": lambda sex: mc.helmed(sex, "open", mantle=True),
            "bare": lambda sex: mc.hair(sex, "short", "braid")}),
        "surcoat": (dict(surcoat=None, tabard=None), {
            "halved": dict(surcoat="halved"), "tabard": dict(tabard="kit1", tabard_trim="kit2")}),
    },
    "bret_thrower": {
        "helm": (dict(HEAD, bascinet=None), {
            "bascinet": lambda sex: dict(bascinet=True, hair=braid(sex)),
            "bare": lambda sex: mc.hair(sex, "short", "braid")}),
        "pads": (dict(pads=None), {
            "left": dict(pads="plate", pad_sides=("l",)), "heraldic": dict(pads="plate", pad_sides=("l", "r"), pad_mat="kit2"),
            "big": dict(pads="big", pad_sides=("l", "r"))}),
    },
    "grail_knight": {
        "helm": (dict(HEAD, great=None, visor=None, plume=None), {
            "great": lambda sex: dict(great=True, visor=True, hair=braid(sex)),
            "open": lambda sex: mc.helmed(sex, "open", plume="kit2")}),
        "cape": CAPE,
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "men_bret_looks.json"), BASES, SLOTS, BODY)
