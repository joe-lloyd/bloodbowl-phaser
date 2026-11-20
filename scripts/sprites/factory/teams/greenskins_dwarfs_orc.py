"""Orc team (models orc_lineman, orc_thrower, orc_blitzer, big_un) and the Black Orc team's own
models (black_orc, goblin_bruiser). Costume: scrap-iron brawlers. Crude spiked plate, tusks, kit-colour
jerseys under the iron. No figure holds anything.

Silhouettes: lineman = bare head with a mohawk; thrower = leather cap and goggles, one bare arm;
blitzer = horned helm, leaning in; big un = hulking, jaw plate and topknot; black orc = slab of black
plate with a crested full helm; goblin bruiser = tiny body under a huge spiked pot helm.
"""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts
from lib.core import tube, tband, ball_at, box, cone, cap, ellipsoid, lerp, UP, basis, D, surf
from teams import greenskins_dwarfs_common as gd

ORC = dict(boots="boot", cuff="leather", belt="leather", buckle="brass", trim="brass", legs="leather")

@register
class OrcLineman(Biped):
    """Bare-headed line orc: black mohawk, kit jersey under football pads with one spike each, fists low."""
    key = "orc_lineman"
    race = "orc"
    layout = dict(ORC, jersey="kit1", pads="football", pad_mat="kit1", pad_trim="kit2", spikes=1, bracers="leather",
                  pant_stripe="kit2", loin="kit2", loin_trim="brass")
    stance = dict(lean=7, legs={"l": (6, 15, 12), "r": (-5, 15, 12)}, arms={"l": (10, 30, 48, -6), "r": (10, 30, 48, -6)},
                  hands="fist")
    stride, arm_swing, jump = 33, 30, 0.13

    def idle(self, ph, p, w):       # pounds a fist into his open palm
        hit = w["up"]
        p["arms"] = {"l": (34 + 6 * hit, 22, 84, -34), "r": (30 + 22 * hit, 22 - 8 * hit, 70 + 22 * hit, -30 - 16 * hit)}
        p["hand_modes"] = {"l": "open", "r": "fist"}
        p["look"] = 10 * w["c1"]

    def extras(self, J, P, L, tag, pose):
        gd.brute_jaw(J, L, tag)
        gd.mohawk(J, tag, "hair", h=0.3, n=6)
        gd.rivets(J, P, tag, "yriv", 0.33, "brass", angles=(-140, -70, 0, 70, 140), off=0.075)

@register
class OrcThrower(Biped):
    """Leaner, upright orc: leather cap with amber goggles, pad on the off shoulder only, bare throwing arm
    with a kit wrap. Hands always empty."""
    key = "orc_thrower"
    race = "orc"
    knobs = dict(shoulders=1.12, limb=1.14, torso=1.05, legs=1.0, hunch=3)
    layout = dict(ORC, jersey="kit1", pads="football_small", pad_sides=("l",), pad_mat="kit1", pad_trim="kit2",
                  helm="skull", helm_mat="leather", legs="kit2", belt="leather", arm_band="kit2", pant_stripe="kit1")
    stance = dict(lean=2, legs={"l": (8, 9, 8), "r": (-6, 9, 8)}, arms={"l": (6, 20, 26), "r": (14, 22, 40, 4)},
                  hands="relaxed")
    stride, arm_swing, jump = 36, 32, 0.16
    height = 1.03

    def idle(self, ph, p, w):       # windmills his throwing arm to keep it loose, watching downfield
        a = 360.0 * ph
        p["arms"] = {"l": (6, 20, 26), "r": (150 * (0.5 - 0.5 * math.cos(math.radians(a))), 26, 20 + 20 * w["up"], 6)}
        p["hand_modes"] = {"r": "open"}
        p["look"] = -14 * w["s1"]

    def extras(self, J, P, L, tag, pose):
        gd.brute_jaw(J, L, tag, 0.92)
        gd.goggles(J, tag, level=0.12, k=1.35)
        c, X, F, U, s = gd.hf(J)                     # kit band round the cap with two tails at the back
        cap(tag + "capband", c + U * 0.02, (s[0] * 1.21, s[1] * 1.21, s[2] * 1.19), "kit2", U, cut=0.34, hi=0.6, rot=J["head_R"],
            thick=0.025)
        k0 = c - F * s[1] * 1.15 + U * s[2] * 0.4
        back = (-F * 0.34 + U * 0.05) if pose.get("_action") else (-F * 0.12 - U * 0.3)
        for sd in (-1, 1):
            core.flat_cone(tag + "captail%d" % sd, k0, k0 + back + X * sd * 0.1, 0.07, "kit2", F if not pose.get("_action") else U, 0.3)
        sh, el, wr, tip = J["arms"]["r"]
        ak = L["limb"] * core.LIMB * L["arm"]
        for i, t in enumerate((0.3, 0.5, 0.7)):      # throwing-arm wrap in the secondary colour
            tube(tag + "twrap%d" % i, [lerp(el, wr, t), lerp(el, wr, t + 0.13)], [0.096 * ak, 0.09 * ak], "kit2", ref=J["F"], n=8)
        gd.baldric(J, P, tag, "leather", sd=-1, r=0.035)

@register
class OrcBlitzer(Biped):
    """Horned iron helm, spiked plate pauldrons with kit rims, greaves; always leaning into the charge."""
    key = "orc_blitzer"
    race = "orc"
    knobs = dict(shoulders=1.3)
    layout = dict(ORC, jersey="kit1", pads="big", pad_mat="kit1", pad_trim="kit2", spikes=2, helm="open", helm_mat="darkmetal",
                  trim="kit2", buckle="brass", gorget=True, breast="darkmetal", emblem_mat="kit2", kneecops=True, knee_mat="darkmetal",
                  bracers="darkmetal", pant_stripe="kit2",
                  loin="kit2", loin_trim="kit1", arm_band="kit2")
    stance = dict(lean=14, nod=-6, legs={"l": (16, 13, 16), "r": (-14, 13, 14)}, feet={"r": 12},
                  arms={"l": (16, 30, 62, -10), "r": (-4, 30, 56, -10)}, hands="fist")
    stride, arm_swing, run_lean, jump = 38, 34, 20, 0.14
    height = 1.06

    def idle(self, ph, p, w):       # snorts and paws the turf with his back foot like a bull
        b = w["breath"]
        p.update(lean=14 + 4 * b, nod=-6 - 6 * b, look=8 * w["s2"],
                 legs={"l": (16, 13, 16), "r": (-14 + 22 * w["up"], 13, 14 + 34 * w["up"])}, feet={"r": 12 + 20 * w["up"]})

    def extras(self, J, P, L, tag, pose):
        gd.brute_jaw(J, L, tag)
        gd.helm_horns(J, tag, "bone", size=1.05)
        gd.cheek_guards(J, tag, "darkmetal", "brass")
        for side in ("l", "r"):
            gd.arm_spikes(J, tag, side, "bone", n=2)

@register
class BigUn(Biped):
    """The hulk of the Orc line: half again as wide, iron cuirass and toothed jaw plate, huge kit pads with
    spikes, bound topknot, kit tabard. Beats his chest."""
    key = "big_un"
    race = "black_orc"
    knobs = dict(belly=1.18, shoulders=1.42, head=1.2)
    layout = dict(ORC, torso="kit1", pads="football_big", pad_mat="kit1", pad_trim="kit2", spikes=1, breast="darkmetal",
                  emblem_mat="kit2", tabard="kit1", tabard_trim="kit2", gauntlets=True, tusks=False, trim="brass",
                  belt="kit2", greaves=True, arm_band="kit2")
    stance = dict(lean=5, legs={"l": (6, 18, 12), "r": (-5, 18, 12)}, arms={"l": (8, 40, 44, -8), "r": (8, 40, 44, -8)},
                  hands="fist")
    stride, arm_swing, run_lean, jump = 28, 24, 12, 0.1
    lie, lie_shift = 0.26, 0.9
    height = 1.1

    def idle(self, ph, p, w):       # taunts: beats his chest plate with alternating fists
        l, r = w["up"], w["dn"]
        p["arms"] = {"l": (20 + 26 * l, 34 - 14 * l, 60 + 62 * l, -8 - 50 * l), "r": (20 + 26 * r, 34 - 14 * r, 60 + 62 * r, -8 - 50 * r)}
        p["lean"] = 5 - 4 * w["breath"]
        p["jaw"] = 20

    def extras(self, J, P, L, tag, pose):
        gd.jaw_plate(J, tag, "metal", "bone", 1.12)
        gd.topknot(J, tag, "hair", "kit2", h=0.36, pose=pose)
        gd.rivets(J, P, tag, "criv", 0.42, "brass", angles=(-120, -60, 60, 120), off=0.085, r=0.028)
        for side in ("l", "r"):
            gd.knee_spike(J, tag, side, "metal", 0.12, 1.3)

# ---------------------------------------------------------------------------- Black Orc team
@register
class BlackOrc(Biped):
    """A slab of black riveted plate: dark-skinned, full black-iron helm with a kit crest and cheek guards,
    kit-rimmed pauldrons, kit tabard. Flexes his grabbing hands."""
    key = "black_orc"
    race = "black_orc"
    knobs = dict(shoulders=1.4, torso=1.34)
    layout = dict(ORC, skin="gd_skin_blackorc", lip="gd_skin_blackorc", torso="gd_iron", arms="gd_skin_blackorc",
                  breast="darkmetal", emblem_mat="kit2", gorget=True, pads="big", pad_mat="kit1", pad_trim="kit2", spikes=1,
                  spike_mat="metal", helm="open", helm_mat="gd_iron", plume="kit2", trim="kit2", tabard="kit1", tabard_trim="kit2",
                  bracers="darkmetal", belt="kit1", buckle="metal", legs="gd_iron", boots="gd_iron", cuff="metal", kneecops=True,
                  knee_mat="darkmetal", arm_band="kit1")
    stance = dict(lean=4, legs={"l": (5, 17, 10), "r": (-4, 17, 10)}, arms={"l": (14, 34, 52, 0), "r": (14, 34, 52, 0)},
                  hands="open")
    stride, arm_swing, run_lean, jump = 28, 24, 12, 0.1
    lie, lie_shift = 0.26, 0.9
    height = 1.04

    def idle(self, ph, p, w):       # opens and clenches his big hands, ready to grab; slow glare side to side
        grab = ("open", "open", "relaxed", "fist", "fist", "fist", "relaxed", "open")[int(round(ph * 8)) % 8]
        k = w["up"]
        p.update(hands=grab, look=18 * w["s1"],
                 arms={"l": (14 + 12 * k, 34, 52 + 22 * k, 0), "r": (14 + 12 * k, 34, 52 + 22 * k, 0)})

    def extras(self, J, P, L, tag, pose):
        gd.brute_jaw(J, L, tag)
        gd.cheek_guards(J, tag, "gd_iron", "metal")
        gd.rivets(J, P, tag, "criv", 0.31, "metal", angles=(-130, -80, -30, 30, 80, 130), off=0.08, r=0.028)
        gd.rivets(J, P, tag, "criv2", 0.17, "metal", angles=(-110, -40, 40, 110), off=0.06, r=0.026)
        for side in ("l", "r"):
            gd.arm_spikes(J, tag, side, "metal", n=2, k=1.2)

@register
class GoblinBruiser(Biped):
    """A goblin swamped by scavenged orc armour: huge pot helm with a tall spike that keeps slipping over
    his eyes, pads far too big for him, ears poking out under the rim."""
    key = "goblin_bruiser"
    race = "goblin"
    knobs = dict(shoulders=1.0, head=1.25)
    layout = dict(jersey="kit1", pads="football_big", pad_mat="gd_iron", pad_trim="kit2", spikes=1, spike_mat="metal",
                  legs="leather", boots="boot", cuff="rags", belt="kit2", buckle="metal", loin="kit1", loin_trim="kit2",
                  bracers="gd_iron", trim="metal")
    stance = dict(lean=6, legs={"l": (6, 14, 14), "r": (-5, 14, 14)}, arms={"l": (16, 34, 60, -6), "r": (16, 34, 60, -6)},
                  hands="fist")
    stride, arm_swing, jump = 40, 36, 0.24
    lie, lie_shift = 0.14, 0.5
    height = 0.92

    def idle(self, ph, p, w):       # the helm slides down over his eyes; he shoves it back up with one hand
        i = int(round(ph * 8)) % 8
        slip = (0.0, 0.3, 0.7, 1.0, 1.0, 0.6, 0.1, 0.0)[i]
        push = (0, 0, 0, 0.5, 1, 1, 0.5, 0)[i]
        p["helm_slip"] = slip
        p["arms"] = {"l": (16, 34, 60, -6), "r": (16 + 120 * push, 34 - 10 * push, 60 + 60 * push, -6 - 30 * push)}
        p["hand_modes"] = {"r": "open" if push else "fist"}
        p["nod"] = -8 * slip

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s = gd.hf(J)
        R = J["head_R"]
        gd.big_ears(J, L, tag, length=0.3, lift=0.1)
        gd.long_nose(J, L, tag, 0.14, 0.05)
        slip = pose.get("helm_slip", 0.0)
        hc = c + U * (s[2] * 0.42 - 0.13 * slip) + F * 0.03 * slip
        big = (s[0] * 1.32, s[1] * 1.32, s[2] * 1.2)
        cap(tag + "pot", hc, big, "gd_iron", U, cut=-0.12, rot=R, thick=0.03)
        cap(tag + "potrim", hc, tuple(b * 1.06 for b in big), "kit2", U, cut=-0.16, hi=0.06, rot=R, thick=0.03)
        cone(tag + "potspike", hc + U * big[2] * 0.9, hc + U * (big[2] + 0.46), 0.085, "metal", 6)
        for i, a in enumerate((-60, 0, 60, 120, 180, 240)):
            q = hc + (X * math.sin(D(a)) * big[0] + F * math.cos(D(a)) * big[1]) * 0.93 + U * big[2] * 0.3
            ball_at(tag + "potriv%d" % i, q, 0.035, "metal")
