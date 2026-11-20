"""Look options of the Norse positions, listed with their labels in men_norse_looks.json. The Valkyrie is a
woman; the Ulfwerener, Yhetee and Beer Boar have no options. See lib/looks.py for how options work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams import men_common as mc
from teams.men_norse import Berserker, Raider, Valkyrie

BASES = {base.key: base for base in (Berserker, Raider, Valkyrie)}

BODY = {
    "berserker": lambda sex: mc.shaven(sex, "hair_red", 0.9),
    "norse_raider": lambda sex: mc.shaven(sex, "hair_blond", 0.7),
    "valkyrie": mc.lips,
}

SLOTS = {
    "berserker": {
        "hair": (dict(hair=None, mane=None), {
            "mane": dict(hair="swept", mane="mane"), "crest": dict(mane="crest"), "braids": dict(hair="slick", mane="braids")}),
        "paint": (dict(paint=None), {"stripes": dict(paint=True), "none": EMPTY}),
    },
    "norse_raider": {
        "head": (dict(helm=None, hair=None, helm_tail=None, horncap=None), {
            "horned": lambda sex: mc.helmed(sex, "skull", horncap=True),
            "bare": lambda sex: mc.hair(sex, "short", "braid")}),
        "mantle": (dict(mantle=None), {"fur": dict(mantle=True), "none": EMPTY}),
    },
    "valkyrie": {
        "helm": (dict(helm=None, hair=None, helmwings=None), {
            "winged": dict(helm="skull", helmwings=True), "bare": dict(hair="slick")}),
        "cape": (dict(cape=None), {"short": dict(cape="short"), "long": dict(cape="long"), "none": EMPTY}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "men_norse_looks.json"), BASES, SLOTS, BODY)
