"""Chaos Chosen: beastman, chaos_chosen and the three big guys shared with Chaos Dwarf and Chaos
Renegade (minotaur, chaos_ogre, chaos_troll). Costume: the Iron Horde. No figure holds a ball."""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts, looks
from lib.core import tube, tband, ball_at, box, cone, flat_cone, ellipsoid, lerp, UP, basis, D, surf
from teams import chaos_common as cc

@register
class Beastman(looks.Fine, Biped):
    """Lean goat-headed runner: swept-back horns, chin tuft, dark mane, hooves, one kit2 shoulder plate."""
    key = "beastman"
    race = "beastman"
    knobs = dict(shoulders=1.08, hunch=12)
    layout = dict(skin="fur_brown", legs="fur_brown", horns="goat", horn_mat="bone", crest="fur_black", jersey="kit1", loin="kit1", loin_trim="kit2",
                  pads="plate", pad_sides=("l",), pad_mat="kit2", pad_trim="brass", belt="leather", buckle="brass",
                  bracers="kit2", arm_band="kit1", dark="fur_black", mutation=None)
    stance = dict(lean=8, nod=10, legs={"l": (8, 12, 10), "r": (-8, 12, 6)}, arms={"l": (14, 26, 52, -4), "r": (6, 26, 44, -4)},
                  hands="fist")
    stride, arm_swing, run_lean = 42, 34, 18
    height = 1.08

    def idle(self, ph, p, w):       # paws the turf with one hoof, then tosses his horns
        p.update(legs={"l": (8, 12, 10), "r": (-8 + 34 * w["up"], 12, 6 + 50 * w["up"])},
                 nod=10 - 26 * max(0.0, -w["s2"]) * (1 if w["s1"] < 0 else 0), look=14 * w["c1"])

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.chin_tuft(J, tag, "fur_black", ln=0.2, fwd=1.05)
        cc.strap(J, P, tag, "kit2", r=0.04, flip=-1)
        cc.spines(J, P, tag, (0.2, 0.34, 0.46), mat="fur_black", ln=0.1, r=0.06, name="mane")
        mutation = L.get("mutation")
        if mutation == "eye":
            cc.third_eye(J, tag, up=0.62)
        elif mutation == "tentacle":
            cc.shoulder_tentacle(J, tag, side="r", ln=0.65, r=0.08)

    def details(self, J, P, L, tag, pose):
        for i, h in enumerate((0.12, 0.3)):            # brass studs down the strap, a bone charm on the belt
            ball_at(tag + "stud%d" % i, surf(J, P, h, -18 + 40 * i, 0.07), 0.026, "brass")
        b = surf(J, P, 0.04, 34, 0.08)
        tube(tag + "charmcord", [b, b - UP * 0.1], [0.012, 0.012], "leather", n=5)
        cone(tag + "charm", b - UP * 0.08, b - UP * 0.2, 0.035, "bone", 6)

@register
class ChaosChosen(Biped):
    """Hulking champion sealed in dark plate: closed helm with wide bull horns, huge kit2 pauldrons, kit1 tabard and cape."""
    key = "chaos_chosen"
    race = "human"
    knobs = dict(shoulders=1.3, limb=1.28, torso=1.22, neck=1.2)
    layout = dict(skin="skin_human", torso="darkmetal", arms="darkmetal", forearms="darkmetal", gloves="darkmetal",
                  legs="darkmetal", boots="darkmetal", cuff="kit2", breast="darkmetal", trim="kit2", emblem_mat="kit1",
                  gorget=True, pads="big", pad_mat="kit2", pad_trim="brass", spikes=2, tabard="kit1", tabard_trim="kit2",
                  belt="leather", buckle="brass", helm="winged", helm_mat="darkmetal", crest_mat="kit1", horns="bull",
                  horn_mat="bone", cape="short", cape_mat="kit1", cape_lining="cloth_black", clasp=False, kneecops=True,
                  knee_mat="kit1", bracers="brass", mutation=None, hair_mat="hair_blond", tie="kit2")
    stance = dict(lean=3, legs={"l": (5, 16, 6), "r": (-4, 16, 6)}, arms={"l": (4, 34, 38, -6), "r": (4, 34, 38, -6)},
                  hands="fist")
    stride, arm_swing, jump = 32, 26, 0.12
    height = 1.04

    def idle(self, ph, p, w):       # looms: slow scan of the pitch, then grinds one fist into the other palm
        up = w["up"]
        p.update(look=26 * w["c1"], lean=3 + 3 * w["breath"],
                 arms={"l": (4 + 30 * up, 34 - 12 * up, 38 + 50 * up, -6 - 30 * up),
                       "r": (4 + 30 * up, 34 - 12 * up, 38 + 50 * up, -6 - 30 * up)},
                 hand_modes={"l": "open" if up > 0.3 else "fist"})

    def extras(self, J, P, L, tag, pose):
        for i, sd in enumerate((-1, 1)):      # spiked knuckle bars
            el, wr = J["arms"]["l" if sd < 0 else "r"][1:3]
            d = (wr - el).normalized()
            cone(tag + "elbspk%d" % i, el, el - d * 0.16 + J["B"] * 0.05, 0.045, "bone", 6)
        cc.chain(tag + "chn", surf(J, P, 0.07, -60, 0.06), surf(J, P, 0.07, -5, 0.06), "brass", n=5, sag=0.12)
        mutation = L.get("mutation")
        if mutation == "tentacle":
            cc.shoulder_tentacle(J, tag, side="r", ln=0.8, r=0.1)
        elif mutation == "claw":
            cc.claw_arm(J, L, tag, "r", k=1.12, size=0.85)

@register
class Minotaur(looks.Fine, Biped):
    """Huge bull-headed brute: wide horns, black mane, nose ring, kit1 loincloth and shoulder plate, kit2 harness."""
    key = "minotaur"
    race = "minotaur"
    knobs = dict(shoulders=1.5, torso=1.38, hunch=14)
    layout = dict(legs="fur_brown", tabard="kit1", tabard_trim="kit2", bracers="kit1", neckband="kit2", pads="big", pad_sides=("l",), pad_mat="kit1",
                  pad_trim="kit2", spikes=1, belt="leather", buckle="brass", crest="fur_black", dark="fur_black",
                  snout_mat="fur_brown", arm_band="kit2")
    stance = dict(lean=6, nod=8, jaw=8, legs={"l": (8, 16, 8), "r": (-8, 16, 4)}, arms={"l": (6, 30, 40, 0), "r": (6, 30, 40, 0)},
                  hands="fist")
    stride, arm_swing, jump = 30, 26, 0.1
    lie, lie_shift = 0.3, 1.0

    def idle(self, ph, p, w):       # snorts: head drops and swings, one hoof scrapes, shoulders heave
        b = w["breath"]
        p.update(lean=6 + 4 * b, nod=8 + 16 * w["dn"], look=20 * w["s2"] * (1 if w["s1"] < 0 else 0), jaw=8 + 22 * w["dn"],
                 legs={"l": (8 + 30 * w["up"], 16, 8 + 46 * w["up"]), "r": (-8, 16, 4)},
                 arms={"l": (6, 30 + 6 * b, 40, 0), "r": (6, 30 + 6 * b, 40, 0)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        hs = s[0] / 0.2
        nose = c + F * s[1] * 1.25 - U * s[2] * 0.42
        for sd in (-1, 1):
            ball_at(tag + "ring%d" % sd, nose + X * sd * 0.045 * hs - U * 0.05 * hs, 0.03 * hs, "brass")
        ball_at(tag + "ringb", nose - U * 0.1 * hs, 0.03 * hs, "brass")
        cc.strap(J, P, tag, "kit2", r=0.05, flip=-1)
        cc.spines(J, P, tag, (0.25, 0.4, 0.55, 0.68), mat="fur_black", ln=0.12, r=0.08, name="mane")
        for sd, side in ((-1, "l"), (1, "r")):       # kit1 bands on the horns
            root = c + X * sd * s[0] * 0.75 + U * s[2] * 0.6
            a = root + (X * sd * 0.1 + U * 0.03) * hs
            tube(tag + "hband" + side, [a, a + (X * sd * 0.07 + U * 0.02) * hs], [0.075 * hs, 0.072 * hs], "kit1", n=6)
            wr, tip = J["arms"][side][2:]
            cc.chain(tag + "shk" + side, wr, wr - UP * 0.22 + J["B"] * 0.03, "darkmetal", n=3, sag=0.0, r=0.03)

    def details(self, J, P, L, tag, pose):
        for i, h in enumerate((0.1, 0.24, 0.38)):      # brass studs down the harness, a brass tip on each horn
            ball_at(tag + "stud%d" % i, surf(J, P, h, -30 + 26 * i, 0.08), 0.032, "brass")
        c, X, F, U, s = cc.hf(J)
        hs = s[0] / 0.2
        for sd in (-1, 1):
            root = c + X * sd * s[0] * 0.75 + U * s[2] * 0.6
            ball_at(tag + "horntip%d" % sd, root + (X * sd * 0.34 + U * 0.24 + F * 0.08) * hs, 0.03 * hs, "brass")

@register
class ChaosOgre(Biped):
    """Fat ogre gone wrong: one swollen red claw-arm, stub horns and a third eye, kit1 breeches, a tattered kit banner on his back."""
    key = "chaos_ogre"
    race = "ogre"
    knobs = dict(belly=1.5, shoulders=1.35)
    layout = dict(skin="skin_ogre", eyes="red", fangs=True, legs="kit1", boots="boot", cuff="fur_brown", belt="leather",
                  buckle="brass", loin="kit2", loin_trim="brass", bracers="kit2", pads="plate", pad_sides=("r",),
                  pad_mat="darkmetal", pad_trim="kit2", spikes=2, horns="small", horn_mat="bone", brow="socket")
    stance = dict(lean=2, legs={"l": (5, 18, 6), "r": (-4, 18, 6)}, arms={"l": (8, 30, 30, 4), "r": (4, 26, 24, 4)},
                  hands="relaxed")
    stride, arm_swing, jump = 28, 24, 0.08
    lie, lie_shift = 0.34, 1.0
    height = 1.05

    def idle(self, ph, p, w):       # bone-headed: scratches his scalp with the good hand, stares at nothing
        up = 1 if w["s1"] > 0 else 0
        p.update(arms={"l": (8, 30, 30, 4), "r": (4 + 136 * up, 26 + 6 * up, 24 + 98 * up + 14 * w["s2"] * up, -30 * up)},
                 nod=10 * up, look=-14 * up + 10 * w["c1"], hand_modes={"l": "open"})

    def adjust(self, name, i, pose):
        modes = dict(pose.get("hand_modes", {}))
        modes["l"] = "open"              # the claw never closes
        pose["hand_modes"] = modes

    def extras(self, J, P, L, tag, pose):
        cc.claw_arm(J, L, tag, "l", k=1.22)
        sh, el = J["arms"]["l"][:2]
        for i, t in enumerate((0.3, 0.75)):
            q = lerp(sh, el, t)
            cone(tag + "armspk%d" % i, q, q - J["X"] * 0.2 + UP * 0.1, 0.05, "bone", 6)
        c, X, F, U, s = cc.hf(J)
        ball_at(tag + "eye3", c + F * s[1] * 0.98 + U * s[2] * 0.48, 0.035, "eye")
        cc.banner(J, P, tag, "kit1", "kit2", h=0.95, w=0.5, xoff=0.42)
        cc.strap(J, P, tag, "leather", r=0.045, flip=1, bot=0.2)
        cc.boils(J, P, tag, ((0.12, 28), (0.2, -34), (0.05, -10)), mat="skin_chaos", r=0.04)

@register
class ChaosTroll(Biped):
    """Stooped two-headed troll: knuckle-dragging arms, stone spines down the back, drooping ears, kit1 rags, kit2 collar and cuffs."""
    key = "chaos_troll"
    race = "troll"
    knobs = dict(arms=1.38, hunch=20, shoulders=1.38, head=0.92, head_fwd=0.08)
    layout = dict(skin="skin_troll", loin="kit1", loin_trim="kit2", neckband="kit2", bracers="kit2", belt="rope", buckle=None,
                  legs="skin_troll", boots="skin_troll", cuff=None, claws=0.08, lip="skin_troll", arm_band="kit1")
    stance = dict(lean=6, nod=6, legs={"l": (6, 18, 14), "r": (-6, 18, 14)}, arms={"l": (16, 20, 14, 10), "r": (10, 20, 10, 10)},
                  hands="relaxed")
    stride, arm_swing, jump = 28, 30, 0.08
    lie, lie_shift = 0.32, 1.0
    height = 1.08

    def idle(self, ph, p, w):       # really stupid: the two heads loll in opposite directions, arms swing slack
        p.update(look=26 * w["s1"], nod=6 + 10 * w["breath"], head2=-w["s1"],
                 arms={"l": (16 + 10 * w["s1"], 20, 14, 10), "r": (10 - 10 * w["s1"], 20, 10, 10)})

    def extras(self, J, P, L, tag, pose):
        cc.big_ears(J, L, tag, size=0.9, droop=0.2)
        X, u, F = J["X"], J["u"], J["F"]
        # the second, smaller head grows from the left shoulder
        k2 = pose.get("head2", 0.0)
        sh = J["arms"]["l"][0]
        base = sh + X * 0.1 + u * 0.1
        hc = base + u * 0.28 - X * (0.06 + 0.05 * k2) + F * 0.06
        tube(tag + "neck2", [base - u * 0.06, hc], [0.09, 0.075], "skin_troll", n=8)
        ang = D(-20 + 30 * k2)
        hx = (X * math.cos(ang) + F * math.sin(ang)).normalized()
        hfw = (F * math.cos(ang) - X * math.sin(ang)).normalized()
        R = basis(hx, hfw, hx.cross(hfw) * -1)
        r = 0.15
        ellipsoid(tag + "head2", hc, (r, r * 1.05, r * 1.05), "skin_troll", R, seg=12)
        ellipsoid(tag + "jaw2", hc + hfw * r * 0.45 - UP * r * 0.55, (r * 0.75, r * 0.7, r * 0.45), "skin_troll", R, seg=10)
        ellipsoid(tag + "mouth2", hc + hfw * r * 0.95 - UP * r * 0.45, (r * 0.5, 0.02, r * 0.14), "mouth", R, seg=8)
        for sd in (-1, 1):
            ball_at(tag + "eye2%d" % sd, hc + hfw * r * 0.9 + hx * sd * r * 0.4 + UP * r * 0.15, 0.028, "eye")
            flat_cone(tag + "ear2%d" % sd, hc + hx * sd * r * 0.8, hc + hx * sd * (r + 0.2) - UP * 0.04 - hfw * 0.06, 0.06,
                      "skin_troll", hfw, squash=0.3)
            cone(tag + "tusk2%d" % sd, hc + hfw * r * 0.9 + hx * sd * r * 0.3 - UP * r * 0.5, hc + hfw * r * 0.95 + hx * sd * r * 0.3 - UP * r * 0.05,
                 0.022, "bone", 5)
        cc.spines(J, P, tag, (0.14, 0.3, 0.46, 0.62), mat="stone", ln=0.2, r=0.09, name="rock")
        cc.strap(J, P, tag, "kit1", r=0.055, flip=1, bot=0.12)
        cc.boils(J, P, tag, ((0.2, 30), (0.34, -20), (0.1, -40)), mat="skin_belly", r=0.035)
        c, Xh, Fh, Uh, s = cc.hf(J)
        for sd in (-1, 1):
            cone(tag + "ltusk%d" % sd, c + Fh * s[1] * 0.85 + Xh * sd * s[0] * 0.38 - Uh * s[2] * 0.62,
                 c + Fh * s[1] * 0.95 + Xh * sd * s[0] * 0.42 - Uh * s[2] * 0.15, 0.03, "bone", 5)
        wr = J["arms"]["r"][2]
        cc.chain(tag + "shk", wr, wr - UP * 0.2, "darkmetal", n=3, sag=0.0, r=0.03)
