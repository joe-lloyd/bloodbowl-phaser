"""Look options of the Chaos Dwarf positions, listed with their labels in chaos_dwarf_looks.json. The Bull
Centaur keeps one look. See lib/looks.py for how options and bodies work."""
import os

from lib import looks
from lib.looks import EMPTY
from teams.chaos_dwarf import ChaosDwarf, Flamesmith, Hobgoblin, HobgoblinStabba

BASES = {base.key: base for base in (ChaosDwarf, Flamesmith, Hobgoblin, HobgoblinStabba)}

# option -> (empty layout, {value: layout or a function of the body, EMPTY for "nothing"})
SLOTS = {
    "chaos_dwarf": {
        "hat": (dict(hat=None, helm=None), {"tall": dict(hat="tall"), "horned": dict(hat="horned"), "cap": dict(helm="skull")}),
        "pads": (dict(pads=None, spikes=None), {"plate": dict(pads="plate"), "spiked": dict(pads="big", spikes=2), "none": EMPTY}),
    },
    "flamesmith": {
        "head": (dict(helm=None, hat=None), {"cap": dict(helm="skull"), "drum": dict(hat="drum"), "bare": EMPTY}),
        "tank": (dict(tank="brass"), {"brass": dict(tank="brass"), "iron": dict(tank="darkmetal")}),
        "apron": (dict(tabard=None, tabard_trim=None), {
            "kit": dict(tabard="kit2", tabard_trim="brass"), "leather": dict(tabard="leather", tabard_trim="brass"), "none": EMPTY}),
    },
    "hobgoblin": {
        "head": (dict(cap=None, helm=None, topknot=None), {
            "cap": dict(cap="floppy"), "helm": dict(helm="skull"), "topknot": dict(topknot="hair")}),
        "top": (dict(torso="skin_goblin", jersey=None, xstrap=None), {
            "jerkin": dict(torso="kit2", jersey="kit2"), "bare": dict(xstrap="kit2")}),
    },
    "hobgoblin_stabba": {
        "head": (dict(helm=None, scarf=None), {"hood": dict(helm="hood"), "bandana": dict(scarf="kit2"), "bare": EMPTY}),
        "cloak": (dict(cape=None), {"short": dict(cape="short"), "long": dict(cape="long"), "none": EMPTY}),
    },
}


looks.define(os.path.join(os.path.dirname(__file__), "chaos_dwarf_looks.json"), BASES, SLOTS)
