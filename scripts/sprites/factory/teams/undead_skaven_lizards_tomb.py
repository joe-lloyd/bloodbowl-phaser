"""Tomb Kings (models tk_skeleton, anointed_blitzer, anointed_thrower, tomb_guardian). Costume: a desert
dynasty in gold and bronze, kit colours on headdresses, kilts, collars and capes. No figure holds a ball."""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts
from lib.core import tube, tband, ball_at, box, lerp, UP, basis, D, cone, flat_cone, ellipsoid, cap, surf
from teams import undead_skaven_lizards_kit as K

def two(w, key="s1"):
    return 1 if w[key] > 0 else -1

@register
class TombSkeleton(Biped):
    """Tomb Kings lineman: bare ribs, kit1 headcloth with a neck flap, broad kit2 collar, one bronze shoulder,
    kit1 kilt; drilled, fists up like a soldier."""
    key = "tk_skeleton"
    race = "skeleton"
    knobs = dict(limb=0.6)
    layout = dict(legs="bone_old", boots="bone_old", cuff=None, loin="kit1", loin_trim="gold", shorts="kit1", belt="gold",
                  buckle="kit2", pads="plate", pad_sides=("l",), pad_mat="brass", pad_trim="kit2", bracers="brass")
    stance = dict(lean=3, legs={"l": (8, 8, 8), "r": (-8, 8, 6)}, arms={"l": (24, 20, 78, 0), "r": (16, 20, 70, 0)},
                  hands="fist")
    height = 1.0

    def idle(self, ph, p, w):       # parade-ground drill: the skull snaps left and right, the guard pumps up and down
        k = two(w)
        p.update(look=24 * k, arms={"l": (24 + 8 * two(w, "s2"), 20, 78, 0), "r": (16 - 8 * two(w, "s2"), 20, 70, 0)})

    def extras(self, J, P, L, tag, pose):
        K.ribs(J, P, tag)
        K.collar(J, P, tag, "kit2", "gold", drop=0.08)
        c, X, F, U, s = K.hframe(J)
        R = J["head_R"]
        cap(tag + "cloth", c + U * 0.015, (s[0] * 1.12, s[1] * 1.12, s[2] * 1.1), "kit1", (U * 0.75 - F * 0.65).normalized(),
            cut=0.0, rot=R, thick=0.03)
        K.head_band(J, tag, "gold", 0.28, 0.46, 1.16)
        b = c - F * s[1] * 0.95 - U * s[2] * 0.1
        flat_cone(tag + "flap", b - U * 0.36 - F * 0.1, b + U * 0.12, 0.2, "kit1", F, squash=0.25)
        cone(tag + "browpt", c + F * s[1] * 1.0 + U * s[2] * 0.55, c + F * s[1] * 1.08 + U * (s[2] * 0.55 + 0.16), 0.035, "gold", 5)

@register
class AnointedBlitzer(Biped):
    """Royal guard: tall kit1 war crown with a gold band, big gold shoulder plates and cuirass, short kit2
    cape, kit1 kilt; leans in with fists low."""
    key = "anointed_blitzer"
    race = "wight"
    knobs = dict(shoulders=1.2, limb=0.95, torso=1.0)
    layout = dict(torso="bone_old", arms="bone_old", legs="bone_old", boots="brass", cuff="kit2", loin="kit1", loin_trim="gold",
                  shorts="kit1", pads="big", pad_mat="gold", pad_trim="kit2", breast="gold", emblem_mat="kit1", gorget=True,
                  cape="short", cape_mat="kit2", cape_lining="cloth_blue", bracers="gold", belt="kit2", trim="brass")
    stance = dict(lean=8, legs={"l": (8, 15, 12), "r": (-6, 15, 10)}, arms={"l": (8, 34, 50, -6), "r": (8, 34, 50, -6)},
                  hands="fist")
    stride, arm_swing, jump = 36, 30, 0.16
    height = 1.08

    def idle(self, ph, p, w):       # shadow-boxes: left and right jabs in turn, the cape twitching behind
        p.update(cape=0.05 + 0.08 * w["up"], look=10 * w["s1"],
                 arms={"l": (8 + 40 * w["up"], 34 - 10 * w["up"], 50 + 20 * w["up"], -6),
                       "r": (8 + 40 * w["dn"], 34 - 10 * w["dn"], 50 + 20 * w["dn"], -6)})

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s = K.hframe(J)
        R = J["head_R"]
        ellipsoid(tag + "crown", c + U * s[2] * 0.72 - F * s[1] * 0.12, (s[0] * 0.98, s[1] * 1.02, s[2] * 1.25), "kit1", R)
        K.head_band(J, tag, "gold", 0.22, 0.5, 1.15)
        ellipsoid(tag + "disc", c + F * s[1] * 0.95 + U * s[2] * 0.95, (0.07, 0.03, 0.09), "gold", R, seg=8)
        for sd in (-1, 1):
            box(tag + "cheek%d" % sd, c + X * sd * s[0] * 1.06 - U * s[2] * 0.15 + F * s[1] * 0.1, (0.03, 0.14, 0.26), "gold", R)

@register
class AnointedThrower(Biped):
    """Priest-king passer: gold funeral mask under a flaring kit2 headcloth with lappets, long kit1 robe skirt
    with gold hem, kit2 sash; stands tall with the throwing hand raised."""
    key = "anointed_thrower"
    race = "skeleton"
    knobs = dict(limb=0.62, legs=1.04)
    layout = dict(legs="bone_old", boots="brass", cuff=None, coat="robe", coat_mat="kit1", robe_len=0.72, robe_lining="kit1",
                  hem="gold", belt="gold", buckle="kit2", arm_band="gold", bracers="kit2")
    stance = dict(lean=0, legs={"l": (4, 6, 4), "r": (-3, 6, 4)}, arms={"l": (10, 22, 24), "r": (44, 26, 104, 2)},
                  hands="open")
    height = 1.08

    def idle(self, ph, p, w):       # a slow blessing: the free hand sweeps out and back while the raised fingers curl
        flex = ("open", "open", "relaxed", "fist", "fist", "relaxed", "open", "open")[int(round(ph * 8)) % 8]
        p.update(hand_modes={"r": flex}, look=-12 * w["s1"], sway=0.5 * w["s1"],
                 arms={"l": (10 + 26 * w["up"], 22 + 30 * w["up"], 24), "r": (44, 26, 104, 2)})

    def extras(self, J, P, L, tag, pose):
        K.ribs(J, P, tag, hs=(0.3, 0.38))
        K.sash(J, P, tag, "kit2", w=0.07)
        K.ribbon(J, tag, "sashtail", surf(J, P, 0.08, 80, 0.05), 0.5, "kit2", pose, w=0.06, back=0.1)
        c, X, F, U, s = K.hframe(J)
        R = J["head_R"]
        cap(tag + "cloth", c + U * 0.015, (s[0] * 1.14, s[1] * 1.14, s[2] * 1.12), "kit2", (U * 0.8 - F * 0.6).normalized(),
            cut=-0.05, rot=R, thick=0.03)
        for sd in (-1, 1):
            top = c + X * sd * s[0] * 0.8 + U * s[2] * 0.75
            flat_cone(tag + "wing%d" % sd, c + X * sd * s[0] * 1.75 - U * s[2] * 1.0 - F * 0.02, top, 0.2, "kit2", F, squash=0.3)
            box(tag + "lappet%d" % sd, c + X * sd * s[0] * 0.95 - U * s[2] * 1.45 + F * s[1] * 0.55, (0.11, 0.04, 0.3), "kit2", R)
            box(tag + "lapend%d" % sd, c + X * sd * s[0] * 0.95 - U * s[2] * 2.05 + F * s[1] * 0.56, (0.12, 0.045, 0.07), "kit1", R)
        K.head_band(J, tag, "gold", 0.3, 0.46, 1.19)
        ellipsoid(tag + "mask", c + F * s[1] * 0.42 - U * s[2] * 0.1, (s[0] * 0.86, s[1] * 0.72, s[2] * 0.95), "gold", R)
        for sd in (-1, 1):
            box(tag + "slit%d" % sd, c + F * s[1] * 1.1 + X * sd * s[0] * 0.38 + U * s[2] * 0.08, (s[0] * 0.42, 0.03, 0.035), "socket", R)
        box(tag + "chinbeard", c + F * s[1] * 0.85 - U * s[2] * 1.2, (0.07, 0.06, 0.2), "kit1", R)

@register
class TombGuardian(Biped):
    """Giant walking statue: sandstone body with square shoulder slabs, tall flaring kit1 crown, carved beard,
    broad kit2 collar, kit1 kilt, cracks in the stone. Moves in stiff steps."""
    key = "tomb_guardian"
    race = "flesh_golem"
    knobs = dict(limb=1.5, shoulders=1.45, torso=1.3, arms=1.1, head=0.98, hunch=0, hands=1.25, legs=1.0)
    layout = dict(skin="tomb_sand", torso="tomb_sand", arms="tomb_sand", legs="tomb_sand", boots="tomb_sand", cuff="gold",
                  hair=None, eyes="red", brow="socket", lip="tomb_sand", loin="kit1", loin_trim="kit2", shorts="kit1",
                  belt="gold", buckle="kit2", bracers="gold", arm_band="kit1")
    stance = dict(lean=0, legs={"l": (3, 13, 2), "r": (-3, 13, 2)}, arms={"l": (2, 16, 8, 8), "r": (2, 16, 8, 8)},
                  hands="fist")
    stride, arm_swing, run_lean, jump = 26, 16, 6, 0.06
    lie, lie_shift = 0.3, 1.0

    def idle(self, ph, p, w):       # a statue: frozen, then the head grinds round in notches and one fist lifts a step
        step = (0, 0, 0, 1, 2, 2, 1, 0)[int(round(ph * 8)) % 8]
        p.update(look=-22 + 22 * step, arms={"l": (2, 16, 8, 8), "r": (2 + 14 * step, 16, 8 + 26 * step, 8)})

    def extras(self, J, P, L, tag, pose):
        K.collar(J, P, tag, "kit2", "gold", drop=0.12)
        u, X = J["u"], J["X"]
        Rb = basis(J["X"], J["F"], J["u"])
        for side, sd in (("l", -1), ("r", 1)):
            shd = J["arms"][side][0]
            box(tag + "slab" + side, shd + u * 0.1 + X * sd * 0.03, (0.36, 0.34, 0.14), "tomb_sand", Rb)
            box(tag + "slabrim" + side, shd + u * 0.02 + X * sd * 0.03, (0.38, 0.36, 0.05), "gold", Rb)
        c, Xh, F, U, s = K.hframe(J)
        R = J["head_R"]
        base = c + U * s[2] * 0.45
        cone(tag + "crown", base, base + U * 0.42, s[0] * 1.02, "kit1", seg=10, r2=s[0] * 1.3)
        cone(tag + "crownband", base - U * 0.02, base + U * 0.08, s[0] * 1.1, "gold", seg=10, r2=s[0] * 1.12)
        cone(tag + "crowntop", base + U * 0.42, base + U * 0.47, s[0] * 1.34, "kit2", seg=10, r2=s[0] * 1.34)
        box(tag + "beard", c + F * s[1] * 0.75 - U * s[2] * 1.25, (0.09, 0.08, 0.26), "gold", R)
        a, b = surf(J, P, 0.42, -30, 0.012), surf(J, P, 0.22, -8, 0.012)
        tube(tag + "crack1", [a, lerp(a, b, 0.5) + X * 0.05, b], [0.016] * 3, "socket", n=4)
        hip, knee = J["legs"]["r"][:2]
        o = J["F"] * K.leg_r(L)
        tube(tag + "crack2", [lerp(hip, knee, 0.3) + o, lerp(hip, knee, 0.6) + o + X * 0.05, lerp(hip, knee, 0.9) + o * 0.8],
             [0.016] * 3, "socket", n=4)
