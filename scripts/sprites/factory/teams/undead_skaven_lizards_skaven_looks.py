"""Look options of the Skaven positions, listed with their labels in undead_skaven_lizards_skaven_looks.json.
Rats have one body, "x"; their options are helmets, plates and cloth. The Rat Ogre has none. See lib/looks.py
for how options, empty states and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.undead_skaven_lizards_skaven import SkavenLineman, SkavenThrower, SkavenBlitzer, GutterRunner

BASES = {base.key: base for base in (SkavenLineman, SkavenThrower, SkavenBlitzer, GutterRunner)}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "skaven_lineman": {
        "head": (dict(helm=None), {
            "bare": EMPTY, "cap": dict(helm="skull", helm_mat="darkmetal"), "kettle": dict(helm="kettle", helm_mat="rust")}),
        "pads": (dict(pads=None), {
            "left": dict(pads="plate", pad_sides=("l",)), "both": dict(pads="plate", pad_sides=("l", "r")), "none": EMPTY}),
    },
    "skaven_thrower": {
        "head": (dict(helm=None, goggles=None), {
            "goggles": dict(helm="skull", goggles=True), "cap": dict(helm="skull"), "bare": EMPTY}),
        "arms": (dict(arms="fur_grey", sleeve_cuff=None), {
            "sleeves": dict(arms="kit1", sleeve_cuff="kit2"), "bare": dict(arms="fur_grey")}),
    },
    "skaven_blitzer": {
        "helmet": (dict(helm=None, plume=None, horns=None), {
            "crested": dict(helm="open", plume="kit1"), "horned": dict(helm="open", horns="bull", horn_mat="bone"),
            "bare": EMPTY}),
        "pads": (dict(pads=None), {
            "both": dict(pads="big", pad_sides=("l", "r")), "left": dict(pads="big", pad_sides=("l",)), "none": EMPTY}),
    },
    "gutter_runner": {
        "head": (dict(helm=None), {"hood": dict(helm="hood"), "bare": EMPTY}),
        "scarf": (dict(scarf_mat=None), {"black": dict(scarf_mat="cloth_black"), "kit": dict(scarf_mat="kit2"), "none": EMPTY}),
    },
}

looks.define(os.path.join(os.path.dirname(__file__), "undead_skaven_lizards_skaven_looks.json"), BASES, SLOTS)
