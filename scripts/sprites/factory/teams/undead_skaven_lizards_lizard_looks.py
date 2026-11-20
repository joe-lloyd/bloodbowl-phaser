"""Look options of the Lizardmen positions, listed with their labels in undead_skaven_lizards_lizard_looks.json.
Lizards have one body, "x"; their options are crests, frills, horns and gear. The Kroxigor has none. See
lib/looks.py for how options, empty states and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.undead_skaven_lizards_lizard import Saurus, Skink, ChameleonSkink

BASES = {base.key: base for base in (Saurus, Skink, ChameleonSkink)}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "saurus": {
        "head": (dict(head_crest=None, head_frill=None, saurus_horns=None), {
            "crest": dict(head_crest="kit2", saurus_horns="swept"),
            "frill": dict(head_frill="kit2", saurus_horns="swept"),
            "horns": dict(saurus_horns="long")}),
        "shoulder": (dict(pads=None), {
            "left": dict(pads="plate", pad_sides=("l",)), "both": dict(pads="plate", pad_sides=("l", "r")), "none": EMPTY}),
    },
    "skink": {
        "crest": (dict(skink_crest=None), {"sail": dict(skink_crest="sail"), "frill": dict(skink_crest="frill"), "none": EMPTY}),
        "chest": (dict(neckband=None, chest=None), {
            "band": dict(neckband="kit1"), "harness": dict(chest="harness"), "sash": dict(chest="sash")}),
    },
    "chameleon_skink": {
        "head": (dict(casque=None), {"casque": dict(casque="plain"), "horned": dict(casque="horned"), "smooth": EMPTY}),
        "strap": (dict(body_strap=None), {"sash": dict(body_strap="sash"), "harness": dict(body_strap="harness")}),
    },
}

looks.define(os.path.join(os.path.dirname(__file__), "undead_skaven_lizards_lizard_looks.json"), BASES, SLOTS)
