"""Look options of the Tomb Kings positions, listed with their labels in undead_skaven_lizards_tomb_looks.json.
Skeletons have one body, "x"; their options are headdresses, a shield, capes and dress. The Tomb Guardian has
none. See lib/looks.py for how options, empty states and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.undead_skaven_lizards_tomb import TombSkeleton, AnointedBlitzer, AnointedThrower

BASES = {base.key: base for base in (TombSkeleton, AnointedBlitzer, AnointedThrower)}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "tk_skeleton": {
        "head": (dict(headcloth=None, helm=None, plume=None), {
            "cloth": dict(headcloth=True), "helm": dict(helm="open", helm_mat="brass", plume="kit1"), "bare": EMPTY}),
        "shield": (dict(shield=None), {"none": EMPTY, "shield": dict(shield=True)}),
    },
    "anointed_blitzer": {
        "head": (dict(headdress=None), {"crown": dict(headdress="crown"), "nemes": dict(headdress="nemes")}),
        "cape": (dict(cape=None), {"short": dict(cape="short"), "long": dict(cape="long"), "none": EMPTY}),
    },
    "anointed_thrower": {
        "head": (dict(headdress=None), {"winged": dict(headdress="winged"), "crown": dict(headdress="crown")}),
        "dress": (dict(coat=None, shorts=None, loin=None), {
            "robe": dict(coat="robe"), "kilt": dict(shorts="kit1", loin="kit1", loin_trim="gold")}),
    },
}

looks.define(os.path.join(os.path.dirname(__file__), "undead_skaven_lizards_tomb_looks.json"), BASES, SLOTS)
