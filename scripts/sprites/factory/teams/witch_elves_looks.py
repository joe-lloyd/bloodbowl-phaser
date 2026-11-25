"""Look options of the Witch Elf positions, listed with their labels in witch_elves_looks.json. See lib/looks.py
for how options, empty states and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.witch_elves import Novice, Priestess

BASES = {base.key: base for base in (Novice, Priestess)}


def tied(style, mat):
    return dict(hair=style, hair_mat=mat)


SLOTS = {
    "witch_novice": {
        "hair": (dict(hair=None, witch_hair=None, witch_knot=None), {
            "ponytail": tied("long", "hair"), "braid": tied("braid", "hair_red"), "swept": tied("swept", "hair_white"),
            "bun": tied("bun", "hair_blond"), "topknot": dict(tied("slick", "elf_pink"), witch_knot="elf_pink"),
            "wild": dict(witch_hair="hair")}),
        "top": (dict(witch_top=None), {
            "bandeau": dict(witch_top="bandeau"), "halter": dict(witch_top="halter"), "strap": dict(witch_top="strap")}),
        "bottom": (dict(witch_bottom=None, loin=None), {
            "briefs": dict(witch_bottom="briefs"), "sash": dict(witch_bottom="sash"),
            "loin": dict(witch_bottom="briefs", loin="kit1", loin_trim="kit2")}),
        "marks": (dict(witch_marks=None), {
            "none": EMPTY, "paint": dict(witch_marks="paint"), "mask": dict(witch_marks="mask"),
            "stockings": dict(witch_marks="stockings")}),
    },
    "witch_priestess": {
        "hair": (dict(hair=None, elf_backhair=None, elf_mane=None), {
            "sleek": dict(hair="slick", elf_backhair="hair_white"), "mane": dict(elf_mane="hair_white"),
            "braid": dict(hair="braid")}),
        "crown": (dict(elf_crown=None, elf_horns=None), {
            "horns": dict(elf_crown="metal"), "swept": dict(elf_horns="gold")}),
        "cape": (dict(cape=None), {"long": dict(cape="long"), "short": dict(cape="short"), "none": EMPTY}),
        "pads": (dict(pads=None, pad_sides=("l", "r")), {
            "both": dict(pads="plate"), "left": dict(pads="plate", pad_sides=("l",)), "none": EMPTY}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "witch_elves_looks.json"), BASES, SLOTS)
