"""Look options of the Wood Elf positions, listed with their labels in elves_wood_looks.json. See lib/looks.py
for how options, empty states and bodies work. The Loren treeman has no options."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.elves_wood import Lineman, Catcher, Thrower, Wardancer

BASES = {base.key: base for base in (Lineman, Catcher, Thrower, Wardancer)}

LIPS = {"f": dict(lip="lip_f"), "m": dict(lip="lip_h")}
BODY = {
    "we_lineman": lambda sex: dict(LIPS[sex], hair="braid" if sex == "f" else None),     # her braid falls out of the hood
    "we_catcher": lambda sex: LIPS[sex],
    "we_thrower": lambda sex: dict(LIPS[sex], hair="braid" if sex == "f" else "slick"),
    "wardancer": lambda sex: LIPS[sex],
}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "we_lineman": {
        "mantle": (dict(elf_mantle=None, cape=None), {
            "leaf": dict(elf_mantle="kit1"), "cloak": dict(cape="long"), "none": EMPTY}),
        "skirt": (dict(loin=None, elf_leafskirt=None), {"loin": dict(loin="kit1"), "leaves": dict(elf_leafskirt="kit1")}),
    },
    "we_catcher": {
        "hair": (dict(hair=None, elf_backhair=None), {
            "braid": dict(hair="braid"), "ponytail": dict(hair="long"), "loose": dict(hair="slick", elf_backhair="hair_red")}),
        "crown": (dict(elf_feathers=None, elf_antlers=None), {
            "feathers": dict(elf_feathers="kit2"), "antlers": dict(elf_antlers="bone_old"), "none": EMPTY}),
    },
    "we_thrower": {
        "crown": (dict(elf_antlers=None, elf_feathers=None), {
            "antlers": dict(elf_antlers="bone_old"), "feathers": dict(elf_feathers="kit2"), "circlet": EMPTY}),
        "cape": (dict(elf_cape=None), {"half": dict(elf_cape="half"), "full": dict(elf_cape="full"), "none": EMPTY}),
    },
    "wardancer": {
        "hair": (dict(hair=None, elf_topknot=None, elf_mohawk=None, elf_backhair=None), {
            "topknot": dict(elf_topknot="hair_red"), "mohawk": dict(elf_mohawk="hair_red"),
            "loose": dict(hair="slick", elf_backhair="hair_red")}),
        "paint": (dict(elf_paint=None), {"paint": dict(elf_paint="kit1"), "none": EMPTY}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "elves_wood_looks.json"), BASES, SLOTS, BODY)
