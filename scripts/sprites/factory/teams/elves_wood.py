"""Wood Elf team (we_lineman, we_catcher, we_thrower, wardancer, treeman_loren).
Costume: forest rangers in leaf and bark, hoods, braids, feathers and antlers. No figure holds a ball."""
import math
from mathutils import Vector
from lib import Biped, register, core, parts, looks
from lib.core import tube, tband, ball_at, cone, flat_cone, lerp, UP, surf, D
from teams import elves_common as ec

WE = dict(skin="skin_elf", hair_mat="hair_brown", brow="hair_brown", trim="brass", legs="rags", boots="leather", cuff="rags", tie="kit2")

@register
class Lineman(looks.Fine, Biped):
    """Hooded ranger: kit1 hood and leaf-edged shoulder mantle over a leather jerkin, kit2 sash; shades his eyes
    to scan the tree line."""
    key = "we_lineman"
    race = "elf"
    layout = dict(WE, hair=None, helm="hood", hood_mat="kit1", torso="leather", arms="cloth_green", bracers="leather",
                  belt="kit2", buckle="brass", loin="kit1", loin_trim="kit2", sleeve_cuff="kit2", elf_mantle="kit1",
                  cape_mat="kit1", cape_lining="kit2", clasp=False, elf_leafskirt=None)
    stance = dict(lean=3, legs={"l": (8, 8, 6), "r": (-8, 10, 6)}, arms={"l": (4, 20, 28), "r": (4, 20, 28)}, hands="relaxed")
    height = 1.0

    def idle(self, ph, p, w):       # lookout: one hand shades his eyes while he sweeps the horizon
        p.update(look=34 * w["s1"], twist=6 * (1 if w["s1"] > 0 else -1), hand_modes={"r": "open"},
                 arms={"l": (4, 20, 28), "r": (96, 34, 112, -40)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("elf_mantle"):
            m = L["elf_mantle"]
            ec.drape(J, P, tag, "mantle", 0.3, -180, 180, (m, m), fold=0.3, grow=0.02, jag=0.09, depth=0.03, nu=18, thick=0.035,
                     flare=0.12, lift=0.02)
        if L.get("elf_leafskirt"):
            ec.leaf_ring(J, P, tag, 0.08, 11, 0.36, L["elf_leafskirt"], width=0.12, droop=0.8, off=0.03, name="skirt", alt="leaf")
        ec.sash(J, P, tag, pose, "kit2", sd=-1, length=0.4)
        c, X, F, U, s = ec.hf(J)
        b = c + X * s[0] * 1.2 + U * s[2] * 0.2 - F * 0.05     # one feather tucked into the hood
        flat_cone(tag + "hoodfeather", b, b + U * 0.34 - F * 0.2 + X * 0.06, 0.055, "kit2", X, 0.3)

    def details(self, J, P, L, tag, pose):
        ec.studs(J, P, tag, "toggle", [(0.16, 0), (0.24, 0), (0.32, 0)], "brass", r=0.02, off=0.06)
        ec.studs(J, P, tag, "acorn", [(P["sh_h"] - 0.02, -30)], "bark", r=0.03, off=0.09)

@register
class Catcher(looks.Fine, Biped):
    """The smallest and lightest: long red braid, two tall kit2 feathers in a headband, kit1 leaf skirt and
    top, bare limbs with bark wraps; never still, skipping from foot to foot."""
    key = "we_catcher"
    race = "elf"
    sex = "f"
    knobs = dict(legs=1.12, limb=0.76, shoulders=0.9, torso=0.88)
    layout = dict(WE, hair="braid", hair_mat="hair_red", brow="hair_red", lip="lip_f", tie="kit2", torso="skin_elf",
                  arms="skin_elf", legs="skin_elf", wraps="rags", boots="rags", cuff=None, belt="kit2", buckle=None,
                  elf_feathers="kit2", elf_antlers=None)
    stance = dict(lean=8, legs={"l": (10, 10, 14), "r": (-8, 10, 10)}, feet={"l": 22, "r": 22},
                  arms={"l": (20, 34, 50, 16), "r": (20, 34, 50, 16)}, hands="open")
    stride, arm_swing, run_lean, jump = 48, 42, 22, 0.32
    height = 1.04

    def idle(self, ph, p, w):       # skips from foot to foot, lifting each knee in turn, arms out for balance
        p.update(legs={"l": (10 + 34 * w["up"], 10, 14 + 56 * w["up"]), "r": (-8 + 40 * w["dn"], 10, 10 + 56 * w["dn"])},
                 hop=0.04 * abs(w["s1"]) if False else 0.0, twist=6 * (1 if w["s1"] > 0 else -1),
                 arms={"l": (20, 34 + 14 * w["dn"], 50, 16), "r": (20, 34 + 14 * w["up"], 50, 16)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        ec.headband(J, tag, "kit2", lo=0.3, hi=0.5)
        if L.get("elf_feathers"):
            ec.feathers(J, tag, L["elf_feathers"], n=2, h=0.46, at=(0.8, 0.45, -0.45), r=0.065, alt="kit1")
        if L.get("elf_antlers"):
            ec.antlers(J, tag, L["elf_antlers"], k=0.85)
        ec.loose_hair(J, L, tag, length=0.5)
        if L.get("sex") == "f":     # her leaf top; a man goes bare-chested
            tband(tag + "top", J, P, [0.3, 0.38, 0.47], "kit1", k=1.06, add=0.012)
            core.cups(J, P, tag, "kit1")
            ec.torso_stripe(J, P, tag, "strap", [(0.47, 32), (P["sh_h"] + 0.04, 14)], "kit1", r=0.035)
        ec.leaf_ring(J, P, tag, 0.08, 11, 0.4, "kit1", width=0.12, droop=0.8, off=0.03, name="skirt")
        sh = J["arms"]["l"][0]
        for i, (dx, dz) in enumerate(((-0.1, 0.02), (-0.02, 0.08), (-0.14, -0.1))):     # leaf pauldron
            flat_cone(tag + "pl%d" % i, sh + J["u"] * 0.06, sh + J["X"] * (dx - 0.12) + UP * (dz - 0.06), 0.1, "kit1", J["u"], 0.3)
        for side in ("l", "r"):
            ec.leg_band(J, L, tag, side, 0.1, 0.4, "rags", "shin", grow=1.1, name="wrap")

    def details(self, J, P, L, tag, pose):
        c, X, F, U, s = ec.hf(J)
        ball_at(tag + "bandgem", c + F * s[1] * 1.12 + U * s[2] * 0.4, 0.026, "leaf")
        for side in ("l", "r"):
            ec.leg_band(J, L, tag, side, 0.22, 0.26, "kit2", "shin", grow=1.16, name="wraptie")

@register
class Thrower(looks.Fine, Biped):
    """Antler circlet over long loose brown hair, a kit2 half cape on the off shoulder, kit1 tail coat; holds
    up a finger to test the wind."""
    key = "we_thrower"
    race = "elf"
    layout = dict(WE, hair="slick", torso="leather", arms="cloth_green", hem="kit2",
                  bracers="rags", belt="kit2", buckle="brass", neckband="kit1", pads="leather", pad_sides=("r",),
                  elf_antlers="bone_old", elf_feathers=None, elf_cape="half")
    stance = dict(lean=0, twist=-6, legs={"l": (6, 8, 4), "r": (-6, 8, 6)}, arms={"l": (2, 18, 22), "r": (20, 18, 50)},
                  hands="relaxed")
    height = 1.08

    def idle(self, ph, p, w):       # holds one finger up to test the wind and tilts his head to feel it
        p.update(look=16 * w["s1"], nod=-8 * w["breath"], hand_modes={"r": "fist"}, cape=0.1 + 0.1 * w["s2"],
                 arms={"l": (2, 18, 22), "r": (58, 26, 118 + 8 * w["s2"], 8)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        # coat tails drawn here rather than with coat="tails": the library's tails always get the default red lining
        core.skirt(J, P, L, tag, 0.74, (-62, 62), pose.get("flare", 0.06) + 0.12, "kit1", lining="kit2")
        ec.back_hair(J, L, tag, "hair_brown", length=0.34)
        if L.get("elf_antlers"):
            ec.antlers(J, tag, L["elf_antlers"], k=1.1)
        if L.get("elf_feathers"):
            ec.feathers(J, tag, L["elf_feathers"], n=2, h=0.4, at=(0.8, 0.4, -0.4), r=0.06, alt="kit1")
        ec.headband(J, tag, "brass", lo=0.34, hi=0.48)
        cape = L.get("elf_cape")
        if cape:
            a0, a1, ln = (-130, 30, 0.72) if cape == "half" else (-110, 110, 0.86)
            ec.drape(J, P, tag, "halfcape", ln, a0, a1, ("kit2", "kit1"), stream=pose.get("cape", 0.0) * 0.8, jag=0.08, depth=0.14,
                     nu=12, grow=0.02)
        tband(tag + "coatbody", J, P, [0.1, 0.25, 0.4, P["sh_h"]], "kit1", k=1.07, add=0.012, arc=(-140, 140))
        if pose.get("hand_modes", {}).get("r") == "fist":      # the raised index finger
            c0, d, n, t = J["grip_r"]
            wr, tip = J["arms"]["r"][2:]
            dd = (tip - wr).normalized()
            tube(tag + "finger", [tip - dd * 0.02, tip + dd * 0.11], [0.024, 0.02], L["skin"], n=5)

    def details(self, J, P, L, tag, pose):
        ec.studs(J, P, tag, "coatbtn", [(0.16, 14), (0.24, 14), (0.32, 14)], "brass", r=0.02, off=0.04)
        c, X, F, U, s = ec.hf(J)
        ball_at(tag + "bandgem", c + F * s[1] * 1.12 + U * s[2] * 0.41, 0.026, "leaf")

@register
class Wardancer(looks.Fine, Biped):
    """Bare to the waist with kit1 warpaint spiralling over arms and chest, a tall red topknot bound in kit2,
    kit1 dance trousers with kit2 garters, long kit2 sash tails; balanced on one leg, slowly dancing."""
    key = "wardancer"
    race = "elf"
    knobs = dict(legs=1.1, limb=0.86)
    layout = dict(WE, hair=None, hair_mat="hair_red", brow="hair_red", torso="skin_elf", arms="skin_elf", legs="kit1",
                  boots="rags", cuff="leather", belt="kit2", buckle="brass", loin="kit2", loin_trim="kit1", wraps="kit1",
                  elf_topknot="hair_red", elf_mohawk=None, elf_paint="kit1")
    stance = dict(lean=4, twist=10, legs={"l": (4, 8, 4), "r": (46, 16, 96)}, feet={"r": 40},
                  arms={"l": (10, 70, 30, 60), "r": (30, 60, 80, 20)}, hands="open")
    stride, arm_swing, run_lean, jump = 46, 44, 18, 0.36
    height = 1.04

    def idle(self, ph, p, w):       # a slow war dance on one leg: the raised knee and both arms sweep through a figure of eight
        s1, c1 = w["s1"], w["c1"]
        p.update(twist=10 + 14 * (1 if s1 > 0 else -1), look=-12 * (1 if s1 > 0 else -1), sash=0.07 * w["s2"],
                 legs={"l": (4, 8, 4), "r": (46 + 16 * s1, 16 + 10 * c1, 96 - 20 * s1)},
                 arms={"l": (10 + 50 * s1, 70 - 20 * c1, 30, 60), "r": (30 - 50 * s1, 60 + 20 * c1, 80, 20)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = ec.hf(J)
        if L.get("elf_topknot"):
            hm = L["elf_topknot"]
            core.cap(tag + "scalp", c + U * 0.012, (s[0] * 1.08, s[1] * 1.08, s[2] * 1.08), hm, (U * 0.9 - F * 0.45).normalized(),
                     cut=0.3, rot=J["head_R"], thick=0.025)
            ec.topknot(J, L, tag, hm, tie="kit2", length=0.6)
        if L.get("elf_mohawk"):
            ec.comb(J, tag, L["elf_mohawk"], h=0.22, lo=0.7, back=-0.98, n=9, jag=0.45, thick=0.09, name="mohawk")
        ec.loose_hair(J, L, tag, length=0.5)
        paint = L.get("elf_paint")
        if paint:
            tube(tag + "facepaint", [c + F * s[1] * 1.0 + U * s[2] * 0.12 - X * s[0] * 0.75, c + F * s[1] * 1.06 + U * s[2] * 0.12,
                                     c + F * s[1] * 1.0 + U * s[2] * 0.12 + X * s[0] * 0.75], [0.035] * 3, paint, n=5, flat=0.5, ref=U)
            # warpaint: chest chevrons and arm spirals
            ec.torso_stripe(J, P, tag, "tat1", [(0.47, -62), (0.34, -28), (0.24, 0), (0.34, 28), (0.47, 62)], paint, r=0.04, off=0.0)
            ec.torso_stripe(J, P, tag, "tat2", [(0.4, 120), (0.3, 180), (0.4, 240)], paint, r=0.045, off=0.0)
            ec.torso_stripe(J, P, tag, "tat3", [(0.2, -70), (0.13, -30), (0.2, 0)], paint, r=0.03, off=0.0)
            for side in ("l", "r"):
                for i, t in enumerate((0.15, 0.45, 0.75)):
                    ec.arm_band(J, L, tag, side, t, t + 0.13, paint, "upper", grow=1.04, name="tat%d" % i)
        if L.get("sex") == "f":     # her bound chest wrap
            tband(tag + "wrap", J, P, [0.31, 0.39, 0.47], "kit2", k=1.07, add=0.016)
            core.cups(J, P, tag, "kit2", off=0.005)
        for side in ("l", "r"):
            ec.leg_band(J, L, tag, side, 0.25, 0.4, "kit2", "thigh", name="garter")
        ec.sash(J, P, tag, pose, "kit2", sd=-1, length=0.66, n=3)
        ec.leaf_ring(J, P, tag, P["sh_h"] + 0.02, 7, 0.14, "leaf", width=0.09, droop=0.5, off=0.03, name="torc", arc=(-150, 150))

    def details(self, J, P, L, tag, pose):
        c, X, F, U, s = ec.hf(J)
        for sd in (-1, 1):          # bone ear cuffs
            ball_at(tag + "earcuff%d" % sd, c + X * sd * s[0] * 1.02 + U * s[2] * 0.15, 0.024, "bone_old")
        for side in ("l", "r"):
            ec.arm_band(J, L, tag, side, 0.7, 0.8, "brass", "fore", grow=1.12, name="armring")

@register
class LorenTreeman(looks.Fine, Biped):
    """A tall pale-barked forest giant: antler-like branch crown with leaf clusters, glowing eyes in a hollow
    face, kit1 pennants hanging from both forearms and a kit1 standard down the back, kit2 ribbons knotted
    round trunk, wrists and branches."""
    key = "treeman_loren"
    race = "treeman"
    knobs = dict(legs=0.95, arms=1.45, limb=1.5, shoulders=1.3, torso=1.25, torso_len=1.35, hands=1.5, feet=1.4, head=0.9,
                 neck=1.5, hunch=6)
    layout = dict(skin="elf_birch", torso="elf_birch", arms="elf_birch", legs="elf_birch", boots="bark", cuff=None, eyes="red",
                  lip="bark", brow="bark", hair=None, ears=None, gloves="bark", belt="kit2", buckle=None, neckband="kit2",
                  loin="kit1", loin_trim="kit2", bracers="kit2", claws=0.1, finger=1.3)
    stance = dict(lean=3, legs={"l": (5, 12, 6), "r": (-4, 12, 6)}, arms={"l": (6, 20, 18, 6), "r": (6, 20, 18, 6)}, hands="relaxed")
    stride, arm_swing, run_lean, jump = 22, 16, 6, 0.04
    lie, lie_shift = 0.38, 1.0
    height = 1.0

    def idle(self, ph, p, w):       # sways like a tree in wind (two states), crown creaking; pennants and ribbons flutter
        k = 1 if w["s1"] > 0 else -1
        p.update(roll=1.5 * k, look=10 * w["s1"], nod=4 * w["s2"], sash=0.12 * w["s2"],
                 arms={"l": (6 + 5 * k, 20, 18, 6), "r": (6 - 5 * k, 20, 18, 6)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        X, u, B, F = J["X"], J["u"], J["B"], J["F"]
        c, HX, HF, HU, s = ec.hf(J)
        sway = pose.get("sash", 0.0)
        stream = 0.25 if pose.get("_action") else 0.0
        Bh = ec.hz(B)
        # bark: dark knots and root flares
        for i, (h, a) in enumerate(((0.2, 35), (0.42, -50), (0.55, 150), (0.3, 200), (0.62, 20))):
            ball_at(tag + "knot%d" % i, surf(J, P, h, a, -0.02), 0.07, "bark")
        for i in range(4):
            a = [35, 150, 215, 325][i]
            p0 = surf(J, P, -0.05, a, 0.0)
        # branch crown: two main antler branches and a rear one, each ending in leaves
        k = 0
        for sd in (-1, 1):
            root = c + HX * sd * s[0] * 0.6 + HU * s[2] * 0.6
            a = root + (HX * sd * 0.3 + HU * 0.38)
            b = a + (HX * sd * 0.22 + HU * 0.42 - HF * 0.08)
            tube(tag + "br%d" % sd, [root, a, b], [0.11, 0.08, 0.035], "elf_birch", n=6)
            t1 = a + HX * sd * 0.42 + HU * 0.12
            tube(tag + "brs%d" % sd, [a, t1], [0.06, 0.025], "elf_birch", n=5)
            t2 = lerp(a, b, 0.5) + (-HX * sd * 0.2 + HU * 0.3 + HF * 0.1)
            tube(tag + "brt%d" % sd, [lerp(a, b, 0.5), t2], [0.05, 0.02], "elf_birch", n=5)
            for q, r in ((b, 0.22), (t1, 0.17), (t2, 0.15)):
                parts.foliage(tag, q + UP * 0.05, r, n=4, seed=k); k += 1
            ball_at(tag + "ribk%d" % sd, lerp(root, a, 0.8), 0.07, "kit2")       # ribbon tied on the branch
            ec.streamers(tag, lerp(root, a, 0.8), J, pose, "kit2", length=0.5, w=0.05, sd=sd, n=2, name="brib%d" % sd)
        back = c - HF * s[1] * 0.5 + HU * s[2] * 0.7
        tube(tag + "brb", [back, back - HF * 0.3 + HU * 0.4], [0.09, 0.03], "elf_birch", n=5)
        parts.foliage(tag, back - HF * 0.3 + HU * 0.48, 0.2, n=4, seed=9)
        # mossy shoulders
        for side, sd in (("l", -1), ("r", 1)):
            sh, el, wr = J["arms"][side][:3]
            parts.foliage(tag, sh + u * 0.14 + X * sd * 0.04, 0.16, n=4, seed=20 + sd)
            # pennant hanging from the forearm
            d = (wr - el).normalized()
            ec.banner(tag, "pen" + side, lerp(el, wr, 0.15) - UP * 0.1, lerp(el, wr, 0.95) - UP * 0.1, 0.62, "kit1", trim="kit2",
                      sway=sway + stream, back=Bh)
            ball_at(tag + "wristk" + side, wr + X * sd * 0.1, 0.08, "kit2")
        # standard down the back, hung from a branch yoke
        a = J["pelvis"] + u * (P["sh_h"] + 0.02) + B * (core.tprof(P, P["sh_h"] - 0.1)[1] + 0.1)
        ec.banner(tag, "std", a - X * 0.26, a + X * 0.26, 0.85, "kit1", trim="kit2", sway=0.1 + sway + stream * 2, back=Bh)
        tube(tag + "yoke", [a - X * 0.34, a + X * 0.34], [0.045, 0.045], "bark", n=5)
        ec.sash(J, P, tag, pose, "kit2", sd=1, length=0.7, n=3)

    def details(self, J, P, L, tag, pose):
        for i, (h, a) in enumerate(((0.12, -20), (0.35, 70), (0.5, -110), (0.25, 160))):    # moss and toadstools on the bark
            p = surf(J, P, h, a, 0.01)
            ball_at(tag + "moss%d" % i, p, 0.06, "leaf")
            ball_at(tag + "shroom%d" % i, p + J["u"] * 0.05 + ec.hz(p - J["pelvis"]) * 0.04, 0.035, "kit2")
