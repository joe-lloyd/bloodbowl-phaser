"""Nurgle: rotter, pestigor, bloater, rotspawn. Costume: the Rot Wardens, rotten cloth and rusty iron.
No figure holds a ball."""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts, looks
from lib.core import tube, tband, ball_at, box, cone, flat_cone, ellipsoid, lerp, UP, basis, D, surf
from teams import chaos_common as cc

@register
class Rotter(looks.Fine, Biped):
    """Shambling plague victim: stooped and pot-bellied, bandaged head and arm, torn kit1 smock, kit2 rope collar and leg wraps, one rusty pad."""
    key = "rotter"
    race = "zombie"
    knobs = dict(hunch=20, belly=1.25, limb=0.92, head_fwd=0.08)
    layout = dict(skin="skin_zombie", lip="skin_zombie", torso="kit1", arms="skin_zombie", legs="rags", boots="rags", cuff="kit2",
                  coat="robe", coat_mat="kit1", robe_len=0.4, jag=0.6, robe_lining="kit1", scarf="bandage", wraps="bandage", neckband="kit2",
                  belt="rope", buckle=None, pads="plate", pad_sides=("r",), pad_mat="rust", pad_trim="kit2", bracers="kit2", hood_mat="kit1",
                  tentacle=None)
    stance = dict(lean=8, nod=14, legs={"l": (4, 10, 14), "r": (-8, 10, 8)}, arms={"l": (26, 14, 30, 0), "r": (8, 18, 16, 0)}, hands="relaxed")
    stride, arm_swing, run_lean, jump = 30, 16, 10, 0.1
    height = 1.05

    def idle(self, ph, p, w):       # sways on his feet, head lolling from one shoulder to the other, one arm jerking
        k = 1 if w["s1"] > 0 else -1
        p.update(look=22 * k, nod=14 + 8 * w["breath"], lean=8 + 4 * w["breath"],
                 arms={"l": (26 + 26 * max(0.0, w["s2"]), 14, 30 + 40 * max(0.0, w["s2"]), 0), "r": (8, 18, 16, 0)})

    def adjust(self, name, i, pose):
        if name == "run":                # shuffles with his arms out in front
            pose["arms"] = {"l": (60 + 8 * math.sin(i * math.pi / 4), 10, 30), "r": (44 - 8 * math.sin(i * math.pi / 4), 14, 40)}
            pose["hands"] = "relaxed"

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.boils(J, P, tag, ((0.16, 24), (0.08, -30), (0.3, -42)), mat="skin_belly", r=0.04)
        cc.strap(J, P, tag, "kit2", r=0.035, flip=-1)
        if L.get("tentacle"):
            cc.shoulder_tentacle(J, tag, side="r", ln=0.6, r=0.065, mat="skin_zombie")

    def details(self, J, P, L, tag, pose):
        cc.bell(tag + "bell", surf(J, P, 0.04, 40, 0.09), "rust", r=0.055)     # a rusty bell on the rope belt
        R = basis(J["X"], J["F"], J["u"])
        for i, h in enumerate((0.22, 0.28, 0.34)):       # crude stitches across a tear in the smock
            box(tag + "stitch%d" % i, surf(J, P, h, 20, 0.035), (0.09, 0.02, 0.02), "black", R)

@register
class Pestigor(Biped):
    """Plague goat: mangy pale-yellow hide, one long horn and one broken stump, a cloud of flies round his head, kit1 tattered tabard, rusty kit2-rimmed shoulder."""
    key = "pestigor"
    race = "beastman"
    knobs = dict(shoulders=1.1, hunch=14, belly=1.15)
    layout = dict(skin="skin_belly", legs="skin_belly", dark="fur_brown", horns=None, snout=(1.0, 0.85), eye_mat="eye_yellow", tabard="kit1",
                  tabard_trim="kit2", pads="plate", pad_sides=("r",), pad_mat="rust", pad_trim="kit2", spikes=1, belt="rope", buckle=None,
                  bracers="kit2", arm_band="kit1", neckband="kit2", horn="one", swarm=True)
    stance = dict(lean=8, nod=8, legs={"l": (8, 12, 10), "r": (-8, 12, 6)}, arms={"l": (12, 26, 48, -4), "r": (12, 26, 48, -4)}, hands="relaxed")
    stride, arm_swing, run_lean = 40, 32, 18
    height = 1.06

    def idle(self, ph, p, w):       # the flies circle; he shakes his head and swats at them with one hand
        up = 1 if w["s1"] > 0.2 else 0
        p.update(look=24 * w["s2"], flies=ph,
                 arms={"l": (12, 26, 48, -4), "r": (12 + 120 * up, 26 + 10 * up, 48 + 50 * up + 30 * w["s2"] * up, -4 - 20 * up)},
                 hand_modes={"r": "open" if up else "relaxed"})

    def adjust(self, name, i, pose):
        pose.setdefault("flies", i / 8.0)

    def extras(self, J, P, L, tag, pose):
        if L.get("horn") == "one":
            cc.one_horn(J, tag, sd=-1, ln=0.5)
        cc.chin_tuft(J, tag, "fur_brown", ln=0.18, fwd=1.05)
        if L.get("swarm"):
            cc.flies(J, tag, pose.get("flies", 0.0), n=4, rad=0.36, r=0.04)
        cc.boils(J, P, tag, ((0.3, 30), (0.18, -28)), mat="skin_belly", r=0.04)
        cc.spines(J, P, tag, (0.22, 0.36, 0.48), mat="fur_brown", ln=0.1, r=0.06, name="mane")

@register
class Bloater(Biped):
    """Hugely fat blocker: a vast bare gut split by a toothed maw, tiny rusty horned pot-helm, kit1 rag skirt and hood-cowl, kit2 belly chain plates."""
    key = "bloater"
    race = "human"
    knobs = dict(belly=2.1, torso=1.55, shoulders=1.2, limb=1.45, legs=0.82, head=0.85, neck=1.3, hips=1.2)
    layout = dict(skin="skin_nurgle", lip="skin_nurgle", hair=None, brow="socket", eyes="red", torso="skin_nurgle", arms="skin_nurgle",
                  legs="rags", boots="rust", cuff="kit2", helm="skull", helm_mat="rust", pads="plate", pad_mat="kit1", pad_trim="kit2",
                  bracers="kit2", neckband="kit1", arm_band="kit1", belt=None)
    stance = dict(lean=-4, legs={"l": (4, 20, 6), "r": (-4, 20, 6)}, arms={"l": (10, 46, 40, -10), "r": (10, 46, 40, -10)}, hands="relaxed")
    stride, arm_swing, jump = 24, 18, 0.06
    lie, lie_shift = 0.36, 1.0
    height = 1.04

    def idle(self, ph, p, w):       # jolly: rocks back and slaps his gut with both hands while the maw in it gapes
        b = w["breath"]
        p.update(lean=-4 - 5 * b, nod=-8 * b, maw=b,
                 arms={"l": (10 + 34 * b, 46 - 16 * b, 40 + 44 * b, -10 - 34 * b), "r": (10 + 34 * b, 46 - 16 * b, 40 + 44 * b, -10 - 34 * b)},
                 hand_modes={"l": "open", "r": "open"})

    def extras(self, J, P, L, tag, pose):
        cc.belly_maw(J, P, tag, h=0.14, w=0.3, gape=0.07 + 0.07 * pose.get("maw", 0.0), teeth=6, off=-0.02)
        cc.rags(J, P, tag, "kit1", h0=0.02, h1=-0.3, jag=0.6, k=1.04)
        tband(tag + "gutband", J, P, [0.0, 0.05], "kit2", k=1.03, add=0.02)
        cc.one_horn(J, tag, sd=1, mat="bone", ln=0.3, r=0.06, stub=False)
        cc.boils(J, P, tag, ((0.3, 40), (0.26, -46), (0.42, 20), (0.2, 150), (0.36, -150)), mat="skin_belly", r=0.055)
        cc.strap(J, P, tag, "kit1", r=0.05, flip=1, bot=0.3)
        for i, a in enumerate((-70, 70)):
            box(tag + "gutplate%d" % i, surf(J, P, 0.1, a, 0.03), (0.14, 0.14, 0.16), "kit2", basis(J["X"], J["F"], J["u"]))

@register
class Rotspawn(Biped):
    """Tentacled mass: a sagging mound of flesh on stumpy legs with tentacles for arms and more writhing from its back, a gaping gut-maw, kit1 rotten cloth, kit2 rusty rings on every tentacle."""
    key = "rotspawn"
    race = "ogre"
    knobs = dict(legs=0.5, belly=1.9, torso=1.55, shoulders=1.15, head=0.75, hunch=14, arms=0.9, limb=1.6, neck=1.3, head_fwd=0.1, hips=1.3)
    layout = dict(skin="skin_nurgle", lip="skin_nurgle", torso="skin_nurgle", arms="skin_nurgle", legs="skin_nurgle", boots="skin_nurgle",
                  cuff=None, no_arms=True, hair=None, brow="socket", eyes="red", fangs=True, loin="kit1", loin_trim="kit2", neckband="kit2",
                  arm_band="kit1", belt=None)
    stance = dict(lean=4, nod=6, legs={"l": (4, 24, 10), "r": (-4, 24, 10)}, arms={"l": (16, 50, 30, 0), "r": (16, 50, 30, 0)}, hands="open")
    stride, arm_swing, jump = 22, 24, 0.05
    lie, lie_shift = 0.4, 1.0
    height = 1.0

    def idle(self, ph, p, w):       # the whole mass ripples: tentacles writhe in turn, the gut-maw yawns, the head lolls
        p.update(writhe=ph, maw=w["up"], look=20 * w["s1"], nod=6 + 10 * w["breath"],
                 arms={"l": (16 + 14 * w["s1"], 50, 30 + 20 * w["s2"], 0), "r": (16 - 14 * w["s1"], 50, 30 - 20 * w["s2"], 0)})

    def adjust(self, name, i, pose):
        pose.setdefault("writhe", i / 8.0)
        if name in ("cheer", "block"):
            pose.setdefault("maw", 1.0)

    def extras(self, J, P, L, tag, pose):
        X, u, F, B = J["X"], J["u"], J["F"], J["B"]
        ph = pose.get("writhe", 0.0) * 2 * math.pi
        for k, (side, sd) in enumerate((("l", -1), ("r", 1))):       # arm tentacles continue from the wrists
            sh, el, wr, tip = J["arms"][side]
            d = (wr - el).normalized()
            bend = (UP * (0.9 + 0.7 * math.sin(ph + k * 2.4)) + J["X"] * sd * 0.4 + F * 0.5 * math.cos(ph + k * 2.4))
            pts = cc.tentacle(tag + "tarm" + side, wr - d * 0.05, d, bend, 0.85, 0.15, "skin_nurgle", n=6, curl=2.2)
            for j in (1, 3):
                ball_at(tag + "tring%s%d" % (side, j), pts[j], 0.15 * (1 - 0.12 * j), "kit2")
        roots = ((0.62, -0.22, -1), (0.7, 0.0, 0), (0.62, 0.22, 1), (0.4, -0.3, -1), (0.4, 0.3, 1))
        for i, (h, sx, sd) in enumerate(roots):                       # back tentacles
            base = cc.back_pt(J, P, h, -0.06, sx)
            a = ph + i * 1.3
            d0 = (UP * 1.0 + B * 0.5 + X * sd * 0.5).normalized()
            bend = X * (sd * 0.5 + 0.9 * math.sin(a)) + F * (0.5 + 0.5 * math.cos(a)) - UP * 0.2
            ln = 0.8 if i < 3 else 0.6
            pts = cc.tentacle(tag + "tback%d" % i, base, d0, bend, ln, 0.1, "skin_nurgle", n=6, curl=1.8)
            ball_at(tag + "tbring%d" % i, pts[2], 0.095, "kit2" if i % 2 == 0 else "kit1")
        cc.belly_maw(J, P, tag, h=0.2, w=0.3, gape=0.06 + 0.1 * pose.get("maw", 0.0), teeth=7, off=-0.02)
        cc.boils(J, P, tag, ((0.4, 44), (0.36, -50), (0.05, 60), (0.02, -64), (0.5, 12)), mat="skin_belly", r=0.06)
        cc.strap(J, P, tag, "kit1", r=0.06, flip=-1, bot=0.3)
        c, Xh, Fh, Uh, s = cc.hf(J)
        ball_at(tag + "eyestalk", c + Uh * s[2] * 1.1 + Xh * 0.08, 0.07, "skin_belly")
        ball_at(tag + "eyestalkp", c + Uh * s[2] * 1.12 + Xh * 0.08 + Fh * 0.05, 0.035, "eye")
