"""Look variants of the Vampire team, for the player page: every combination of body, helmet and shoulder
pads on top of each position's own spec. A variant is registered as <model>__<sex>-<helm>-<pads>, so the
driver sizes and colours it like its model. Nothing here changes the four reference specs."""
from lib import registry
from teams.vampire import Thrall, Runner, Thrower, Blitzer

SEXES = ("m", "f")
HELMS = {
    "bare": dict(helm=None, helm_wings=None),
    "cap": dict(helm="skull", helm_wings=None),
    "winged": dict(helm="open", helm_wings="kit1"),
}
PADS = {
    "none": dict(pads=None),
    "left": dict(pad_sides=("l",)),
    "right": dict(pad_sides=("r",)),
    "both": dict(pad_sides=("l", "r")),
}
HAIR = {"m": dict(hair="slick", hair_mat="hair", lip="lip"), "f": dict(hair="long", hair_mat="hair", lip="lip_f", tie="kit2")}
ADDED_PADS = dict(pads="leather", pad_mat="kit2")


def look(base, sex, helm, pads):
    layout = dict(base.layout)
    layout.update(HAIR[sex])
    layout.update(HELMS[helm])
    if pads != "none" and not layout.get("pads"):
        layout.update(ADDED_PADS)
    layout.update(PADS[pads])
    name = "%s__%s-%s-%s" % (base.key, sex, helm, pads)
    return type(base.__name__ + "Look", (base,), dict(key=name, sex=sex, layout=layout,
                                                       __doc__="Look variant of " + base.key))


for base in (Thrall, Runner, Thrower, Blitzer):
    for sex in SEXES:
        for helm in HELMS:
            for pads in PADS:
                registry.register(look(base, sex, helm, pads))
