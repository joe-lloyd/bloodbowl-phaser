"""Look options of the Ogre and Underworld Denizens positions, listed with their labels in
greenskins_dwarfs_monsters_looks.json. See lib/looks.py for how options, empty states and bodies work.
Trolls and the mutant rat ogre are monsters and have no options. Ogre women lose the moustache and wear a
braid, hoops and lips; the bare-chested blocker also wears a bust wrap."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.greenskins_dwarfs_monsters import OgreBlocker, OgreRunt, Gnoblar, UnderworldGoblin, UnderworldSnotling

BASES = {base.key: base for base in (OgreBlocker, OgreRunt, Gnoblar, UnderworldGoblin, UnderworldSnotling)}


def ogress(**more):
    def body(sex):
        if sex == "f":
            return dict(lip="lip_f", gd_hoops="gold", **more)
        return {}
    return body


BODY = {
    "ogre_blocker": ogress(gd_tache=None, gd_wrap="kit2", hair="braid", hair_mat="hair_brown", tie="kit2"),
    "ogre_runt": ogress(helm_tail=True, hair_mat="hair_brown", tie="kit2"),
}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "ogre_blocker": {
        "hair": (dict(gd_topknot=None, gd_mohawk=None), {
            "bald": EMPTY, "topknot": dict(gd_topknot="hair"), "mohawk": dict(gd_mohawk="hair")}),
        "chest": (dict(gd_gut=None), {"plate": dict(gd_gut=True), "straps": EMPTY}),
        "shoulder": (dict(gd_shplate=None), {"iron": dict(gd_shplate=True), "none": EMPTY}),
    },
    "ogre_runt": {
        "head": (dict(helm=None, gd_runtcap=None, scarf=None, hair=None), {
            "cap": dict(helm="skull", helm_mat="kit2", gd_runtcap=True),
            "bandana": dict(scarf="kit1"),
            "bare": lambda sex: dict(hair="short", hair_mat="hair_brown") if sex == "m" else dict(hair="bun", hair_mat="hair_brown")}),
        "boot": (dict(gd_kboot=None), {"iron": dict(gd_kboot="metal"), "kit": dict(gd_kboot="kit2")}),
    },
    "gnoblar": {
        "head": (dict(helm=None), {"bare": EMPTY, "hood": dict(helm="hood", hood_mat="kit2"),
                                   "cap": dict(helm="skull", helm_mat="leather", trim="leather")}),
        "pack": (dict(gd_roll=None, gd_basket=None), {"roll": dict(gd_roll=True), "basket": dict(gd_basket=True), "none": EMPTY}),
    },
    "goblin_underworld": {
        "head": (dict(helm=None), {"hood": dict(helm="hood", hood_mat="kit1"),
                                   "cap": dict(helm="skull", helm_mat="leather", trim="leather"), "bare": EMPTY}),
        "growth": (dict(gd_shcry=None, gd_hcry=None), {
            "shoulder": dict(gd_shcry=True), "head": dict(gd_hcry=True), "none": EMPTY}),
    },
    "snotling_underworld": {
        "crystal": (dict(gd_horn=None), {"one": dict(gd_horn="one"), "twin": dict(gd_horn="twin"),
                                         "back": dict(gd_horn="back")}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "greenskins_dwarfs_monsters_looks.json"), BASES, SLOTS, BODY)
