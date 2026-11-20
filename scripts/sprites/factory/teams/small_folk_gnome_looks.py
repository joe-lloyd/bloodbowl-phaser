"""Look options of the Gnome positions, listed with their labels in small_folk_gnome_looks.json. See lib/looks.py
for how options, empty states and bodies work. Gnome women lose the beard and wear two plaits."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.small_folk_gnome import GnomeLineman, GnomeIllusionist, GnomeBeastmaster

BASES = {base.key: base for base in (GnomeLineman, GnomeIllusionist, GnomeBeastmaster)}


def woman(hair):
    """Gnome women: no beard, two plaits, brows to match and fuller lips; the men keep the race's beard."""
    def body(sex):
        if sex == "f":
            return dict(beard=None, pigtails=hair, brow=hair, lip="lip_f")
        return dict(pigtails=None)
    return body


BODY = {
    "gnome_lineman": woman("hair_blond"),
    "gnome_illusionist": woman("hair_red"),
    "gnome_beastmaster": woman("hair_blond"),
}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "gnome_lineman": {
        "hat": (dict(hat=None), {"cone": dict(hat="cone"), "toadstool": dict(hat="toadstool"), "nightcap": dict(hat="nightcap")}),
        "coat": (dict(tunic_hem=None, coat=None, coat_mat=None, hem=None, torso="kit2"), {
            "tunic": dict(tunic_hem="kit1"),
            "smock": dict(coat="gambeson", coat_mat="kit1", hem="kit2"),
            "vest": dict(tunic_hem="kit2", torso="kit1")}),
    },
    "gnome_illusionist": {
        "hat": (dict(hat=None), {"wizard": dict(hat="wizard"), "steeple": dict(hat="steeple"), "hood": dict(hat="hood")}),
        "robe": (dict(coat=None, coat_mat=None, robe_len=None, robe_lining=None, hem=None, cape=None, cape_mat=None), {
            "robe": dict(coat="robe", coat_mat="kit1", robe_len=0.5, robe_lining="kit2", hem="kit2"),
            "caped": dict(coat="robe", coat_mat="kit1", robe_len=0.5, robe_lining="kit2", hem="kit2", cape="long", cape_mat="kit2"),
            "tunic": dict(coat="gambeson", coat_mat="kit2", hem="kit1")}),
    },
    "gnome_beastmaster": {
        "head": (dict(furcap=None, antlers=None, wolfhead=None), {
            "antlers": dict(furcap=True, antlers=True), "wolf": dict(wolfhead=True), "cap": dict(furcap=True)}),
        "mantle": (dict(cape=None, cape_mat=None, cape_lining=None, shag=None), {
            "fur": dict(cape="short", cape_mat="fur_brown", cape_lining="fur_brown", shag="fur_brown"),
            "cape": dict(cape="long", cape_mat="kit2", cape_lining="lining"),
            "none": EMPTY}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "small_folk_gnome_looks.json"), BASES, SLOTS, BODY)
