"""Stand-in for a position with no model of its own yet: a plain wooden mannequin in team colours, so a
secret team can field every position and the gaps are plain to see."""
from lib import Biped, register, core, palette
from lib.core import ellipsoid, tband

palette.ramp("mannequin", "#6a5a48", "#a89478", "#d8c8a8")
core.HEADS["blank"] = lambda J, P, L, tag, pose: None


@register
class Placeholder(Biped):
    """A faceless mannequin: kit1 vest, kit2 shorts and wristbands, and a kit2 ring round its head."""
    key = "placeholder"
    race = "human"
    layout = dict(skin="mannequin", torso="kit1", arms="mannequin", legs="mannequin", boots="mannequin", cuff=None, head="blank",
                  hair=None, shorts="kit2", sleeve_cuff="kit2", belt=None, neckband="kit2")
    stance = dict(lean=0, legs={"l": (4, 8, 6), "r": (-4, 8, 6)}, arms={"l": (4, 18, 20), "r": (4, 18, 20)}, hands="relaxed")
    target_px = 90

    def idle(self, ph, p, w):       # stands still and turns its blank head slowly
        p.update(look=20 * w["s1"])

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s = J["head"], J["head_R"].col[0], J["head_R"].col[1], J["head_R"].col[2], J["head_s"]
        core.cap(tag + "headband", c, (s[0] * 1.04, s[1] * 1.04, s[2] * 1.04), "kit2", U, cut=0.05, hi=0.25,
                 rot=J["head_R"], thick=0.02)
        ellipsoid(tag + "joint", J["pelvis"] + J["u"] * 0.02, (0.2, 0.15, 0.06), "mannequin")
