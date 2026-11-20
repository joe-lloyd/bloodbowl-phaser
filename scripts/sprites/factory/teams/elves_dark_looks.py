"""Look options of the Dark Elf positions, listed with their labels in elves_dark_looks.json. See lib/looks.py
for how options, empty states and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams import elves_common as ec
from teams.elves_dark import Lineman, Blitzer, Runner, Assassin, WitchElf

BASES = {base.key: base for base in (Lineman, Blitzer, Runner, Assassin, WitchElf)}


def bare(sex):
    return ec.hair(sex, "hair_white")


LIPS = {"f": dict(lip="lip_f"), "m": dict(lip="lip")}
BODY = {
    "de_lineman": lambda sex: LIPS[sex],
    "de_blitzer": lambda sex: LIPS[sex],
    "de_runner": lambda sex: LIPS[sex],
    "assassin": lambda sex: dict(LIPS[sex], hair="braid" if sex == "f" else None),
}

HEAD = dict(helm=None, helm_tail=None, hair=None, elf_backhair=None)

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "de_lineman": {
        "head": (dict(HEAD, elf_comb=None, elf_cheeks=None, plume=None), {
            "ridged": ec.helmed(helm="skull", elf_comb="kit1", elf_cheeks="darkmetal"),
            "crested": ec.helmed(helm="open", plume="kit1"),
            "bare": bare}),
        "chest": (dict(coat=None, tabard=None), {
            "gambeson": dict(coat="gambeson"), "tabard": dict(tabard="kit1", tabard_trim="kit2"), "none": EMPTY}),
        "pads": (dict(pads=None), {"spiked": dict(pads="plate"), "none": EMPTY}),
    },
    "de_blitzer": {
        "helmet": (dict(HEAD, elf_horns=None, helm_wings=None), {
            "horned": ec.helmed(helm="open", elf_horns="metal"),
            "winged": ec.helmed(helm="open", helm_wings="kit1"),
            "bare": bare}),
        "pads": (dict(pads=None, spikes=None), {
            "spiked": dict(pads="big", spikes=2), "plate": dict(pads="plate")}),
        "cape": (dict(cape=None), {"short": dict(cape="short"), "long": dict(cape="long"), "none": EMPTY}),
    },
    "de_runner": {
        "hair": (dict(hair=None, elf_backhair=None), {
            "swept": lambda sex: dict(hair="swept", elf_backhair="hair_white" if sex == "f" else None),
            "ponytail": dict(hair="long"), "braid": dict(hair="braid")}),
        "scarf": (dict(elf_mask=None, elf_scarf=None), {
            "masked": dict(elf_mask="kit2", elf_scarf="kit2"), "scarf": dict(elf_scarf="kit2"), "none": EMPTY}),
    },
    "assassin": {
        "cloak": (dict(elf_cloak=None, cape=None), {
            "ragged": dict(elf_cloak="kit1"), "long": dict(cape="long"), "none": EMPTY}),
        "face": (dict(elf_mask=None), {"masked": dict(elf_mask="kit1"), "bare": EMPTY}),
    },
    "witch_elf": {
        "hair": (dict(hair=None, elf_mane=None), {
            "mane": dict(elf_mane="hair_white"), "ponytail": dict(hair="long"), "braid": dict(hair="braid")}),
        "crown": (dict(elf_tiara=None, elf_horns=None), {
            "tiara": dict(elf_tiara="metal"), "horns": dict(elf_horns="darkmetal"), "none": EMPTY}),
        "legs": (dict(legs="skin"), {"bare": dict(legs="skin"), "hose": dict(legs="kit2")}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "elves_dark_looks.json"), BASES, SLOTS, BODY)
