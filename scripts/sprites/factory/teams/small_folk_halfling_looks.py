"""Look options of the Halfling positions, listed with their labels in small_folk_halfling_looks.json. See
lib/looks.py for how options, empty states and bodies work. Halfling women wear two plaits."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.small_folk_halfling import HalflingHopeful, HalflingCatcher, HalflingHefty

BASES = {base.key: base for base in (HalflingHopeful, HalflingCatcher, HalflingHefty)}


def woman(hair):
    """Halfling women: two plaits, brows and temple curls to match and fuller lips; men keep the position's hair."""
    def body(sex):
        if sex == "f":
            return dict(pigtails=hair, brow=hair, curl_mat=hair, lip="lip_f")
        return dict(pigtails=None)
    return body


BODY = {
    "halfling_hopeful": woman("hair_red"),
    "halfling_catcher": woman("hair_red"),
    "halfling_hefty": woman("hair_blond"),
}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "halfling_hopeful": {
        "head": (dict(pot=None, scarf=None, mop=None), {
            "pot": dict(pot=True), "kerchief": dict(scarf="kit2"), "curls": dict(mop="hair_brown")}),
        "apron": (dict(apron=None), {"apron": dict(apron="kit2"), "none": EMPTY}),
    },
    "halfling_catcher": {
        "head": (dict(headband=None, flatcap=None), {
            "band": dict(headband="kit2"), "cap": dict(flatcap="kit2"), "bare": EMPTY}),
        "scarf": (dict(scarf_len=None), {"long": dict(scarf_len=1.0), "short": dict(scarf_len=0.45), "none": EMPTY}),
    },
    "halfling_hefty": {
        "hat": (dict(toque=None, kerchief=None), {"toque": dict(toque=True), "kerchief": dict(kerchief="kit2"), "bare": EMPTY}),
        "back": (dict(back=None), {"pan": dict(back="pan"), "cauldron": dict(back="cauldron"), "pin": dict(back="pin")}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "small_folk_halfling_looks.json"), BASES, SLOTS, BODY)
