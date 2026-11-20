"""Look options of the Elven Union positions, listed with their labels in elves_union_looks.json. See
lib/looks.py for how options, empty states and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.elves_union import Lineman, Blitzer, Catcher, Thrower

BASES = {base.key: base for base in (Lineman, Blitzer, Catcher, Thrower)}

LIPS = {"f": dict(lip="lip_f"), "m": dict(lip="lip_h")}
BODY = {key: lambda sex: LIPS[sex] for key in BASES}
BODY["union_blitzer"] = lambda sex: dict(LIPS[sex], helm_tail=None, hair="braid") if sex == "f" else LIPS[sex]

HAIR = dict(hair=None, elf_backhair=None)

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "union_lineman": {
        "hair": (HAIR, {
            "swept": lambda sex: dict(hair="swept", elf_backhair="hair_blond" if sex == "f" else None),
            "ponytail": dict(hair="long"), "short": dict(hair="short")}),
        "pads": (dict(pads=None), {"small": dict(pads="football_small"), "full": dict(pads="football"), "none": EMPTY}),
    },
    "union_blitzer": {
        "fins": (dict(fins=None), {"swept": dict(fins="swept"), "crest": dict(fins="crest"), "none": EMPTY}),
        "pads": (dict(pads=None, neckroll=None), {
            "full": dict(pads="football", neckroll=True), "big": dict(pads="football_big", neckroll=True)}),
    },
    "union_catcher": {
        "hair": (dict(hair=None), {"ponytail": dict(hair="long"), "braid": dict(hair="braid"), "short": dict(hair="short")}),
        "shades": (dict(elf_shades=None), {"shades": dict(elf_shades="black"), "none": EMPTY}),
    },
    "union_thrower": {
        "hair": (HAIR, {
            "loose": dict(hair="slick", elf_backhair="hair_blond"), "ponytail": dict(hair="long"), "short": dict(hair="short")}),
        "sleeves": (dict(elf_sleeve=None), {"one": dict(elf_sleeve=("r",)), "both": dict(elf_sleeve=("l", "r")), "none": EMPTY}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "elves_union_looks.json"), BASES, SLOTS, BODY)
