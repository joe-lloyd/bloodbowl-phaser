"""Bretonian (bret_squire, bret_catcher, bret_thrower, grail_knight): knightly heraldry in our own style.
The squire is a hooded peasant lad; the knights differ by helm, surcoat cut and build. Empty hands always."""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts, looks
from lib.core import tube, tband, ball_at, box, lerp, UP, basis, D, ellipsoid, cap, cone, flat_cone, surf
from teams import men_common as mc


@register
class Squire(looks.Fine, Biped):
    """Peasant lad: pointed hood with a long tail and scalloped shoulder cape, patched tunic, bare shins; eager."""
    key = "bret_squire"
    race = "human"
    knobs = dict(limb=0.9, torso=0.95, shoulders=0.95, head=1.04)
    layout = dict(skin="skin_fair", torso="rags", arms="rags", legs="skin_fair", boots="leather", cuff=None, coat="gambeson",
                  coat_mat="rags", hem="kit2", belt="rope", buckle=None, helm="hood", hood_mat="kit1", wraps="bandage",
                  arm_band="kit2", hoodcape=True)
    stance = dict(lean=8, legs={"l": (8, 10, 12), "r": (-6, 10, 12)}, arms={"l": (24, 22, 80, 4), "r": (24, 22, 80, 4)},
                  hands="fist")
    stride, arm_swing, jump = 40, 34, 0.24
    height = 1.04

    def idle(self, ph, p, w):       # eager and fidgety: hops from foot to foot (two states), wipes his nose on a sleeve
        k = 1 if w["s2"] > 0 else -1
        up = w["up"]
        p.update(legs={"l": (8, 10, 12 + 8 * k), "r": (-6, 10, 12 - 8 * k)},
                 arms={"l": (24, 22, 80, 4), "r": (24 + 60 * up, 22 - 10 * up, 80 + 50 * up, 4 - 30 * up)}, nod=-8 * up)

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        sh = P["sh_h"]
        if L.get("hoodcape"):
            tband(tag + "hoodcape", J, P, [sh + 0.1, sh + 0.03, sh - 0.08, sh - 0.17], "kit1", k=1.05, add=0.11, jag=0.45, solid=0.04,
                  n=16)
            tband(tag + "hoodedge", J, P, [sh + 0.115, sh + 0.07], "kit2", k=1.0, add=0.09, solid=0.03)
        if L.get("strawhat"):
            mc.brim_hat(tag, J, "rope", brim=1.7, crown=0.55, band="kit2", tilt=8, sit=0.4)
        for side in ("l", "r"):
            mc.legging(tag, J, L, side, "rags", 0.0, 0.42, grow=1.1, name="breech")
        p = surf(J, P, 0.25, 30, 0.03)
        box(tag + "patch", p, (0.1, 0.03, 0.1), "kit2", basis(J["X"], J["F"], J["u"]))

    def details(self, J, P, L, tag, pose):
        R = basis(J["X"], J["F"], J["u"])
        box(tag + "patch2", surf(J, P, 0.12, -40, 0.04), (0.08, 0.03, 0.07), "kit1", R)
        box(tag + "patch3", surf(J, P, 0.3, 160, 0.04), (0.1, 0.03, 0.09), "kit2", R)
        mc.studs(tag, J, P, [(0.04, -20, 0.08)], "rope", r=0.035, name="ropeknot")
        mc.pouch(tag, J, P, ang=55, mat="rags", flap="kit1")


@register
class KnightCatcher(looks.Fine, Biped):
    """Light knight: open helm with long streaming mantling, mail sleeves, long halved surcoat, reaching hands."""
    key = "bret_catcher"
    race = "human"
    knobs = dict(legs=1.1, limb=0.88, shoulders=0.95, torso=0.92)
    layout = dict(skin="skin_fair", torso="mail", arms="mail", legs="mail", boots="boot", cuff="kit2", helm="open", belt="leather",
                  gorget=True, bracers="kit2", kneecops=True, knee_mat="metal", mantle=True, surcoat="halved")
    stance = dict(lean=8, legs={"l": (14, 8, 14), "r": (-12, 8, 10)}, feet={"r": 16}, arms={"l": (40, 20, 60, 4), "r": (30, 22, 70, 4)},
                  hands="open")
    stride, arm_swing, run_lean, jump = 44, 38, 18, 0.26
    height = 1.08

    def idle(self, ph, p, w):       # shades his eyes with one hand and scans downfield, mantling stirring
        up = w["up"]
        p.update(arms={"l": (40 - 20 * up, 20, 60, 4), "r": (30 + 100 * up, 22 + 14 * up, 70 + 62 * up, 4 - 40 * up)},
                 look=-26 * w["s1"], hand_modes={"r": "open"}, mantle=0.06 * w["s2"])

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("surcoat") == "halved":
            mc.halves(tag, J, P, "kit1", "kit2")
            fl = pose.get("flare", 0.06)
            mc.split_panel(tag, J, P, True, 0.5, 0.15, "kit2", "kit1", fl)
            mc.split_panel(tag, J, P, False, 0.52, 0.16, "kit1", "kit2", fl)
        if L.get("mantle"):
            self.mantling(J, tag, pose)

    def details(self, J, P, L, tag, pose):
        mc.studs(tag, J, P, [(0.07, a, 0.09) for a in (-24, 24)], "gold", r=0.024, name="beltstud")
        mc.pouch(tag, J, P, ang=-70)

    def mantling(self, J, tag, pose):
        """A long cloth from the helm crown, with a twisted kit-coloured torse round the helm."""
        c, X, F, U, s, R = mc.head(J)
        cap(tag + "torse", c + U * 0.02, (s[0] * 1.22, s[1] * 1.22, s[2] * 1.2), "kit2", U, cut=0.5, hi=0.72, rot=R, thick=0.045)
        a = c - F * s[1] * 0.9 + U * s[2] * 0.7
        sw = pose.get("mantle", 0.0)
        if mc.act(pose):
            pts = [a, a - F * 0.35 + U * 0.1, a - F * 0.75 + U * 0.02, a - F * 1.15 + U * 0.1]
        else:
            pts = [a, a - F * 0.22 - U * 0.1, a - F * (0.3 + sw) - U * 0.5, a - F * (0.24 + 2 * sw) - U * 0.95]
        tube(tag + "mantling", pts, [0.1, 0.16, 0.17, 0.06], "kit1", ref=X, n=8, flat=0.35)
        ball_at(tag + "finial", c + U * s[2] * 1.22, 0.06, "gold")


@register
class KnightThrower(looks.Fine, Biped):
    """Bascinet with the pointed visor lifted, one plate shoulder on the off side, baldric, quartered chest."""
    key = "bret_thrower"
    race = "human"
    knobs = dict(limb=1.0, shoulders=1.04)
    layout = dict(skin="skin_fair", torso="mail", arms="mail", legs="kit1", boots="boot", cuff="kit2", belt="leather", gorget=True,
                  pads="plate", pad_sides=("l",), pad_mat="metal", pad_trim="kit2", gauntlets=True, hair=None,
                  beard="hair", beard_len=0.25, tabard="kit1", tabard_trim="kit2", pant_stripe="kit2", bascinet=True)
    stance = dict(lean=0, twist=-10, legs={"l": (10, 9, 6), "r": (-8, 9, 4)}, arms={"l": (6, 26, 30, 0), "r": (30, 24, 100, -6)},
                  hands="relaxed")
    height = 1.08

    def idle(self, ph, p, w):       # loosens his throwing arm with a slow overhead circle, off arm steady
        a = w["a"]
        p.update(arms={"l": (6, 26, 30, 0), "r": (70 + 80 * math.sin(a), 26 + 10 * w["c1"], 60 + 40 * w["c1"], -6)},
                 hand_modes={"r": "open"}, twist=-10 + 8 * w["s1"])

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        sh = P["sh_h"]
        # quartered jupon: kit1 / kit2 swap sides above and below the chest
        mc.halves(tag, J, P, "kit1", "kit2", hs=[0.3, 0.4, sh, sh + 0.04], name="qtop")
        mc.halves(tag, J, P, "kit2", "kit1", hs=[0.08, 0.2, 0.3], name="qbot")
        mc.sash(tag, J, P, "leather", side=-1, r=0.04, name="baldric")
        tband(tag + "aventail", J, P, [sh + 0.13, sh + 0.05, sh - 0.03], "mail", k=1.0, add=0.07, solid=0.03)
        if L.get("bascinet"):
            self.bascinet(J, tag, pose)

    def details(self, J, P, L, tag, pose):
        mc.studs(tag, J, P, [(P["sh_h"] - 0.12, -30, 0.06), (0.2, 24, 0.06)], "gold", r=0.024, name="baldricstud")
        mc.studs(tag, J, P, [(0.36, 0, 0.05)], "gold", r=0.03, name="jupongem")

    def bascinet(self, J, tag, pose):
        """Bascinet with the pointed visor swung up, and a kit2 pennon ribbon from its point."""
        c, X, F, U, s, R = mc.head(J)
        big = (s[0] * 1.15, s[1] * 1.15, s[2] * 1.18)
        cap(tag + "bascinet", c + U * 0.02, big, "metal", (U * 0.75 - F * 0.5).normalized(), cut=-0.2, rot=R, thick=0.025)
        cone(tag + "bascpoint", c + U * s[2] * 0.95 - F * 0.05, c + U * s[2] * 1.5 - F * 0.14, s[0] * 0.55, "metal", 8)
        # visor swung up over the brow: a pointed snout aimed forward and up
        v = c + U * s[2] * 0.8 + F * s[1] * 0.6
        cone(tag + "visor", v - F * 0.08 - U * 0.02, v + F * 0.36 + U * 0.2, s[0] * 0.62, "metal", 8)
        for sd in (-1, 1):
            ball_at(tag + "pivot%d" % sd, c + X * sd * big[0] * 0.98 + U * s[2] * 0.25, 0.045, "gold")
        # small kit2 pennon ribbon from the bascinet point
        t = c + U * s[2] * 1.5 - F * 0.14
        tip = t - F * (0.5 if mc.act(pose) else 0.3) - U * (0.0 if mc.act(pose) else 0.22)
        flat_cone(tag + "ribbon", t, tip, 0.09, "kit2", X, 0.3)


@register
class GrailKnight(looks.Fine, Biped):
    """The shining champion: crowned great helm under a tall feather fan, full plate, long surcoat and cloak."""
    key = "grail_knight"
    race = "human"
    knobs = dict(shoulders=1.22, limb=1.16, torso=1.1)
    layout = dict(skin="skin_fair", torso="kit1", arms="metal", legs="metal", boots="boot", coat="frock", coat_mat="kit1", hem="kit2",
                  breast="metal", gorget=True, pads="big", pad_mat="metal", pad_trim="gold", gauntlets=True, greaves=True,
                  kneecops=True, belt="kit2", cape="long", cape_mat="kit2", cape_lining="kit1", visor=True, hair=None,
                  emblem_mat="kit2", great=True)
    stance = dict(lean=0, legs={"l": (5, 14, 4), "r": (-4, 14, 4)}, arms={"l": (4, 30, 40, -10), "r": (4, 30, 40, -10)},
                  hands="fist")
    stride, arm_swing, jump = 34, 26, 0.14
    height = 1.1

    def idle(self, ph, p, w):       # the vow: lays a fist over his heart and bows the great helm, cloak stirring
        up = w["up"]
        p.update(arms={"l": (4, 30, 40, -10), "r": (4 + 44 * up, 30 - 18 * up, 40 + 76 * up, -10 - 50 * up)},
                 nod=-16 * up, cape=0.05 + 0.05 * w["s2"])

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        if L.get("great"):
            self.great_helm(J, tag)
        # halved heraldic chest badge over the breastplate
        p = surf(J, P, 0.4, 0, 0.1)
        Rc = basis(J["X"], J["F"], J["u"])
        box(tag + "badge1", p - J["X"] * 0.05, (0.1, 0.03, 0.16), "kit1", Rc)
        box(tag + "badge2", p + J["X"] * 0.05, (0.1, 0.03, 0.16), "kit2", Rc)

    def details(self, J, P, L, tag, pose):
        mc.studs(tag, J, P, [(h, a, 0.08) for h in (0.12, 0.22) for a in (-34, 34)], "gold", r=0.022, name="rivet")
        mc.studs(tag, J, P, [(0.4, 0, 0.13)], "gold", r=0.03, name="badgeboss")

    def great_helm(self, J, tag):
        """Crowned great helm with a cross on the face plate, under a tall feather fan."""
        c, X, F, U, s, R = mc.head(J)
        r = s[0] * 1.2
        lo, hi = c - U * s[2] * 0.95, c + U * s[2] * 0.95
        parts.cylinder(tag + "greathelm", lo, hi, r, "metal", seg=12)
        ellipsoid(tag + "helmtop", hi, (r, r, 0.06), "metal", R, seg=12)
        parts.cylinder(tag + "crown", hi - U * 0.1, hi + U * 0.02, r * 1.07, "gold", seg=12)
        for i in range(6):
            a = D(60 * i + 30)
            o = (X * math.sin(a) + F * math.cos(a)) * r * 1.05
            cone(tag + "crownpt%d" % i, hi + o - U * 0.02, hi + o * 1.05 + U * 0.14, 0.05, "gold", 5)
        box(tag + "slit", c + F * r * 0.98 + U * s[2] * 0.15, (r * 1.5, 0.06, 0.045), "socket", R)
        box(tag + "cross", c + F * r * 0.98 - U * s[2] * 0.2, (0.05, 0.07, s[2] * 1.4), "gold", R)
        mc.crest_fan(tag, J, ("kit2", "kit1"), n=5, h=0.5, spread=42, base=0.98, r=0.085)
