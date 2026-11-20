"""Gnome team (small-folk batch): gnome_lineman, gnome_illusionist, gnome_beastmaster, woodland_fox.

Costume idea: hedgerow folk. The hat is the position: a tall bent cone for the Lineman, a wide-brimmed
starry wizard hat for the Illusionist, a fur cap with antlers for the Beastmaster. The fox wears the team
bandana."""
import math
from mathutils import Vector, Matrix
from lib import Biped, Quadruped, register, core, parts
from lib.core import tube, tband, ball_at, box, cone, flat_cone, ellipsoid, cap, sheet, lerp, UP, basis, D
from teams import small_folk_common as sf

GNOME = dict(skin="skin_fair", boots="boot", cuff="leather", belt="leather", hair=None)


@register
class GnomeLineman(Biped):
    """Garden-variety gnome: tall bent cone hat, white beard to the belt, thumbs hooked in a wide belt."""
    key = "gnome_lineman"
    race = "gnome"
    knobs = dict(belly=1.2, feet=1.2)
    layout = dict(GNOME, torso="kit2", arms="kit2", legs="trouser", sleeve_cuff="kit1", beard_len=1.0)
    stance = dict(lean=-2, legs={"l": (5, 16, 6), "r": (-4, 16, 6)}, arms={"l": (0, 40, 96, -40), "r": (0, 40, 96, -40)},
                  hands="fist")
    stride, arm_swing, jump = 36, 32, 0.2

    def idle(self, ph, p, w):       # rocks on his heels with his thumbs in his belt; the hat tip nods after him
        k = 1 if w["s1"] > 0 else -1
        p.update(lean=-2 + 4 * k, feet={"l": -8 * k, "r": -8 * k}, look=14 * w["c1"], _tip=0.12 * k)

    def extras(self, J, P, L, tag, pose):
        sf.pointy_hat(J, tag, "kit1", band="kit2", h=0.72, bend=0.3 + pose.get("_tip", 0.0), r=1.1, brim=1.25, tip=None)
        sf.long_nose(J, L, tag, ln=0.1, r=0.07, droop=0.01, mat="skin_fair")
        tband(tag + "hem", J, P, [0.0, 0.06], "kit1", k=1.06, add=0.012, solid=0.03)


@register
class GnomeIllusionist(Biped):
    """Tall for a gnome: long robe, wide-brimmed wizard hat spangled with gold stars, beard to his knees,
    a star-topped staff in his off hand; the other hand trails sparks."""
    key = "gnome_illusionist"
    race = "gnome"
    knobs = dict(legs=0.6, torso_len=0.85, limb=0.85, torso=0.9)
    layout = dict(GNOME, torso="kit1", arms="kit1", coat="robe", coat_mat="kit1", robe_len=0.5, robe_lining="kit2", hem="kit2",
                  sleeve_cuff="kit2", belt="rope", buckle=None, beard_len=1.7, legs="kit1")
    stance = dict(lean=0, legs={"l": (4, 8, 5), "r": (-3, 8, 5)}, arms={"l": (30, 26, 60, 0), "r": (40, 24, 70, -6)},
                  hands="fist")
    stride, arm_swing, jump = 30, 14, 0.16

    def idle(self, ph, p, w):       # conjures: lifts an open palm while sparks circle above it
        p.update(arms={"l": (30, 26, 60, 0), "r": (60 + 14 * w["breath"], 24, 74, -6)}, hand_modes={"r": "open"},
                 _spark=ph, nod=-4 * w["breath"])

    def adjust(self, name, i, pose):
        if name != "fall":          # the staff arm stays put so the staff does not flail
            a = dict(pose["arms"])
            a["l"] = (30, 26, 60, 0) if name != "cheer" else (120, 20, 30, 0)
            pose["arms"] = a
            pose["hand_modes"] = dict(pose.get("hand_modes", {}), l="fist")
        if name in ("block", "cheer"):
            pose["_spark"] = i / 8.0
        return pose

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s = sf.hf(J)
        pts = sf.pointy_hat(J, tag, "kit2", band="kit1", h=0.95, bend=0.38, r=1.12, brim=1.75, brim_mat="kit2")
        for i, (t, a) in enumerate(((0.12, 20), (0.3, -70), (0.3, 110), (0.5, 180), (0.52, 30))):      # stars
            ctr = lerp(pts[0], pts[-1], t)
            rr = s[0] * 1.12 * (1 - t * 0.95) + 0.02
            d = X * math.sin(D(a)) + F * math.cos(D(a))
            box(tag + "star%d" % i, ctr + d * rr, (0.085, 0.085, 0.085), "gold", Matrix.Rotation(D(45), 3, d) @ J["head_R"])
        sf.long_nose(J, L, tag, ln=0.1, r=0.06, droop=0.01, mat="skin_fair")
        # staff with a gold star (five flat points)
        parts.rod(J, "l", tag, length=1.25, r=0.03, mat="wood")
        c0, d, n, t = J["grip_l"]
        top = c0 - n * 0.05 + t * 1.25 * 0.75
        for k in range(5):
            a = 2 * math.pi * k / 5
            dd = t * math.cos(a) + d * math.sin(a)
            flat_cone(tag + "stpt%d" % k, top + t * 0.1, top + t * 0.1 + dd * 0.2, 0.075, "gold", n, squash=0.35)
        if "_spark" in pose and abs(pose.get("pitch", 0)) < 1:
            hnd = J["arms"]["r"][3] + UP * 0.16
            for k in range(3):
                a = 2 * math.pi * (pose["_spark"] + k / 3.0)
                q = hnd + Vector((math.cos(a) * 0.15, math.sin(a) * 0.15, 0.06 * k + 0.05 * math.sin(a * 2)))
                box(tag + "spark%d" % k, q, (0.055, 0.055, 0.055), "fire" if k % 2 else "gold",
                    Matrix.Rotation(D(45), 3, Vector((0, 1, 0))))


@register
class GnomeBeastmaster(Biped):
    """Stocky woodsman: fur cap with a pair of antlers, shaggy fur mantle, brown beard, a whistle on a cord."""
    key = "gnome_beastmaster"
    race = "gnome"
    knobs = dict(shoulders=1.2, torso=1.15, limb=1.1)
    layout = dict(GNOME, torso="kit1", arms="kit1", legs="kit2", arm_band="kit2", bracers="leather", beard="hair_brown",
                  brow="hair_brown", beard_len=0.7, cape="short", cape_mat="fur_brown", cape_lining="fur_brown", neckband="kit2")
    stance = dict(lean=6, legs={"l": (6, 16, 10), "r": (-5, 16, 10)}, arms={"l": (10, 30, 40, 0), "r": (10, 30, 40, 0)},
                  hands="fist")
    stride, arm_swing, jump = 34, 28, 0.16
    height = 1.05

    def idle(self, ph, p, w):       # puts the whistle to his lips and blows two blasts, then looks for the fox
        blow = w["breath"]
        p.update(arms={"l": (10, 30, 40, 0), "r": ((84, 10, 132, -30) if blow else (10, 30, 40, 0))},
                 look=(0 if blow else 26 * w["s1"]), nod=-6 * blow, _whistle=blow)

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s = sf.hf(J)
        R = J["head_R"]
        cap(tag + "furcap", c + U * 0.02, (s[0] * 1.2, s[1] * 1.2, s[2] * 1.16), "fur_brown", U, cut=0.2, rot=R, thick=0.05)
        cap(tag + "furcaprim", c + U * 0.02, (s[0] * 1.3, s[1] * 1.3, s[2] * 1.2), "kit2", U, cut=0.2, hi=0.42, rot=R, thick=0.04)
        for sd in (-1, 1):           # antlers: main beam and two tines
            r0 = c + X * sd * s[0] * 0.7 + U * s[2] * 0.85
            r1 = r0 + X * sd * 0.2 + U * 0.22
            r2 = r1 + X * sd * 0.08 + U * 0.26
            tube(tag + "antler%d" % sd, [r0, r1, r2], [0.05, 0.04, 0.02], "bone", n=5)
            tube(tag + "tine%da" % sd, [r1, r1 + X * sd * 0.2 + U * 0.1], [0.035, 0.015], "bone", n=5)
            tube(tag + "tine%db" % sd, [lerp(r0, r1, 0.5), lerp(r0, r1, 0.5) + F * 0.16 + U * 0.1], [0.035, 0.015], "bone", n=5)
            sh = J["arms"]["l" if sd < 0 else "r"][0]      # shaggy shoulders
            for j, (dx, dz) in enumerate(((0.0, 0.07), (0.1, 0.0), (-0.08, 0.03))):
                ball_at(tag + "shag%d%d" % (sd, j), sh + J["X"] * sd * dx + UP * dz - J["F"] * 0.03 * j, 0.12, "fur_brown")
        sf.long_nose(J, L, tag, ln=0.1, r=0.07, droop=0.01, mat="skin_fair")
        tband(tag + "hem", J, P, [0.0, 0.06], "kit2", k=1.06, add=0.012, solid=0.03)
        if not pose.get("_whistle"):       # the whistle hangs on its cord when it is not at his lips
            k = core.surf(J, P, P["sh_h"] * 0.55, 10, 0.05)
            parts.cylinder(tag + "whistle", k + UP * 0.06, k - UP * 0.06, 0.035, "metal", seg=6)
        else:
            g = J["grip_r"][0]
            parts.cylinder(tag + "whistle", g, g + J["head_R"].col[1] * 0.02 + UP * 0.12, 0.035, "metal", seg=6)


@register
class WoodlandFox(Quadruped):
    """A lean red fox with black socks, a white bib and tail tip, wearing the team bandana and a chest harness.
    Head-on it reads wide: big flared ears, white cheek ruffs, a bandana spread across the chest and a bushy
    brush that curls out to one side instead of standing up behind the head."""
    key = "woodland_fox"
    body = (0.9, 0.2)
    leg_len, leg_r = 0.36, 0.05
    skin = "fur_red"
    belly_mat = "white"
    paw_mat = "fur_black"
    head = dict(snout=(1.35, 0.62), ears="none", nose_mat="socket", eye_mat="eye_yellow")
    head_size = 0.19
    tail = None                     # drawn in extras(): a side-curling brush
    coat, collar = None, "kit1"
    height = 1.02

    def idle(self, ph, p, w):       # alert: ears up, one forepaw lifted, brush swishing; sniffs the air in two states
        p.update(nod=-12 * w["breath"], tail=w["s1"], legs4=(34 * w["up"], 0, 0, 0), jaw=8 + 14 * w["dn"])

    def extras(self, J, tag, pose, c):
        ln, r = self.body
        X, F, B = J["X"], J["F"], J["B"]
        # saddle cloth reaches well down both flanks (wider frontal read); secondary straps fore and aft
        core.loft(tag + "harness", [(c + B * (ln * t), X, UP, r * 1.12, r * 1.12) for t in (-0.22, -0.1)], "kit2", n=12,
                  caps=False, subsurf=1, solidify=0.035)
        core.loft(tag + "saddle", [(c + B * (ln * t), X, UP, r * k, r * 1.1) for t, k in ((-0.1, 1.3), (0.06, 1.38), (0.22, 1.3))],
                  "kit1", n=12, arc=(-118, 118), caps=False, subsurf=1, solidify=0.035)
        core.loft(tag + "girth", [(c + B * (ln * t), X, UP, r * 1.36, r * 1.12) for t in (0.22, 0.3)], "kit2", n=12,
                  arc=(-120, 120), caps=False, subsurf=1, solidify=0.035)
        # bandana: a wide triangle spread over the chest, knotted at the collar, with secondary knot ends
        neck = c + F * ln * 0.5 + UP * r * 0.3
        k = neck + F * 0.15 - UP * 0.02
        core.loft(tag + "bandana", [(k + UP * 0.07 - F * 0.02, X, F, 0.2, 0.06), (k - UP * 0.08 + F * 0.04, X, F, 0.17, 0.05),
                                    (k - UP * 0.24 + F * 0.07, X, F, 0.03, 0.02)], "kit1", n=12, arc=(-100, 100), caps=False,
                  subsurf=1, solidify=0.03)
        for sd in (-1, 1):
            kn = k + X * sd * 0.17 + UP * 0.06
            flat_cone(tag + "bknot%d" % sd, kn, kn + X * sd * 0.12 - UP * 0.08 - B * 0.04, 0.05, "kit2", F, squash=0.35)
        # big flared fox ears with black tips and cheek ruffs: widen the head-on silhouette
        c0, Xh, Fh, Uh, s = parts.head_frame(J)
        for sd in (-1, 1):
            root = c0 + Xh * sd * s[0] * 0.62 + Uh * s[2] * 0.5 - Fh * 0.02
            tip = root + (Xh * sd * 0.27 + Uh * 0.26 + Fh * 0.03)
            flat_cone(tag + "ear%d" % sd, root - Uh * 0.05, tip, 0.14, "fur_red", Fh, squash=0.3)
            flat_cone(tag + "earin%d" % sd, root + Fh * 0.03, lerp(root, tip, 0.7) + Fh * 0.03, 0.06, "white", Fh, squash=0.2)
            cone(tag + "eartip%d" % sd, lerp(root, tip, 0.75), tip + (tip - root) * 0.05, 0.045, "fur_black", 5)
            ch = c0 + Xh * sd * s[0] * 0.95 - Uh * s[2] * 0.3 + Fh * s[1] * 0.2
            flat_cone(tag + "ruff%d" % sd, ch - Xh * sd * 0.05, ch + Xh * sd * 0.13 - Uh * 0.06 - Fh * 0.03, 0.07, "white", Fh, squash=0.4)
        # bushy brush curling out to the right side and round towards the front; sways with pose["tail"]
        sw = pose.get("tail", 0.0)
        Bh = Vector((B.x, B.y, 0)).normalized()
        base = c + B * ln * 0.5 + UP * r * 0.15
        pts = [base, base + Bh * 0.22 - UP * 0.12 + X * 0.06,
               base + Bh * 0.36 - UP * 0.14 + X * (0.28 + 0.05 * sw),
               base + Bh * (0.28 - 0.06 * sw) - UP * 0.04 + X * (0.52 + 0.05 * sw),
               base + Bh * (0.06 - 0.08 * sw) + UP * 0.1 + X * (0.6 + 0.04 * sw)]
        tube(tag + "tail", pts, [0.07, 0.13, 0.15, 0.12, 0.05], "fur_red", ref=UP, n=10)
        ball_at(tag + "tailtip", pts[-1] + UP * 0.02, 0.09, "white")
