"""Elven Union team (union_lineman, union_blitzer, union_catcher, union_thrower).
Costume: a professional league's star athletes: sleek modern sports kit, bright piping, styled hair, almost no
armour. No figure holds a ball."""
from mathutils import Vector
from lib import Biped, register, core, looks
from lib.core import tube, tband, ball_at, box, cone, flat_cone, sheet, lerp, UP, surf, basis
from teams import elves_common as ec

EU = dict(skin="skin_elf", hair_mat="hair_blond", brow="hair_brown", trim="kit2", boots="shirt", cuff=None, legs="skin_elf",
          torso="kit1", arms="skin_elf", tie="kit2")

def kit(J, P, L, tag, shorts="kit2", hem="kit1", socks="kit1", sock_top="kit2", piping="kit2"):
    """Shared sportswear: shorts, knee socks with a contrast top, side piping on the jersey."""
    if shorts:
        ec.shorts(J, L, tag, shorts, hem=hem, length=0.4)
    for side in ("l", "r"):
        if socks:
            ec.leg_band(J, L, tag, side, 0.06, 0.44, socks, "shin", grow=1.07, name="sock")
            ec.leg_band(J, L, tag, side, 0.02, 0.12, sock_top, "shin", grow=1.13, name="socktop")
    if piping:
        for sd in (-1, 1):
            ec.torso_stripe(J, P, tag, "pipe%d" % sd, [(0.1, sd * 62), (0.3, sd * 58), (P["sh_h"] - 0.04, sd * 40)], piping, r=0.035,
                            off=0.035)

@register
class Lineman(looks.Fine, Biped):
    """Short swept blond hair under a kit2 headband, sleeveless kit1 jersey, small shoulder caps, shorts and
    knee socks; forever stretching."""
    key = "union_lineman"
    race = "elf"
    layout = dict(EU, hair="swept", jersey="kit1", shorts="kit2", pads="football_small", pad_mat="kit1", pad_trim="kit2",
                  sleeve_cuff="kit2", belt="kit2", buckle=None)
    stance = dict(lean=3, legs={"l": (5, 11, 6), "r": (-4, 11, 6)}, arms={"l": (6, 24, 30), "r": (6, 24, 30)}, hands="relaxed")
    height = 0.98

    def idle(self, ph, p, w):       # warm-up: pulls one arm across his chest, then the other, twisting at the waist
        k = 1 if w["s1"] > 0 else -1
        a, b = (62, -14, 28, -70), (40, 30, 118, -40)       # stretched arm, hooking arm
        p.update(twist=12 * k, look=-10 * k, arms={"l": a if k > 0 else b, "r": b if k > 0 else a})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        ec.headband(J, tag, "kit2")
        ec.loose_hair(J, L, tag, length=0.4)
        kit(J, P, L, tag)
        p = surf(J, P, 0.36, 0, 0.05)      # chest flash
        box(tag + "flash", p, (0.2, 0.03, 0.09), "kit2", basis(J["X"], J["F"], J["u"]))

    def details(self, J, P, L, tag, pose):
        R = basis(J["X"], J["F"], J["u"])
        box(tag + "number", surf(J, P, 0.36, 0, 0.075), (0.05, 0.02, 0.07), "kit1", R)
        for side in ("l", "r"):
            ec.leg_band(J, L, tag, side, 0.22, 0.27, "kit2", "shin", grow=1.12, name="sockstripe")

@register
class Blitzer(looks.Fine, Biped):
    """The only helmet in the squad: kit1 gridiron helm with swept kit2 fins and face bars, full shoulder pads
    with a neck roll, long kit2 tights with a kit1 stripe, knee and elbow pads; a low, bouncing guard."""
    key = "union_blitzer"
    race = "elf"
    knobs = dict(shoulders=1.04, limb=0.95)
    layout = dict(EU, hair=None, hair_mat="elf_pink", helm="gridiron", helm_mat="kit1", stripe="kit2", fins="swept",
                  fin_mat="kit2", bars=2, helm_tail=True, tie="kit2", jersey="kit1", pads="football", pad_mat="kit2",
                  pad_trim="kit1", neckroll=True, legs="kit2", pant_stripe="kit1", kneecops=True, knee_mat="kit1",
                  gloves="cloth_black", bracers="kit1", belt="kit1", buckle=None)
    stance = dict(lean=16, nod=-10, legs={"l": (16, 16, 30), "r": (-10, 16, 26)}, arms={"l": (30, 26, 84, -6), "r": (30, 26, 84, -6)},
                  hands="fist")
    stride, arm_swing, jump = 38, 32, 0.2
    height = 0.98

    def idle(self, ph, p, w):       # shadow-boxing guard: bobs between his feet (two states) and throws short jabs
        k = 1 if w["s1"] > 0 else -1
        p.update(twist=8 * k, legs={"l": (16, 16, 30 + 8 * k), "r": (-10, 16, 26 - 8 * k)},
                 arms={"l": (30 + 44 * max(0.0, w["s2"]), 26, 84 - 60 * max(0.0, w["s2"]), -6),
                       "r": (30 + 44 * max(0.0, -w["s2"]), 26, 84 - 60 * max(0.0, -w["s2"]), -6)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        kit(J, P, L, tag, shorts=None, socks=None)
        for side in ("l", "r"):
            ec.arm_band(J, L, tag, side, 0.78, 1.0, "kit1", "upper", grow=1.22, name="elbow")

    def details(self, J, P, L, tag, pose):
        c, X, F, U, s = ec.hf(J)
        for sd in (-1, 1):          # chin strap buckles at the ear cups
            ball_at(tag + "strapstud%d" % sd, c + X * sd * s[0] * 1.2 - U * s[2] * 0.1, 0.026, "kit1")
        for side in ("l", "r"):
            ec.arm_band(J, L, tag, side, 0.6, 0.75, "kit2", "fore", grow=1.15, name="wristband")

@register
class Catcher(looks.Fine, Biped):
    """The glamour signing: pink high ponytail, dark shades, cropped kit1 top, long kit2 gloves and thigh socks;
    hand on hip, waving to the crowd."""
    key = "union_catcher"
    race = "elf"
    sex = "f"
    knobs = dict(legs=1.14, limb=0.78, shoulders=0.92, torso=0.9)
    layout = dict(EU, skin="skin_tan", arms="skin_tan", legs="skin_tan", torso="skin_tan", hair="long", hair_mat="elf_pink",
                  brow="elf_pink", lip="lip_f", tie="kit2", shorts="kit2", forearms="kit2", gloves="kit2", arm_band="kit1",
                  neckband="kit1", elf_shades="black")
    stance = dict(lean=2, twist=-8, legs={"l": (8, 8, 4), "r": (-8, 12, 14)}, feet={"r": 30},
                  arms={"l": (-8, 46, 104, -30), "r": (10, 22, 30)}, hands="relaxed")
    stride, arm_swing, run_lean, jump = 46, 40, 20, 0.3
    height = 1.02

    def idle(self, ph, p, w):       # one hand on her hip while the other waves to the stands
        up = 1 if w["c1"] < 0.3 else 0
        p.update(look=18 * up, hand_modes={"r": "open"},
                 arms={"l": (-8, 46, 104, -30), "r": ((150, 30, 24 + 26 * w["s2"], 20) if up else (10, 22, 30))})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("elf_shades"):
            ec.shades(J, tag, L["elf_shades"])
        low = 0.3 if L.get("sex") == "f" else 0.12        # a man's top reaches the belt
        tband(tag + "crop", J, P, [low, 0.38, P["sh_h"] - 0.02, P["sh_h"] + 0.03], "kit1", k=1.06, add=0.014)
        tband(tag + "crophem", J, P, [low - 0.015, low + 0.025], "kit2", k=1.07, add=0.022)
        kit(J, P, L, tag, hem="kit1", socks=None, piping=None)
        for side in ("l", "r"):
            ec.leg_band(J, L, tag, side, 0.62, 1.0, "kit1", "thigh", grow=1.06, name="hose")
            ec.leg_band(J, L, tag, side, 0.0, 0.44, "kit1", "shin", grow=1.07, name="sock")
            ec.leg_band(J, L, tag, side, 0.56, 0.68, "kit2", "thigh", grow=1.12, name="hosetop")

    def details(self, J, P, L, tag, pose):
        c, X, F, U, s = ec.hf(J)
        for sd in (-1, 1):          # hoop earrings
            ball_at(tag + "earring%d" % sd, c + X * sd * s[0] * 0.98 - U * s[2] * 0.22, 0.026, "gold")
        ec.studs(J, P, tag, "cropstar", [(0.36, 0)], "kit2", r=0.03, off=0.06)

@register
class Thrower(looks.Fine, Biped):
    """The franchise quarterback: long loose blond hair under a kit1 headband, a kit2 sleeve on the throwing arm
    only, long kit2 trousers, a kit1 towel at the belt; keeps running a hand through his hair."""
    key = "union_thrower"
    race = "elf"
    layout = dict(EU, hair="slick", jersey="kit1", pads="football_small", pad_mat="kit1", pad_trim="kit2", legs="kit2",
                  pant_stripe="kit1", belt="kit1", buckle=None, sleeve_cuff="kit1",
                  elf_backhair="hair_blond", elf_sleeve=("r",))
    stance = dict(lean=0, twist=6, legs={"l": (3, 7, 2), "r": (-6, 10, 12)}, feet={"r": 12},
                  arms={"l": (4, 20, 24), "r": (12, 20, 40)}, hands="relaxed")
    height = 1.03

    def idle(self, ph, p, w):       # sweeps a hand back through his hair, head tilting with it
        up = w["up"]
        p.update(nod=-10 * up, look=-14 * up, hand_modes={"r": "open"},
                 arms={"l": (4, 20, 24), "r": (12 + 128 * up, 20 + 20 * up, 40 + 100 * up, 20 - 60 * up)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        ec.loose_hair(J, L, tag, length=0.36, w=0.19)
        ec.headband(J, tag, "kit1")
        kit(J, P, L, tag, shorts=None, socks=None, piping="kit2")
        for side in L.get("elf_sleeve") or ():
            ec.arm_band(J, L, tag, side, 0.1, 1.0, "kit2", "upper", grow=1.06, name="slv")
            ec.arm_band(J, L, tag, side, 0.0, 0.9, "kit2", "fore", grow=1.08, name="slv")
        ec.arm_band(J, L, tag, "l", 0.5, 0.8, "shirt", "fore", grow=1.2, name="playcard")
        X, B, u = J["X"], J["B"], J["u"]       # towel tucked into the belt at the off hip
        c0 = surf(J, P, 0.07, -38, 0.05)
        out = ec.hz(c0 - J["pelvis"])
        side = UP.cross(out)
        rows = [[c0 + side * sx * 0.07 * (1 + 0.3 * t) - UP * 0.34 * t + out * 0.03 * t for sx in (-1, 0, 1)] for t in (0, 0.5, 1)]
        sheet(tag + "towel", rows, ["kit1"], thick=0.035)

    def details(self, J, P, L, tag, pose):
        R = basis(J["X"], J["F"], J["u"])
        box(tag + "number", surf(J, P, 0.36, 0, 0.075), (0.05, 0.02, 0.07), "kit2", R)
        ec.arm_band(J, L, tag, "l", 0.47, 0.52, "kit2", "fore", grow=1.24, name="playcardtrim")
