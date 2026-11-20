"""Look options of the Chaos Chosen positions, listed with their labels in chaos_chosen_looks.json. The
Minotaur, Chaos Ogre and Chaos Troll keep one look. See lib/looks.py for how options and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.chaos_chosen import Beastman, ChaosChosen

BASES = {base.key: base for base in (Beastman, ChaosChosen)}


def tail(sex):
    """A woman's ponytail escapes from under the back of a helm."""
    return dict(helm_tail=True if sex == "f" else None)


def bare(sex):
    if sex == "f":
        return dict(hair="long", horns="ram")
    return dict(horns="ram")


BODY = {"chaos_chosen": lambda sex: dict(lip="lip_f" if sex == "f" else "lip_h")}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "beastman": {
        "horns": (dict(horns=None), {"goat": dict(horns="goat"), "ram": dict(horns="ram"), "bull": dict(horns="bull")}),
        "mutation": (dict(mutation=None), {"none": EMPTY, "eye": dict(mutation="eye"), "tentacle": dict(mutation="tentacle")}),
    },
    "chaos_chosen": {
        "helm": (dict(helm=None, horns=None, plume=None, hair=None, helm_tail=None), {
            "horned": lambda sex: dict(tail(sex), helm="winged", horns="bull"),
            "crested": lambda sex: dict(tail(sex), helm="open", plume="kit1"),
            "bare": bare}),
        "cape": (dict(cape=None), {"short": dict(cape="short"), "long": dict(cape="long"), "none": EMPTY}),
        "mutation": (dict(mutation=None), {"none": EMPTY, "tentacle": dict(mutation="tentacle"), "claw": dict(mutation="claw")}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "chaos_chosen_looks.json"), BASES, SLOTS, BODY)
