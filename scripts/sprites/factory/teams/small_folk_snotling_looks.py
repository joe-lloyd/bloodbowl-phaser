"""Look options of the Snotling positions, listed with their labels in small_folk_snotling_looks.json. See
lib/looks.py for how options, empty states and bodies work. Snotlings keep one body, "x"; their options are
headgear big enough to read at their size."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.small_folk_snotling import Snotling, StiltyRunna, FunHoppa, FungusFlinga

BASES = {base.key: base for base in (Snotling, StiltyRunna, FunHoppa, FungusFlinga)}
HATS = {"cone": dict(snothat="cone"), "band": dict(snothat="band"), "pot": dict(snothat="pot")}
HAT = (dict(snothat=None), HATS)

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "snotling": {
        "head": (dict(tuft=None, snothat=None), {
            "tuft": dict(tuft=True), "pot": dict(snothat="pot"), "toadstool": dict(snothat="toadstool")}),
        "neck": (dict(kerchief=None, scarf_tails=None), {"kerchief": dict(kerchief="kit2"), "scarf": dict(scarf_tails=True)}),
    },
    "stilty_runna": {"hat": HAT},
    "fun_hoppa": {"hat": HAT},
    "fungus_flinga": {
        "hat": (dict(snothat=None), dict(HATS, cap=dict(snothat="bigcap"))),
        "load": (dict(load=None), {"sack": dict(load="sack"), "basket": dict(load="basket")}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "small_folk_snotling_looks.json"), BASES, SLOTS)
