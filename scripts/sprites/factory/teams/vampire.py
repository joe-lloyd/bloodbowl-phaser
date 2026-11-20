"""Vampire team: the reference implementation (models thrall, vampire_runner, vampire_thrower,
vampire_blitzer, vargheist). Costume: Crimson Court. No figure holds a ball."""
import math
from mathutils import Vector
from lib import Biped, register, core, parts, looks
from lib.core import tube, tband, ball_at, box, lerp, UP, basis, D
from mathutils import Matrix

VAMP = dict(skin="skin", eyes="red", fangs=True, ears="pointed", hair="slick", hair_mat="hair", brow="hair", lip="lip",
            boots="boot", cuff="leather", legs="trouser", torso="kit1", arms="kit1", lapel="kit2", hem="kit2",
            collar_mat="kit2")

class Vampire(looks.Physique, looks.Fine, Biped):
    """A Vampire team biped: men and women differ clearly in build, and fine details that only resolve
    from 2x density up are added there and left out at game size."""

    def band(self, J, tag, limb, side, a, b, r, mat):
        joints = J[limb][side]
        tube(tag + "band%s%s%.2f" % (limb, side, a), [lerp(joints[1], joints[2], a), lerp(joints[1], joints[2], b)],
             [r, r], mat, n=10)

@register
class Thrall(Vampire):
    """Human militia servant in livery: the smallest, plainest figure; skull cap, no cape, fists up."""
    key = "thrall"
    race = "human"
    layout = dict(skin="thrall_skin", torso="kit1", arms="shirt", legs="rags", coat="gambeson", hem="kit2", belt="leather",
                  bracers="leather", arm_band="kit2", neckband="kit2", helm="skull", boots="leather", cuff="rags", hunch=4)
    stance = dict(lean=9, legs={"l": (6, 9, 12), "r": (-4, 9, 12)}, arms={"l": (26, 24, 66, 4), "r": (26, 24, 66, 4)},
                  hands="fist")
    height = 0.97

    def idle(self, ph, p, w):       # nervous: shifts weight in two states, glances around, wrings his fists
        k = 9 * (1 if w["s1"] > 0 else -1)
        p.update(look=24 * w["c1"], legs={"l": (6, 9, 12 + k), "r": (-4, 9, 12 - k)},
                 arms={"l": (26 + 7 * w["s2"], 24, 66, 4), "r": (26 - 7 * w["s2"], 24, 66, 4)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        p = core.surf(J, P, 0.36, 0, 0.03)
        box(tag + "badge", p, (0.12, 0.03, 0.12), "kit2", Matrix.Rotation(D(45), 3, J["F"]) @ basis(J["X"], J["F"], J["u"]))
        ball_at(tag + "badgeboss", p + J["F"] * 0.02, 0.03, "gold")

    def details(self, J, P, L, tag, pose):
        R = basis(J["X"], J["F"], J["u"])
        box(tag + "patch0", core.surf(J, P, 0.16, 38, 0.05), (0.09, 0.02, 0.08), "rags", R)
        box(tag + "patch1", core.surf(J, P, 0.26, -150, 0.05), (0.1, 0.02, 0.09), "rags", R)
        ball_at(tag + "beltknot", core.surf(J, P, 0.02, -30, 0.06), 0.035, "leather")

@register
class Runner(Vampire):
    """Lightweight sprinter: slim, long bare legs and arms, sleeveless top and shorts, sash, high ponytail."""
    key = "vampire_runner"
    race = "human"
    sex = "f"
    knobs = dict(legs=1.14, limb=0.74, shoulders=0.9, torso=0.86)
    layout = dict(skin="skin", eyes="red", fangs=True, ears="pointed", hair="long", hair_mat="hair", brow="hair", lip="lip_f",
                  tie="kit2", torso="kit1", arms="skin", legs="skin", boots="leather", cuff="rags", wraps="rags", belt="kit2",
                  neckband="kit2", shorts="kit1")
    stance = dict(lean=8, twist=-6, nod=-4, legs={"l": (-10, 6, 8), "r": (14, 6, 12)}, feet={"l": 26, "r": 26},
                  arms={"l": (22, 16, 50, 6), "r": (-12, 18, 42)}, hands="relaxed")
    stride, arm_swing, run_lean, jump = 46, 40, 20, 0.28
    height = 1.1

    def idle(self, ph, p, w):       # bounces on her toes (two states), shakes out one leg, then the other
        toe = 26 + 14 * (1 if w["s2"] > 0 else -1)
        p.update(legs={"l": (-10 + 30 * w["dn"], 6, 8 + 50 * w["dn"]), "r": (14 + 26 * w["up"], 6, 12 + 50 * w["up"])},
                 feet={"l": toe, "r": toe}, sash=0.05 * w["s1"])

    def details(self, J, P, L, tag, pose):
        k = L["limb"] * core.LIMB
        for side in ("l", "r"):
            self.band(J, tag, "arms", side, 0.78, 0.92, 0.06 * k, "kit2")
            self.band(J, tag, "legs", side, 0.02, 0.12, 0.085 * k, "kit2")

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        k = L["limb"] * core.LIMB
        for side in ("l", "r"):
            hip, knee = J["legs"][side][:2]
            tube(tag + "short" + side, [hip + J["u"] * 0.03, lerp(hip, knee, 0.18), lerp(hip, knee, 0.36)],
                 [0.15 * k, 0.152 * k, 0.142 * k], "kit1", n=10)
            tube(tag + "shorthem" + side, [lerp(hip, knee, 0.33), lerp(hip, knee, 0.39)], [0.158 * k, 0.158 * k], "kit2", n=10)
        # sash tails at the near hip; they stream behind when she runs
        X, B = J["X"], J["B"]
        Bh = Vector((B.x, B.y, 0)).normalized()
        start = J["pelvis"] + J["u"] * 0.06 - X * (core.tprof(P, 0.06)[0] + 0.03) + B * 0.02
        ball_at(tag + "sashknot", start, 0.06, "kit2")
        sway = pose.get("sash", 0.0)
        for i, off in enumerate((0.0, 0.07)):
            if pose.get("_action"):
                pts = [start, start + Bh * 0.3 + UP * (0.06 + off), start + Bh * 0.62 + UP * (0.1 + off * 2),
                       start + Bh * 0.9 + UP * (0.04 + off * 2)]
            else:
                pts = [start, start - UP * 0.14 - X * (0.03 + off), start + Bh * sway - UP * 0.3 - X * (0.04 + off * 1.5),
                       start + Bh * sway * 2 - UP * (0.46 - off) - X * (0.04 + off * 2)]
            tube(tag + "sash%d" % i, pts, [0.05, 0.055, 0.05, 0.02], "kit2", ref=X, n=6, flat=0.4)

@register
class Thrower(Vampire):
    """Frock coat under cuirass and gorget, high collar, long cape, pinned bun. Her hands are always empty."""
    key = "vampire_thrower"
    race = "human"
    sex = "f"
    layout = dict(VAMP, hair="bun", lip="lip_f", coat="frock", collar=True, cape="long", breast="metal", gorget=True,
                  pads="plate", sleeve_cuff="kit2", belt="kit2")
    stance = dict(lean=0, legs={"l": (4, 6, 5), "r": (-3, 6, 5)}, arms={"l": (4, 22, 16), "r": (34, 24, 96, 2)},
                  hands="relaxed")
    height = 1.05

    def idle(self, ph, p, w):       # the cape sways while she flexes the fingers of her throwing hand
        flex = ("open", "open", "relaxed", "fist", "fist", "fist", "relaxed", "open")[int(round(ph * 8)) % 8]
        p.update(hand_modes={"r": flex}, cape=0.06 + 0.06 * w["s1"])

    def details(self, J, P, L, tag, pose):
        sh = P["sh_h"]
        ball_at(tag + "brooch", core.surf(J, P, sh - 0.02, 0, 0.1), 0.032, "gold")
        ball_at(tag + "broochgem", core.surf(J, P, sh - 0.02, 0, 0.125), 0.017, "kit2")
        for i, ang in enumerate((-50, 50)):
            ball_at(tag + "stud%d" % i, core.surf(J, P, 0.0, ang, 0.07), 0.022, "gold")

@register
class Blitzer(Vampire):
    """Full plate: big spiked pauldrons, gauntlets, greaves, open helm with bat wings, short cape."""
    key = "vampire_blitzer"
    race = "human"
    knobs = dict(shoulders=1.16, limb=1.12)
    layout = dict(VAMP, coat="frock", collar=True, cape="short", helm="open", helm_wings="kit1", pads="big", spikes=2,
                  breast="metal", gorget=True, gauntlets=True, greaves=True, kneecops=True, belt="kit2")
    stance = dict(lean=5, legs={"l": (5, 15, 8), "r": (-4, 15, 8)}, arms={"l": (6, 36, 46, -8), "r": (6, 36, 46, -8)},
                  hands="fist")
    stride, arm_swing, jump = 34, 28, 0.14
    height = 1.08

    def idle(self, ph, p, w):       # heaving shoulders, a slow neck roll, then cracks his knuckles
        b, dn = w["breath"], w["dn"]
        arm = (6 + 16 * dn, 36 + 6 * b, 46 + 44 * dn, -8 - 34 * dn)
        p.update(lean=5 + 3 * b, look=22 * w["s1"], nod=-6 + 10 * w["c1"], arms={"l": arm, "r": arm})

    def details(self, J, P, L, tag, pose):
        for i, (h, ang) in enumerate(((0.06, -30), (0.06, 30), (0.14, -38), (0.14, 38))):
            ball_at(tag + "rivet%d" % i, core.surf(J, P, h, ang, 0.06), 0.02, "gold")
        ball_at(tag + "gorgetgem", core.surf(J, P, P["sh_h"] + 0.03, 0, 0.1), 0.028, "kit2")

@register
class Vargheist(Biped):
    """Bat-headed brute with digitigrade legs and folded wings; kit1 harness and loincloth, kit2 collar and
    bracers. Built by the concept's dedicated functions instead of the generic biped dress."""
    key = "vargheist"
    layout = dict(skin="varg_skin", gloves="varg_dark", claws=0.16, finger=1.25, harness="kit1", loin="kit1",
                  loin_trim="gold", bracers="kit2", belt_mat="kit2", collar=True)
    stance = dict(lean=0, legs={"l": (-14, 17, 4), "r": (16, 17, 10)}, arms={"l": (2, 24, 26, 8), "r": (16, 24, 34, 8)},
                  hands="open", jaw=10, nod=-10)
    stride, arm_swing, run_lean, jump = 30, 26, 10, 0.18
    lie, lie_shift = 0.3, 1.0

    def idle(self, ph, p, w):       # slow breathing, head tilt, two jaw snaps, one wing twitch
        b = w["breath"]
        p.update(lean=3 * b, look=18 * w["s1"], nod=-10 + 6 * w["s2"], jaw=10 + 28 * max(0.0, w["s2"]) ** 2,
                 arms={"l": (2 + 6 * b, 24, 26, 8), "r": (16 - 6 * b, 24, 34, 8)},
                 layout={"wing_scale": 1.0 + 0.08 * max(0.0, math.sin(w["a"] - 2.2))})

    def adjust(self, name, i, pose):
        pose.setdefault("jaw", 10)
        if name == "run":
            pose["hands"] = "open"

    def build(self, pose):
        L = dict(self.layout)
        L.update(pose.get("layout", {}))
        L.update(sex="x", _action=False, hand_modes={})
        P = dict(core.VARG)
        J = core.skeleton(P, pose)
        tag = self.key + "_"
        spread = bool(pose.get("wings"))
        core.varg(J, P, L, tag, pose, spread)
        core.varg_extras(J, P, L, tag, spread)
        return J
