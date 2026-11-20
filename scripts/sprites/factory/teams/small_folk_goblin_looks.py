"""Look options of the Goblin positions, listed with their labels in small_folk_goblin_looks.json. See
lib/looks.py for how options, empty states and bodies work. Goblins keep one body, "x"; their options are gear."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.small_folk_goblin import GoblinLineman, Bomma, DoomDiver, Fanatic, Loony, Ooligan, Pogoer

BASES = {base.key: base for base in (GoblinLineman, Bomma, DoomDiver, Fanatic, Loony, Ooligan, Pogoer)}
HELM = dict(helm=None, helm_mat=None)

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "goblin_lineman": {
        "head": (dict(topknot=None, pothelm=None, hood=None), {
            "topknot": dict(topknot=True), "pot": dict(pothelm="metal"), "hood": dict(hood="kit1")}),
        "pads": (dict(pads=None, pad_sides=None), {
            "left": dict(pads="leather", pad_sides=("l",)), "both": dict(pads="leather", pad_sides=("l", "r")), "none": EMPTY}),
    },
    "bomma": {
        "hat": (dict(HELM, tinhat=None, goggles=None), {
            "tin": dict(helm="skull", helm_mat="darkmetal", tinhat=True),
            "goggles": dict(helm="skull", helm_mat="leather", goggles="kit2"),
            "bare": EMPTY}),
        "bag": (dict(bag=None), {"satchel": dict(bag="satchel"), "keg": dict(bag="pack")}),
    },
    "doom_diver": {
        "head": (dict(HELM, helmspike=None), {
            "cap": dict(helm="skull", helm_mat="leather"), "spike": dict(helm="skull", helm_mat="metal", helmspike="metal"),
            "bare": EMPTY}),
        "wings": (dict(wing_mats=("kit2",)), {
            "canvas": dict(wing_mats=("kit2",)), "patched": dict(wing_mats=("kit2", "kit1")), "hide": dict(wing_mats=("leather",))}),
    },
    "fanatic": {
        "hood": (dict(hood=None, scarf=None), {
            "floppy": dict(hood="floppy"), "pointed": dict(hood="pointed"), "rag": dict(scarf="kit1")}),
        "rags": (dict(rags=None), {"skirt": dict(rags=0.3), "robe": dict(rags=0.62)}),
    },
    "loony": {
        "helm": (dict(HELM, plume=None, bucket=None), {
            "crest": dict(helm="skull", helm_mat="rust", plume="kit1"), "bucket": dict(bucket="darkmetal"), "bare": EMPTY}),
        "apron": (dict(apron=None), {"apron": dict(apron="kit2"), "none": EMPTY}),
    },
    "ooligan": {
        "hat": (dict(HELM, bobble=None, horns=None, horn_mat=None), {
            "bobble": dict(bobble=True), "horns": dict(helm="skull", helm_mat="darkmetal", horns="bull", horn_mat="bone"),
            "bare": EMPTY}),
        "scarf": (dict(scarf_len=None), {"long": dict(scarf_len=1.0), "short": dict(scarf_len=0.45), "none": EMPTY}),
    },
    "pogoer": {
        "helm": (dict(HELM, helmspike=None), {
            "spike": dict(helm="skull", helm_mat="metal", helmspike="metal"), "cap": dict(helm="skull", helm_mat="leather"),
            "bare": EMPTY}),
        "flag": (dict(pennant=None, banner=None), {"pennant": dict(pennant=0.3), "banner": dict(banner=True), "none": EMPTY}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "small_folk_goblin_looks.json"), BASES, SLOTS)
