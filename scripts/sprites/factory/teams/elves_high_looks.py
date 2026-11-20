"""Look options of the High Elf positions, listed with their labels in elves_high_looks.json. See lib/looks.py
for how options, empty states and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams import elves_common as ec
from teams.elves_high import Lineman, Blitzer, Thrower, Catcher

BASES = {base.key: base for base in (Lineman, Blitzer, Thrower, Catcher)}


def bare(sex):
    return ec.hair(sex, "hair_blond")


LIPS = {"f": dict(lip="lip_f"), "m": dict(lip="lip_h")}
BODY = {key: lambda sex: LIPS[sex] for key in BASES}

HEAD = dict(helm=None, helm_tail=None, hair=None, elf_backhair=None)
CHEST = dict(coat=None, tabard=None)

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "he_lineman": {
        "helmet": (dict(HEAD, elf_spire=None, plume=None), {
            "spire": ec.helmed(helm="open", elf_spire="metal"),
            "plumed": ec.helmed(helm="open", plume="kit2"),
            "bare": bare}),
        "chest": (CHEST, {"tabard": dict(tabard="kit1"), "robe": dict(coat="robe")}),
    },
    "he_blitzer": {
        "helmet": (dict(HEAD, elf_dragon=None, helm_wings=None), {
            "dragon": ec.helmed(helm="open", elf_dragon="kit2"),
            "winged": ec.helmed(helm="open", helm_wings="kit2"),
            "bare": bare}),
        "cape": (dict(cape=None), {"long": dict(cape="long"), "short": dict(cape="short"), "none": EMPTY}),
    },
    "he_thrower": {
        "helmet": (dict(HEAD, elf_phoenix=None, elf_circlet=None), {
            "phoenix": ec.helmed(helm="open", elf_phoenix="kit2"),
            "plain": ec.helmed(helm="open"),
            "circlet": lambda sex: dict(bare(sex), elf_circlet="gold")}),
        "robe": (CHEST, {"robe": dict(coat="robe"), "tabard": dict(tabard="kit1"), "short": dict(coat="gambeson")}),
        "collar": (dict(elf_ruff=None), {"ruff": dict(elf_ruff="kit2"), "none": EMPTY}),
    },
    "he_catcher": {
        "hair": (dict(hair=None, elf_backhair=None), {
            "loose": dict(hair="slick", elf_backhair="hair_blond"), "ponytail": dict(hair="long"),
            "braid": dict(hair="braid")}),
        "pelt": (dict(elf_pelt=None), {"lion": dict(elf_pelt="fur_white"), "none": EMPTY}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "elves_high_looks.json"), BASES, SLOTS, BODY)
