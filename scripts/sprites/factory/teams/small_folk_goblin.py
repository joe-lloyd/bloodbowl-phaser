"""Goblin team (small-folk batch): goblin_lineman, bomma, doom_diver, fanatic, loony, ooligan, pogoer.

Costume idea: a scrapyard gang. Every "secret weapon" is one bold prop; nobody ever holds anything
ball-like (the Fanatic's spiked wrecking weight swings on a chain above his head, it is never in a hand)."""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts, looks
from lib.core import tube, tband, ball_at, box, cone, flat_cone, ellipsoid, cap, sheet, lerp, UP, basis, D
from teams import small_folk_common as sf

GOB = dict(skin="skin_goblin", torso="kit1", arms="skin_goblin", legs="kit2", boots="leather", cuff=None, belt="leather",
           hair=None, fangs=False)


def gob_face(J, L, tag, ears=1.0, nose=0.2):
    sf.big_ears(J, L, tag, size=ears)
    sf.long_nose(J, L, tag, ln=nose)


def tall_hood(J, tag, kind):
    """A tall hood in the primary colour, "floppy" or stiffly "pointed"."""
    if not kind:
        return
    c, X, F, U, s = sf.hf(J)
    cap(tag + "hood", c + U * 0.01 - F * 0.02, (s[0] * 1.2, s[1] * 1.2, s[2] * 1.2), "kit1", (U * 0.6 - F * 0.8).normalized(),
        cut=-0.35, rot=J["head_R"], thick=0.03)
    b = c + U * s[2] * 0.75 - F * s[1] * 0.3
    if kind == "floppy":
        pts = [b, b + U * 0.28 - F * 0.1, b + U * 0.42 - F * 0.34, b + U * 0.3 - F * 0.56]
    else:
        pts = [b, b + U * 0.3 - F * 0.02, b + U * 0.58 + F * 0.02, b + U * 0.82 + F * 0.06]
    tube(tag + "hoodtip", pts, [s[0] * 0.8, s[0] * 0.5, s[0] * 0.28, 0.03], "kit1", ref=X, n=8)


def goggles(J, tag, strap="kit2"):
    """Big brass flying goggles with a strap round the head."""
    c, X, F, U, s = sf.hf(J)
    for sd in (-1, 1):
        e = c + F * s[1] * 0.86 + X * sd * s[0] * 0.42 + U * s[2] * 0.12
        parts.cylinder(tag + "gog%d" % sd, e, e + F * 0.08, 0.09, "brass", seg=8)
        ball_at(tag + "lens%d" % sd, e + F * 0.07, 0.06, "white")
    tube(tag + "gogstrap", [c + X * s[0] * 1.05 + U * s[2] * 0.15, c - F * s[1] * 1.1 + U * s[2] * 0.2,
                            c - X * s[0] * 1.05 + U * s[2] * 0.15], [0.03] * 3, strap, n=6)


@register
class GoblinLineman(looks.Fine, Biped):
    """Plain but cheeky: bare head with huge ears, one scrap shoulder pad, hands on hips; thumbs his nose."""
    key = "goblin_lineman"
    race = "goblin"
    layout = dict(GOB, wraps="kit2", neckband="kit2", pads="leather", pad_sides=("l",), topknot=True)
    stance = dict(lean=4, legs={"l": (6, 14, 10), "r": (-5, 14, 10)}, arms={"l": (-8, 46, 96, -30), "r": (-8, 46, 96, -30)},
                  hands="fist")
    stride, arm_swing, jump = 40, 36, 0.24

    def idle(self, ph, p, w):       # cocks a snook: thumb to nose, fingers waggling, hips swaying in two states
        k = 1 if w["s1"] > 0 else -1
        p.update(twist=5 * k, look=-10 * k, nod=-6,
                 arms={"l": (-8, 46, 96, -30), "r": (62, 12, 118 + 10 * w["s2"], -22)}, hand_modes={"r": "open"})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        gob_face(J, L, tag)
        sf.grin(J, tag)
        c, X, F, U, s = sf.hf(J)
        if L.get("topknot"):                # a single top-knot tuft tied in the secondary colour
            b = c + U * s[2] * 0.9 - F * 0.04
            cone(tag + "knot", b, b + U * 0.2 - F * 0.1, 0.05, "hair", 6)
            ball_at(tag + "knottie", b + U * 0.03, 0.055, "kit2")
        if L.get("pothelm"):
            sf.pot_helm(J, tag, mat=L["pothelm"])
        if L.get("hood"):
            sf.nightcap(J, tag, pose, L["hood"], "kit2", "kit2", ln=0.45)
        p = core.surf(J, P, P["sh_h"] * 0.62, 0, 0.03)      # crude painted chest stripe
        box(tag + "stripe", p, (0.2, 0.04, 0.07), "kit2", basis(J["X"], J["F"], J["u"]))

    def details(self, J, P, L, tag, pose):
        for i, a in enumerate((-40, -15, 15, 40)):        # a necklace of teeth
            cone(tag + "tooth%d" % i, core.surf(J, P, P["sh_h"] - 0.04, a, 0.05), core.surf(J, P, P["sh_h"] - 0.12, a, 0.07),
                 0.022, "bone", 4)
        for side in ("l", "r"):                           # rag patches on the knees
            hip, knee = J["legs"][side][:2]
            ball_at(tag + "kneepatch" + side, knee + J["F"] * 0.06, 0.06, "rags")


@register
class Bomma(looks.Fine, Biped):
    """Crouched sapper: tin hat down over the eyes, fat bomb satchel on the hip with fizzing fuses, bandolier,
    a lit taper (a thin stick) in one hand. The bombs stay in the bag."""
    key = "bomma"
    race = "goblin"
    knobs = dict(hunch=16)
    layout = dict(GOB, helm="skull", helm_mat="darkmetal", bracers="leather", tinhat=True, bag="satchel")
    stance = dict(lean=12, legs={"l": (16, 16, 34), "r": (-12, 16, 30)}, arms={"l": (10, 30, 60, 0), "r": (40, 26, 80, 0)},
                  hands="fist")
    stride, arm_swing, jump = 36, 22, 0.16
    height = 1.1

    def idle(self, ph, p, w):       # shifty: looks both ways, pats the satchel, the taper sputters
        p.update(look=30 * w["s1"], arms={"l": (6 + 10 * w["breath"], 34, 70, -10), "r": (40 + 8 * w["s2"], 26, 80, 0)},
                 _spark=int(ph * 8) % 2)

    def adjust(self, name, i, pose):
        pose.setdefault("_spark", i % 2)
        if name == "run":
            pose["arms"] = {"l": pose["arms"]["l"], "r": (50, 24, 70, 0)}

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        gob_face(J, L, tag, ears=0.9)
        X, F, u = J["X"], J["F"], J["u"]
        c, Xh, Fh, U, s = sf.hf(J)
        if L.get("tinhat"):
            ellipsoid(tag + "brim", c + U * s[2] * 0.42, (s[0] * 1.45, s[1] * 1.45, 0.035), "darkmetal", J["head_R"], seg=14)
            box(tag + "helmstripe", c + U * s[2] * 0.78 + Fh * s[1] * 0.75, (s[0] * 0.5, 0.06, 0.1), "kit1", J["head_R"])
        if L.get("goggles"):
            goggles(J, tag, strap=L["goggles"])
        sf.strap(tag, "band", J, P, "kit2", sd=1, r=0.05)
        R = basis(X, F, u)
        kind = L.get("bag")
        if kind == "satchel":
            bag = core.surf(J, P, 0.05, -62, 0.17) - UP * 0.06
            ellipsoid(tag + "bag", bag, (0.2, 0.2, 0.2), "leather", R, seg=10)
            box(tag + "bagflap", bag + UP * 0.1, (0.36, 0.36, 0.07), "kit2", R)
            spots = [bag + UP * 0.2 + X * dx + F * dy for dx, dy in ((-0.05, -0.1), (-0.07, 0.09))]
        elif kind == "pack":                 # a big powder keg strapped on his back, fuses sticking out of the top
            bag = core.surf(J, P, 0.2, 180, 0.22)
            parts.cylinder(tag + "keg", bag - u * 0.22, bag + u * 0.22, 0.2, "kit2", seg=12)
            for j, t in enumerate((-0.15, 0.15)):
                parts.cylinder(tag + "keghoop%d" % j, bag + u * (t - 0.025), bag + u * (t + 0.025), 0.21, "darkmetal", seg=12)
            spots = [bag + u * 0.26 + X * dx for dx in (-0.08, 0.08)]
        else:
            spots = []
        sp = pose.get("_spark", 0)
        for i, b in enumerate(spots):
            ball_at(tag + "bomb%d" % i, b, 0.085, "black")
            tube(tag + "fuse%d" % i, [b + UP * 0.07, b + UP * 0.16 - X * 0.03], [0.014, 0.012], "rope", n=5)
            if (i + sp) % 2 == 0:
                cone(tag + "fizz%d" % i, b + UP * 0.15 - X * 0.03, b + UP * 0.24 - X * 0.03, 0.03, "fire", 4)
        parts.rod(J, "r", tag, length=0.42, r=0.02, mat="wood")
        c0, d, n, t = J["grip_r"]
        tip = c0 - n * 0.05 + t * 0.42 * 0.75
        cone(tag + "flame", tip - t * 0.02, tip + t * (0.11 + 0.05 * sp), 0.04, "fire", 5)


@register
class DoomDiver(looks.Fine, Biped):
    """Glider goblin: patched canvas wings on poles strapped along both arms, flying cap and big goggles."""
    key = "doom_diver"
    race = "goblin"
    layout = dict(GOB, helm="skull", helm_mat="leather", arms="kit1", neckband="kit2", wing_mats=("kit2",))
    stance = dict(lean=14, legs={"l": (14, 14, 30), "r": (-10, 14, 26)}, arms={"l": (0, 78, 8, 80), "r": (0, 78, 8, 80)},
                  hands="fist")
    stride, arm_swing, jump = 40, 0, 0.3
    height = 1.1

    def idle(self, ph, p, w):       # tests the wings: two-state flap, knees flexing for the jump
        k = w["breath"]
        a = (0, 78 + 14 * k, 8, 80 + 14 * k)
        p.update(arms={"l": a, "r": a}, look=14 * w["s1"], legs={"l": (14, 14, 30 + 10 * k), "r": (-10, 14, 26 + 10 * k)})

    def adjust(self, name, i, pose):
        if name == "run":           # arms swept back like a swooping bird
            w = math.sin(2 * math.pi * i / 8)
            a = (-28, 74 + 8 * w, 6, 76 + 8 * w)
            pose.update(arms={"l": a, "r": a}, lean=30)
        elif name == "cheer":
            f = 100 + 30 * max(0.0, math.sin(2 * math.pi * i / 8))
            pose["arms"] = {"l": (0, f, 6, f), "r": (0, f, 6, f)}

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        gob_face(J, L, tag, ears=0.85)
        c, X, F, U, s = sf.hf(J)
        goggles(J, tag)
        if L.get("helmspike"):
            cone(tag + "helmspike", c + U * s[2] * 1.05, c + U * (s[2] * 1.05 + 0.26), 0.07, L["helmspike"], 6)
        wm = L.get("wing_mats") or ("kit2",)
        B, u = J["B"], J["u"]
        sf.strap(tag, "harn1", J, P, "leather", sd=1)
        sf.strap(tag, "harn2", J, P, "leather", sd=-1)
        for side, sd in (("l", -1), ("r", 1)):
            sh, el, wr, tipj = J["arms"][side]
            d = (wr - sh).normalized()
            root = sh + B * 0.1 + u * 0.04
            tip = wr + d * 0.5 + B * 0.06
            tube(tag + "spar" + side, [root, tip], [0.03, 0.02], "wood", n=6)
            hip = J["pelvis"] + B * 0.16 + J["X"] * sd * 0.1 - UP * 0.3
            top = [lerp(root, tip, t) for t in (0, 0.25, 0.5, 0.75, 1)]
            dn = (hip - root)
            bot = [hip] + [lerp(root, tip, t) + dn * k + B * 0.06 - d * 0.05 for t, k in ((0.25, 1.0), (0.5, 0.85), (0.75, 0.6))] \
                  + [tip + dn * 0.1]
            for i in range(4):       # flat canvas panels between the ribs, scalloped along the trailing edge
                m = lerp(bot[i], bot[i + 1], 0.5) - dn * 0.12
                sheet(tag + "wing%s%d" % (side, i), [[top[i], lerp(top[i], top[i + 1], 0.5), top[i + 1]], [bot[i], m, bot[i + 1]]],
                      [wm[i % len(wm)]], thick=0.025, subsurf=0)
            for i in (1, 2, 3):      # ribs in the primary colour
                tube(tag + "rib%s%d" % (side, i), [top[i] - B * 0.03, bot[i] - B * 0.03], [0.04, 0.03], "kit1", n=5, flat=0.6, ref=B)
            tube(tag + "wtip" + side, [top[4], bot[4]], [0.035, 0.03], "wood", n=5)


@register
class Fanatic(looks.Fine, Biped):
    """Hooded loon whirling a huge spiked iron weight on a chain round his head (a weapon, never in a hand)."""
    key = "fanatic"
    race = "goblin"
    layout = dict(GOB, torso="kit2", legs="cloth_black", belt="rope", buckle=None, wraps="kit1", hood="floppy", rags=0.3)
    stance = dict(lean=-4, legs={"l": (8, 20, 18), "r": (-6, 20, 18)}, arms={"l": (164, 10, 24, -10), "r": (164, 10, 24, -10)},
                  hands="fist")
    stride, arm_swing, jump = 30, 0, 0.1
    height = 1.1
    RAD, DROP = 0.95, 0.02

    def adjust(self, name, i, pose):
        ph = i / 8.0
        up = {"l": (164, 10, 24, -10), "r": (164, 10, 24, -10)}
        orbit = 360 * ph + 100
        pose["_ball"] = (orbit, self.RAD, self.DROP, 0.0)
        if name == "idle":           # leans against the pull, two-state
            k = 1 if math.sin(2 * math.pi * ph) > 0 else -1
            pose.update(arms=up, lean=-4, twist=8 * k, look=20 * math.sin(2 * math.pi * ph + 1.6))
        elif name in ("run", "cheer"):
            pose["arms"] = up
            pose["hands"] = "fist"
        elif name == "fall":
            t = i / 7.0
            pose["_ball"] = (100 + 150 * t, self.RAD, self.DROP, min(1.0, t * 1.5))
        else:                        # block / pass: the weight comes round low and smashes forward
            fwd = dict(lean=22, arms={"l": (84, 8, 10, -6), "r": (84, 8, 10, -6)}, hands="fist")
            base = dict(pose, arms=up)
            from lib import anim
            q = anim.keyframes([(0, base), (2, dict(base, lean=-12)), (3, dict(pose, **fwd)), (4, dict(pose, **fwd)), (7, base)],
                               i * 7.0 / 7)
            ang = [100, 190, 280, 360, 360, 400, 430, 460][i]
            q["_ball"] = (ang, self.RAD * (1.15 if i in (3, 4) else 1.0), 0.0, 0.0)
            return q

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        gob_face(J, L, tag, ears=0.9, nose=0.24)
        tall_hood(J, tag, L.get("hood"))
        if L.get("rags"):                    # ragged skirt or robe of kit2 cloth
            core.skirt(J, P, L, tag, L["rags"], (-178, 178), pose.get("flare", 0.1), "kit2", lining="kit2", jag=0.5, top=0.08)
        gl, gr = J["grip_l"][0], J["grip_r"][0]
        h = lerp(gl, gr, 0.5)
        tube(tag + "handle", [gl, gr], [0.03, 0.03], "wood", n=6)
        ang, rad, drop, rest = pose.get("_ball", (100, self.RAD, self.DROP, 0))
        a = D(ang)
        Xb, Fb = J["X0"], Vector((0, -1, 0))
        ballp = h + (Xb * math.sin(a) + Fb * math.cos(a)) * rad - UP * drop
        if rest:                     # falling: the weight drops beside him and stays there
            ballp = lerp(ballp, Vector((0.85, -0.1, J["pelvis"].z + 0.5)), rest)
        n = 7
        sag = 0.1 + 0.25 * rest
        pts = [lerp(h, ballp, i / n) - UP * sag * math.sin(math.pi * i / n) for i in range(n + 1)]
        tube(tag + "chain", pts, [0.022] * (n + 1), "darkmetal", n=5)
        for i in range(1, n):
            ball_at(tag + "link%d" % i, pts[i], 0.04, "metal")
        r = 0.27
        ball_at(tag + "weight", ballp, r, "darkmetal")
        k = 0
        for el in (-50, 0, 50):
            for az in range(0, 360, 60 if el == 0 else 120):
                aa, ee = D(az + (30 if el else 0)), D(el)
                d = Vector((math.cos(aa) * math.cos(ee), math.sin(aa) * math.cos(ee), math.sin(ee)))
                cone(tag + "spk%d" % k, ballp + d * r * 0.85, ballp + d * (r + 0.17), 0.075, "metal", 5)
                k += 1
        for d in (UP, -UP):
            cone(tag + "spk%d" % k, ballp + d * r * 0.85, ballp + d * (r + 0.17), 0.075, "metal", 5)
            k += 1


@register
class Loony(looks.Fine, Biped):
    """Masked maniac hefting a chain-toothed cutting engine taller than himself: engine block, long toothed
    bar, smoking exhaust. Rust helm with a primary-colour crest, secondary-colour apron."""
    key = "loony"
    race = "goblin"
    layout = dict(GOB, helm="skull", helm_mat="rust", plume="kit1", bracers="leather", apron="kit2")
    stance = dict(lean=2, legs={"l": (10, 18, 16), "r": (-8, 18, 16)}, arms={"l": (58, 8, 52, -30), "r": (30, 14, 96, -20)},
                  hands="fist")
    stride, arm_swing, jump = 34, 0, 0.14

    def idle(self, ph, p, w):       # the engine judders in two states and coughs smoke; he revs it with a jerk
        p.update(_shake=1 if int(ph * 8) % 2 else -1, _puff=(ph * 2) % 1.0, look=14 * w["s1"],
                 arms={"l": (58 + 6 * w["up"], 8, 52, -30), "r": (30 + 6 * w["up"], 14, 96, -20)})

    def adjust(self, name, i, pose):
        pose.setdefault("_shake", 1 if i % 2 else -1)
        pose.setdefault("_puff", (i % 4) / 4.0)
        hold = {"l": (58, 8, 52, -30), "r": (30, 14, 96, -20)}
        if name == "run":
            pose.update(arms=hold, hands="fist")
        elif name == "cheer":
            pose.update(arms={"l": (120, 8, 30, -20), "r": (100, 14, 60, -20)}, hands="fist")
        elif name in ("block", "pass"):     # a forward lunge with the bar levelled
            if 2 <= i <= 4:
                pose.update(arms={"l": (84, 6, 14, -10), "r": (60, 10, 60, -20)}, _level=1.0, hands="fist")
            else:
                pose.update(arms=hold, hands="fist", _level=0.4 if i in (1, 5) else 0.0)

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        gob_face(J, L, tag, ears=0.95)
        X, F, u = J["X"], J["F"], J["u"]
        if L.get("apron"):
            core.panel(J, P, tag, True, 0.3, 0.13, L["apron"], pose.get("flare", 0.0), trim="leather", top=0.1)
        if L.get("bucket"):                  # a dented bucket over the head, kit1 band, a spike on top
            c0, Xh, Fh, Uh, s0 = sf.hf(J)
            parts.cylinder(tag + "bucket", c0 - Uh * s0[2] * 0.15, c0 + Uh * s0[2] * 1.15, s0[0] * 1.18, L["bucket"], seg=10)
            parts.cylinder(tag + "bucketband", c0 + Uh * s0[2] * 0.55, c0 + Uh * s0[2] * 0.75, s0[0] * 1.22, "kit1", seg=10)
            cone(tag + "bucketspike", c0 + Uh * s0[2] * 1.12, c0 + Uh * (s0[2] * 1.12 + 0.24), 0.06, "metal", 5)
            box(tag + "bucketslit", c0 + Fh * s0[0] * 1.2 + Uh * s0[2] * 0.12, (s0[0] * 1.1, 0.04, 0.05), "eye", J["head_R"])
        sf.strap(tag, "brace", J, P, "kit2", sd=-1, r=0.04)
        c, Xh, Fh, U, s = sf.hf(J)
        box(tag + "slit", c + Fh * s[1] * 1.0 + U * s[2] * 0.12, (s[0] * 1.3, 0.05, 0.05), "eye", J["head_R"])
        # the machine, carried between the two grips
        gl, gr = J["grip_l"][0], J["grip_r"][0]
        lv = pose.get("_level", 0.0)
        ax = (u * (0.9 - 0.85 * lv) + F * (0.12 + 0.85 * lv) + X * 0.34 * (1 - lv)).normalized()
        down = abs(pose.get("pitch", 0)) / 90.0
        if down:                     # dropped: it ends up lying beside him
            ax = (ax * (1 - down) + (u * 0.9 - X * 0.3) * down).normalized()
        sx = (X - ax * X.dot(ax)).normalized()
        sy = ax.cross(sx)
        R = basis(sx, sy, ax)
        g = gr + ax * 0.02 + sx * 0.02 * pose.get("_shake", 0)
        if down:
            g = lerp(g, J["pelvis"] + X * 0.62 + u * 0.1 + F * 0.05, down)
        box(tag + "engine", g + ax * 0.12, (0.26, 0.3, 0.34), "kit2", R)
        box(tag + "enginecap", g + ax * 0.12 - sy * 0.17, (0.2, 0.08, 0.26), "rust", R)
        tube(tag + "sawgrip", [g - ax * 0.1 + sx * 0.1, g - ax * 0.2, g - ax * 0.1 - sx * 0.1], [0.03] * 3, "leather", n=5)
        ex = g + ax * 0.02 + sx * 0.16
        parts.cylinder(tag + "exhaust", ex, ex + sx * 0.12 + UP * 0.16, 0.045, "darkmetal", seg=6)
        pf = pose.get("_puff", 0.0)
        if not down:                 # square smoke wisps (not a blob near the hand)
            for j in (0, 1):
                k = (pf + j * 0.5) % 1.0
                box(tag + "smoke%d" % j, ex + sx * (0.2 + 0.1 * k) + UP * (0.24 + 0.34 * k), (0.07, 0.07, 0.07), "stone")
        b0 = g + ax * 0.3
        ln = 0.95
        box(tag + "bar", b0 + ax * ln * 0.5, (0.05, 0.2, ln), "metal", R)
        ellipsoid(tag + "barnose", b0 + ax * ln, (0.03, 0.1, 0.1), "metal", R, seg=8)
        box(tag + "barline", b0 + ax * ln * 0.5, (0.07, 0.06, ln * 0.9), "kit1", R)
        nt = 6
        for i in range(nt):
            t = (i + 0.5) / nt
            for e in (-1, 1):
                p = b0 + ax * ln * t + sy * e * 0.1
                cone(tag + "tooth%d%d" % (i, e > 0), p, p + sy * e * 0.09 + ax * 0.03, 0.045, "bone", 4)
        cone(tag + "toothn", b0 + ax * (ln + 0.08), b0 + ax * (ln + 0.2), 0.05, "bone", 4)
        if not down:
            tube(tag + "sawbrace", [gl, lerp(gl, b0, 0.5) + sy * 0.03, b0 + ax * 0.12], [0.028] * 3, "darkmetal", n=5)


@register
class Ooligan(looks.Fine, Biped):
    """Pot-bellied terrace yob: bobble hat, long striped scarf, a wooden clacker rattle whirled overhead."""
    key = "ooligan"
    race = "goblin"
    knobs = dict(belly=1.5, torso=1.0, hunch=2)
    layout = dict(GOB, arms="kit1", sleeve_cuff="kit2", legs="rags", bobble=True, scarf_len=1.0)
    stance = dict(lean=-4, legs={"l": (6, 16, 8), "r": (-5, 16, 8)}, arms={"l": (40, 30, 110, -10), "r": (150, 24, 30, 6)},
                  hands="fist")
    stride, arm_swing, jump = 34, 26, 0.26

    def idle(self, ph, p, w):       # whirls the rattle and shakes a fist, bouncing his gut in two states
        p.update(_rattle=360 * ph, arms={"l": (40 + 30 * w["up"], 30, 110 - 30 * w["up"], -10), "r": (150 + 8 * w["s2"], 24, 30, 6)},
                 lean=-4 - 4 * w["breath"], look=-16 * w["s1"])

    def adjust(self, name, i, pose):
        pose.setdefault("_rattle", 90.0 * i)
        if name == "run":
            pose["arms"] = {"l": pose["arms"]["l"], "r": (150, 24, 30, 6)}

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        gob_face(J, L, tag, ears=0.95)
        sf.grin(J, tag)
        c, X, F, U, s = sf.hf(J)
        R = J["head_R"]
        big = (s[0] * 1.12, s[1] * 1.12, s[2] * 1.14)
        if L.get("bobble"):
            cap(tag + "hat", c + U * 0.03, big, "kit1", U, cut=0.25, rot=R, thick=0.03)
            cap(tag + "hatband", c + U * 0.03, tuple(b * 1.05 for b in big), "kit2", U, cut=0.25, hi=0.5, rot=R, thick=0.03)
            ball_at(tag + "bobble", c + U * (big[2] + 0.1), 0.1, "kit2")
        # scarf: a thick two-colour wrap at the neck and two long, wide striped tails (one in front, one behind)
        sh = P["sh_h"]
        ln = L.get("scarf_len")
        if ln:
            tband(tag + "scarf", J, P, [sh - 0.04, sh + 0.04, sh + 0.13], "kit2", k=1.0, add=0.085, solid=0.045)
            tband(tag + "scarfstripe", J, P, [sh + 0.02, sh + 0.065], "kit1", k=1.0, add=0.1, solid=0.03)
            Bh = Vector((J["B"].x, J["B"].y, 0)).normalized()
            st = 1.0 if pose.get("_action") else 0.0
            for i, (ang, tl, sw, d) in enumerate(((-38, 0.6, -0.1, -Bh), (-150, 0.72, -0.2, Bh))):
                k0 = core.surf(J, P, sh - 0.02, ang, 0.1)
                pts = sf.hang(k0, Bh if st else d, J["X"], tl * ln, n=6, stream=st, sway=sw, out=0.25)
                sf.streamer(tag, "tail%d" % i, pts, 0.125, ("kit2", "kit1"), ref=J["X"], taper=0.85)
        tband(tag + "gut", J, P, [0.0, 0.07], "kit2", k=1.03, add=0.01, solid=0.03)       # hem stripe on the stretched jersey
        # rattle: handle in the raised fist, a cog and a flat clacker board that spins round the handle
        c0, d, n, t = J["grip_r"]
        c0 = c0 - n * 0.05
        top = c0 + t * 0.3
        # a long square-cut clacker (box shapes only, so it never reads as a ball): wood handle, brass cog,
        # a big kit1 board with kit2 bands, held in a wooden frame that whirls round the handle
        top = c0 + t * 0.36
        tube(tag + "rhandle", [c0 - t * 0.14, top + t * 0.05], [0.035, 0.035], "wood", n=6)
        a = D(pose.get("_rattle", 0.0))
        sx = (d * math.cos(a) + n * math.sin(a)).normalized()
        Rr = basis(sx, t.cross(sx), t)
        box(tag + "rboard", top + sx * 0.32, (0.56, 0.05, 0.24), "kit1", Rr)
        for j, f in enumerate((0.16, 0.44)):
            box(tag + "rband%d" % j, top + sx * f, (0.07, 0.065, 0.25), "kit2", Rr)
        for j, sgn in enumerate((-1, 1)):
            box(tag + "rslat%d" % j, top + sx * 0.32 + t * sgn * 0.14, (0.6, 0.07, 0.045), "wood", Rr)
        box(tag + "rframe", top + sx * 0.62, (0.06, 0.08, 0.33), "wood", Rr)
        parts.cylinder(tag + "rcog", top - t * 0.06, top + t * 0.1, 0.06, "brass", seg=6)


@register
class Pogoer(looks.Fine, Biped):
    """Crouched on a sprung pogo stick, both hands on the crossbar; spiked helm, pennant streaming from the top."""
    key = "pogoer"
    race = "goblin"
    layout = dict(GOB, helm="skull", helm_mat="metal", wraps="leather", neckband="kit2", helmspike="metal", pennant=0.3)
    stance = dict(lean=10, legs={"l": (38, 20, 78), "r": (38, 20, 78)}, arms={"l": (50, 2, 46, -34), "r": (50, 2, 46, -34)},
                  hands="fist")
    jump = 0.3
    LIFT = 0.5
    lie, lie_shift = 0.2, 0.55

    def pose(self, name, i, n):
        from lib import anim
        ph = i / float(n)
        w = anim.wave(ph)
        p = dict(self.stance)
        b = 0.0                       # bounce height above the rest position
        if name == "idle":           # little impatient bounces: two states, plus a look round
            b = 0.1 * w["breath"]
            p.update(look=20 * w["s1"])
        elif name == "run":          # two big bounds per loop, leaning into them
            b = 0.34 * abs(w["s1"])
            p.update(lean=20, _tilt=0.18, _action=True)
        elif name == "cheer":
            b = 0.4 * w["up"]
            p.update(arms={"l": (50, 2, 46, -34), "r": (165, 20, 12)}, hand_modes={"r": "fist"}, lean=2)
        elif name == "fall":
            t = i / 7.0
            p = anim.biped_fall(self, i, n)
            p["hop"] = p.get("hop", 0) + self.LIFT * max(0.0, 1 - t * 1.6)
            p["_lift"] = self.LIFT
            p["_loose"] = min(1.0, t * 2)
            return p
        else:                        # block / pass: a pogo-powered body slam
            k = [0, -0.3, 0.5, 1.0, 1.0, 0.5, 0.2, 0][i]
            b = 0.3 * max(0.0, k) + (0.0 if k >= 0 else -0.06)
            p.update(lean=10 + 26 * max(0.0, k), shift=0.3 * max(0.0, k), _tilt=0.25 * max(0.0, k))
        legs = 78 - 150 * b            # legs straighten as he rises off the spring
        p["legs"] = {"l": (38 - 40 * b, 20, max(20, legs)), "r": (38 - 40 * b, 20, max(20, legs))}
        p["hop"] = self.LIFT + b
        p["_lift"] = self.LIFT + b
        return p

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        gob_face(J, L, tag, ears=0.95)
        c, X, F, U, s = sf.hf(J)
        if L.get("helmspike"):
            cone(tag + "helmspike", c + U * s[2] * 1.05, c + U * (s[2] * 1.05 + 0.26), 0.07, L["helmspike"], 6)
        tband(tag + "hem", J, P, [0.0, 0.07], "kit2", k=1.05, add=0.012, solid=0.03)
        gl, gr = J["grip_l"][0], J["grip_r"][0]
        loose = pose.get("_loose", 0.0)
        la, ra = J["legs"]["l"][2], J["legs"]["r"][2]
        feet = lerp(la, ra, 0.5)
        if "hand_modes" in pose:      # one-handed cheer: keep the bar where the left hand is
            top = gl + J["X"] * 0.12
        else:
            top = lerp(gl, gr, 0.5)
        top = top + Vector((0, 0, 0.0))
        lift = pose.get("_lift", self.LIFT)
        Fw = Vector((0, -1, 0))
        foot = Vector((feet.x, feet.y, 0)) + Fw * (0.16 - pose.get("_tilt", 0.0)) + UP * (-lift)
        if loose:
            top = lerp(top, Vector((0.45, feet.y, 0.75)), loose)
            foot = lerp(foot, Vector((0.45, feet.y, -0.35)), loose)
        ax = (top - foot).normalized()
        tube(tag + "stick", [top + ax * 0.1, foot + ax * 0.3], [0.05, 0.05], "wood", n=6)
        tube(tag + "bar", [top - J["X"] * 0.3, top + J["X"] * 0.3], [0.035, 0.035], "darkmetal", n=6)
        for sd in (-1, 1):
            ball_at(tag + "barend%d" % sd, top + J["X"] * sd * 0.3, 0.05, "kit2")
        peg = Vector((feet.x, feet.y, feet.z - 0.1)) if not loose else foot + ax * 0.45
        pegc = foot + ax * max(0.3, (peg - foot).dot(ax))
        tube(tag + "pegs", [pegc - J["X0"] * 0.3, pegc + J["X0"] * 0.3], [0.04, 0.04], "darkmetal", n=6)
        # spring: rings between the pegs and the foot, squeezed when he is low
        tube(tag + "plunger", [foot, pegc], [0.035, 0.035], "darkmetal", n=5)
        for i in range(4):
            q = lerp(foot + ax * 0.05, pegc - ax * 0.03, i / 3.0)
            tube(tag + "coil%d" % i, [q - ax * 0.025, q + ax * 0.025], [0.1, 0.1], "metal", n=8)
        ball_at(tag + "ferrule", foot + ax * 0.02, 0.05, "kit1")
        # pennant on the stick top
        ln = L.get("pennant")
        if ln:
            Bh = Vector((0, 1, 0))
            st = 1.0 if pose.get("_action") else 0.25
            pts = sf.hang(top + ax * 0.1, Bh, J["X"], ln, n=max(3, int(ln * 10)), stream=st)
            sf.streamer(tag, "pennant", pts, 0.06, ("kit2", "kit1"), ref=J["X"])
        if L.get("banner"):           # a tall banner pole strapped to his back, the flag streaming behind
            b0 = core.surf(J, P, 0.05, 180, 0.08)
            ptop = b0 + J["u"] * 1.75 + J["B"] * 0.05
            tube(tag + "bannerpole", [b0 - J["u"] * 0.1, ptop], [0.03, 0.025], "wood", n=5)
            ball_at(tag + "bannertop", ptop, 0.045, "kit2")
            Bh = Vector((0, 1, 0))
            droop = 0.02 if pose.get("_action") else 0.12
            Xs = J["X0"]
            cols = []
            for j in range(4):           # a flag of three panels flying out behind the pole
                off = Bh * (0.17 * j) + Xs * (0.04 * ((j % 2) * 2 - 1) * (j > 0)) - UP * (droop * j * 0.6)
                cols.append((ptop - UP * 0.04 + off, ptop - UP * 0.44 + off))
            for j, m in enumerate(("kit1", "kit2", "kit1")):
                sheet(tag + "banner%d" % j, [[cols[j][0], cols[j + 1][0]], [cols[j][1], cols[j + 1][1]]], [m], thick=0.03,
                      subsurf=0)
