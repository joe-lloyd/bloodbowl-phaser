"""Amazon (amazon_eagle, amazon_jaguar, amazon_piranha, amazon_python): each warrior is defined by her
animal. Shared uniform: kit1 top and kit2 loincloth; the animal gear makes the silhouette. Empty hands."""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts, looks
from lib.core import tube, tband, ball_at, box, lerp, UP, basis, D, ellipsoid, cap, cone, flat_cone, surf
from teams import men_common as mc

AMZ = dict(skin="skin_tan", arms="skin_tan", torso="skin_tan", legs="skin_tan", hair_mat="hair", brow="hair", lip="lip_h",
           boots="leather", cuff=None, belt="leather", buckle="gold", loin="kit2", loin_trim="kit1")


def sandal_straps(tag, J, L, mat="leather"):
    for side in ("l", "r"):
        mc.legging(tag, J, L, side, mat, 0.6, 0.66, grow=1.08, name="strapA")
        mc.legging(tag, J, L, side, mat, 0.72, 0.78, grow=1.08, name="strapB")


@register
class EagleWarrior(looks.Fine, Biped):
    """Eagle: tall upright feather crown, golden beak brow, feather fringes on the arms that open like wings."""
    key = "amazon_eagle"
    race = "human"
    sex = "f"
    knobs = dict(limb=0.9)
    layout = dict(AMZ, hair="short", arm_band="kit1", bracers="gold", crown="fan", fringe=True)
    stance = dict(lean=4, legs={"l": (8, 9, 8), "r": (-6, 9, 8)}, arms={"l": (6, 34, 30, 10), "r": (6, 34, 30, 10)}, hands="open")
    stride, arm_swing, jump = 40, 34, 0.26
    height = 1.1

    def idle(self, ph, p, w):       # mantles like a bird: arms lift and spread the wing fringes, head darts to one side
        up = w["up"]
        p.update(arms={"l": (6, 34 + 46 * up, 30 - 14 * up, 10 + 50 * up), "r": (6, 34 + 46 * up, 30 - 14 * up, 10 + 50 * up)},
                 look=28 * (1 if w["c1"] > 0 else -1), nod=-6 * up)

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        mc.bandeau(tag, J, P, "kit1", trim="kit2")
        if L.get("crown"):
            mc.headband(tag, J, "gold", tails=0)
            if L["crown"] == "fan":
                mc.crest_fan(tag, J, ("kit1", "kit2"), n=7, h=0.5, spread=58, base=0.9, r=0.075)
            else:
                mc.plume_tall(tag, J, "kit1", h=0.42, r=0.12, base=1.0)
            c, X, F, U, s, R = mc.head(J)
            b = c + F * s[1] * 0.95 + U * s[2] * 0.5
            cone(tag + "beak", b - F * 0.04 + U * 0.05, b + F * 0.2 - U * 0.14, 0.07, "gold", 6)
        if L.get("fringe"):
            self.fringes(J, tag)
        sandal_straps(tag, J, L)
        tband(tag + "collar", J, P, [P["sh_h"] + 0.06, P["sh_h"] - 0.02, P["sh_h"] - 0.07], "kit2", k=1.0, add=0.06, solid=0.03, jag=0.4)

    def details(self, J, P, L, tag, pose):
        sh = P["sh_h"]
        mc.studs(tag, J, P, [(sh - 0.06, a, 0.08) for a in (-44, -22, 0, 22, 44)], "gold", r=0.022, name="collarbead")
        mc.studs(tag, J, P, [(0.4, 0, 0.05)], "gold", r=0.03, name="topgem")

    def fringes(self, J, tag):
        for side, sd in (("l", -1), ("r", 1)):                 # wing fringes along the back of each arm
            sh, el, wr, _ = J["arms"][side]
            out = (J["X"] * sd * 0.5 - J["F"] * 0.4 - UP * 0.75).normalized()
            for i in range(5):
                t = i / 4
                a = lerp(sh, el, t * 1.0) if t <= 1 else el
                a = lerp(lerp(sh, el, 0.3), lerp(el, wr, 0.5), t)
                flat_cone(tag + "wingf%s%d" % (side, i), a, a + out * (0.36 + 0.14 * math.sin(t * 3.1)), 0.085,
                          "kit2" if i % 2 else "kit1", J["F"], 0.3)


@register
class JaguarWarrior(looks.Fine, Biped):
    """Jaguar: the strong one, under a spotted cat-head hood with ears and fangs, pelt down her back, clawed fists."""
    key = "amazon_jaguar"
    race = "human"
    sex = "f"
    knobs = dict(limb=1.12, shoulders=1.14, torso=1.12)
    layout = dict(AMZ, hair=None, pads="leather", bracers="pelt", arm_band="kit2", claws=0.07, kneecops=True, knee_mat="pelt",
                  hood=True, pelt=True)
    stance = dict(lean=14, legs={"l": (14, 16, 26), "r": (-10, 16, 22)}, arms={"l": (26, 34, 70, 10), "r": (26, 34, 70, 10)},
                  hands="open")
    stride, arm_swing, jump = 36, 30, 0.18
    height = 1.08

    def idle(self, ph, p, w):       # prowls in a low crouch (two states) and rakes the air with one clawed hand
        k = 1 if w["s1"] > 0 else 0
        sw = max(0.0, w["s2"])
        p.update(lean=14 + 5 * k, legs={"l": (14, 16, 26 + 8 * k), "r": (-10, 16, 22 + 8 * k)},
                 arms={"l": (26, 34, 70, 10), "r": (26 + 50 * sw, 34 - 14 * sw, 70 - 40 * sw, 10)}, look=-16 * w["c1"])

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        mc.bandeau(tag, J, P, "kit1", trim="kit2")
        if L.get("hood"):
            self.hood(J, tag)
        if L.get("pelt"):
            self.pelt(J, P, tag, pose)
        # kit1 girdle tied round the waist: team colour from behind too
        tband(tag + "girdle", J, P, [0.12, 0.17, 0.22], "kit1", k=1.12, add=0.095, solid=0.035)
        sandal_straps(tag, J, L, "pelt")

    def details(self, J, P, L, tag, pose):
        mc.studs(tag, J, P, [(0.17, a, 0.13) for a in (-30, 0, 30)], "gold", r=0.025, name="girdlestud")
        mc.tooth_necklace(tag, J, P, n=3, span=30, ln=0.08)

    def hood(self, J, tag):
        """Cat-head hood with ears, fangs, eyes, spots and a kit1 brow band."""
        c, X, F, U, s, R = mc.head(J)
        cap(tag + "hood", c + U * 0.02, (s[0] * 1.22, s[1] * 1.22, s[2] * 1.2), "pelt", (U * 0.8 - F * 0.6).normalized(), cut=-0.05,
            rot=R, thick=0.04)
        m = c + U * s[2] * 0.72 + F * s[1] * 0.85
        ellipsoid(tag + "muzzle", m, (s[0] * 0.62, s[1] * 0.5, s[2] * 0.3), "pelt", R, seg=10)
        ball_at(tag + "catnose", m + F * s[1] * 0.45, 0.04, "socket")
        for sd in (-1, 1):
            e = c + X * sd * s[0] * 0.78 + U * s[2] * 1.1 - F * 0.02
            ellipsoid(tag + "ear%d" % sd, e, (0.1, 0.05, 0.12), "pelt", R, seg=8)
            ellipsoid(tag + "earin%d" % sd, e + F * 0.035, (0.055, 0.03, 0.07), "socket", R, seg=8)
            f = m + X * sd * s[0] * 0.34 - U * 0.03 + F * 0.05
            cone(tag + "fang%d" % sd, f, f - U * 0.16, 0.035, "bone", 6)
            ball_at(tag + "cateye%d" % sd, m + X * sd * s[0] * 0.45 + U * 0.07 + F * 0.02, 0.03, "eye_yellow")
        tube(tag + "hoodband", [c + U * s[2] * 0.35 - F * 0.02, c + U * s[2] * 0.6 - F * 0.04], [s[0] * 1.3, s[0] * 1.28], "kit1",
             ref=X, n=12)
        for i, (x, y, z) in enumerate(((0.5, -0.3, 0.85), (-0.5, -0.3, 0.85), (0, -0.75, 0.75), (0.75, -0.5, 0.3), (-0.75, -0.5, 0.3),
                                       (0, 0.2, 1.05))):
            ball_at(tag + "hspot%d" % i, c + X * x * s[0] * 1.2 + F * y * s[1] * 1.2 + U * z * s[2] * 1.2, 0.035, "socket")

    def pelt(self, J, P, tag, pose):
        """Spotted pelt down the back with its tail, forepaws knotted over the shoulders."""
        sh = P["sh_h"]
        tband(tag + "pelt", J, P, [sh + 0.06, sh - 0.06, 0.26, 0.1], "pelt", k=1.1, add=0.05, arc=(-95, 95), solid=0.04, jag=0.3)
        core.panel(J, P, tag + "pelt", False, 0.62, 0.2, "pelt", pose.get("flare", 0.06), top=0.14)
        for sd in (-1, 1):
            a = J["arms"]["l" if sd < 0 else "r"][0] + J["u"] * 0.1
            b = surf(J, P, sh - 0.08, sd * 22, 0.06)
            tube(tag + "paw%d" % sd, [a - J["F"] * 0.08, a + J["F"] * 0.1, b], [0.07, 0.075, 0.055], "pelt", n=6)
            ball_at(tag + "pawtip%d" % sd, b, 0.065, "pelt")
        spots = [(sh - 0.02, 180), (0.38, 150), (0.38, -150), (0.25, 175), (0.14, 150), (0.14, -155), (0.3, 120), (0.3, -120)]
        for i, (h, a) in enumerate(spots):
            ball_at(tag + "spot%d" % i, surf(J, P, h, a, 0.085), 0.04, "socket")
        # tail of the pelt
        t0 = J["pelvis"] + J["B"] * 0.22 - UP * 0.45
        sw = 0.5 if mc.act(pose) else 0.0
        tube(tag + "pelttail", [t0, t0 + J["B"] * (0.1 + sw * 0.4) - UP * (0.28 - sw * 0.2), t0 + J["B"] * (0.16 + sw * 0.8) - UP * (0.5 - sw * 0.45)],
             [0.05, 0.045, 0.035], "pelt", n=6)


@register
class PiranhaWarrior(looks.Fine, Biped):
    """Piranha: sleek fish helm with a tall dorsal fin and a tooth-lined jaw, forearm and calf fins, tooth necklace."""
    key = "amazon_piranha"
    race = "human"
    sex = "f"
    knobs = dict(limb=0.92, legs=1.06)
    layout = dict(AMZ, hair=None, helm_tail=True, tie="kit1", bracers="kit2", wraps=None, fish=True, fins=True)
    stance = dict(lean=10, twist=10, legs={"l": (16, 9, 16), "r": (-14, 9, 12)}, feet={"r": 14},
                  arms={"l": (40, 20, 94, 0), "r": (16, 22, 100, 0)}, hands="fist")
    stride, arm_swing, run_lean, jump = 44, 38, 18, 0.3
    height = 1.08

    def idle(self, ph, p, w):       # hit and run: bobs on her toes (two states) and snaps out quick left jabs
        k = 1 if w["s2"] > 0 else 0
        jab = max(0.0, math.sin(2 * w["a"] + 0.6)) ** 2
        p.update(feet={"l": 14 * k, "r": 14 + 12 * k},
                 arms={"l": (40 + 40 * jab, 20, 94 - 78 * jab, 0), "r": (16, 22, 100, 0)}, twist=10 - 14 * jab)

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        mc.bandeau(tag, J, P, "kit1", trim="kit2")
        if L.get("fish"):
            self.fish_helm(J, tag)
        mc.tooth_necklace(tag, J, P, n=5)
        if L.get("fins"):
            self.fins(J, tag)
        tband(tag + "scales", J, P, [0.06, 0.0, -0.07], "kit2", k=1.1, add=0.02, solid=0.03, jag=0.5)
        sandal_straps(tag, J, L, "kit2")

    def details(self, J, P, L, tag, pose):
        mc.studs(tag, J, P, [(0.03, a, 0.09) for a in (-40, -14, 14, 40)], "bone", r=0.022, name="scalestud")
        mc.studs(tag, J, P, [(0.4, 0, 0.05)], "bone", r=0.03, name="topgem")

    def fins(self, J, tag):
        for side, sd in (("l", -1), ("r", 1)):
            sh, el, wr, _ = J["arms"][side]
            fd = (wr - el).normalized()
            out = (J["X"] * sd - fd * (J["X"] * sd).dot(fd)).normalized()
            a = lerp(el, wr, 0.3)
            flat_cone(tag + "armfin" + side, a, a + out * 0.26 - fd * 0.16, 0.11, "kit1", J["F"].cross(out), 0.25)
            knee, ankle = J["legs"][side][1:3]
            a = lerp(knee, ankle, 0.35)
            flat_cone(tag + "calffin" + side, a, a + J["B"] * 0.24 + UP * 0.1, 0.1, "kit1", J["X0"], 0.25)

    def fish_helm(self, J, tag):
        """Sleek fish helm: a tall swept dorsal fin, gill fins, big eyes and a row of teeth over the brow."""
        c, X, F, U, s, R = mc.head(J)
        big = (s[0] * 1.15, s[1] * 1.2, s[2] * 1.14)
        cap(tag + "fishhelm", c + U * 0.02, big, "kit2", (U * 0.8 - F * 0.55).normalized(), cut=-0.1, rot=R, thick=0.03)
        # dorsal fin: one tall swept blade with spines
        for i, (y, hgt) in enumerate(((0.45, 0.2), (0.1, 0.36), (-0.3, 0.44), (-0.65, 0.34))):
            z = math.sqrt(max(0.0, 1 - y * y))
            b = c + F * y * big[1] + U * z * big[2]
            flat_cone(tag + "dorsal%d" % i, b - U * 0.05 + F * 0.05, b + U * hgt - F * (0.14 + 0.1 * i), 0.13, "kit1", X, 0.22)
        for sd in (-1, 1):
            r2 = c + X * sd * s[0] * 1.02 + U * s[2] * 0.2
            flat_cone(tag + "gillfin%d" % sd, r2 + F * 0.06, r2 - F * 0.36 + U * 0.1 + X * sd * 0.2, 0.11, "kit1", X, 0.25)
            ball_at(tag + "fisheye%d" % sd, c + X * sd * s[0] * 0.8 + U * s[2] * 0.72 + F * s[1] * 0.6, 0.045, "eye_yellow")
        for i in range(5):                                   # upper jaw teeth over the brow
            x = (i - 2) * 0.42
            b = c + X * x * s[0] + F * s[1] * (1.12 - 0.12 * abs(x)) + U * s[2] * 0.42
            cone(tag + "jawtooth%d" % i, b + U * 0.02, b - U * 0.1 + F * 0.02, 0.03, "bone", 5)


@register
class PythonWarrior(looks.Fine, Biped):
    """Python: a great kit-coloured snake coiled round her body, its head reared over her off shoulder; long tail of hair."""
    key = "amazon_python"
    race = "human"
    sex = "f"
    knobs = dict(limb=0.9)
    layout = dict(AMZ, hair="long", tie="kit1", wraps="kit2", arm_band="kit1")
    stance = dict(lean=0, twist=-8, legs={"l": (8, 8, 4), "r": (-8, 8, 6)}, arms={"l": (-6, 30, 34, -10), "r": (34, 22, 96, -6)},
                  hands="open")
    height = 1.08

    def idle(self, ph, p, w):       # sways like a charmer while the snake's head weaves beside hers
        k = 1 if w["s1"] > 0 else -1
        p.update(twist=-8 + 5 * k, snake=w["s1"], snake2=w["c1"], look=-10 * w["s1"],
                 arms={"l": (-6, 30, 34, -10), "r": (34 + 10 * w["s2"], 22, 96, -6)})

    def details(self, J, P, L, tag, pose):
        k = L["limb"] * core.LIMB
        for side in ("l", "r") if L.get("arm_band") else ():          # gold rings round the upper arms
            sh, el = J["arms"][side][:2]
            tube(tag + "armring" + side, [lerp(sh, el, 0.3), lerp(sh, el, 0.36)], [0.11 * k, 0.11 * k], "gold", ref=J["F"], n=10)
        mc.studs(tag, J, P, [(0.4, 0, 0.05)], "gold", r=0.03, name="topgem")

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        mc.bandeau(tag, J, P, "kit1", trim="kit2")
        sh = P["sh_h"]
        sw, sw2 = pose.get("snake", 0.0), pose.get("snake2", 0.0)
        X, F, u = J["X"], J["F"], J["u"]
        # coil: tail at the right hip, twice round the waist and chest, over the back to the left shoulder
        path = [(0.02, 110), (0.08, 60), (0.13, 0), (0.18, -60), (0.22, -120), (0.26, 180), (0.3, 120), (0.33, 70), (0.36, 20),
                (0.4, -40), (0.45, -90)]
        pts = [surf(J, P, h, a, 0.06) for h, a in path]
        s0 = J["arms"]["l"][0]
        neck0 = s0 + u * 0.14 - J["B"] * -0.02
        up = act = mc.act(pose)
        rear = neck0 + u * (0.3 if not act else 0.2) - X * (0.1 + 0.07 * sw) + F * (0.06 + 0.08 * sw2)
        headp = rear + u * 0.12 + F * (0.2 + 0.06 * sw2) - X * 0.05 * sw
        pts += [neck0, rear, headp]
        n = len(pts)
        radii = [0.025 + 0.045 * min(1.0, i / 4.0) for i in range(n)]
        radii[-3:] = [0.07, 0.06, 0.055]
        tube(tag + "snake", pts, radii, "kit2", ref=u, n=8)
        hd = (headp - rear).normalized()
        sx = hd.cross(UP).normalized()
        ellipsoid(tag + "snakehead", headp + hd * 0.05, (0.085, 0.13, 0.055), "kit2", basis(sx, hd, sx.cross(hd) * -1), seg=10)
        for sd in (-1, 1):
            ball_at(tag + "snakeeye%d" % sd, headp + hd * 0.08 + sx * sd * 0.06 + UP * 0.03, 0.025, "eye_yellow")
        for i in (1, 3, 5, 7, 9, 11):                         # kit1 saddle markings along the coils
            if i < n - 1:
                ball_at(tag + "snakemark%d" % i, lerp(pts[i], pts[i + 1], 0.5) + (lerp(pts[i], pts[i + 1], 0.5) - (J["pelvis"] + u * 0.25)).normalized() * 0.035,
                        radii[i] * 0.8, "kit1")
        c, Xh, Fh, U, s, R = mc.head(J)
        mc.headband(tag, J, "kit2", tails=0)
        ball_at(tag + "browgem", c + Fh * s[1] * 1.12 + U * s[2] * 0.42, 0.04, "kit1")
        sandal_straps(tag, J, L)
