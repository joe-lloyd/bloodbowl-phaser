"""Norse (berserker, norse_raider, valkyrie, ulfwerener, yhetee, beer_boar): northern raiders in furs.
Each position has its own head and build: wild mane, horned cap, winged helm, wolf head, horned snow
beast, and a little boar carrying a keg. Hands are always empty."""
import math
from mathutils import Vector, Matrix
from lib import Biped, Quadruped, register, core, parts
from lib.core import tube, tband, ball_at, box, lerp, UP, basis, D, ellipsoid, cap, cone, flat_cone, surf
from teams import men_common as mc


def fur_boots(tag, J, L, mat="fur_brown"):
    """Shaggy fur wrapped round the shins."""
    for side in ("l", "r"):
        mc.legging(tag, J, L, side, mat, 0.6, 0.9, grow=1.5, name="furboot")
        knee, ankle = J["legs"][side][1:3]
        for i, o in enumerate((J["X"], -J["X"], J["B"])):
            p = lerp(knee, ankle, 0.3)
            cone(tag + "furtuft%s%d" % (side, i), p + o * 0.07 + UP * 0.05, p + o * 0.17 - UP * 0.06, 0.06, mat, 5)


def warpaint(tag, J, P, mat, n=3):
    """Slanted stripes of paint across the bare chest and the back."""
    for i in range(n):
        h = 0.2 + 0.1 * i
        for nm, a0, a1 in (("f", -38, 30), ("b", 150, 215)):
            tube(tag + "paint%s%d" % (nm, i), [surf(J, P, h + 0.05, a0, 0.022), surf(J, P, h + 0.02, (a0 + a1) / 2, 0.026),
                                               surf(J, P, h - 0.02, a1, 0.022)], [0.026] * 3, mat, ref=J["u"], n=5, flat=0.5)


@register
class Berserker(Biped):
    """Bare-chested and wild: huge spiky red mane and forked beard, war paint, kilt, wrapped fists; roars."""
    key = "berserker"
    race = "human"
    knobs = dict(shoulders=1.16, limb=1.1, torso=1.04, arm=1.1)
    layout = dict(skin="skin_fair", torso="skin_fair", arms="skin_fair", legs="skin_fair", hair="swept", hair_mat="hair_red",
                  brow="hair_red", beard="hair_red", beard_len=0.9, boots="leather", cuff=None, belt="leather", buckle="gold",
                  loin="kit1", loin_trim="kit2", wraps="kit2", arm_band="kit1")
    stance = dict(lean=12, legs={"l": (14, 16, 22), "r": (-12, 16, 18)}, arms={"l": (10, 44, 70, -10), "r": (10, 44, 70, -10)},
                  hands="fist", jaw=20)
    stride, arm_swing, run_lean, jump = 42, 40, 20, 0.26
    height = 1.06

    def idle(self, ph, p, w):       # works himself up: pounds his chest with alternate fists, then throws his head back
        a, b = max(0.0, w["s2"]), max(0.0, -w["s2"])
        p.update(arms={"l": (10 + 30 * a, 44 - 30 * a, 70 + 50 * a, -10 - 40 * a),
                       "r": (10 + 30 * b, 44 - 30 * b, 70 + 50 * b, -10 - 40 * b)},
                 nod=14 * w["up"], lean=12 - 8 * w["breath"])

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s, R = mc.head(J)
        act = mc.act(pose)
        # mane: a ring of long spikes round the crown, swept back when he runs
        for i, (ax, ay, ln) in enumerate(((0, 0.3, 0.3), (-0.6, 0.0, 0.34), (0.6, 0.0, 0.34), (-0.9, -0.5, 0.36), (0.9, -0.5, 0.36),
                                          (0, -0.5, 0.42), (-0.5, -1.0, 0.4), (0.5, -1.0, 0.4), (0, -1.1, 0.46))):
            b = c + X * ax * s[0] * 0.8 + F * ay * s[1] * 0.7 + U * s[2] * 0.6
            d = (X * ax * 0.7 + F * (ay * 0.5 - (0.9 if act else 0.25)) + U * (0.5 if act else 1.0)).normalized()
            cone(tag + "mane%d" % i, b - d * 0.04, b + d * ln, 0.085, "hair_red", 6)
        # beard forks
        for sd in (-1, 1):
            b = c - U * s[2] * 1.3 + F * s[1] * 0.6 + X * sd * 0.05
            cone(tag + "fork%d" % sd, b, b - U * 0.3 + X * sd * 0.12 + F * 0.06, 0.06, "hair_red", 6)
        warpaint(tag, J, P, "kit1")
        mc.tooth_necklace(tag, J, P, n=5)
        tband(tag + "kiltband", J, P, [-0.07, 0.0, 0.08], "kit1", k=1.08, add=0.015, solid=0.03)
        for side in ("l", "r"):
            mc.legging(tag, J, L, side, "kit1", 0.0, 0.2, grow=1.12, name="kilt")
            mc.legging(tag, J, L, side, "kit2", 0.18, 0.225, grow=1.16, name="kilthem")
        fur_boots(tag, J, L)


@register
class Raider(Biped):
    """Fur-wrapped lineman: iron cap with two short horns, heavy fur mantle, quilted tunic, drinking horn on the belt."""
    key = "norse_raider"
    race = "human"
    knobs = dict(torso=1.1, belly=1.15, limb=1.06, shoulders=1.06)
    layout = dict(skin="skin_fair", torso="kit1", arms="shirt", legs="rags", coat="gambeson", hem="kit2", belt="leather",
                  helm="skull", bracers="leather", boots="boot", cuff=None, beard="hair_blond", beard_len=0.7,
                  brow="hair_blond", hair=None, arm_band="kit2", pant_stripe="kit2")
    stance = dict(lean=2, legs={"l": (5, 13, 6), "r": (-4, 13, 6)}, arms={"l": (8, 30, 40, -6), "r": (8, 30, 40, -6)},
                  hands="fist")
    stride, arm_swing, jump = 35, 28, 0.16
    height = 1.0

    def idle(self, ph, p, w):       # a little drunk: sways from side to side in two states and wipes his mouth
        k = 1 if w["s1"] > 0 else -1
        up = max(0.0, w["s2"])
        p.update(roll=4 * k, look=-12 * k, legs={"l": (5, 13 + 3 * k, 6), "r": (-4, 13 - 3 * k, 6)},
                 arms={"l": (8, 30, 40, -6), "r": (8 + 62 * up, 30 - 14 * up, 40 + 86 * up, -6 - 34 * up)})

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s, R = mc.head(J)
        for sd in (-1, 1):          # short straight horns from the cap, and a nasal bar
            b = c + X * sd * s[0] * 0.95 + U * s[2] * 0.55
            tube(tag + "caphorn%d" % sd, [b, b + X * sd * 0.14 + U * 0.1, b + X * sd * 0.2 + U * 0.3], [0.065, 0.05, 0.015], "bone", n=6)
            ball_at(tag + "caphornboss%d" % sd, b, 0.06, "kit2")
        tube(tag + "nasal", [c + F * s[1] * 1.12 + U * s[2] * 0.55, c + F * s[1] * 1.16 - U * s[2] * 0.15], [0.035, 0.025], "metal", n=6,
             flat=0.5)
        cap(tag + "capband", c + U * 0.02, (s[0] * 1.2, s[1] * 1.2, s[2] * 1.18), "kit2", U, cut=0.22, hi=0.4, rot=R, thick=0.03)
        mc.fur_mantle(tag, J, P, "fur_brown", drop=0.2, add=0.12)
        ball_at(tag + "brooch", surf(J, P, P["sh_h"] - 0.08, 0, 0.15), 0.05, "kit2")
        fur_boots(tag, J, L)
        # drinking horn hanging at the hip (curved, pointed, with a kit2 rim): slung, never held
        h0 = surf(J, P, 0.04, -80, 0.07)
        tube(tag + "dhorn", [h0, h0 - UP * 0.14 + J["B"] * 0.05, h0 - UP * 0.26 + J["B"] * 0.16, h0 - UP * 0.3 + J["B"] * 0.3],
             [0.07, 0.06, 0.04, 0.012], "bone", n=6)
        tube(tag + "dhornrim", [h0 + UP * 0.02, h0 - UP * 0.03], [0.078, 0.078], "kit2", n=6)
        mc.sash(tag, J, P, "leather", side=1, r=0.035, name="hornstrap", full=False)


@register
class Valkyrie(Biped):
    """Shield-maiden: tall feathered wings on her helm, two long blond braids, scale corselet, split skirt, bare arms."""
    key = "valkyrie"
    race = "human"
    sex = "f"
    knobs = dict(legs=1.06, limb=0.96)
    layout = dict(skin="skin_fair", torso="kit1", arms="skin_fair", legs="skin_fair", hair=None, brow="hair_blond", lip="lip_h",
                  helm="skull", trim="gold", breast="metal", emblem_mat="kit2", belt="kit2", buckle="gold", bracers="metal",
                  arm_band="kit2", boots="boot", cuff=None, greaves=True, loin="kit1", loin_trim="kit2", neckband="kit2",
                  cape="short", cape_mat="kit2", cape_lining="kit1")
    stance = dict(lean=0, twist=8, legs={"l": (8, 9, 4), "r": (-8, 9, 6)}, arms={"l": (-16, 36, 62, -50), "r": (20, 20, 60, 0)},
                  hands="relaxed")
    stride, arm_swing, jump = 40, 34, 0.26
    height = 1.02

    def idle(self, ph, p, w):       # one fist on her hip; raises the other arm to point the way, braids and cape stirring
        up = w["up"]
        p.update(arms={"l": (-16, 36, 62, -50), "r": (20 + 86 * up, 20 - 4 * up, 60 - 50 * up, 0)},
                 hand_modes={"l": "fist", "r": "open"}, look=-16 * up + 10 * w["dn"], cape=0.05 + 0.05 * w["s2"])

    def extras(self, J, P, L, tag, pose):
        mc.helm_wings(tag, J, "shirt", size=1.25, n=4, boss="gold")
        mc.braids(tag, J, "hair_blond", tie="kit2", stream=mc.act(pose), ln=1.05)
        c, X, F, U, s, R = mc.head(J)
        tube(tag + "nasal", [c + F * s[1] * 1.12 + U * s[2] * 0.55, c + F * s[1] * 1.16 + U * s[2] * 0.05], [0.03, 0.022], "gold", n=6,
             flat=0.5)
        ball_at(tag + "helmgem", c + F * s[1] * 1.1 + U * s[2] * 0.62, 0.045, "kit1")
        # split skirt of kit1 strips with kit2 tips over the thighs
        for side in ("l", "r"):
            mc.legging(tag, J, L, side, "kit1", 0.0, 0.2, grow=1.12, name="skirt")
            mc.legging(tag, J, L, side, "kit2", 0.18, 0.225, grow=1.16, name="skirthem")
        tband(tag + "scales", J, P, [0.1, 0.05, -0.02], "metal", k=1.08, add=0.02, solid=0.03, jag=0.5)


class Beast(Biped):
    """Shared by the two Norse big guys: shaggy fur tufts on the limbs and a kit harness."""
    fur = "fur_grey"

    cuff_k = 1.0

    def shag_all(self, J, tag, r=0.11, ln=0.2):
        for side, sd in (("l", -1), ("r", 1)):
            sh, el, wr, _ = J["arms"][side]
            out = J["X"] * sd
            mc.shag(tag, lerp(sh, el, 0.2), el, r, self.fur, n=2, out=out, ln=ln, name="shagU" + side)
            mc.shag(tag, el, lerp(el, wr, 0.45), r * 0.9, self.fur, n=1, out=(out - J["F"] * 0.6).normalized(), ln=ln, name="shagF" + side)
            # broad kit2 cuff over the forearm, with a kit1 stud band
            tube(tag + "cuff" + side, [lerp(el, wr, 0.5), lerp(el, wr, 0.95)], [r * 1.45 * self.cuff_k, r * 1.3 * self.cuff_k], "kit2", ref=J["F"], n=10)
            tube(tag + "cuffband" + side, [lerp(el, wr, 0.66), lerp(el, wr, 0.8)], [r * 1.56 * self.cuff_k, r * 1.5 * self.cuff_k], "kit1", ref=J["F"], n=10)
            hip, knee = J["legs"][side][:2]
            mc.shag(tag, lerp(hip, knee, 0.1), knee, r * 1.1, self.fur, n=2, out=out, ln=ln, name="shagL" + side)


@register
class Ulfwerener(Beast):
    """Hulking wolfman: long muzzle, tall ears, ragged mane down a hunched back, one kit pauldron on a harness, kilt."""
    key = "ulfwerener"
    race = "werewolf"
    fur = "fur_grey"
    knobs = dict(limb=1.38, shoulders=1.34, torso=1.3, arms=1.2, hands=1.25, head=1.1, hunch=20)
    layout = dict(skin="fur_grey", legs="fur_grey", shorts="kit1", snout=(1.45, 0.85), snout_mat="fur_grey", loin="kit1", loin_trim="kit2", belt="leather",
                  buckle="kit2", bracers="kit2", pads="big", pad_mat="kit1", pad_trim="kit2", spikes=1,
                  claws=0.14, tail=dict(len=0.8, r=0.12, mat="fur_grey", up=0.35, tip="fur_white"))
    stance = dict(lean=10, legs={"l": (-12, 17, 6), "r": (14, 17, 12)}, arms={"l": (6, 30, 40, 8), "r": (14, 30, 46, 8)},
                  hands="open", jaw=12, nod=-8)
    stride, arm_swing, run_lean, jump = 36, 32, 18, 0.2
    lie, lie_shift = 0.3, 1.0
    height = 1.0

    def idle(self, ph, p, w):       # snarls and flexes his claws, then throws back his head for one long howl
        up = w["up"]
        p.update(nod=-8 + 34 * up, jaw=12 + 26 * up, lean=10 - 8 * up, tail=w["s2"],
                 arms={"l": (6, 30 + 12 * up, 40 + 14 * w["dn"], 8), "r": (14, 30 + 12 * up, 46 + 14 * w["dn"], 8)})

    def adjust(self, name, i, pose):
        pose.setdefault("jaw", 12)
        if name == "run":
            pose["hands"] = "open"

    def extras(self, J, P, L, tag, pose):
        sh = P["sh_h"]
        # mane: ragged darker fur from the crown down the spine
        c, X, F, U, s, R = mc.head(J)
        core.crest(tag, c, R, s, "fur_dark", h=0.2, n=5, lo=0.2, width=0.07)
        for i, h in enumerate((sh + 0.08, sh - 0.04, 0.4, 0.28, 0.16)):
            p = surf(J, P, h, 180, 0.02)
            cone(tag + "spine%d" % i, p, p + J["B"] * 0.2 + J["u"] * 0.12, 0.1, "fur_dark", 6)
        ellipsoid(tag + "ruff", surf(J, P, sh - 0.06, 0, 0.03), (0.3, 0.13, 0.16), "fur_white", basis(J["X"], J["F"], J["u"]), seg=10)
        mc.sash(tag, J, P, "kit1", side=-1, r=0.095, name="harness")
        ball_at(tag + "harnessboss", surf(J, P, 0.3, -4, 0.08), 0.085, "kit2")
        tband(tag + "waist", J, P, [0.04, 0.1, 0.16], "kit2", k=1.06, add=0.02, solid=0.03)
        self.shag_all(J, tag, r=0.11, ln=0.18)


@register
class Yhetee(Beast):
    """Shaggy snow beast: huge rounded shoulders, curling ram horns, blue face, icicle fur, kit sash and kilt."""
    key = "yhetee"
    race = "yhetee"
    fur = "fur_white"
    cuff_k = 1.25
    knobs = dict(head=0.95, belly=1.2, arms=1.25)
    layout = dict(skin="fur_white", snout=(0.6, 1.15), snout_mat="skin_troll", nose_mat="socket", eye_mat="eye_yellow",
                  gloves="skin_troll", boots="skin_troll", cuff=None, legs="fur_white", horns="ram", horn_mat="bark",
                  loin="kit1", loin_trim="kit2", shorts="kit1", belt="kit2", buckle="gold", bracers="kit2", claws=0.12,
                  pads="plate", pad_sides=("r",), pad_mat="kit1", pad_trim="kit2")
    stance = dict(lean=4, legs={"l": (5, 18, 8), "r": (-4, 18, 8)}, arms={"l": (4, 34, 22, 4), "r": (4, 34, 22, 4)},
                  hands="open", jaw=8)
    stride, arm_swing, run_lean, jump = 28, 26, 10, 0.1
    lie, lie_shift = 0.34, 1.0
    height = 1.0

    def idle(self, ph, p, w):       # slow and menacing: rises to full height and roars with both arms spread, then sags
        up = w["up"]
        k = w["breath"]
        p.update(lean=4 - 7 * k, jaw=8 + 30 * up, nod=10 * up,
                 arms={"l": (4 + 20 * up, 34 + 40 * up, 22 + 30 * up, 4), "r": (4 + 20 * up, 34 + 40 * up, 22 + 30 * up, 4)})

    def adjust(self, name, i, pose):
        pose.setdefault("jaw", 8)

    def extras(self, J, P, L, tag, pose):
        sh = P["sh_h"]
        mc.fur_mantle(tag, J, P, "fur_white", drop=0.1, add=0.08, name="ruff")
        self.shag_all(J, tag, r=0.14, ln=0.26)
        # hanging beard of fur under the jaw and a shaggy fringe round the belly
        c, X, F, U, s, R = mc.head(J)
        for i, x in enumerate((-0.5, 0.0, 0.5)):
            b = c - U * s[2] * 0.7 + F * s[1] * 0.5 + X * x * s[0]
            cone(tag + "chin%d" % i, b, b - U * (0.26 - 0.06 * abs(x)) + F * 0.04, 0.08, "fur_white", 6)
        tband(tag + "wrap", J, P, [0.03, 0.1, 0.18], "kit1", k=1.06, add=0.025, solid=0.03)
        tband(tag + "wraptrim", J, P, [0.165, 0.2], "kit2", k=1.06, add=0.04, solid=0.03)
        # kit yoke over the shoulders (seen from above, the chest is hidden by the hunch)
        tband(tag + "yoke", J, P, [sh + 0.1, sh + 0.05, sh - 0.03], "kit1", k=1.0, add=0.15, solid=0.04, jag=0.4, n=16)
        tband(tag + "yokeedge", J, P, [sh + 0.13, sh + 0.09], "kit2", k=1.0, add=0.1, solid=0.03)
        tband(tag + "cheststrap", J, P, [0.3, 0.35, 0.4], "kit1", k=1.04, add=0.03, solid=0.03)
        ball_at(tag + "strapboss", surf(J, P, 0.35, 0, 0.07), 0.1, "kit2")
        ball_at(tag + "strapbossB", surf(J, P, 0.35, 180, 0.07), 0.1, "kit2")
        for sd in (-1, 1):          # kit2 rings on the horns
            b = c + X * sd * s[0] * 0.95 + U * s[2] * 0.62
            ball_at(tag + "hornring%d" % sd, b, 0.075 * s[0] / 0.2, "kit2")


@register
class BeerBoar(Quadruped):
    """Small bristly boar with a keg strapped across its back: kit1 saddle blanket, kit2 keg hoops and collar."""
    key = "beer_boar"
    body = (0.8, 0.27)
    leg_len, leg_r = 0.3, 0.065
    skin = "fur_brown"
    belly_mat = None
    paw_mat = "sole"
    head = dict(snout=(1.25, 0.95), ears="wolf", nose_mat="skin_rat", snout_mat="fur_brown", eye_mat="socket")
    head_size = 0.2
    tail = dict(len=0.22, r=0.03, mat="fur_brown", up=1.2)
    coat, collar = "kit1", "kit2"
    lie = 0.22

    def idle(self, ph, p, w):       # roots about: nose down snuffling, a stamp of one trotter, tail twitching
        k = 1 if w["s1"] > 0 else 0
        p.update(nod=16 * k + 5 * w["s2"], legs4=(22 * max(0.0, w["s2"]) * k, 0, 0, 0), tail=w["s2"], jaw=6 + 8 * k)

    def extras(self, J, tag, pose, centre):
        ln, r = self.body
        X, B, F = J["X"], J["B"], J["F"]
        top = centre + UP * (r + 0.15)
        # keg lying across the back
        a, b = top - X * 0.27, top + X * 0.27
        tube(tag + "keg", [a, lerp(a, b, 0.25), lerp(a, b, 0.5), lerp(a, b, 0.75), b], [0.15, 0.19, 0.2, 0.19, 0.15], "wood",
             ref=UP, n=12)
        for i, t in enumerate((0.16, 0.84)):
            q = lerp(a, b, t)
            parts.cylinder(tag + "hoop%d" % i, q - X * 0.03, q + X * 0.03, 0.195, "kit2", seg=12)
        for i, e in enumerate((a, b)):
            ellipsoid(tag + "kegend%d" % i, e, (0.02, 0.13, 0.13), "rope", seg=10)
        cone(tag + "tap", top - F * 0.19, top - F * 0.3 - UP * 0.03, 0.035, "brass", 6, r2=0.025)
        # harness straps over the blanket
        for i, y in enumerate((-0.14, 0.14)):
            core.loft(tag + "girth%d" % i, [(centre + B * (y + d), X, UP, r * 1.13, r * 1.13) for d in (-0.035, 0.035)], "kit2",
                      n=12, caps=False, subsurf=1, solidify=0.03)
        # bristle ridge along the spine in front of and behind the keg
        for i, t in enumerate((-0.5, -0.4, -0.3, 0.3, 0.4)):
            p = centre + B * (ln * t) + UP * r * 0.9
            cone(tag + "bristle%d" % i, p, p + UP * 0.14 + B * 0.05, 0.06, "fur_dark", 5)
        # tusks curling up from the lower jaw
        c, s = J["head"], J["head_s"]
        R = J["head_R"]
        hf, hu = R.col[1], R.col[2]
        for sd in (-1, 1):
            t0 = c + hf * s[1] * 1.15 - hu * s[2] * 0.45 + X * sd * s[0] * 0.55
            tube(tag + "tusk%d" % sd, [t0, t0 + X * sd * 0.05 + hu * 0.09, t0 + X * sd * 0.04 + hu * 0.19 - hf * 0.03], [0.04, 0.032, 0.01],
                 "bone", n=6)
