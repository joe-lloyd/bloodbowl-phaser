"""Look options of the Dwarf positions, listed with their labels in greenskins_dwarfs_dwarf_looks.json. See
lib/looks.py for how options, empty states and bodies work. Dwarf women wear two side braids and no beard,
whatever the beard option says. The deathroller is a machine and has no options."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.greenskins_dwarfs_dwarf import DwarfLineman, DwarfRunner, DwarfBlitzer, TrollSlayer

BASES = {base.key: base for base in (DwarfLineman, DwarfRunner, DwarfBlitzer, TrollSlayer)}


def women(hair, **more):
    """Per-body layout: women get lips and two side braids in the position's hair colour."""
    def body(sex):
        return dict(lip="lip_f", gd_braids=hair, **more) if sex == "f" else {}
    return body


def bare(hair_mat):
    """A bare head: cropped hair for men, a bun above the braids for women."""
    return lambda sex: dict(hair="bun" if sex == "f" else "short", hair_mat=hair_mat, tie="kit2")


def beard(kind):
    return lambda sex: EMPTY if sex == "f" else dict(gd_beard=kind)


def beards(*kinds):
    return (dict(gd_beard=None), {kind: EMPTY if kind == "none" else beard(kind) for kind in kinds})


BODY = {
    "dwarf_lineman": women("hair_brown"),
    "dwarf_runner": women("hair_blond"),
    "dwarf_blitzer": women("hair_red"),
    "troll_slayer": women("gd_hair_orange", gd_wrap="kit2"),
}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "dwarf_lineman": {
        "helmet": (dict(helm=None, hair=None), {
            "bucket": dict(helm="winged"), "open": dict(helm="open"), "bare": bare("hair_brown")}),
        "beard": beards("spade", "fork", "none"),
    },
    "dwarf_runner": {
        "hair": (dict(hair=None), {"swept": dict(hair="swept"), "braid": dict(hair="braid", tie="kit2"),
                                   "tail": dict(hair="long", tie="kit2")}),
        "beard": beards("fork", "spade", "none"),
    },
    "dwarf_blitzer": {
        "helmet": (dict(helm=None, helm_wings=None, plume=None, gd_cheeks=None, gd_horns=None, hair=None), {
            "winged": dict(helm="open", helm_wings="kit2", plume="kit1", gd_cheeks=True),
            "horned": dict(helm="open", gd_horns="bone", gd_cheeks=True),
            "bare": bare("hair_red")}),
        "beard": beards("long", "fork", "spade"),
    },
    "troll_slayer": {
        "crest": (dict(gd_crest=None, gd_topknot=None), {
            "tall": dict(gd_crest=0.62), "short": dict(gd_crest=0.3), "topknot": dict(gd_topknot=True)}),
        "beard": beards("bush", "fork", "long"),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "greenskins_dwarfs_dwarf_looks.json"), BASES, SLOTS, BODY)
