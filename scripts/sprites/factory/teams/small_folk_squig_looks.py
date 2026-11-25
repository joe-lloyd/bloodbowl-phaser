"""Look options of the goblins with cave beasts, listed with their labels in small_folk_squig_looks.json. See
lib/looks.py for how options, empty states and bodies work."""
import os

from lib import looks
from teams.small_folk_squig import SquigHopper, SquigWrangler

BASES = {base.key: base for base in (SquigHopper, SquigWrangler)}

SLOTS = {
    "squig_wrangler": {
        "hood": (dict(hood=None, scarf=None), {
            "pointed": dict(hood="pointed"), "floppy": dict(hood="floppy"), "rag": dict(scarf="kit1")}),
        "rags": (dict(rags=None), {"skirt": dict(rags=0.3), "robe": dict(rags=0.62)}),
    },
    "squig_hopper": {
        "helm": (dict(helm=None, helm_mat=None, helmspike=None, hood=None), {
            "spike": dict(helm="skull", helm_mat="metal", helmspike="metal"), "cap": dict(helm="skull", helm_mat="leather"),
            "pointed": dict(hood="pointed"), "floppy": dict(hood="floppy")}),
        "chest": (dict(torso="kit1"), {"jersey": dict(torso="kit1"), "bare": dict(torso="skin_goblin")}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "small_folk_squig_looks.json"), BASES, SLOTS)
