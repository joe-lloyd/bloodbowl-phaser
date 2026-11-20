"""Look options of the Necromantic Horror and Shambling Undead positions, listed with their labels in
undead_skaven_lizards_undead_looks.json. Zombies and Ghouls come as men and women; skeletons, wights, mummies
and wraiths have one body, "x", and gear options. The Werewolf and Flesh Golem have none. See lib/looks.py
for how options, empty states and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.undead_skaven_lizards_undead import Zombie, Ghoul, Wraith, Skeleton, Wight, Mummy

BASES = {base.key: base for base in (Zombie, Ghoul, Wraith, Skeleton, Wight, Mummy)}

BODY = {
    "zombie": lambda sex: dict(hair="long", hair_mat="hair_brown", tie="rags", lip="lip_f") if sex == "f" else {},
    "ghoul": lambda sex: dict(hair="long", hair_mat="hair", tie="kit2", lip="lip_f") if sex == "f" else {},
}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "zombie": {
        "shirt": (dict(shirt=None), {"jersey": dict(shirt="kit1"), "shroud": dict(shirt="bandage")}),
        "pad": (dict(pads=None), {"pad": dict(pads="football_small", pad_sides=("l",)), "none": EMPTY}),
    },
    "ghoul": {
        "head": (dict(headband=None), {"band": dict(headband=True), "bare": EMPTY}),
        "pads": (dict(pads=None), {"pads": dict(pads="football_small"), "none": EMPTY}),
    },
    "wraith": {
        "head": (dict(helm=None, hood_rim=None, wraith_crown=None), {
            "hood": dict(helm="hood", hood_rim=True), "crowned": dict(helm="hood", hood_rim=True, wraith_crown=True)}),
        "shroud": (dict(shroud=None), {"shroud": dict(shroud=True), "none": EMPTY}),
    },
    "skeleton": {
        "helmet": (dict(helm=None, pot_helm=None), {
            "pot": dict(helm="skull", helm_mat="rust", pot_helm=True), "hood": dict(helm="hood", hood_mat="kit1"), "bare": EMPTY}),
        "shield": (dict(shield=None), {"none": EMPTY, "shield": dict(shield=True)}),
    },
    "wight": {
        "head": (dict(helm=None, crowned=None), {
            "crowned": dict(helm="open", crowned=True), "helm": dict(helm="open"), "crown": dict(crowned=True)}),
        "cape": (dict(cape=None), {"long": dict(cape="long"), "short": dict(cape="short"), "none": EMPTY}),
    },
    "mummy": {
        "head": (dict(headdress=None), {"wrap": dict(headdress="wrap"), "nemes": dict(headdress="nemes")}),
        "collar": (dict(broad_collar=None), {"collar": dict(broad_collar=True), "none": EMPTY}),
    },
}

looks.define(os.path.join(os.path.dirname(__file__), "undead_skaven_lizards_undead_looks.json"), BASES, SLOTS, BODY)
