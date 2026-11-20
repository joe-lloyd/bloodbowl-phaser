"""Trolls, the Ogre team and the Underworld Denizens models of the greenskins_dwarfs batch.

  troll                 shared by Orc, Black Orc, Goblin and Snotling: rocky hump, kit loincloth, one kit plate
  ogre_blocker          bald giant with a kit gut plate
  ogre_runt             leaner young ogre in a kit vest and cap with one iron kicking boot
  gnoblar               tiny ragged servant, huge drooping ears, bedroll on his back
  troll_underworld      sickly troll with a ridge of glowing crystals
  rat_ogre_mutant       rat ogre with a third arm, two tails and crystal growths
  goblin_underworld     hooded goblin with a crystal shoulder and a tail
  snotling_underworld   tiny snotling with a crystal horn

Monsters wear the team colours as loincloths, harness straps, plates, collars and bracers. Nobody holds
anything.
"""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts, looks
from lib.core import tube, tband, ball_at, box, cone, cap, ellipsoid, flat_cone, lerp, UP, basis, D, surf
from teams import greenskins_dwarfs_common as gd

BARE = dict(cuff=None)

def _bands(J, L, tag, side, mat, ts=(0.3, 0.85), k=1.12, name="mband"):
    """A wide band round one forearm."""
    sh, el, wr, tip = J["arms"][side]
    ak = L["limb"] * core.LIMB * L["arm"]
    tube(tag + name + side, [lerp(el, wr, ts[0]), lerp(el, wr, ts[1])], [0.1 * ak * k, 0.086 * ak * k], mat, ref=J["F"], n=10)

# ---------------------------------------------------------------------------- trolls
class TrollBase(Biped):
    race = "troll"
    knobs = dict(hunch=20, head_fwd=0.1, arms=1.38, head=1.05, belly=1.25)
    stride, arm_swing, run_lean, jump = 26, 22, 10, 0.07
    lie, lie_shift = 0.3, 1.0
    height = 1.1

    def troll_head(self, J, L, tag, ear_lift=-0.25):
        gd.brute_jaw(J, L, tag, 1.15)
        gd.big_tusks(J, tag, 0.7, spread=0.42)
        gd.long_nose(J, L, tag, 0.2, 0.085, droop=0.6)
        gd.big_ears(J, L, tag, length=0.3, lift=ear_lift, width=0.5)

@register
class Troll(TrollBase):
    """Big, dim and warty: knuckles near the ground, drooping nose and ears, a rocky hump down the back, a
    kit loincloth, kit strap and one kit shoulder plate. Slowly scratches its head."""
    key = "troll"
    height = 1.04
    layout = dict(BARE, legs="skin_troll", boots="skin_troll", loin="kit1", loin_trim="kit2", belt="rope", buckle=None,
                  arm_band="kit2")
    stance = dict(lean=6, nod=6, legs={"l": (6, 17, 14), "r": (-5, 17, 14)}, arms={"l": (6, 16, 16), "r": (10, 16, 22)},
                  hands="relaxed", jaw=14)

    def idle(self, ph, p, w):       # dim: one hand creeps up to scratch its head while its gaze drifts
        k = w["up"]
        scr = 10 * w["s2"] * (1 if k > 0.5 else 0)
        p["arms"] = {"l": (6, 16, 16), "r": (10 + 128 * k, 16 + 14 * k, 22 + 100 * k + scr, -30 * k)}
        p["look"] = -16 * w["s1"]
        p["nod"] = 6 - 10 * k

    def extras(self, J, P, L, tag, pose):
        self.troll_head(J, L, tag)
        c, X, F, U, s = gd.hf(J)
        for i, x in enumerate((-0.3, 0.0, 0.3)):                 # lank tuft of hair
            b = c + U * s[2] * 0.9 + X * x * s[0] - F * 0.03
            cone(tag + "tuft%d" % i, b, b + U * 0.16 - F * (0.1 + 0.05 * abs(x)) + X * x * 0.2, 0.05, "hair", 5)
        gd.lumps(J, P, tag, "rock", ((0.62, 180, 1.5), (0.5, 155, 1.2), (0.5, 205, 1.25), (0.36, 180, 1.3), (0.24, 165, 1.0),
                                    (0.66, 140, 0.9)), "stone", r=0.1)
        gd.lumps(J, P, tag, "wart", ((0.45, 40, 0.5), (0.3, -55, 0.45), (0.2, 20, 0.4), (0.52, -100, 0.5)), "skin_zombie", r=0.08)
        gd.baldric(J, P, tag, "kit2", sd=-1, r=0.055, top=P["sh_h"] + 0.02)
        gd.shoulder_plate(J, tag, "l", "kit1", "kit2", 1.25, spike="bone")
        for side in ("l", "r"):
            _bands(J, L, tag, side, "kit1")

@register
class UnderworldTroll(TrollBase):
    """Sickly green-grey troll lit from inside: a ridge of glowing crystals from skull to tail-bone, green
    eyes, kit collar, loincloth and bracers. Stares at its own hand."""
    key = "troll_underworld"
    height = 1.02
    knobs = dict(TrollBase.knobs, hunch=26, shoulders=1.2)
    layout = dict(BARE, skin="skin_zombie", lip="skin_zombie", legs="skin_zombie", boots="skin_zombie", loin="kit1",
                  loin_trim="kit2", belt="kit2", buckle="gd_warp", neckband="kit2", eyes="red")
    stance = dict(lean=8, nod=10, legs={"l": (8, 15, 18), "r": (-6, 15, 16)}, arms={"l": (14, 14, 26), "r": (2, 20, 12)},
                  hands="open", jaw=22)

    def idle(self, ph, p, w):       # lifts one hand and stares at it, head tilting, jaw hanging
        k = w["up"]
        p["arms"] = {"l": (14 + 60 * k, 14, 26 + 70 * k, -10 * k), "r": (2, 20 + 4 * w["breath"], 12)}
        p["nod"] = 10 + 12 * k
        p["look"] = 14 * k
        p["jaw"] = 22 + 10 * w["dn"]

    def extras(self, J, P, L, tag, pose):
        self.troll_head(J, L, tag, ear_lift=0.2)
        gd.glow_eyes(J, tag, "eye_green", 1.2)
        c, X, F, U, s = gd.hf(J)
        gd.crystals(tag, "hcry", c + U * s[2] * 0.85 - F * 0.04, U - F * 0.3, 0.3, 3, seed=4)
        for i, (h, a, sz) in enumerate(((0.66, 180, 0.42), (0.5, 170, 0.36), (0.34, 185, 0.3), (0.62, 125, 0.3), (0.2, 180, 0.22))):
            gd.crystals(tag, "bcry%d" % i, surf(J, P, h, a, -0.03), J["B"] * math.cos(D(a - 180)) + J["X"] * -math.sin(D(a - 180))
                        + J["u"] * 0.7, sz, 3, seed=i + 7)
        el = J["arms"]["r"][1]
        gd.crystals(tag, "ecry", el, J["X"] + J["B"] * 0.5, 0.22, 2, seed=3)
        gd.lumps(J, P, tag, "boil", ((0.45, 50, 0.5), (0.25, -40, 0.55), (0.55, -110, 0.5)), "skin_nurgle", r=0.08)
        gd.strap(J, P, tag, "chain", "kit1", 50, P["sh_h"], -70, 0.12, r=0.05)
        gd.strap(J, P, tag, "chainb", "kit1", -70, 0.12, -310, P["sh_h"], r=0.05)
        for side in ("l", "r"):
            _bands(J, L, tag, side, "kit2")

# ---------------------------------------------------------------------------- Ogre team
def _ogre_hair(J, L, tag, pose):
    """Hair a look option adds to a bald ogre: a bound topknot or a short mohawk."""
    if L.get("gd_topknot"):
        gd.topknot(J, tag, L["gd_topknot"], "kit2", h=0.34, pose=pose)
    if L.get("gd_mohawk"):
        gd.mohawk(J, tag, L["gd_mohawk"], h=0.22, n=6)

@register
class OgreBlocker(looks.Fine, Biped):
    """A wall of fat and muscle: bald, drooping moustache, crossed straps holding a riveted kit gut plate,
    one iron shoulder, kit trousers, fur boot tops. Slaps his belly."""
    key = "ogre_blocker"
    race = "ogre"
    knobs = dict(belly=1.5, shoulders=1.35, head=1.0, neck=1.3)
    layout = dict(legs="kit2", pant_stripe="kit1", boots="boot", cuff="fur_brown", belt="leather", buckle=None, arm_band="kit2",
                  brow="hair", loin="kit1", loin_trim="kit2", gd_tache=True, gd_gut=True, gd_shplate=True)
    stance = dict(lean=-2, legs={"l": (5, 18, 10), "r": (-4, 18, 10)}, arms={"l": (6, 38, 40, -4), "r": (6, 38, 40, -4)},
                  hands="relaxed")
    stride, arm_swing, run_lean, jump = 26, 22, 9, 0.08
    lie, lie_shift = 0.34, 1.0

    def idle(self, ph, p, w):       # slaps his gut plate with one big hand; the belly heaves in two states
        k = max(0.0, w["s2"])
        p["arms"] = {"l": (6, 38, 40, -4), "r": (22 + 10 * k, 30 - 16 * k, 70 + 30 * k, -40 - 26 * k)}
        p["hand_modes"] = {"r": "open"}
        p["lean"] = -2 - 3 * w["breath"]
        p["look"] = 10 * w["s1"]

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        fem = L.get("sex") == "f"
        gd.brute_jaw(J, L, tag, 0.9 if fem else 1.1)
        gd.big_tusks(J, tag, 0.4 if fem else 0.55, spread=0.4)
        if L.get("gd_tache"):
            gd.moustache(J, tag, "hair", 1.1, 0.055)
        if L.get("gd_wrap"):
            gd.bust_band(J, P, tag, L["gd_wrap"], "kit1")
        _ogre_hair(J, L, tag, pose)
        if L.get("gd_hoops"):
            gd.hoops(J, tag, L["gd_hoops"], r=0.075)
        gd.baldric(J, P, tag, "leather", sd=1, r=0.05, bot=0.16, name="bx")
        gd.baldric(J, P, tag, "leather", sd=-1, r=0.05, bot=0.16, name="by")
        if L.get("gd_gut"):
            # larger kit1 gut plate on a wide dark iron rim, kit2 diamond on the front (contrast against tan skin)
            gp = gd.gut_plate(J, P, tag, "kit1", "darkmetal", h=0.16, rx=0.4, rz=0.33, off=0.06, boss="brass", emblem="kit2")
            ellipsoid(tag + "gutrim2", gp - J["F"] * 0.035, (0.4 * 1.24, 0.05, 0.33 * 1.24), "darkmetal", basis(J["X"], J["F"], J["u"]), seg=16)
        if L.get("gd_shplate"):
            gd.shoulder_plate(J, tag, "l", "darkmetal", "kit1", 1.3, spike="metal")
        for side in ("l", "r"):
            _bands(J, L, tag, side, "kit1", k=1.1)
        gd.rivets(J, P, tag, "briv", 0.07, "brass", angles=(-150, -100, -50, 50, 100, 150), off=0.06, r=0.03)

    def details(self, J, P, L, tag, pose):
        if not L.get("gd_hoops"):
            gd.earring(J, tag, "gold", 1, r=0.05)
        for i, (h, a) in enumerate(((0.36, 150), (0.3, -160), (0.42, -130))):     # old scars across the back
            gd.strap(J, P, tag, "scar%d" % i, "lip_h", a - 14, h + 0.03, a + 14, h - 0.03, r=0.014, off=0.008, n=3)

@register
class OgreRunt(looks.Fine, Biped):
    """The punter: a younger, leaner ogre in a kit vest and strapped kit cap, with one huge iron-shod
    kicking boot. Swings the boot to keep it warm."""
    key = "ogre_runt"
    race = "ogre"
    knobs = dict(torso=1.3, belly=1.15, shoulders=1.2, limb=1.42, legs=0.98, head=1.08)
    layout = dict(jersey="kit1", legs="kit2", pant_stripe="kit1", boots="boot", cuff="rags", belt="leather", buckle="brass",
                  helm="skull", helm_mat="kit2", brow="hair_brown", wraps="rags", gd_runtcap=True, gd_kboot="metal")
    stance = dict(lean=3, twist=-8, legs={"l": (10, 13, 10), "r": (-10, 13, 10)}, arms={"l": (10, 28, 34), "r": (4, 30, 30)},
                  hands="fist")
    stride, arm_swing, run_lean, jump = 32, 28, 12, 0.12
    lie, lie_shift = 0.3, 1.0

    def idle(self, ph, p, w):       # practice swings with the kicking leg, arms out for balance
        s = w["s1"]
        p["legs"] = {"l": (10, 13, 10), "r": (-10 + 40 * s, 13, 10 + 46 * w["dn"])}
        p["feet"] = {"r": 20 * w["dn"] - 14 * w["up"]}
        p["arms"] = {"l": (10 - 16 * s, 28, 34), "r": (4 + 14 * s, 38, 30)}

    def adjust(self, name, i, pose):
        if name == "pass":          # he punts instead of throwing: the pass is a big empty kick
            b = self.stance
            wind = dict(lean=-4, twist=-10, legs={"l": (8, 13, 14), "r": (-48, 13, 60)}, feet={"r": 30},
                        arms={"l": (40, 40, 30), "r": (-20, 44, 30)}, hands="fist")
            kick = dict(lean=-12, twist=6, legs={"l": (4, 13, 8), "r": (78, 13, 6)}, feet={"r": -20},
                        arms={"l": (-30, 46, 30), "r": (50, 40, 30)}, hands="fist", hop=0.05)
            from lib import anim
            return anim.keyframes([(0, dict(b)), (2, wind), (3, wind), (4, kick), (5, kick), (7, dict(b))], i * 7.0 / 7)
        return pose

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        fem = L.get("sex") == "f"
        gd.brute_jaw(J, L, tag, 0.88 if fem else 1.05)
        c, X, F, U, s = gd.hf(J)
        if L.get("gd_runtcap"):
            cap(tag + "capband", c + U * 0.02, (s[0] * 1.21, s[1] * 1.21, s[2] * 1.19), "kit1", U, cut=0.2, hi=0.44, rot=J["head_R"],
                thick=0.025)
            tube(tag + "chinstrap", [c + X * s[0] * 1.0, c - U * s[2] * 1.02 + F * s[1] * 0.45, c - X * s[0] * 1.0], [0.03] * 3,
                 "leather", n=6)
            ball_at(tag + "capstud", c + U * s[2] * 1.18, 0.05, "brass")
        gd.big_tusks(J, tag, 0.38 if fem else 0.5, spread=0.4)
        if L.get("gd_hoops"):
            gd.hoops(J, tag, L["gd_hoops"], r=0.07)
        if L.get("gd_kboot"):
            self.kick_boot(J, L, tag, L["gd_kboot"])
        gd.strap(J, P, tag, "vest", "kit2", 40, P["sh_h"], -60, 0.12, r=0.045)
        _bands(J, L, tag, "l", "kit2", ts=(0.25, 0.6))

    def kick_boot(self, J, L, tag, mat):
        """One huge shod kicking boot on the right leg, in iron or painted in the team colour."""
        k = L["limb"] * core.LIMB
        hip, knee, ankle, toe = J["legs"]["r"]
        band = "kit1" if mat == "kit2" else "kit2"
        tube(tag + "kboot", [lerp(knee, ankle, 0.25), lerp(knee, ankle, 0.6), ankle - UP * 0.02], [0.135 * k, 0.125 * k, 0.115 * k],
             mat, n=10)
        tube(tag + "kband", [lerp(knee, ankle, 0.2), lerp(knee, ankle, 0.34)], [0.142 * k, 0.142 * k], band, n=10)
        fd = (toe - ankle).normalized()
        ellipsoid(tag + "ktoe", ankle + fd * (toe - ankle).length * 0.75 - UP * 0.02, (0.125 * k, 0.17 * k, 0.085 * k), mat,
                  basis(fd.cross(UP).normalized(), fd, UP), seg=10)
        cone(tag + "kspike", toe + fd * 0.02, toe + fd * 0.16 + UP * 0.03, 0.05 * k, "brass", 6)
        ball_at(tag + "kknee", knee + J["hF"] * 0.05, 0.1 * k, mat)

    def details(self, J, P, L, tag, pose):
        X, F, u = J["X"], J["F"], J["u"]
        hip, knee = J["legs"]["l"][:2]
        box(tag + "kneepatch", lerp(hip, knee, 0.82) + J["hF"] * 0.13, (0.11, 0.03, 0.1), "kit1", basis(X, F, u))
        if not L.get("gd_hoops"):
            gd.earring(J, tag, "brass", -1, r=0.04)

@register
class Gnoblar(looks.Fine, Biped):
    """Tiny scrappy servant: olive skin, enormous drooping ears and nose, ragged kit smock, kit neckerchief,
    a bedroll roped to his back. Scratches his ear like a dog."""
    key = "gnoblar"
    race = "goblin"
    knobs = dict(legs=0.5, head=1.32, torso=0.82, limb=0.72, hunch=12, arms=0.9)
    layout = dict(BARE, skin="skin_nurgle", lip="skin_nurgle", torso="kit1", arms="skin_nurgle", legs="skin_nurgle",
                  boots="skin_nurgle", coat="robe", robe_len=0.36, jag=0.55, coat_mat="kit1", robe_lining="kit1", hem=None,
                  neckband="kit2", belt="kit2", buckle=None, eyes="dark", fangs=False, gd_roll=True)
    stance = dict(lean=8, legs={"l": (8, 14, 16), "r": (-6, 14, 16)}, arms={"l": (20, 26, 60, 0), "r": (20, 26, 60, 0)},
                  hands="relaxed")
    stride, arm_swing, jump = 42, 40, 0.26
    lie, lie_shift = 0.12, 0.4
    height = 1.0

    def idle(self, ph, p, w):       # scratches one ear furiously, then glances about
        k = 1.0 if w["s1"] > -0.2 else 0.0
        p["arms"] = {"l": (20, 26, 60, 0), "r": (20 + 120 * k, 26 + 16 * k, 60 + 70 * k + 16 * w["s2"] * k, -30 * k)}
        p["look"] = 20 * (1 - k) * w["s2"] - 8 * k
        p["hand_modes"] = {"r": "open"}

    def extras(self, J, P, L, tag, pose):
        gd.big_ears(J, L, tag, length=0.42, lift=-0.35, width=0.55, back=0.12)
        gd.long_nose(J, L, tag, 0.22, 0.07, droop=0.5)
        super().extras(J, P, L, tag, pose)
        X, B, u = J["X"], J["B"], J["u"]
        if L.get("gd_roll"):
            p = surf(J, P, 0.3, 180, 0.11)
            parts.cylinder(tag + "roll", p - X * 0.22, p + X * 0.22, 0.11, "kit2", seg=8)
            for sx in (-0.11, 0.11):
                parts.cylinder(tag + "rollrope%d" % (sx > 0), p + X * (sx - 0.02), p + X * (sx + 0.02), 0.108, "rope", seg=8)
        if L.get("gd_basket"):
            self.basket(J, P, tag)
        q = surf(J, P, 0.22, -28, 0.035)
        box(tag + "patch", q, (0.09, 0.03, 0.09), "kit2", basis(X, J["F"], u))

    def basket(self, J, P, tag):
        """A tall wicker basket strapped to his back, a kit cloth tied over the top and a stick poking out."""
        X, B, u = J["X"], J["B"], J["u"]
        R = basis(X, B, u)
        p = surf(J, P, 0.3, 180, 0.15)
        box(tag + "basket", p, (0.34, 0.22, 0.42), "rope", R)
        for i, h in enumerate((-0.12, 0.06)):
            box(tag + "basketband%d" % i, p + u * h, (0.36, 0.24, 0.04), "wood", R)
        box(tag + "basketcloth", p + u * 0.23, (0.36, 0.24, 0.06), "kit2", R)
        tube(tag + "basketstick", [p + X * 0.1 + u * 0.2, p + X * 0.16 + u * 0.48 + B * 0.04], [0.022, 0.018], "wood", n=5)
        for sd in (-1, 1):
            tube(tag + "basketstrap%d" % sd, [surf(J, P, P["sh_h"], 180 - sd * 30, 0.04), surf(J, P, P["sh_h"] - 0.02, sd * 40, 0.04),
                                              surf(J, P, 0.16, sd * 50, 0.04)], [0.022] * 3, "rope", n=5)

    def details(self, J, P, L, tag, pose):
        gd.earring(J, tag, "brass", 1, r=0.03, drop=0.05)
        q = surf(J, P, 0.08, 34, 0.04)
        box(tag + "patch2", q, (0.07, 0.03, 0.08), "rags", basis(J["X"], J["F"], J["u"]))

# ---------------------------------------------------------------------------- Underworld Denizens
@register
class MutantRatOgre(Biped):
    """Hulking rat-beast warped by the glow: a third arm growing from its flank, two lashing tails, crystal
    spurs along the spine and one shoulder; kit harness and loincloth, kit collar and bracers."""
    key = "rat_ogre_mutant"
    race = "rat_ogre"
    knobs = dict(shoulders=1.38, arms=1.3, head=1.1)
    layout = dict(skin="fur_brown", gloves="skin_rat", dark="skin_rat", eye_mat="eye_green", loin="kit1", loin_trim="kit2",
                  belt="kit2", buckle="gd_warp", neckband="kit2", claws=0.16,
                  tail=dict(len=1.2, r=0.075, mat="skin_rat", up=0.25, tip="gd_warp"))
    stance = dict(lean=0, nod=-6, jaw=14, legs={"l": (-12, 16, 6), "r": (14, 16, 10)}, arms={"l": (6, 26, 30, 6), "r": (18, 26, 40, 6)},
                  hands="open")
    stride, arm_swing, run_lean, jump = 32, 28, 12, 0.16
    lie, lie_shift = 0.32, 1.0
    height = 1.0

    def idle(self, ph, p, w):       # savage twitching: head snaps side to side, jaws snap, tails lash, the third arm gropes
        snap = 1 if w["s2"] > 0.5 else 0
        p.update(look=26 * (1 if w["s1"] > 0 else -1), jaw=14 + 26 * snap, tail=w["s1"], arm3=w["s2"],
                 arms={"l": (6 + 10 * w["up"], 26, 30 + 16 * w["up"], 6), "r": (18 + 10 * w["dn"], 26, 40 + 16 * w["dn"], 6)})

    def adjust(self, name, i, pose):
        pose.setdefault("jaw", 14)
        if name in ("run", "block", "cheer"):
            pose["hands"] = "open"
            pose["jaw"] = 34
            pose["arm3"] = math.sin(i * math.pi / 4)
            pose["tail"] = math.sin(i * math.pi / 4)
        return pose

    def extras(self, J, P, L, tag, pose):
        X, F, B, u = J["X"], J["F"], J["B"], J["u"]
        # second tail, lashing against the first
        L2 = dict(L, tail=dict(len=0.95, r=0.06, mat="skin_rat", up=0.5, tip="gd_warp"))
        pose2 = dict(pose, tail=-pose.get("tail", 0.0) - 0.9)
        parts.tail(J, P, L2, tag + "t2", pose2)
        # third arm on the left flank
        sw = pose.get("arm3", 0.0)
        a = surf(J, P, 0.42, -78, -0.02)
        d1 = (-X * 0.75 + F * (0.5 + 0.3 * sw) - UP * 0.3).normalized()
        el = a + d1 * 0.34
        d2 = (F * 0.9 - X * 0.15 + UP * (0.15 + 0.35 * sw)).normalized()
        wr = el + d2 * 0.32
        tube(tag + "arm3", [a, el, wr], [0.1, 0.075, 0.055], "skin_rat", ref=F, n=8)
        ball_at(tag + "arm3s", a, 0.12, "fur_brown")
        for i, off in enumerate((-0.07, 0.0, 0.07)):
            cone(tag + "arm3c%d" % i, wr, wr + d2 * 0.18 + X * off + UP * 0.03, 0.03, "bone", 5)
        # crystal spurs
        for i, (h, sz) in enumerate(((0.74, 0.34), (0.58, 0.4), (0.4, 0.3), (0.24, 0.22))):
            gd.crystals(tag, "spine%d" % i, surf(J, P, h, 180, -0.04), B + u * 0.6, sz, 3, seed=i + 2)
        sh = J["arms"]["r"][0]
        gd.crystals(tag, "shcry", sh + u * 0.08, u + X * 0.5, 0.36, 4, seed=11)
        gd.lumps(J, P, tag, "boil", ((0.5, 60, 0.6), (0.3, -40, 0.5), (0.62, -30, 0.45)), "skin_rat", r=0.09)
        gd.baldric(J, P, tag, "kit1", sd=1, r=0.06, top=P["sh_h"] - 0.04, bot=0.14, name="hx")
        gd.baldric(J, P, tag, "kit1", sd=-1, r=0.06, top=P["sh_h"] - 0.04, bot=0.14, name="hy")
        ball_at(tag + "hboss", surf(J, P, 0.42, 0, 0.07), 0.07, "kit2")
        for side in ("l", "r"):
            _bands(J, L, tag, side, "kit2", k=1.3)

@register
class UnderworldGoblin(looks.Fine, Biped):
    """Hooded tunnel goblin: kit hood with the ears poking through, glowing eyes, a crystal cluster on one
    shoulder and a thin mutant tail."""
    key = "goblin_underworld"
    race = "goblin"
    layout = dict(helm="hood", hood_mat="kit1", torso="kit1", arms="skin_goblin", legs="rags", boots="leather", cuff=None,
                  belt="kit2", buckle="gd_warp", loin="kit2", loin_trim="kit1", wraps="bandage", gd_shcry=True,
                  tail=dict(len=0.75, r=0.04, mat="skin_goblin", up=0.45, tip="gd_warp"))
    stance = dict(lean=10, legs={"l": (10, 13, 18), "r": (-8, 13, 16)}, arms={"l": (18, 22, 58, 0), "r": (26, 22, 70, 0)},
                  hands="open")
    stride, arm_swing, jump = 42, 38, 0.26
    lie, lie_shift = 0.13, 0.45
    height = 1.03

    def idle(self, ph, p, w):       # twitchy: head jerks from side to side in two states, tail flicks, fingers flex
        p["look"] = 26 * (1 if w["s1"] > 0 else -1)
        p["tail"] = w["s2"]
        p["hands"] = "open" if w["s2"] > 0 else "relaxed"
        p["arms"] = {"l": (18, 22, 58 + 14 * w["up"], 0), "r": (26, 22, 70 + 14 * w["dn"], 0)}

    def extras(self, J, P, L, tag, pose):
        gd.big_ears(J, L, tag, length=0.34, lift=0.25, width=0.42)
        gd.long_nose(J, L, tag, 0.15, 0.05)
        super().extras(J, P, L, tag, pose)
        gd.glow_eyes(J, tag, "eye_green", 1.25)
        if L.get("gd_shcry"):
            sh = J["arms"]["l"][0]
            gd.crystals(tag, "shcry", sh + J["u"] * 0.06, J["u"] - J["X"] * 0.5, 0.32, 3, seed=5)
        if L.get("gd_hcry"):
            c, X, F, U, s = gd.hf(J)
            gd.crystals(tag, "hcry", c + U * s[2] * 1.0 + X * s[0] * 0.3, U + X * 0.4 - F * 0.2, 0.3, 3, seed=9)
        if L.get("gd_shcry") or L.get("gd_hcry"):
            gd.crystals(tag, "bkcry", surf(J, P, 0.3, 170, -0.02), J["B"] + J["u"] * 0.5, 0.2, 2, seed=8)
        tband(tag + "hem", J, P, [0.06, 0.1], "kit2", k=1.1, add=0.02)

    def details(self, J, P, L, tag, pose):
        gd.earring(J, tag, "gd_warp", -1, r=0.03, drop=0.02)
        gd.rivets(J, P, tag, "beltstud", 0.07, "gd_warp", angles=(-110, -60, 60, 110), off=0.06, r=0.018)

@register
class UnderworldSnotling(Biped):
    """Knee-high snotling in a kit rag with a glowing crystal horn bigger than its head. Jumps up and down."""
    key = "snotling_underworld"
    race = "snotling"
    knobs = dict(limb=0.85, torso=0.85)
    layout = dict(BARE, torso="kit1", arms="skin_goblin", legs="skin_goblin", boots="skin_goblin", loin="kit1", loin_trim="kit2",
                  neckband="kit2", belt="kit2", buckle=None, gd_horn="one")
    stance = dict(lean=4, legs={"l": (6, 14, 12), "r": (-5, 14, 12)}, arms={"l": (30, 40, 70, 0), "r": (30, 40, 70, 0)},
                  hands="open")
    stride, arm_swing, jump = 44, 44, 0.3
    lie, lie_shift = 0.1, 0.3
    height = 1.08

    def idle(self, ph, p, w):       # can't keep still: little hops in two states with flapping arms
        up = 1.0 if w["s2"] > 0 else 0.0
        p["hop"] = 0.07 * up
        p["arms"] = {"l": (30 + 50 * up, 40 + 20 * up, 70 - 30 * up, 0), "r": (30 + 50 * up, 40 + 20 * up, 70 - 30 * up, 0)}
        p["legs"] = {"l": (6, 14, 12 + 16 * (1 - up)), "r": (-5, 14, 12 + 16 * (1 - up))}

    def extras(self, J, P, L, tag, pose):
        gd.big_ears(J, L, tag, length=0.28, lift=0.2, width=0.45)
        gd.glow_eyes(J, tag, "eye_green", 1.3)
        c, X, F, U, s = gd.hf(J)
        horn = L.get("gd_horn")
        if horn == "one":
            gd.crystals(tag, "horn", c + U * s[2] * 0.8 + X * s[0] * 0.2, U + X * 0.25 - F * 0.1, 0.42, 3, seed=6)
        elif horn == "twin":
            for sd in (-1, 1):
                gd.crystals(tag, "horn%d" % sd, c + U * s[2] * 0.7 + X * s[0] * 0.45 * sd, U + X * 0.55 * sd - F * 0.1, 0.3, 2,
                            seed=6 + sd)
        elif horn == "back":
            gd.crystals(tag, "bkcry", surf(J, P, 0.3, 180, -0.02), J["B"] + J["u"] * 0.7, 0.34, 3, seed=12)
            gd.crystals(tag, "shcry", J["arms"]["r"][0] + J["u"] * 0.05, J["u"] + J["X"] * 0.5, 0.24, 2, seed=13)
