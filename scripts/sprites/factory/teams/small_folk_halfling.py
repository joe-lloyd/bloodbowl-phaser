"""Halfling team and the shared Treeman (small-folk batch): halfling_hopeful, halfling_catcher,
halfling_hefty, treeman.

Costume idea: a village kitchen brigade. The Hopeful wears a cooking pot, the Hefty a cook's hat with a
frying pan strapped to his back, the Catcher is a barefoot errand-runner in a long scarf. Everyone has
big bare hairy feet. The Treeman is a walking oak hung with team cloth."""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts, looks
from lib.core import tube, tband, ball_at, box, cone, flat_cone, ellipsoid, cap, sheet, lerp, UP, basis, D
from teams import small_folk_common as sf

HALF = dict(skin="skin_fair", boots="skin_fair", cuff=None, belt="leather", hair=None, legs="rags")


@register
class HalflingHopeful(looks.Fine, Biped):
    """Cooking pot jammed on his head with the handle sticking out sideways, long apron over a team shirt."""
    key = "halfling_hopeful"
    race = "halfling"
    knobs = dict(feet=1.35)
    layout = dict(HALF, torso="kit1", arms="kit1", sleeve_cuff="kit2", neckband="kit2", pot=True, apron="kit2")
    stance = dict(lean=3, legs={"l": (6, 14, 8), "r": (-5, 14, 8)}, arms={"l": (16, 30, 70, -6), "r": (16, 30, 70, -6)},
                  hands="fist")
    stride, arm_swing, jump = 38, 34, 0.2

    def idle(self, ph, p, w):       # the pot slips over his eyes; he shoves it back up with one hand
        k = w["breath"]
        p.update(nod=10 * k - 4, _pot=-0.07 * k,
                 arms={"l": (16, 30, 70, -6), "r": ((150, 22, 62, -10) if k else (16, 30, 70, -6))}, hand_modes={"r": "open"})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = sf.hf(J)
        R = J["head_R"]
        if L.get("pot"):
            b = c + U * (s[2] * 0.28 + pose.get("_pot", 0.0))
            parts.cylinder(tag + "pot", b, b + U * s[2] * 1.0, s[0] * 1.14, "darkmetal", seg=12)
            parts.cylinder(tag + "potrim", b - U * 0.02, b + U * 0.05, s[0] * 1.24, "metal", seg=12)
            h0 = b + U * s[2] * 0.55 + X * s[0] * 1.05
            tube(tag + "pothandle", [h0, h0 + X * 0.2 - F * 0.04, h0 + X * 0.42 - F * 0.1], [0.045, 0.04, 0.04], "wood", n=6)
            box(tag + "potmark", b + U * s[2] * 0.55 + F * s[0] * 1.12, (0.16, 0.04, 0.16), "kit1", R)
        if L.get("mop"):
            sf.curls(J, tag, L["mop"], n=8, r=0.095, seed=5)
        for i, sd in enumerate((-1, 1)):       # curls escaping at the temples
            ball_at(tag + "sidecurl%d" % i, c + X * sd * s[0] * 0.95 - U * s[2] * 0.05 - F * 0.03, 0.075, L.get("curl_mat", "hair_brown"))
        if L.get("pigtails"):
            sf.pigtails(J, tag, pose, L["pigtails"], tie="kit2")
        if L.get("apron"):                     # apron: bib, skirt panel and ties
            tband(tag + "bib", J, P, [0.1, 0.24, 0.36], L["apron"], k=1.06, add=0.015, arc=(125, 235), solid=0.03)
            core.panel(J, P, tag, True, 0.34, 0.2, L["apron"], pose.get("flare", 0.0), trim="kit1", top=0.12)
            tband(tag + "apronties", J, P, [0.09, 0.14], L["apron"], k=1.07, add=0.01, solid=0.02)
        sf.hairy_feet(J, tag, k=1.25)

    def details(self, J, P, L, tag, pose):
        if L.get("apron"):                     # a pocket on the apron with a wooden spoon in it
            p = core.surf(J, P, -0.06, 18, 0.14)
            R = basis(J["X"], J["F"], J["u"])
            box(tag + "pocket", p, (0.1, 0.02, 0.08), "kit1", R)
            tube(tag + "spoon", [p - J["u"] * 0.02, p + J["u"] * 0.16], [0.016, 0.016], "wood", n=5)
            ball_at(tag + "spoonbowl", p + J["u"] * 0.18, 0.03, "wood")


@register
class HalflingCatcher(looks.Fine, Biped):
    """The quick one: slim, bare-armed, a mop of red curls with a headband, a very long striped scarf and
    enormous bare feet. Always on his toes."""
    key = "halfling_catcher"
    race = "halfling"
    knobs = dict(legs=0.62, limb=0.85, belly=0.95, torso=0.9, feet=1.75, arms=0.85)
    layout = dict(HALF, torso="kit1", arms="skin_fair", legs="skin_fair", shorts="kit2", brow="hair_red", wraps="kit2",
                  scarf_len=1.0, headband="kit2")
    stance = dict(lean=10, legs={"l": (14, 12, 22), "r": (-12, 12, 20)}, feet={"l": 14, "r": 14},
                  arms={"l": (30, 26, 70, 0), "r": (30, 26, 70, 0)}, hands="open")
    stride, arm_swing, run_lean, jump = 46, 40, 20, 0.32
    height = 1.05

    def idle(self, ph, p, w):       # bounces from foot to foot in two states, fingers wiggling, scarf swaying
        k = 1 if w["s1"] > 0 else -1
        p.update(legs={"l": (14, 12, 22 + 14 * k), "r": (-12, 12, 20 - 14 * k)}, feet={"l": 14 + 12 * k, "r": 14 - 12 * k},
                 arms={"l": (30 + 10 * w["s2"], 26, 70, 0), "r": (30 - 10 * w["s2"], 26, 70, 0)}, _sway=0.12 * w["s1"],
                 look=14 * w["c1"])

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        sf.curls(J, tag, "hair_red", n=8, r=0.1)
        c, X, F, U, s = sf.hf(J)
        if L.get("headband"):
            tube(tag + "hband", [c + U * s[2] * 0.3, c + U * s[2] * 0.48], [s[0] * 1.06, s[0] * 1.02], L["headband"], ref=X, n=10)
        if L.get("flatcap"):                   # a flat cloth cap with a peak, pulled down over the curls
            cap(tag + "flatcap", c + U * s[2] * 0.25, (s[0] * 1.3, s[1] * 1.35, s[2] * 0.75), L["flatcap"], U, cut=0.0,
                rot=J["head_R"], thick=0.04)
            ellipsoid(tag + "flatpeak", c + U * s[2] * 0.3 + F * s[1] * 1.05, (s[0] * 0.75, s[1] * 0.45, 0.03), L["flatcap"],
                      J["head_R"], seg=10)
            ball_at(tag + "flatbutton", c + U * s[2] * 1.03, 0.04, "kit1")
        if L.get("pigtails"):
            sf.pigtails(J, tag, pose, L["pigtails"], tie="kit1", ln=0.5)
        ln = L.get("scarf_len")
        if ln:
            sf.scarf(J, P, tag, pose, mats=("kit2", "kit1"), wrap="kit2",
                     tails=((-40, 0.7 * ln, -0.1, 1), (-150, 0.9 * ln, -0.2, -1)), r=0.155)
            tband(tag + "scarfwrap2", J, P, [P["sh_h"] + 0.03, P["sh_h"] + 0.1, P["sh_h"] + 0.15], "kit2", k=1.0, add=0.085,
                  solid=0.04)
        # long kit1 tunic: flares over the hips to mid-thigh, kit2 hem
        core.loft(tag + "tunic", [core.tring(J, P, h, 1.06, a) for h, a in ((0.14, 0.015), (0.02, 0.04), (-0.1, 0.075))], "kit1",
                  n=14, caps=False, subsurf=1, solidify=0.025)
        core.loft(tag + "vesthem", [core.tring(J, P, h, 1.06, a) for h, a in ((-0.08, 0.08), (-0.13, 0.09))], "kit2",
                  n=14, caps=False, subsurf=1, solidify=0.025)
        sf.hairy_feet(J, tag, k=1.5, mat="hair_red")

    def details(self, J, P, L, tag, pose):
        R = basis(J["X"], J["F"], J["u"])
        box(tag + "patch", core.surf(J, P, 0.22, -35, 0.05), (0.1, 0.02, 0.09), "kit2", R)
        for i, h in enumerate((0.1, 0.2, 0.3)):
            ball_at(tag + "lace%d" % i, core.surf(J, P, h, 0, 0.05), 0.022, "kit2")


@register
class HalflingHefty(looks.Fine, Biped):
    """Twice as wide as the others: quilted coat, tall cook's hat, a frying pan strapped across his back with
    the handle over one shoulder. Chews on a loaf while he waits."""
    key = "halfling_hefty"
    race = "halfling"
    knobs = dict(belly=1.65, torso=1.3, shoulders=1.2, limb=1.2, feet=1.3, legs=0.5)
    layout = dict(HALF, torso="kit1", arms="kit1", sleeve_cuff="kit2", pads="leather", bracers="leather",
                  hair="short", hair_mat="hair_brown", toque=True, back="pan")
    stance = dict(lean=-2, legs={"l": (5, 20, 6), "r": (-4, 20, 6)}, arms={"l": (10, 40, 50, -10), "r": (10, 40, 50, -10)},
                  hands="fist")
    stride, arm_swing, jump = 30, 24, 0.1
    height = 1.05

    def idle(self, ph, p, w):       # takes a bite of his loaf, chews (two-state jaw), pats his belly
        bite = w["breath"]
        p.update(arms={"l": (30 + 8 * w["s2"], 20, 96, -40), "r": ((78, 16, 128, -24) if bite else (40, 30, 80, -10))},
                 nod=6 * bite, jaw=18 * (int(ph * 8) % 2), _loaf=1)

    def adjust(self, name, i, pose):
        if name == "run":
            pose["_loaf"] = 1
        return pose

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = sf.hf(J)
        R = J["head_R"]
        b = c + U * s[2] * 0.5
        if L.get("toque"):
            parts.cylinder(tag + "toqueband", b, b + U * 0.14, s[0] * 0.98, "kit2", seg=12)
            tube(tag + "toque", [b + U * 0.12, b + U * 0.3, b + U * 0.44], [s[0] * 0.95, s[0] * 1.2, s[0] * 1.05], "shirt", ref=X, n=10)
            ellipsoid(tag + "toquetop", b + U * 0.46 - F * 0.03, (s[0] * 1.3, s[1] * 1.3, 0.13), "shirt", R, seg=12)
        if L.get("kerchief"):              # a knotted kitchen kerchief over the hair
            cap(tag + "kerchief", c + U * 0.015, (s[0] * 1.13, s[1] * 1.13, s[2] * 1.12), L["kerchief"],
                (U * 0.85 - F * 0.5).normalized(), cut=0.1, rot=R, thick=0.03)
            k = c - F * s[1] * 1.02 + U * s[2] * 0.15
            for sd in (-1, 1):
                flat_cone(tag + "kerchend%d" % sd, k, k - F * 0.12 - U * 0.16 + X * sd * 0.14, 0.07, L["kerchief"], F, 0.3)
        if L.get("pigtails"):
            sf.pigtails(J, tag, pose, L["pigtails"], tie="kit2", ln=0.4, r=0.08)
        tband(tag + "sash", J, P, [-0.02, 0.07], "kit2", k=1.05, add=0.012, solid=0.03)
        for h in (0.2, 0.34):                           # quilting lines
            tband(tag + "quilt%d" % int(h * 100), J, P, [h, h + 0.035], "kit2", k=1.065, add=0.012, solid=0.02)
        back = L.get("back")
        if back:                                        # crossed straps hold what he carries on his back
            sf.strap(tag, "panstrap1", J, P, "leather", sd=1, r=0.05)
            sf.strap(tag, "panstrap2", J, P, "leather", sd=-1, r=0.05)
        Bk, u, Xb = J["B"], J["u"], J["X"]
        pb = core.surf(J, P, 0.24, 180, 0.07)
        if back == "pan":
            parts.cylinder(tag + "pan", pb, pb + Bk * 0.07, 0.34, "darkmetal", seg=14)
            parts.cylinder(tag + "paninner", pb + Bk * 0.06, pb + Bk * 0.085, 0.27, "black", seg=14)
            hd = (u * 0.9 + Xb * 0.45).normalized()
            tube(tag + "panhandle", [pb + Bk * 0.04 + hd * 0.3, pb + Bk * 0.04 + hd * 0.78], [0.05, 0.045], "wood", n=6)
            ball_at(tag + "panring", pb + Bk * 0.04 + hd * 0.8, 0.05, "kit2")
        elif back == "cauldron":                        # a stewpot on his back, lid tied on, ladle sticking up
            cb = pb + Bk * 0.2 - u * 0.12
            parts.cylinder(tag + "cauldron", cb, cb + u * 0.42, 0.26, "darkmetal", seg=14)
            parts.cylinder(tag + "cauldronrim", cb + u * 0.38, cb + u * 0.45, 0.29, "metal", seg=14)
            parts.cylinder(tag + "cauldronlid", cb + u * 0.44, cb + u * 0.48, 0.25, "kit2", seg=14)
            tube(tag + "ladle", [cb + u * 0.3 + Xb * 0.1, cb + u * 0.85 + Xb * 0.22], [0.03, 0.03], "wood", n=5)
            ball_at(tag + "ladlecup", cb + u * 0.88 + Xb * 0.23, 0.06, "metal")
        elif back == "pin":                             # a huge rolling pin across his shoulders
            a, b2 = pb + Bk * 0.1 + u * 0.18 - Xb * 0.5, pb + Bk * 0.1 + u * 0.18 + Xb * 0.5
            parts.cylinder(tag + "rollpin", a, b2, 0.1, "wood", seg=10)
            for j, (e0, e1) in enumerate(((a, a - Xb * 0.18), (b2, b2 + Xb * 0.18))):
                parts.cylinder(tag + "pinhandle%d" % j, e0, e1, 0.045, "kit2", seg=6)
        if pose.get("_loaf"):
            c0, d, n, t = J["grip_r"]
            c0 = c0 - n * 0.05
            tube(tag + "loaf", [c0 - t * 0.12, c0 + t * 0.1, c0 + t * 0.34], [0.05, 0.065, 0.045], "rope", n=6)
            for j, q in enumerate((0.05, 0.17)):
                tube(tag + "loafcut%d" % j, [c0 + t * q, c0 + t * (q + 0.03)], [0.068, 0.068], "bone", n=6)
        sf.hairy_feet(J, tag, k=1.25)


@register
class Treeman(Biped):
    """A walking oak: gnarled trunk with ridged bark and root feet, a broad leafy crown with antler branches,
    glowing knot-hole eyes; team cloth hangs from both forearms and as a trimmed tabard, ribbons in the branches."""
    key = "treeman"
    race = "treeman"
    knobs = dict(head=0.95, arms=1.35, legs=0.75)
    layout = dict(legs="bark", boots="bark", cuff=None, eyes=None, tabard="kit1", tabard_trim="kit2", wraps="kit2",
                  belt="kit2", buckle=None)
    stance = dict(lean=4, legs={"l": (5, 16, 8), "r": (-4, 16, 8)}, arms={"l": (10, 30, 34, 6), "r": (10, 30, 34, 6)},
                  hands="open")
    stride, arm_swing, jump = 24, 20, 0.05
    lie, lie_shift = 0.35, 1.0

    def idle(self, ph, p, w):       # creaks: slow two-state sway, one arm lifts and settles, the crown rustles
        k = w["breath"]
        p.update(lean=4 + 2 * k, twist=4 * (1 if w["s1"] > 0 else -1), look=12 * w["s1"],
                 arms={"l": (10 + 16 * w["up"], 30, 34 + 26 * w["up"], 6), "r": (10 + 10 * w["dn"], 30, 34 + 16 * w["dn"], 6)},
                 _rustle=1 if int(ph * 8) % 2 else -1)

    def adjust(self, name, i, pose):
        pose.setdefault("_rustle", 1 if i % 2 else -1)
        return pose

    def extras(self, J, P, L, tag, pose):
        X, F, B, u = J["X"], J["F"], J["B"], J["u"]
        c, Xh, Fh, U, s = sf.hf(J)
        R = J["head_R"]
        ru = pose.get("_rustle", 0) * 0.025
        # face: knot-hole eyes with a glow, bark brow, twig nose, hollow mouth
        for sd in (-1, 1):
            e = c + Fh * s[1] * 0.86 + Xh * sd * s[0] * 0.42 + U * s[2] * 0.1
            ellipsoid(tag + "hole%d" % sd, e, (0.075, 0.03, 0.06), "socket", R, seg=8)
            ball_at(tag + "glow%d" % sd, e + Fh * 0.02, 0.032, "eye_yellow")
            tube(tag + "tbrow%d" % sd, [e + U * 0.08 - Xh * sd * 0.08, e + U * 0.1 + Xh * sd * 0.1], [0.045, 0.03], "wood", n=5)
        nb = c + Fh * s[1] * 0.95 - U * s[2] * 0.12
        cone(tag + "tnose", nb, nb + Fh * 0.2 + U * 0.03, 0.05, "bark", 5)
        box(tag + "tmouth", c + Fh * s[1] * 0.92 - U * s[2] * 0.55, (s[0] * 0.8, 0.05, 0.07), "socket", R)
        # crown: leaf clumps on the head and shoulders, antler branches with leaves at the tips
        parts.foliage(tag, c + U * (s[2] + 0.42) - Fh * 0.06 + Xh * ru, 0.46, n=8, seed=5)
        parts.foliage(tag, c + U * (s[2] + 0.2) - Fh * 0.3 - Xh * ru, 0.36, n=6, seed=6)
        for i, sd in enumerate((-1, 1)):
            sh = J["arms"]["l" if sd < 0 else "r"][0]
            ellipsoid(tag + "moss%d" % i, sh + UP * 0.12, (0.2, 0.2, 0.08), "leaf", seg=8)
            r0 = sh + UP * 0.1 - F * 0.05
            r1 = r0 + X * sd * 0.22 + UP * 0.42
            r2 = r1 + X * sd * 0.3 + UP * 0.22 - F * 0.06
            tube(tag + "branch%d" % i, [r0, r1, r2], [0.09, 0.065, 0.035], "bark", n=6)
            tw = r1 + UP * 0.3 - X * sd * 0.1
            tube(tag + "twig%d" % i, [r1, tw], [0.05, 0.025], "bark", n=5)
            parts.foliage(tag, r2 + Vector((ru * sd, 0, 0.05)), 0.27, n=5, seed=10 + i)
            parts.foliage(tag, tw + Vector((-ru * sd, 0, 0.05)), 0.2, n=4, seed=20 + i)
            # ribbon tied in the branch
            Bh = Vector((0, 1, 0))
            pts = sf.hang(r1, Bh, X * sd, 0.5, n=4, stream=1.0 if pose.get("_action") else 0.1, sway=0.25 + ru * 4)
            sf.streamer(tag, "ribbon%d" % i, pts, 0.07, ("kit2", "kit1"), ref=X)
        # bark ridges and a hollow on the trunk
        for i, a in enumerate((-150, -100, -50, 35, 75, 120, 165)):
            pts = [core.surf(J, P, h, a + 8 * math.sin(h * 9 + i), 0.01) for h in (-0.04, 0.12, 0.28, P["sh_h"] * 0.92)]
            tube(tag + "ridge%d" % i, pts, [0.05, 0.045, 0.04, 0.025], "wood", n=5, flat=0.6, ref=u)
        hp = core.surf(J, P, P["sh_h"] * 0.72, 28, 0.0)
        ellipsoid(tag + "hollow", hp, (0.07, 0.04, 0.1), "socket", basis(X, F, u), seg=8)
        # roots spreading from the feet
        for side, sd in (("l", -1), ("r", 1)):
            ankle, toe = J["legs"][side][-2:]
            fd = (toe - ankle).normalized()
            sx = Vector((fd.y, -fd.x, 0)).normalized() * -1
            for j, (dx, dy, ln) in enumerate(((sd * 0.9, 0.5, 0.36), (sd * 0.6, -0.7, 0.3), (-sd * 0.5, 1.0, 0.3))):
                b0 = lerp(ankle, toe, 0.5) - UP * 0.04
                d = (Vector((dx, 0, 0)) + fd * dy).normalized()
                cone(tag + "root%s%d" % (side, j), b0, b0 + d * (ln + 0.25) - UP * 0.03, 0.09, "bark", 6)
            # team cloth draped over the forearm
            sh, el, wr, tip = J["arms"][side]
            a0, a1 = lerp(el, wr, 0.1), lerp(el, wr, 0.9)
            ln = 0.62
            sw = Vector((0, 1, 0)) * (0.35 if pose.get("_action") else 0.04)
            top = [a0, lerp(a0, a1, 0.5), a1]
            mid = [q - UP * ln * 0.68 + sw * ln * 0.6 for q in top]
            bot = [q - UP * ln * (1.0 if k != 1 else 0.82) + sw * ln for k, q in enumerate(top)]
            sheet(tag + "drape" + side, [top, mid], ["kit1"], thick=0.04, subsurf=0)
            sheet(tag + "drapetrim" + side, [mid, bot], ["kit2"], thick=0.045, subsurf=0)
