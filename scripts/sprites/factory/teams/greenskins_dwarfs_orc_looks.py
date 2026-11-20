"""Look options of the Orc and Black Orc positions, listed with their labels in
greenskins_dwarfs_orc_looks.json. See lib/looks.py for how options, empty states and bodies work. Orc women
lose the underbite (in the team file) and wear lips, hoops and a low ponytail; a bare head gives them a long
braid or a high ponytail."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.greenskins_dwarfs_orc import OrcLineman, OrcThrower, OrcBlitzer, BigUn, BlackOrc, GoblinBruiser

BASES = {base.key: base for base in (OrcLineman, OrcThrower, OrcBlitzer, BigUn, BlackOrc, GoblinBruiser)}


def women(sex):
    """Women: red lips, gold hoops and a low ponytail that shows under any helmet."""
    return dict(lip="lip_f", gd_hoops="gold", helm_tail=True, hair_mat="hair", tie="kit2") if sex == "f" else {}


def bare(men=None, her="braid"):
    """A bare head: a black mohawk for men (or nothing), a long braid or ponytail for women."""
    def layout(sex):
        if sex == "f":
            return dict(hair=her, hair_mat="hair", tie="kit2")
        return dict(gd_mohawk=men) if men else EMPTY
    return layout


HAIR = dict(gd_mohawk=None, gd_topknot=None, hair=None)
BODY = {key: women for key in ("orc_lineman", "orc_thrower", "orc_blitzer", "big_un", "black_orc")}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "orc_lineman": {
        "hair": (HAIR, {"mohawk": dict(gd_mohawk="hair"), "topknot": dict(gd_topknot="hair"),
                        "braid": dict(hair="braid", hair_mat="hair", tie="kit2")}),
        "pads": (dict(pads=None, spikes=None), {"football": dict(pads="football", spikes=1),
                                                "plate": dict(pads="plate", spikes=1), "none": EMPTY}),
    },
    "orc_thrower": {
        "head": (dict(HAIR, helm=None, gd_cap=None, gd_goggles=None, scarf=None), {
            "cap": dict(helm="skull", gd_cap=True, gd_goggles=0.12),
            "bandana": dict(scarf="kit2", gd_goggles=0.5),
            "bare": bare("hair", "long")}),
        "pads": (dict(pads=None, pad_sides=None), {
            "left": dict(pads="football_small", pad_sides=("l",)), "both": dict(pads="football_small", pad_sides=("l", "r")),
            "none": EMPTY}),
    },
    "orc_blitzer": {
        "helmet": (dict(HAIR, helm=None, gd_horns=None, gd_hspike=None, gd_cheeks=None), {
            "horned": dict(helm="open", gd_horns="bone", gd_cheeks=True),
            "spiked": dict(helm="open", gd_hspike="darkmetal", gd_cheeks=True),
            "bare": bare("hair")}),
        "pads": (dict(pads=None, spikes=None, pad_sides=None, pad_mat=None), {
            "both": dict(pads="big", pad_mat="kit1", spikes=2, pad_sides=("l", "r")),
            "left": dict(pads="big", pad_mat="kit1", spikes=2, pad_sides=("l",)),
            "iron": dict(pads="big", pad_mat="metal", spikes=1, pad_sides=("l", "r"))}),
    },
    "big_un": {
        "head": (dict(HAIR, helm=None, gd_hspike=None), {
            "topknot": dict(gd_topknot="hair"), "mohawk": dict(gd_mohawk="hair"),
            "helm": dict(helm="skull", helm_mat="darkmetal", gd_hspike="metal")}),
        "chest": (dict(tabard=None, gd_gutplate=None), {
            "tabard": dict(tabard="kit1", tabard_trim="kit2"), "gutplate": dict(gd_gutplate=True), "none": EMPTY}),
    },
    "black_orc": {
        "helmet": (dict(HAIR, helm=None, plume=None, gd_cheeks=None, gd_horns=None), {
            "crested": dict(helm="open", plume="kit2", gd_cheeks=True),
            "horned": dict(helm="open", gd_horns="bone", gd_cheeks=True),
            "bare": bare("hair")}),
        "chest": (dict(tabard=None, gd_sash=None), {
            "tabard": dict(tabard="kit1", tabard_trim="kit2"), "sash": dict(gd_sash="kit2"), "none": EMPTY}),
    },
    "goblin_bruiser": {
        "helmet": (dict(gd_pot=None), {"spike": dict(gd_pot="spike"), "horns": dict(gd_pot="horns"), "none": EMPTY}),
        "pads": (dict(pads=None, spikes=None), {"big": dict(pads="football_big", spikes=1),
                                                "small": dict(pads="football_small", spikes=1)}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "greenskins_dwarfs_orc_looks.json"), BASES, SLOTS, BODY)
