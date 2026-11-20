"""Look options of the Human positions, listed with their labels in men_human_looks.json. See lib/looks.py
for how options, empty states and bodies work. The Ogre has no options."""
import os

from lib import looks
from lib.looks import EMPTY
from teams import men_common as mc
from teams.men_human import HumanLineman, HumanThrower, HumanCatcher, HumanBlitzer

BASES = {base.key: base for base in (HumanLineman, HumanThrower, HumanCatcher, HumanBlitzer)}

BODY = {
    "human_lineman": lambda sex: mc.shaven(sex, "hair_brown", 0.35),
    "human_thrower": lambda sex: mc.hair(sex, "short", "braid", **mc.lips(sex)),
    "human_catcher": lambda sex: mc.hair(sex, "swept", "long", **mc.lips(sex)),
    "human_blitzer": mc.lips,
}

HEAD = dict(helm=None, hair=None, helm_tail=None)

SLOTS = {
    "human_lineman": {
        "head": (HEAD, {
            "kettle": lambda sex: mc.helmed(sex, "kettle"),
            "cap": lambda sex: mc.helmed(sex, "skull"),
            "bare": lambda sex: mc.hair(sex)}),
        "pads": (dict(pads=None), {
            "left": dict(pads="leather", pad_sides=("l",)), "plate": dict(pads="plate", pad_sides=("l", "r"), pad_mat="metal"),
            "none": EMPTY}),
    },
    "human_thrower": {
        "hat": (dict(hat=None), {"cap": dict(hat="cap"), "beret": dict(hat="beret"), "bare": EMPTY}),
        "sleeves": (dict(sleeves=None), {"one": dict(sleeves="one"), "both": dict(sleeves="both"), "none": EMPTY}),
    },
    "human_catcher": {
        "head": (dict(band=None, scarf=None), {"band": dict(band="kit2"), "scarf": dict(scarf="kit2"), "bare": EMPTY}),
        "legs": (dict(trunks=None, legs="skin_tan"), {"shorts": dict(trunks=True), "tights": dict(trunks=True, legs="kit1")}),
    },
    "human_blitzer": {
        "helmet": (dict(HEAD, plume_tall=None), {
            "plumed": lambda sex: mc.helmed(sex, "open", plume_tall=True),
            "visored": lambda sex: mc.helmed(sex, "winged"),
            "bare": lambda sex: mc.hair(sex)}),
        "pads": (dict(pads=None), {
            "both": dict(pads="big", pad_sides=("l", "r")), "left": dict(pads="big", pad_sides=("l",)), "none": EMPTY}),
        "chest": (dict(tabard=None, cape=None), {
            "tabard": dict(tabard="kit1", tabard_trim="kit2"),
            "cape": dict(cape="short", cape_mat="kit2", cape_lining="kit1")}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "men_human_looks.json"), BASES, SLOTS, BODY)
