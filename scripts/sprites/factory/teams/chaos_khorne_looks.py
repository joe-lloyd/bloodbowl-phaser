"""Look options of the Khorne positions, listed with their labels in chaos_khorne_looks.json. The
Bloodspawn keeps one look. See lib/looks.py for how options and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.chaos_khorne import Marauder, Khorngor, Bloodseeker

BASES = {base.key: base for base in (Marauder, Khorngor, Bloodseeker)}


def tail(sex):
    """A woman's braid escapes from under the back of a helm."""
    return dict(helm_tail=True if sex == "f" else None)


LIPS = {"f": dict(lip="lip_f"), "m": dict(lip="lip_h")}
BODY = {
    "marauder": lambda sex: dict(LIPS[sex], beard=None, wrap="kit2") if sex == "f" else dict(LIPS[sex], beard="hair_red", wrap=None),
    "bloodseeker": lambda sex: LIPS[sex],
}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "marauder": {
        "hair": (dict(mohawk=None, hair=None, helm=None, horns=None, helm_tail=None), {
            "mohawk": lambda sex: dict(mohawk=True, hair="long" if sex == "f" else None), "braid": dict(hair="braid"),
            "helm": lambda sex: dict(tail(sex), helm="open", horns="bull")}),
        "pelt": (dict(cape=None), {"none": EMPTY, "fur": dict(cape="short")}),
    },
    "khorngor": {
        "horns": (dict(horns=None), {"ram": dict(horns="ram"), "bull": dict(horns="bull"), "goat": dict(horns="goat")}),
        "plate": (dict(skullplate=None), {"brass": dict(skullplate="brass"), "kit": dict(skullplate="kit1"), "none": EMPTY}),
    },
    "bloodseeker": {
        "helm": (dict(helm=None, plume=None, horns=None, helm_tail=None), {
            "crested": lambda sex: dict(tail(sex), helm="winged", plume="kit1"),
            "horned": lambda sex: dict(tail(sex), helm="winged", horns="bull"),
            "open": lambda sex: dict(tail(sex), helm="open", plume="kit1")}),
        "pads": (dict(pads=None, pad_sides=("l", "r")), {
            "big": dict(pads="big"), "left": dict(pads="big", pad_sides=("l",)), "plate": dict(pads="plate")}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "chaos_khorne_looks.json"), BASES, SLOTS, BODY)
