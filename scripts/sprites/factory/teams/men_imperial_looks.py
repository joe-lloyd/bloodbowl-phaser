"""Look options of the Imperial Nobility positions, listed with their labels in men_imperial_looks.json. See
lib/looks.py for how options, empty states and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams import men_common as mc
from teams.men_imperial import ImperialLineman, ImperialThrower, NobleBlitzer, Bodyguard

BASES = {base.key: base for base in (ImperialLineman, ImperialThrower, NobleBlitzer, Bodyguard)}

BODY = {
    "imperial_lineman": lambda sex: mc.hair(sex, "short", "braid", **mc.lips(sex)),
    "imperial_thrower": lambda sex: mc.hair(sex, "slick", "braid", **mc.shaven(sex, "hair_blond", 0.3)),
    "noble_blitzer": lambda sex: mc.shaven(sex, "hair_brown", 0.3),
    "bodyguard": mc.lips,
}

HEAD = dict(helm=None, hair=None, helm_tail=None)

SLOTS = {
    "imperial_lineman": {
        "hat": (dict(beret=None), {"beret": dict(beret=True), "bare": EMPTY}),
        "sleeves": (dict(puffs=None, arms="kit1"), {"puffed": dict(puffs=True), "coloured": dict(arms="kit2")}),
        "hose": (dict(mihose=None), {"halved": dict(mihose=True), "plain": EMPTY}),
    },
    "imperial_thrower": {
        "hat": (dict(hat=None), {"brim": dict(hat="brim"), "beret": dict(hat="beret"), "bare": EMPTY}),
        "cape": (dict(halfcape=None), {"half": dict(halfcape=True), "none": EMPTY}),
    },
    "noble_blitzer": {
        "helm": (dict(HEAD, morion=None), {
            "morion": lambda sex: dict(morion=True, hair="braid" if sex == "f" else None),
            "bare": lambda sex: mc.hair(sex, "short", "braid")}),
        "hose": (dict(trunks=None, legs="shirt"), {"trunks": dict(trunks=True), "tights": dict(legs="kit2")}),
    },
    "bodyguard": {
        "helm": (dict(HEAD, sallet=None, visor=None), {
            "sallet": lambda sex: dict(sallet=True, visor=True, hair="braid" if sex == "f" else None),
            "kettle": lambda sex: mc.helmed(sex, "kettle", helm_mat="darkmetal")}),
        "coat": (dict(coat=None), {"frock": dict(coat="frock"), "none": EMPTY}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "men_imperial_looks.json"), BASES, SLOTS, BODY)
