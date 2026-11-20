"""Lizardmen (models saurus, skink, chameleon_skink, kroxigor). Kit colours go on crests, loincloths,
harness, arm rings and tail bands; each position has its own scale colour. No figure holds a ball."""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts
from lib.core import tube, tband, ball_at, box, lerp, UP, basis, D, cone, flat_cone, ellipsoid, cap, surf
from teams import undead_skaven_lizards_kit as K

def two(w, key="s1"):
    return 1 if w[key] > 0 else -1

def scaly(skin, **kw):
    d = dict(skin=skin, legs=skin, boots=skin, cuff=None, tail=None, crest=None)
    d.update(kw)
    return d

@register
class Saurus(Biped):
    """Blocker: thick blue-green warrior, pale belly, back-swept bone horns over a kit2 crest, one gold
    shoulder plate, kit1 loincloth, kit1 bands on a heavy spiked tail; stands wide with fists out."""
    key = "saurus"
    race = "saurus"
    knobs = dict(shoulders=1.32, torso=1.25, limb=1.4, head=1.12, hands=1.2, legs=0.95)
    layout = scaly("skin_lizard", loin="kit1", loin_trim="gold", belt="gold", buckle="kit2", pads="plate", pad_sides=("l",),
                   pad_mat="gold", pad_trim="kit2", bracers="gold", arm_band="kit2", claws=0.1, snout=(1.35, 1.05))
    stance = dict(lean=2, jaw=10, legs={"l": (6, 16, 10), "r": (-5, 16, 10)}, arms={"l": (8, 36, 46, -4), "r": (8, 36, 46, -4)},
                  hands="fist")
    stride, arm_swing, run_lean, jump = 32, 26, 10, 0.12
    lie, lie_shift = 0.28, 0.9

    def idle(self, ph, p, w):       # cold-blooded patience: slow heave of the chest, tail swinging, one sudden jaw snap
        snap = 1.0 if 0.55 <= ph < 0.7 else 0.0
        p.update(lean=2 + 3 * w["breath"], tail=w["s1"], jaw=10 + 26 * snap, nod=-8 * snap, look=10 * w["c1"])

    def adjust(self, name, i, pose):
        pose.setdefault("jaw", 10)

    def extras(self, J, P, L, tag, pose):
        K.belly(J, P, tag)
        K.toe_claws(J, tag, 1.3)
        K.tail(J, tag, pose, ln=1.0, r=0.15, mat="skin_lizard", up=0.08, bands=[(0.3, 0.4, "kit1"), (0.6, 0.68, "kit1")],
               spikes="bone")
        c, X, F, U, s = K.hframe(J)
        core.crest(tag, c, J["head_R"], s, "kit2", h=0.22, n=5, lo=0.5, width=0.06)
        for sd in (-1, 1):
            root = c + X * sd * s[0] * 0.6 + U * s[2] * 0.7 - F * s[1] * 0.3
            tube(tag + "horn%d" % sd, [root, root - F * 0.2 + U * 0.1 + X * sd * 0.06, root - F * 0.42 + U * 0.08 + X * sd * 0.1],
                 [0.07, 0.055, 0.02], "bone", n=6)
        K.spines(J, P, tag, "kit2", [0.2, 0.34, 0.48], length=0.12, r=0.06)

@register
class Skink(Biped):
    """Small quick lineman: bright green, big kit1 sail crest from brow to neck, kit2 loincloth and arm
    rings, gold wrist bands, thin banded tail held high; up on its toes, head darting."""
    key = "skink"
    race = "skink"
    knobs = dict(head=1.15, hunch=14)
    layout = scaly("skin_skink", loin="kit2", loin_trim="gold", arm_band="kit2", bracers="gold", belt="leather", buckle="gold",
                   neckband="kit1")
    stance = dict(lean=4, nod=-8, legs={"l": (14, 10, 26), "r": (-6, 10, 18)}, feet={"l": 14, "r": 14},
                  arms={"l": (24, 16, 70, 0), "r": (24, 16, 70, 0)}, hands="relaxed")
    stride, arm_swing, run_lean, jump = 46, 38, 18, 0.3
    height = 1.08

    def idle(self, ph, p, w):       # bird-quick: the head darts side to side and up, tail flicking, bouncing on its toes
        k = two(w)
        toe = 14 + 12 * (1 if w["s2"] > 0 else 0)
        p.update(look=26 * k, nod=-8 - 10 * (1 if w["s2"] > 0 else 0), tail=w["s2"], feet={"l": toe, "r": toe})

    def extras(self, J, P, L, tag, pose):
        K.belly(J, P, tag, half=55)
        K.tail(J, tag, pose, ln=0.9, r=0.07, mat="skin_skink", up=0.4, bands=[(0.35, 0.45, "kit1"), (0.62, 0.7, "kit1")])
        c, X, F, U, s = K.hframe(J)
        core.crest(tag, c, J["head_R"], s, "kit1", h=0.36, n=6, lo=0.75, back=-0.95, width=0.07)

@register
class ChameleonSkink(Biped):
    """Stalker: leaf-green with yellow and kit2 blotches, pointed casque on the back of the head, bulging
    turret eyes, tail curled in a spiral, kit1 sash; creeps with one hand reaching and flicks its tongue."""
    key = "chameleon_skink"
    race = "skink"
    knobs = dict(head=1.12, hunch=22, arms=1.1)
    layout = scaly("leaf", loin="kit1", loin_trim="kit2", wraps="kit2", belt="rope", buckle=None, eye_mat="socket",
                   snout=(1.0, 0.85))
    stance = dict(lean=6, nod=-14, legs={"l": (18, 12, 30), "r": (-10, 12, 20)},
                  arms={"l": (50, 14, 40, 0), "r": (4, 18, 50, 0)}, hands="open")
    stride, arm_swing, run_lean, jump = 44, 36, 18, 0.26
    height = 1.08

    def idle(self, ph, p, w):       # slow-motion creep of the reaching hand, tail curling tighter, then a tongue flick
        flick = 1.0 if 0.5 <= ph < 0.75 else 0.0
        p.update(curl=0.9 + 0.15 * w["s1"], tongue=flick, look=14 * w["c1"],
                 arms={"l": (50 + 12 * w["s1"], 14, 40 - 10 * w["s1"], 0), "r": (4, 18, 50, 0)})

    def extras(self, J, P, L, tag, pose):
        K.belly(J, P, tag, half=50)
        K.sash(J, P, tag, "kit1", w=0.065)
        K.tail(J, tag, pose, ln=0.85, r=0.07, mat="leaf", curl=pose.get("curl", 1.0))
        Rb = basis(J["X"], J["F"], J["u"])
        for i, (h, a, m) in enumerate(((0.38, 150, "kit2"), (0.22, 200, "skin_belly"), (0.42, 215, "skin_belly"), (0.14, 150, "kit2"),
                                       (0.3, 100, "skin_belly"), (0.3, -100, "kit2"))):
            ellipsoid(tag + "blotch%d" % i, surf(J, P, h, a, -0.03), (0.075, 0.075, 0.065), m, Rb, seg=8)
        c, X, F, U, s = K.hframe(J)
        R = J["head_R"]
        top = c + U * s[2] * 0.55 - F * s[1] * 0.2
        cone(tag + "casque", top - U * 0.06, top + U * 0.2 - F * 0.36, s[0] * 0.8, "leaf", 8)
        flat_cone(tag + "casquefin", top + F * 0.2, top + U * 0.26 - F * 0.4, 0.09, "kit2", X, squash=0.3)
        for sd in (-1, 1):
            e = c + F * s[1] * 0.55 + X * sd * s[0] * 0.85 + U * s[2] * 0.2
            ball_at(tag + "turret%d" % sd, e, 0.085, "skin_belly")
            ball_at(tag + "pupil%d" % sd, e + X * sd * 0.06 + F * 0.045, 0.035, "socket")
        if pose.get("tongue"):
            a = c + F * s[1] * 1.5 - U * s[2] * 0.3
            tube(tag + "tongue", [a, a + F * 0.2 - U * 0.02, a + F * 0.42 + U * 0.03], [0.025, 0.022, 0.03], "lip_f", n=5)

@register
class Kroxigor(Biped):
    """Crocodile giant: dark swamp-green, very long toothed snout, twin rows of back scutes, enormous tail
    with kit2 rings, crossed kit1 harness and loincloth, gold shoulder plate rimmed kit2; yawns wide."""
    key = "kroxigor"
    race = "kroxigor"
    knobs = dict(shoulders=1.5, torso=1.45, head=1.12, arms=1.25, limb=1.65, hands=1.35, legs=0.9)
    layout = scaly("skin_krox", loin="kit1", loin_trim="gold", belt="leather", buckle="gold", pads="plate", pad_sides=("r",),
                   pad_mat="gold", pad_trim="kit2", bracers="kit2", arm_band="kit1", claws=0.14, snout=(2.0, 1.15), fangs=True)
    stance = dict(lean=2, jaw=10, legs={"l": (6, 16, 10), "r": (-5, 16, 10)}, arms={"l": (14, 30, 34, 4), "r": (14, 30, 34, 4)},
                  hands="open")
    stride, arm_swing, run_lean, jump = 30, 24, 10, 0.1
    lie, lie_shift = 0.32, 1.0

    def idle(self, ph, p, w):       # a long lazy yawn showing every tooth, the great tail sweeping the turf
        yawn = max(0.0, math.sin(w["a"] - 0.4)) ** 0.6
        p.update(jaw=10 + 38 * yawn, nod=-16 * yawn, tail=w["s1"], lean=2 + 3 * w["breath"])

    def adjust(self, name, i, pose):
        pose.setdefault("jaw", 10)
        pose["jaw"] = max(pose["jaw"], 16)           # always a little open: the dark jaw line reads head-on
        if name != "fall":
            pose["nod"] = pose.get("nod", 0) - 14    # head carried higher so the snout does not foreshorten to a blob
        if name in ("run", "block"):
            pose["hands"] = "open"

    def extras(self, J, P, L, tag, pose):
        K.belly(J, P, tag, hi=0.5)
        K.toe_claws(J, tag, 1.6)
        K.harness(J, P, tag, "kit1", boss="gold", w=0.13, lo=0.12)
        tband(tag + "yoke", J, P, [P["sh_h"] - 0.06, P["sh_h"] + 0.02, P["sh_h"] + 0.08], "kit1", k=1.06, add=0.045, solid=0.03)
        # head: pale lower jaw under the dark mouth line, bony brow ridges, and a kit1 muzzle strap with kit2 rim
        c, X, F, U, s = K.hframe(J)
        hs, (ln, wd) = s[0] / 0.2, L.get("snout", (1.0, 1.0))
        jaw = D(pose.get("jaw", 10))
        hinge = c - U * s[2] * 0.35 + F * s[1] * 0.1
        jf = (F * math.cos(jaw) - U * math.sin(jaw)).normalized()
        ju = X.cross(jf) * -1
        jc = hinge + jf * 0.26 * hs * ln - ju * 0.07 * hs
        ellipsoid(tag + "jawpale", jc - ju * 0.025 * hs, (0.13 * hs * wd, 0.2 * hs * ln, 0.05 * hs), "skin_belly", basis(X, jf, ju))
        for sd in (-1, 1):
            b = c + F * s[1] * 0.75 + X * sd * s[0] * 0.5 + U * s[2] * 0.42
            ellipsoid(tag + "browridge%d" % sd, b, (0.07 * hs, 0.09 * hs, 0.05 * hs), "skin_lizard", J["head_R"], seg=8)
        sn = c + F * s[1] * (0.55 + 0.28 * ln) - U * s[2] * 0.22
        mz0, mz1 = sn - F * 0.1 * hs * ln, sn - F * 0.02 * hs * ln
        tube(tag + "muzzle", [mz0, mz1], [0.19 * hs * wd, 0.18 * hs * wd], "kit1", ref=X, n=12)
        tube(tag + "muzzlerim", [mz1, mz1 + F * 0.03 * hs], [0.185 * hs * wd, 0.185 * hs * wd], "kit2", ref=X, n=12)
        K.tail(J, tag, pose, ln=1.35, r=0.2, mat="skin_krox", up=0.06, bands=[(0.28, 0.36, "kit2"), (0.55, 0.62, "kit2")],
               spikes="skin_lizard")
        for i, h in enumerate((0.2, 0.34, 0.48, 0.62)):
            for sd in (-1, 1):
                b = surf(J, P, h, 180 + sd * 22, -0.02)
                d = (J["B"] + J["u"] * 0.4 + J["X"] * sd * 0.2).normalized()
                cone(tag + "scute%d%d" % (i, sd), b, b + d * 0.16, 0.07, "skin_lizard", 5)
        c, X, F, U, s = K.hframe(J)
        for i, t in enumerate((0.9, 1.25, 1.6)):
            for sd in (-1, 1):
                b = c + F * s[1] * t - U * s[2] * 0.38 + X * sd * s[0] * 0.5
                cone(tag + "tooth%d%d" % (i, sd), b, b - U * 0.09, 0.03, "bone", 5)
