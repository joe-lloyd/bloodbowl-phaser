"""Look options of the Chaos Renegade positions, listed with their labels in chaos_renegade_looks.json. See
lib/looks.py for how options and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.chaos_renegade import (RenegadeLineman, RenegadeThrower, RenegadeOrc, RenegadeGoblin, RenegadeSkaven,
                                  RenegadeDarkElf)

BASES = {base.key: base for base in (RenegadeLineman, RenegadeThrower, RenegadeOrc, RenegadeGoblin, RenegadeSkaven,
                                     RenegadeDarkElf)}


def fem(sex, women, men=None):
    return women if sex == "f" else men


HUMAN_LIPS = {"f": dict(lip="lip_f"), "m": dict(lip="lip_h")}
BODY = {
    "renegade_lineman": lambda sex: HUMAN_LIPS[sex],
    "renegade_thrower": lambda sex: HUMAN_LIPS[sex],
    "renegade_dark_elf": lambda sex: dict(lip=fem(sex, "lip_f", "lip")),
}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "renegade_lineman": {
        "head": (dict(scarf=None, helm=None, hair=None, helm_tail=None), {
            "scarf": lambda sex: dict(scarf="kit1", hair=fem(sex, "long")),
            "cap": lambda sex: dict(helm="skull", helm_tail=fem(sex, True)),
            "bare": lambda sex: dict(hair=fem(sex, "long", "short"))}),
        "pads": (dict(pads=None, pad_sides=("l",)), {
            "left": dict(pads="football", pad_sides=("l",)), "right": dict(pads="football", pad_sides=("r",)),
            "both": dict(pads="football", pad_sides=("l", "r"))}),
    },
    "renegade_thrower": {
        "hair": (dict(hair=None, mohawk=None), {
            "swept": lambda sex: dict(hair=fem(sex, "long", "swept")), "braid": dict(hair="braid"), "mohawk": dict(mohawk=True)}),
        "coat": (dict(coat=None), {"tails": dict(coat="tails"), "frock": dict(coat="frock"), "none": EMPTY}),
    },
    "renegade_orc": {
        "head": (dict(topknot=None, mohawk=None, helm=None), {
            "topknot": dict(topknot=True), "mohawk": dict(mohawk=True), "helm": dict(helm="skull")}),
        "pads": (dict(pads=None, pad_sides=("l", "r")), {
            "both": dict(pads="football_big"), "left": dict(pads="football_big", pad_sides=("l",)), "none": EMPTY}),
    },
    "renegade_goblin": {
        "helm": (dict(helm=None), {"kettle": dict(helm="kettle"), "cap": dict(helm="skull"), "bare": EMPTY}),
        "smock": (dict(coat=None), {"smock": dict(coat="robe"), "vest": EMPTY}),
    },
    "renegade_skaven": {
        "horns": (dict(horns=None), {"stubs": dict(horns="small"), "ram": dict(horns="ram"), "none": EMPTY}),
        "mutation": (dict(mutation=None), {
            "spines": dict(mutation="spines"), "tentacle": dict(mutation="tentacle"), "eye": dict(mutation="eye")}),
    },
    "renegade_dark_elf": {
        "hair": (dict(hair=None, helm=None, helm_tail=None), {
            "long": dict(hair="long"), "braid": dict(hair="braid"), "helm": dict(helm="open", helm_tail=True)}),
        "cape": (dict(cape=None), {"short": dict(cape="short"), "long": dict(cape="long"), "none": EMPTY}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "chaos_renegade_looks.json"), BASES, SLOTS, BODY)
