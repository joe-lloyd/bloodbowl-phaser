"""Look options of the Nurgle positions, listed with their labels in chaos_nurgle_looks.json. The Bloater
and the Rotspawn keep one look. See lib/looks.py for how options and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.chaos_nurgle import Rotter, Pestigor

BASES = {base.key: base for base in (Rotter, Pestigor)}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "rotter": {
        "head": (dict(scarf=None, helm=None), {"bandage": dict(scarf="bandage"), "hood": dict(helm="hood"), "bare": EMPTY}),
        "shoulder": (dict(pads=None, tentacle=None), {"pad": dict(pads="plate"), "tentacle": dict(tentacle=True), "bare": EMPTY}),
    },
    "pestigor": {
        "horns": (dict(horn=None, horns=None), {"one": dict(horn="one"), "pair": dict(horns="goat")}),
        "flies": (dict(swarm=None), {"swarm": dict(swarm=True), "none": EMPTY}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "chaos_nurgle_looks.json"), BASES, SLOTS)
