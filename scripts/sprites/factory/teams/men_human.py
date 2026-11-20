"""Human team (human_lineman, human_thrower, human_catcher, human_blitzer) and the shared Ogre.
Each position has its own head, build and stance so the four humans read apart by silhouette.
No figure holds a ball."""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts, looks
from lib.core import tube, tband, ball_at, box, lerp, UP, basis, D, ellipsoid, cap, cone, flat_cone, surf
from teams import men_common as mc


@register
class HumanLineman(looks.Fine, Biped):
    """Sturdy town militia: wide kettle helm, quilted jack to the thigh, one leather shoulder, thumbs in belt."""
    key = "human_lineman"
    race = "human"
    knobs = dict(torso=1.1, belly=1.12, limb=1.08, shoulders=1.05)
    layout = dict(skin="skin_fair", torso="kit1", arms="shirt", legs="rags", coat="gambeson", hem="kit2", belt="leather",
                  helm="kettle", bracers="leather", neckband="kit2", pads="leather", pad_sides=("l",), boots="boot",
                  beard="hair_brown", beard_len=0.35, arm_band="kit2")
    stance = dict(lean=3, legs={"l": (4, 13, 6), "r": (-3, 13, 6)}, arms={"l": (-18, 36, 62, -50), "r": (-18, 36, 62, -50)},
                  hands="fist")
    stride, arm_swing, jump = 34, 28, 0.15
    height = 1.0

    def idle(self, ph, p, w):       # stands with fists on hips, rocks on his heels, looks up and down the line
        k = 1 if w["s1"] > 0 else 0
        p.update(look=26 * w["s1"], lean=3 - 4 * k, feet={"l": -10 * k, "r": -10 * k})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        # quilting: vertical kit2 stitch lines down the jack, and a kit2 diamond badge
        for i, a in enumerate((-48, -24, 24, 48, 180)):
            tube(tag + "quilt%d" % i, [surf(J, P, 0.14, a, 0.03), surf(J, P, 0.3, a, 0.035), surf(J, P, 0.44, a, 0.03)],
                 [0.016] * 3, "kit2", n=5)
        p = surf(J, P, 0.36, 0, 0.035)
        box(tag + "badge", p, (0.12, 0.03, 0.12), "kit2", Matrix.Rotation(D(45), 3, J["F"]) @ basis(J["X"], J["F"], J["u"]))

    def details(self, J, P, L, tag, pose):
        mc.pouch(tag, J, P, ang=-62)
        mc.studs(tag, J, P, [(0.36, 0, 0.06)], "metal", r=0.026, name="badgeboss")
        mc.studs(tag, J, P, [(h, a, 0.04) for h in (0.2, 0.38) for a in (-36, 36)], "kit2", r=0.018, name="quiltknot")


@register
class HumanThrower(looks.Fine, Biped):
    """The showman: peaked feathered cap, bare throwing arm, one long sleeve, sash; light kit, stands side-on."""
    key = "human_thrower"
    race = "human"
    knobs = dict(limb=0.92, torso=0.94)
    layout = dict(skin="skin_fair", hair="short", hair_mat="hair_blond", brow="hair_blond", torso="kit1", arms="skin_fair",
                  legs="kit2", boots="boot", cuff="kit1", belt="kit2", neckband="kit2", wraps="rags", pant_stripe="kit1",
                  hat="cap", sleeves="one")
    stance = dict(lean=0, twist=-14, legs={"l": (10, 8, 6), "r": (-8, 8, 4)}, arms={"l": (-10, 34, 70, -46), "r": (30, 20, 100, -10)},
                  hands="relaxed")
    stride, arm_swing, jump = 38, 32, 0.22
    height = 1.1

    def idle(self, ph, p, w):       # showboats: off hand on hip, throwing arm rolls up to salute the stands
        up = w["up"]
        p.update(arms={"l": (-10, 34, 70, -46), "r": (30 + 110 * up, 20 + 10 * up, 100 - 80 * up, -10)},
                 hand_modes={"r": "open"}, look=-20 * up, nod=10 * up)

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("hat") == "cap":
            self.peaked_cap(J, tag, pose)
        elif L.get("hat") == "beret":
            mc.beret(tag, J, "kit1", band="kit2", tilt=-16, size=1.4)
            mc.side_feather(tag, J, "kit2", sd=1, length=0.55, r=0.09, name="beretfeather")
        if L.get("sleeves"):
            for side in ("l", "r") if L["sleeves"] == "both" else ("l",):
                self.sleeve(J, L, tag, side)
        mc.sash(tag, J, P, "kit2", side=-1, r=0.05)

    def details(self, J, P, L, tag, pose):
        mc.pouch(tag, J, P, ang=60, flap="kit1")
        mc.studs(tag, J, P, [(P["sh_h"] - 0.04, 34, 0.06)], "gold", r=0.03, name="sashpin")

    def sleeve(self, J, L, tag, side):
        sh, el, wr, _ = J["arms"][side]
        k = L["limb"] * core.LIMB * L["arm"]
        sfx = "" if side == "l" else "R"
        tube(tag + "sleeve" + sfx, [sh, lerp(sh, el, 0.5), el, lerp(el, wr, 0.5), wr],
             [0.108 * k, 0.106 * k, 0.094 * k, 0.096 * k, 0.08 * k], "kit2", ref=J["F"], n=10)
        ball_at(tag + "sleevecap" + sfx, sh, 0.118 * k, "kit1")

    def peaked_cap(self, J, tag, pose):
        """Peaked cap: soft crown, long pointed bill, long feather."""
        c, X, F, U, s, R = mc.head(J)
        cap(tag + "capcrown", c + U * 0.02, (s[0] * 1.13, s[1] * 1.13, s[2] * 1.16), "kit1", (U * 0.9 - F * 0.3).normalized(),
            cut=0.2, rot=R, thick=0.03)
        flat_cone(tag + "capbill", c + U * s[2] * 0.42 + F * s[1] * 0.5, c + U * s[2] * 0.3 + F * s[1] * 2.0, s[0] * 0.95, "kit1", U, 0.22)
        cap(tag + "capband", c + U * 0.02, (s[0] * 1.17, s[1] * 1.17, s[2] * 1.2), "kit2", U, cut=0.2, hi=0.38, rot=R, thick=0.03)
        a = c + X * s[0] * 0.9 + U * s[2] * 0.5
        stream = mc.act(pose)
        tip = a - F * (0.95 if stream else 0.8) + U * (0.2 if stream else 0.34) + X * 0.12
        tube(tag + "capfeather", [a, lerp(a, tip, 0.35) + U * 0.2, lerp(a, tip, 0.7) + U * 0.16, tip], [0.04, 0.1, 0.11, 0.03], "kit2",
             ref=X, n=8, flat=0.6)


@register
class HumanCatcher(looks.Fine, Biped):
    """Lean sprinter: bare head with a streaming headband, long bare legs, vest and shorts, crouched on his toes."""
    key = "human_catcher"
    race = "human"
    knobs = dict(legs=1.16, limb=0.78, shoulders=0.9, torso=0.84)
    layout = dict(skin="skin_tan", hair="swept", hair_mat="hair", brow="hair", torso="kit1", arms="skin_tan", legs="skin_tan",
                  boots="leather", cuff="kit2", shorts="kit2", belt="kit1", buckle=None, wraps="kit2", band="kit2", trunks=True)
    stance = dict(lean=12, legs={"l": (16, 9, 22), "r": (-14, 9, 16)}, feet={"l": 18, "r": 18},
                  arms={"l": (30, 22, 70, 6), "r": (34, 22, 74, 6)}, hands="open")
    stride, arm_swing, run_lean, jump = 46, 40, 20, 0.3
    height = 1.1

    def idle(self, ph, p, w):       # bounces on his toes (two states), hands open and twitching for the catch
        k = 1 if w["s2"] > 0 else 0
        p.update(feet={"l": 12 + 16 * k, "r": 12 + 16 * k},
                 arms={"l": (30 + 12 * w["s1"], 22, 70, 6), "r": (34 - 12 * w["s1"], 22, 74, 6)}, look=18 * w["c1"])

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("band"):
            mc.headband(tag, J, L["band"], tails=0.5, stream=mc.act(pose))
        if L.get("trunks"):
            for side in ("l", "r"):
                mc.legging(tag, J, L, side, "kit2", 0.0, 0.19, grow=1.1, name="short")
                mc.legging(tag, J, L, side, "kit1", 0.17, 0.215, grow=1.14, name="shorthem")
        # racing stripe down the vest
        for sd in (-1, 1):
            tube(tag + "vstripe%d" % sd, [surf(J, P, 0.12, sd * 62, 0.03), surf(J, P, 0.3, sd * 62, 0.035), surf(J, P, 0.46, sd * 55, 0.03)],
                 [0.03] * 3, "kit2", n=5)

    def details(self, J, P, L, tag, pose):
        k = L["limb"] * core.LIMB
        for side in ("l", "r"):          # kit1 sweatbands round the wrists
            el, wr = J["arms"][side][1:3]
            tube(tag + "sweat" + side, [lerp(el, wr, 0.8), lerp(el, wr, 0.95)], [0.1 * k, 0.1 * k], "kit1", ref=J["F"], n=10)
        mc.studs(tag, J, P, [(0.46, 0, 0.04)], "kit1", r=0.032, name="number")


@register
class HumanBlitzer(looks.Fine, Biped):
    """The armoured star: full plate, broad pauldrons, tall horsehair plume, tabard; fists up, rolling shoulders."""
    key = "human_blitzer"
    race = "human"
    knobs = dict(shoulders=1.2, limb=1.14, torso=1.06)
    layout = dict(skin="skin_fair", torso="kit1", arms="mail", legs="mail", helm="open", breast="metal", gorget=True, pads="big",
                  pad_mat="kit1", pad_trim="kit2", gauntlets=True, greaves=True, kneecops=True, belt="kit2", tabard="kit1",
                  tabard_trim="kit2", emblem_mat="kit1", plume_tall=True)
    stance = dict(lean=7, legs={"l": (8, 15, 12), "r": (-6, 15, 10)}, arms={"l": (30, 30, 96, -10), "r": (20, 30, 88, -10)},
                  hands="fist")
    stride, arm_swing, jump = 35, 28, 0.15
    height = 1.1

    def idle(self, ph, p, w):       # smacks a fist into his open palm, twice a loop
        hit = max(0.0, w["s2"])
        p.update(arms={"l": (34, 30 - 12 * hit, 96, -10 - 34 * hit), "r": (30, 30 - 12 * hit, 92, -10 - 34 * hit)},
                 hand_modes={"l": "open", "r": "fist"}, lean=7 + 3 * w["breath"], look=14 * w["s1"])

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("plume_tall"):
            mc.plume_tall(tag, J, "kit2", h=0.5, r=0.15)

    def details(self, J, P, L, tag, pose):
        mc.studs(tag, J, P, [(0.08, -26, 0.07), (0.08, 26, 0.07), (0.16, -32, 0.07), (0.16, 32, 0.07)], "gold", name="rivet")
        mc.studs(tag, J, P, [(0.07, 0, 0.09)], "kit2", r=0.035, name="beltgem")


@register
class Ogre(Biped):
    """Huge pot-bellied brute: studded gut-plate in kit colours, crossed harness, one big pauldron, topknot."""
    key = "ogre"
    race = "ogre"
    knobs = dict(head=0.9)
    layout = dict(legs="rags", boots="boot", cuff="leather", belt="leather", buckle=None, loin="kit1", loin_trim="kit2",
                  pads="football_big", pad_sides=("l",), pad_mat="kit1", pad_trim="kit2", spikes=1, bracers="kit2",
                  beard="hair", beard_len=0.25, brow="hair")
    stance = dict(lean=2, legs={"l": (5, 17, 8), "r": (-4, 17, 8)}, arms={"l": (6, 30, 30, 0), "r": (6, 30, 30, 0)},
                  hands="fist")
    stride, arm_swing, run_lean, jump = 28, 24, 10, 0.08
    lie, lie_shift = 0.32, 1.0
    height = 1.0

    def idle(self, ph, p, w):       # bone-headed: slowly scratches his scalp, mouth-breathing, then forgets why
        up = w["up"]
        p.update(arms={"l": (6, 30, 30, 0), "r": (6 + 150 * up, 30 + 6 * up, 30 + 100 * up, -40 * up)},
                 look=-16 * up + 10 * w["dn"], nod=-8 * up, hand_modes={"r": "relaxed"}, lean=2 + 2 * w["breath"])

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s, R = mc.head(J)
        # topknot
        t = c + U * s[2] * 0.95 - F * 0.04
        tube(tag + "knotband", [t, t + U * 0.08], [0.07, 0.065], "kit2", n=6)
        cone(tag + "knot", t + U * 0.06, t + U * 0.38 - F * 0.16, 0.085, "hair", 6)
        # gut-plate: round iron plate strapped over the belly, kit1 face, kit2 rim studs
        g = surf(J, P, 0.17, 0, 0.03)
        Rg = basis(J["X"], J["F"], J["u"])
        ellipsoid(tag + "gut", g, (0.3, 0.07, 0.27), "darkmetal", Rg, seg=14)
        ellipsoid(tag + "gutface", g + J["F"] * 0.03, (0.23, 0.06, 0.2), "kit1", Rg, seg=14)
        cone(tag + "gutboss", g + J["F"] * 0.06, g + J["F"] * 0.2, 0.07, "kit2", 6)
        for i in range(6):
            a = D(60 * i)
            ball_at(tag + "gutstud%d" % i, g + J["F"] * 0.05 + (J["X"] * math.cos(a) * 0.26 + J["u"] * math.sin(a) * 0.235), 0.035, "kit2")
        # crossed harness straps in kit1 with a kit2 strap round the belly holding the plate
        mc.sash(tag, J, P, "kit1", side=1, r=0.065, name="strapA")
        mc.sash(tag, J, P, "kit1", side=-1, r=0.065, name="strapB")
        tband(tag + "gutstrap", J, P, [0.13, 0.21], "kit2", k=1.03, add=0.012, arc=(-125, 125), solid=0.03)
