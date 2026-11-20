"""Skaven (models skaven_lineman, skaven_thrower, skaven_blitzer, gutter_runner, rat_ogre); the first four
are also used by Underworld Denizens and the Rat Ogre by Chaos Renegade. Each position has its own fur
colour as well as its own gear. No figure holds a ball."""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts, looks
from lib.core import tube, tband, ball_at, box, lerp, UP, basis, D, cone, flat_cone, ellipsoid, cap, surf
from teams import undead_skaven_lizards_kit as K

def two(w, key="s1"):
    return 1 if w[key] > 0 else -1

def rat(fur, **kw):
    """Common rat layout: fur on the legs, pink feet, the library tail replaced by this batch's banded tail."""
    d = dict(skin=fur, legs=fur, dark="skin_rat", tail=None, eye_mat="eye", claws=0.06)
    d.update(kw)
    return d

@register
class SkavenLineman(Biped):
    """Clanrat: brown fur, bare head and big ears, kit1 jersey, one rusty shoulder plate and rusty bracers,
    kit2 loincloth; hunched, nose twitching."""
    key = "skaven_lineman"
    race = "skaven"
    layout = rat("fur_brown", jersey="kit1", torso="kit1", loin="kit2", loin_trim="rust", pads="plate", pad_sides=("l",), pad_mat="rust",
                 pad_trim="kit2", bracers="rust", arm_band="kit2", neckband="kit2", belt="leather", buckle="rust")
    stance = dict(lean=4, nod=-6, legs={"l": (6, 10, 8), "r": (-5, 10, 8)}, arms={"l": (22, 18, 62, 0), "r": (22, 18, 62, 0)},
                  hands="relaxed")
    stride, arm_swing, jump = 42, 34, 0.22

    def idle(self, ph, p, w):       # sniffs the air in quick twitches, wringing its paws, tail flicking
        p.update(nod=-6 - 12 * (1 if w["s2"] > 0 else 0), look=18 * w["s1"], tail=w["s2"],
                 arms={"l": (22 + 6 * w["s2"], 18, 62, 0), "r": (22 - 6 * w["s2"], 18, 62, 0)})

    def extras(self, J, P, L, tag, pose):
        K.tail(J, tag, pose, ln=0.95, r=0.05, mat="skin_rat", up=0.2, bands=[(0.2, 0.3, "kit2")])
        # kit2 trim frames the kit1 jersey so it separates from the fur: wide collar, chest hoop and hem
        sh = P["sh_h"]
        tband(tag + "jcollar", J, P, [sh - 0.06, sh + 0.01, sh + 0.07], "kit2", k=1.1, add=0.05, solid=0.03)
        tband(tag + "jhoop", J, P, [0.25, 0.33], "kit2", k=1.08, add=0.045, solid=0.03)
        tband(tag + "jhem", J, P, [0.06, 0.12], "kit2", k=1.08, add=0.045, solid=0.03)
        # the rusty scrap plate sits on the left flank under the shoulder plate, leaving the jersey front clear
        box(tag + "chestplate", surf(J, P, 0.4, -55, 0.04), (0.1, 0.035, 0.09), "rust", basis(J["X"], J["F"], J["u"]))

@register
class SkavenThrower(Biped):
    """Passer: grey fur, stands straighter than the rest, leather cap with big brass goggles, long kit1
    sleeves with kit2 cuffs, kit2 sash with a trailing tail; keeps pushing the goggles up."""
    key = "skaven_thrower"
    race = "skaven"
    knobs = dict(hunch=5, legs=1.05, shoulders=0.9)
    layout = rat("fur_grey", torso="kit1", arms="kit1", sleeve_cuff="kit2", helm="skull", helm_mat="leather", loin="kit1",
                 loin_trim="kit2", belt="leather", buckle="brass", neckband="kit2", goggles=True)
    stance = dict(lean=0, legs={"l": (5, 8, 6), "r": (-4, 8, 6)}, arms={"l": (8, 20, 26), "r": (36, 22, 96, 2)},
                  hands="relaxed")
    stride, arm_swing, jump = 42, 34, 0.22
    height = 1.06

    def idle(self, ph, p, w):       # pushes the goggles up the snout with one paw, then shakes the throwing arm loose
        up = w["up"]
        p.update(tail=w["s1"], nod=-8 * up,
                 arms={"l": (8 + 84 * up, 20 - 8 * up, 26 + 110 * up), "r": (36, 22, 96 - 30 * w["dn"], 2)})

    def extras(self, J, P, L, tag, pose):
        K.tail(J, tag, pose, ln=0.95, r=0.05, mat="skin_rat", up=0.3, bands=[(0.3, 0.4, "kit1")])
        K.sash(J, P, tag, "kit2", w=0.06)
        K.ribbon(J, tag, "sashtail", surf(J, P, 0.08, 80, 0.05), 0.4, "kit2", pose, w=0.05, back=0.2, key="tail")
        if not L.get("goggles"):
            return
        c, X, F, U, s = K.hframe(J)
        hs = s[0] / 0.2
        K.head_band(J, tag, "leather", -0.02, 0.2, 1.08, "gstrap")
        for sd in (-1, 1):
            e = c + F * s[1] * 0.86 + X * sd * s[0] * 0.5 + U * s[2] * 0.16
            parts.cylinder(tag + "gog%d" % sd, e, e + F * 0.08 * hs, 0.085 * hs, "brass", seg=8)
            parts.cylinder(tag + "lens%d" % sd, e + F * 0.07 * hs, e + F * 0.095 * hs, 0.06 * hs, "white", seg=8)

@register
class SkavenBlitzer(Biped):
    """Armoured stormer: black fur, broad, dark open helm with a kit1 crest, big spiked shoulder plates
    trimmed kit2, cuirass and gauntlets, kit1 tabard, blade on the tail."""
    key = "skaven_blitzer"
    race = "skaven"
    knobs = dict(shoulders=1.2, limb=1.0, torso=1.05, hunch=10, arms=1.05)
    layout = rat("fur_black", helm="open", helm_mat="darkmetal", plume="kit1", pads="big", pad_mat="darkmetal",
                 pad_trim="kit2", spikes=1, spike_mat="metal", breast="darkmetal", emblem_mat="kit2", gorget=True,
                 tabard="kit1", tabard_trim="kit2", gauntlets=True, belt="leather", trim="brass", ear_mat="skin_rat")
    stance = dict(lean=6, jaw=14, legs={"l": (6, 15, 8), "r": (-5, 15, 8)}, arms={"l": (10, 34, 48, -8), "r": (10, 34, 48, -8)},
                  hands="fist")
    stride, arm_swing, jump = 38, 30, 0.16
    height = 1.08

    def idle(self, ph, p, w):       # smacks an armoured fist into the other palm and bares its teeth
        hit = w["up"]
        p.update(jaw=14 + 14 * hit, look=12 * w["c1"], tail=w["s2"], hand_modes={"l": "open"},
                 arms={"l": (30 + 10 * hit, 14, 80, -30), "r": (30 + 22 * hit, 30 - 16 * hit, 84, -10 - 26 * hit)})

    def adjust(self, name, i, pose):
        pose.setdefault("jaw", 14)

    def extras(self, J, P, L, tag, pose):
        pts = K.tail(J, tag, pose, ln=1.0, r=0.055, mat="skin_rat", up=0.35, bands=[(0.55, 0.7, "darkmetal")])
        d = (pts[-1] - pts[-2]).normalized()
        flat_cone(tag + "tailblade", pts[-1] - d * 0.04, pts[-1] + d * 0.24, 0.06, "metal", J["X"], squash=0.25)

@register
class GutterRunner(Biped):
    """Sprinting sneak: lean and low, black hood, cloth mask over the snout and a long black scarf streaming
    behind, kit1 sash, kit2 wraps and loincloth, arms swept back, very long whip of a tail."""
    key = "gutter_runner"
    race = "skaven"
    knobs = dict(limb=0.68, torso=0.74, shoulders=0.8, hunch=24, arms=1.1, legs=1.02, head=0.95)
    layout = rat("fur_grey", torso="cloth_black", helm="hood", hood_mat="cloth_black", loin="kit2", wraps="kit2",
                 belt="kit1", buckle=None, snout_mat="cloth_black", nose_mat="skin_rat", ears="none", scarf_mat="cloth_black")
    stance = dict(lean=6, nod=-22, legs={"l": (20, 12, 30), "r": (-14, 12, 22)},
                  arms={"l": (-34, 22, 26, 10), "r": (-22, 22, 34, 10)}, hands="open")
    stride, arm_swing, run_lean, jump = 52, 14, 24, 0.3
    height = 1.1

    def idle(self, ph, p, w):       # never still: glances sharply over each shoulder, tail whipping, scarf stirring
        k = two(w)
        p.update(look=38 * k, tail=w["s2"], sway=w["s1"], lean=6 + 4 * (1 if w["s2"] > 0 else 0))

    def adjust(self, name, i, pose):
        if name == "run":           # runs with both arms trailing behind
            a = pose["arms"]
            pose["arms"] = {"l": (-52 + 0.4 * a["l"][0], 20, 14), "r": (-52 + 0.4 * a["r"][0], 20, 14)}
            pose["hands"] = "open"

    def extras(self, J, P, L, tag, pose):
        K.tail(J, tag, pose, ln=1.25, r=0.04, mat="skin_rat", up=0.5, bands=[(0.12, 0.2, "kit1")])
        K.sash(J, P, tag, "kit1", w=0.07)
        ra, rl = K.arm_r(L), K.leg_r(L)
        for side in ("l", "r"):
            hip, knee = J["legs"][side][:2]
            K.ring(tag, "legwrap" + side, hip, knee, 0.45, 0.75, rl * 1.5, "kit2")
        sm = L.get("scarf_mat")
        if sm:
            c, X, F, U, s = K.hframe(J)
            nk = c - F * s[1] * 0.9 - U * s[2] * 0.75
            tband(tag + "scarfwrap", J, P, [P["sh_h"] - 0.02, P["sh_h"] + 0.1], sm, k=1.0, add=0.05, solid=0.04)
            for i, sd in enumerate((-1, 1)):
                K.ribbon(J, tag, "scarf%d" % i, nk, 0.75 + 0.12 * i, sm, pose, w=0.06, side=sd * 0.12, back=0.7)

@register
class RatOgre(Biped):
    """Hulking rat brute: knuckles near the ground, stitched bald patches, bone spines down the back, crossed
    kit1 harness, rusty shoulder plate rimmed kit2, kit2 bracers and tail rings; heaves and roars."""
    key = "rat_ogre"
    race = "rat_ogre"
    knobs = dict(shoulders=1.5, torso=1.32, arms=1.32, head=1.0, hands=1.4, limb=1.45)
    layout = rat("fur_grey", claws=0.16, fangs=True, loin="kit1", loin_trim="rust", pads="plate", pad_sides=("l",), pad_mat="rust",
                 pad_trim="kit2", bracers="kit2", arm_band="kit1", belt="leather", buckle="rust")
    stance = dict(lean=2, jaw=16, legs={"l": (6, 16, 8), "r": (-5, 16, 8)}, arms={"l": (16, 30, 30, 6), "r": (16, 30, 30, 6)},
                  hands="open")
    stride, arm_swing, run_lean, jump = 32, 28, 12, 0.12
    lie, lie_shift = 0.3, 1.0

    def idle(self, ph, p, w):       # heaving breaths, then rears back and roars with both arms flung wide
        roar = max(0.0, math.sin(w["a"] - 0.5)) ** 0.8
        big = 1 if roar > 0.35 else 0
        p.update(lean=2 - 8 * big, nod=-20 * roar, jaw=16 + 30 * roar, tail=w["s2"],
                 arms={"l": (16, 30 + 26 * roar, 30 + 30 * roar, 6), "r": (16, 30 + 26 * roar, 30 + 30 * roar, 6)})

    def adjust(self, name, i, pose):
        pose.setdefault("jaw", 16)
        if name in ("run", "block"):
            pose["hands"] = "open"

    def extras(self, J, P, L, tag, pose):
        K.harness(J, P, tag, "kit1", boss="rust", w=0.09, lo=0.12)
        tband(tag + "yoke", J, P, [P["sh_h"] - 0.03, P["sh_h"] + 0.07], "kit1", k=1.05, add=0.04, solid=0.03)
        K.spines(J, P, tag, "bone", [0.25, 0.4, 0.55, 0.68], length=0.2, r=0.07, lift=0.4)
        K.tail(J, tag, pose, ln=1.3, r=0.085, mat="skin_rat", up=0.2, bands=[(0.2, 0.28, "kit2"), (0.45, 0.52, "kit2")])
        Rb = basis(J["X"], J["F"], J["u"])
        p = surf(J, P, 0.5, 38, -0.02)
        ellipsoid(tag + "patch", p, (0.17, 0.08, 0.14), "skin_rat", Rb, seg=10)
        K.surf_stitch(J, P, tag, "seam", 0.6, 30, 0.4, 48, 3, off=0.07)
        shd, el = J["arms"]["r"][:2]
        K.ring(tag, "armseam", shd, el, 0.4, 0.5, K.arm_r(L) * 1.04, "skin_rat")
