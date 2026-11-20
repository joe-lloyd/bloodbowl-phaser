"""Look options of the Amazon positions, listed with their labels in men_amazon_looks.json. An all-woman
team: every position has the one female body. See lib/looks.py for how options and empty states work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams import men_common as mc
from teams.men_amazon import EagleWarrior, JaguarWarrior, PiranhaWarrior, PythonWarrior

BASES = {base.key: base for base in (EagleWarrior, JaguarWarrior, PiranhaWarrior, PythonWarrior)}
BODY = {key: mc.lips for key in BASES}

SLOTS = {
    "amazon_eagle": {
        "crown": (dict(crown=None), {"fan": dict(crown="fan"), "plume": dict(crown="plume"), "none": EMPTY}),
        "wings": (dict(fringe=None, cape=None), {
            "fringe": dict(fringe=True), "cloak": dict(cape="short", cape_mat="kit1", cape_lining="kit2"), "none": EMPTY}),
    },
    "amazon_jaguar": {
        "head": (dict(hood=None, hair=None), {"hood": dict(hood=True), "bare": dict(hair="braid", tie="kit1")}),
        "pelt": (dict(pelt=None), {"back": dict(pelt=True), "none": EMPTY}),
    },
    "amazon_piranha": {
        "head": (dict(fish=None, helm_tail=None, hair=None), {"fish": dict(fish=True, helm_tail=True), "bare": dict(hair="long")}),
        "fins": (dict(fins=None), {"fins": dict(fins=True), "none": EMPTY}),
    },
    "amazon_python": {
        "hair": (dict(hair=None), {"long": dict(hair="long"), "braid": dict(hair="braid"), "bun": dict(hair="bun")}),
        "arms": (dict(arm_band=None, wraps=None, bracers=None), {
            "bands": dict(arm_band="kit1", wraps="kit2"), "gold": dict(bracers="gold", arm_band="gold"), "bare": EMPTY}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "men_amazon_looks.json"), BASES, SLOTS, BODY)
