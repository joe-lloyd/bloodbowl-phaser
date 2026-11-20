"""Snotling team (small-folk batch): snotling, stilty_runna, fun_hoppa, fungus_flinga, pump_wagon.

Costume idea: a mushroom-cellar rabble in sackcloth smocks (primary colour) with a secondary-colour hem.
They are about 22 px tall, so each position is one big prop: stilts, a bouncing toadstool, a back-sack,
a pump cart. Nothing round is ever held in a hand."""
import math
from mathutils import Vector, Matrix
from lib import Biped, Vehicle, register, core, parts, anim, looks
from lib.core import tube, tband, ball_at, box, cone, flat_cone, ellipsoid, cap, sheet, lerp, UP, basis, D
from teams import small_folk_common as sf

SNOT = dict(skin="skin_goblin", torso="kit1", arms="skin_goblin", legs="skin_goblin", boots="skin_goblin", cuff=None,
            coat="gambeson", hem="kit2", belt="rope", buckle=None, hair=None, fangs=False)


def snot_face(J, L, tag, ears=1.15, nose=0.12):
    sf.big_ears(J, L, tag, size=ears, up=0.15, back=0.15)
    sf.long_nose(J, L, tag, ln=nose, r=0.06, droop=0.02)


def snot_hat(J, L, tag, pose):
    """The head option shared by the snotlings: a floppy cone, a headband, a pot helmet or a toadstool cap."""
    hat = L.get("snothat")
    if hat == "cone":
        sf.pointy_hat(J, tag, "kit2", band="kit1", h=0.5, bend=0.3, r=1.0, tip="kit1")
    elif hat == "band":
        headband(J, tag, pose)
    elif hat == "pot":
        sf.pot_helm(J, tag)
    elif hat == "toadstool":
        sf.toadstool_hat(J, tag, r=1.5, lift=0.35)


def headband(J, tag, pose, mat="kit2", ln=0.36):
    c, X, F, U, s = sf.hf(J)
    tube(tag + "hband", [c + U * s[2] * 0.42, c + U * s[2] * 0.6], [s[0] * 1.04, s[0] * 0.94], mat, ref=X, n=10)
    Bh = Vector((0, 1, 0))
    k = c - F * s[1] * 0.95 + U * s[2] * 0.45
    ball_at(tag + "hbknot", k, 0.05, mat)
    st = 1.0 if pose.get("_action") else 0.15
    for i, sw in enumerate((-0.25, 0.25)):
        pts = sf.hang(k, Bh, X, ln, n=3, stream=st, sway=sw)
        sf.streamer(tag, "hbtail%d" % i, pts, 0.05, (mat,), ref=X)


@register
class Snotling(looks.Fine, Biped):
    """The plain one: bare head with a hair tuft, sack smock, big neckerchief. Jumps up and down for attention."""
    key = "snotling"
    race = "snotling"
    layout = dict(SNOT, neckband="kit2", tuft=True, kerchief="kit2")
    stance = dict(lean=2, legs={"l": (6, 16, 10), "r": (-5, 16, 10)}, arms={"l": (20, 40, 60, 10), "r": (20, 40, 60, 10)},
                  hands="open")
    stride, arm_swing, jump = 42, 40, 0.3

    def idle(self, ph, p, w):       # hops on the spot waving both arms: two states, hands flapping
        k = w["breath"]
        a = 20 + 135 * k
        p.update(hop=0.12 * k, look=18 * w["s1"],
                 arms={"l": (a, 40, 40 + 25 * w["s2"], 10), "r": (a, 40, 40 - 25 * w["s2"], 10)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        snot_face(J, L, tag)
        sf.grin(J, tag, w=0.7)
        c, X, F, U, s = sf.hf(J)
        if L.get("tuft"):
            for i, dx in enumerate((-0.07, 0.0, 0.07)):      # scruffy tuft
                b = c + U * s[2] * 0.92 + X * dx
                cone(tag + "tuft%d" % i, b, b + U * (0.16 + 0.05 * (i == 1)) + X * dx * 1.5 - F * 0.04, 0.045, "hair", 5)
        snot_hat(J, L, tag, pose)
        if L.get("kerchief"):
            k = core.surf(J, P, P["sh_h"] - 0.02, 0, 0.05)      # neckerchief point on the chest
            flat_cone(tag + "kerchief", k + UP * 0.03, k - UP * 0.2 + J["F"] * 0.03, 0.13, L["kerchief"], J["F"], squash=0.25)
        if L.get("scarf_tails"):                           # a striped scarf far too long for him
            sf.scarf(J, P, tag, pose, mats=("kit2", "kit1"), wrap="kit2", tails=((-40, 0.55, -0.1, 1), (-150, 0.7, -0.2, -1)),
                     r=0.12)

    def details(self, J, P, L, tag, pose):
        R = basis(J["X"], J["F"], J["u"])
        box(tag + "patch0", core.surf(J, P, 0.05, 140, 0.07), (0.09, 0.02, 0.08), "kit2", R)
        box(tag + "patch1", core.surf(J, P, -0.08, -60, 0.1), (0.08, 0.02, 0.07), "rags", R)


@register
class StiltyRunna(looks.Fine, Biped):
    """Teeters on two tall banded stilts, arms out for balance, in a tall floppy cone hat."""
    key = "stilty_runna"
    race = "snotling"
    layout = dict(SNOT, snothat="cone")
    stance = dict(lean=4, legs={"l": (8, 10, 12), "r": (-6, 10, 12)}, arms={"l": (0, 70, 10, 60), "r": (0, 70, 10, 60)},
                  hands="open")
    stride, arm_swing, jump = 24, 0, 0.1
    LIFT = 1.0
    lie, lie_shift = 0.15, 0.5

    def pose(self, name, i, n):
        w = anim.wave(i / float(n))
        p = anim.BIPED[name](self, i, n)
        if name == "fall":
            t = i / 7.0
            p["hop"] = p.get("hop", 0) + self.LIFT * max(0.0, 1 - t * 1.6)
            return p
        if name == "idle":          # wobbles: arms see-saw, tiny steps from stilt to stilt in two states
            k = 1 if w["s1"] > 0 else -1
            p.update(roll=3 * k, arms={"l": (0, 70 + 14 * w["s2"], 10, 60), "r": (0, 70 - 14 * w["s2"], 10, 60)},
                     legs={"l": (8 + 6 * k, 10, 12), "r": (-6 - 6 * k, 10, 12)}, look=12 * w["c1"])
        elif name == "run":
            p["arms"] = {"l": (0, 74 + 12 * w["s1"], 10, 60), "r": (0, 74 - 12 * w["s1"], 10, 60)}
            p["hands"] = "open"
        p["hop"] = p.get("hop", 0) + self.LIFT
        return p

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        snot_face(J, L, tag)
        c, X, F, U, s = sf.hf(J)
        snot_hat(J, L, tag, pose)
        for side, sd in (("l", -1), ("r", 1)):
            hip, knee, ankle, toe = J["legs"][side]
            d = ((ankle - knee).normalized() - UP * 0.8).normalized()
            o = J["X0"] * sd * 0.07
            top = knee + o + UP * 0.05
            end = ankle + o + d * (self.LIFT + 0.1)
            tube(tag + "stilt" + side, [top, ankle + o, end], [0.08, 0.08, 0.07], "bone_old", n=6)
            box(tag + "rest" + side, ankle - UP * 0.1 + Vector((0, -0.06, 0)), (0.16, 0.24, 0.05), "wood")
            for j, t in enumerate((0.3, 0.6, 0.9)):
                q = lerp(ankle + o, end, t)
                tube(tag + "sband%s%d" % (side, j), [q - d * 0.1, q + d * 0.1], [0.1, 0.1], "kit2", n=6)
            tube(tag + "stie" + side, [lerp(knee, ankle, 0.55) - UP * 0.03, lerp(knee, ankle, 0.55) + UP * 0.03], [0.1, 0.1],
                 "kit1", n=8)


@register
class FunHoppa(looks.Fine, Biped):
    """Rides a fat spotted toadstool like a space-hopper, reins in both fists, headband tails flying."""
    key = "fun_hoppa"
    race = "snotling"
    layout = dict(SNOT, coat=None, snothat="band")
    stance = dict(lean=6, legs={"l": (58, 52, 74), "r": (58, 52, 74)}, arms={"l": (48, 10, 40, -10), "r": (48, 10, 40, -10)},
                  hands="fist")
    jump = 0.3
    H, R, SEAT = 0.72, 0.6, 0.06
    lie, lie_shift = 0.2, 0.4
    _pz = None

    def pz(self):
        if self._pz is None:
            L = self.make_layout({})
            FunHoppa._pz = core.skeleton(self.proportions(L), self.stance)["pelvis"].z
        return self._pz

    def pose(self, name, i, n):
        ph = i / float(n)
        w = anim.wave(ph)
        p = dict(self.stance)
        S, air = self.H, 0.0
        if name == "fall":
            t = i / 7.0
            p = anim.biped_fall(self, i, n)
            p["hop"] = p.get("hop", 0) + (self.H - self.pz() + self.SEAT) * max(0.0, 1 - t * 1.6)
            p["_loose"] = min(1.0, t * 1.6)
            return p
        if name == "idle":           # jiggles on the springy cap in two states and looks about
            S = self.H * (1 - 0.14 * w["breath"])
            p.update(look=22 * w["s1"])
        elif name == "run":          # two bounds per loop; the cap squashes when it lands
            a = abs(w["s1"])
            air = 0.34 * a
            S = self.H * (0.74 if a < 0.3 else 1.04)
            p.update(lean=16, _action=True)
        elif name == "cheer":
            air = 0.4 * w["up"]
            S = self.H * (0.8 if w["s1"] < -0.3 else 1.0)
            p.update(arms={"l": (48, 10, 40, -10), "r": (165, 20, 12)}, lean=0)
        else:                        # block / pass: a bouncing body slam
            k = [0, -0.3, 0.5, 1.0, 1.0, 0.5, 0.2, 0][i]
            air = 0.28 * max(0.0, k)
            S = self.H * (0.72 if k < 0 else 1.0)
            p.update(lean=6 + 24 * max(0.0, k), shift=0.3 * max(0.0, k), _action=k > 0.3)
        p["hop"] = S + air - self.pz() + self.SEAT
        p["_S"], p["_air"] = S, air
        return p

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        snot_face(J, L, tag)
        sf.grin(J, tag, w=0.7)
        snot_hat(J, L, tag, pose)
        tband(tag + "hem", J, P, [0.0, 0.07], "kit2", k=1.05, add=0.012, solid=0.03)
        loose = pose.get("_loose", 0.0)
        S, air = pose.get("_S", self.H), pose.get("_air", 0.0)
        pel = J["pelvis"]
        top = pel - UP * self.SEAT
        base = Vector((pel.x, pel.y + 0.03, top.z - S))
        axis = UP
        if loose:                    # thrown off: the toadstool topples over beside him
            X = J["X0"]
            base = lerp(base, pel + X * 0.3 - UP * 0.05, loose)
            axis = (UP * (1 - loose) + X * loose + Vector((0, -0.3, 0)) * loose).normalized()
        sq = max(0.6, min(1.1, S / self.H))
        sf.mushroom(tag, "ride", base, S / sq, self.R, spots="kit2", squash=sq, axis=axis, nspots=7, seed=4, spot_r=0.2)
        tube(tag + "girth", [base + axis * S * 0.2, base + axis * S * 0.36], [self.R * 0.44, self.R * 0.42], "kit1", n=10)
        if not loose:                # rope reins from a knot on the cap front to the fists
            k = base + axis * (S - 0.02) + Vector((0, -self.R * 0.72, 0))
            for side in ("l", "r"):
                g = J["grip_" + side][0]
                tube(tag + "rein" + side, [k, lerp(k, g, 0.5) - UP * 0.04, g], [0.02] * 3, "rope", n=5)


@register
class FungusFlinga(looks.Fine, Biped):
    """Bent under a bulging sack of toadstools taller than he is, with a wide toadstool cap for a hat."""
    key = "fungus_flinga"
    race = "snotling"
    knobs = dict(hunch=14)
    layout = dict(SNOT, snothat="bigcap", load="sack")
    stance = dict(lean=10, legs={"l": (10, 16, 16), "r": (-8, 16, 16)}, arms={"l": (14, 30, 50, 0), "r": (14, 30, 50, 0)},
                  hands="open")
    stride, arm_swing, jump = 36, 30, 0.18

    def idle(self, ph, p, w):       # reaches back over his shoulder and rummages in the sack
        p.update(arms={"l": (14, 30, 50, 0), "r": (150 + 14 * w["s2"], 26, 100 + 20 * w["s2"], 0)}, look=-20 * w["breath"],
                 twist=-8 * w["breath"])

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        snot_face(J, L, tag, ears=1.0)
        if L.get("snothat") == "bigcap":
            sf.toadstool_hat(J, tag, r=1.7, lift=0.3)
        else:
            snot_hat(J, L, tag, pose)
        load = L.get("load")
        if not load:
            return
        sf.strap(tag, "sackstrap", J, P, "kit2", sd=1, r=0.045)
        B, u, Xb = J["B"], J["u"], J["X"]
        sc = core.surf(J, P, 0.2, 180, 0.24) + UP * 0.06
        Rb = basis(Xb, J["F"], u)
        if load == "sack":
            ellipsoid(tag + "sack", sc, (0.3, 0.26, 0.36), "sack", Rb, seg=12)
            tube(tag + "sackneck", [sc + u * 0.3, sc + u * 0.4], [0.17, 0.2], "sack", n=8)
            tube(tag + "sacktie", [sc + u * 0.28, sc + u * 0.33], [0.18, 0.18], "kit2", n=8)
            box(tag + "patch", sc + B * 0.25 - u * 0.05, (0.2, 0.05, 0.2), "kit2", Rb)
            box(tag + "patch2", sc + Xb * 0.28 + u * 0.05, (0.05, 0.16, 0.16), "kit1", Rb)
            crops = ((-0.08, 0.0, 0.2), (0.09, 0.05, 0.14), (0.0, -0.08, 0.1))
        else:                                # a tall wicker basket in kit1 bands, heaped higher with toadstools
            parts.cylinder(tag + "basket", sc - u * 0.3, sc + u * 0.34, 0.27, "wood", seg=12)
            for j, t in enumerate((-0.18, 0.05, 0.28)):
                parts.cylinder(tag + "basketband%d" % j, sc + u * (t - 0.04), sc + u * (t + 0.04), 0.285, "kit1", seg=12)
            crops = ((-0.1, 0.0, 0.24), (0.1, 0.06, 0.2), (0.0, -0.1, 0.16), (0.02, 0.1, 0.12))
        for i, (dx, dy, h) in enumerate(crops):
            sf.mushroom(tag, "crop%d" % i, sc + u * 0.36 + Xb * dx + B * dy, h, 0.11, nspots=3, seed=i, axis=u)


class PumpCrew(Biped):
    race = "snotling"
    layout = dict(SNOT, coat=None, neckband="kit2")
    variant = 0

    def extras(self, J, P, L, tag, pose):
        snot_face(J, L, tag, ears=1.0)
        if self.variant:
            headband(J, tag, pose, ln=0.25)
        else:
            c, X, F, U, s = sf.hf(J)
            cap(tag + "pot", c + U * 0.02, (s[0] * 1.14, s[1] * 1.14, s[2] * 1.12), "rust", U, cut=0.25, rot=J["head_R"], thick=0.03)
            cone(tag + "potspike", c + U * s[2] * 1.05, c + U * (s[2] * 1.05 + 0.18), 0.05, "metal", 5)


def crew_pose(s, mode):
    """s = height of this crewman's pump handle, -1 (down) .. 1 (up)."""
    low = (1 - s) / 2.0
    p = dict(lean=6 + 16 * low, nod=-4, legs={"l": (6 + 18 * low, 16, 12 + 40 * low), "r": (-5 + 18 * low, 16, 12 + 40 * low)},
             arms={"l": (70 + 34 * s, 6, 34 - 16 * s, -6), "r": (70 + 34 * s, 6, 34 - 16 * s, -6)}, hands="fist")
    if mode in ("cheer", "fall"):
        p.update(lean=-4, arms={"l": (150, 30, 20), "r": (158, 26, 10)}, hands="open", jaw=28)
    return p


@register
class PumpWagon(Vehicle):
    """A rickety plank cart worked by two snotlings on a see-saw pump handle: painted hull, spiked ram bar,
    a keg, and a tall crooked mast flying the team flag."""
    key = "pump_wagon"
    size = (0.82, 1.7, 0.4)
    drum = None
    wheels = 0.27
    hull, trim, roof = "kit1", "wood", "wood"
    funnel = False
    lie = 0.4

    def pose(self, name, i, n):
        p = Vehicle.pose(self, name, i, n)
        ph = i / float(n)
        cyc = {"idle": 1, "run": 2, "block": 2, "pass": 2}.get(name, 1)
        p["_pump"] = math.sin(2 * math.pi * ph * cyc)
        p["_mode"] = name
        p["_flag"] = 1 if (i % 4) < 2 else -1
        if name == "run":
            p["_flag"] = 2 if i % 2 else 3
        return p

    def idle(self, ph, p, w):       # ticking over: slow pumping, the whole cart rocking in two states
        p.update(roll=2.5 * (1 if w["s1"] > 0 else -1))

    def extras(self, tag, pose, c):
        wd, ln, ht = self.size
        X, F, B = Vector((1, 0, 0)), Vector((0, -1, 0)), Vector((0, 1, 0))
        wr = self.wheels
        zt = c.z + ht / 2
        spin = D(pose.get("spin", 0))
        for sx in (-1, 1):           # front wheels (smaller), plank sides
            wc = Vector((sx * (wd / 2 + 0.06), c.y - ln * 0.33, wr * 0.8))
            parts.cylinder(tag + "fwheel%d" % sx, wc - X * 0.06, wc + X * 0.06, wr * 0.8, "wood", seg=12)
            ball_at(tag + "fhub%d" % sx, wc + X * sx * 0.07, wr * 0.26, "brass")
            for j in range(4):
                a = spin + j * math.pi / 2
                dd = Vector((0, math.sin(a), math.cos(a)))
                ball_at(tag + "fspoke%d%d" % (sx, j), wc + X * sx * 0.07 + dd * wr * 0.55, wr * 0.12, "darkmetal")
            for j, (y, m) in enumerate(((-0.3, "wood"), (0.36, "wood"))):
                box(tag + "plank%d%d" % (sx, j), c + X * sx * (wd / 2 + 0.012) + B * ln * y * 0.8, (0.03, ln * 0.12, ht * 0.9), m)
            box(tag + "stripe%d" % sx, c + X * sx * (wd / 2 + 0.02) + UP * 0.02, (0.03, ln * 0.5, ht * 0.4), "kit2")
            box(tag + "rail%d" % sx, c + X * sx * (wd / 2 - 0.03) + UP * (ht / 2 + 0.07), (0.05, ln * 0.96, 0.06), "wood")
        fr = Vector((0, c.y - ln / 2 - 0.1, wr * 1.15))          # ram bar with spikes
        parts.cylinder(tag + "ram", fr - X * (wd / 2 + 0.12), fr + X * (wd / 2 + 0.12), 0.085, "darkmetal", seg=8)
        for j, sx in enumerate((-0.42, -0.14, 0.14, 0.42)):
            cone(tag + "ramspk%d" % j, fr + X * sx + F * 0.05, fr + X * sx + F * 0.3, 0.07, "bone", 5)
        for sx in (-1, 1):
            tube(tag + "ramarm%d" % sx, [fr + X * sx * 0.3, c + X * sx * 0.3 + F * ln * 0.4], [0.04, 0.04], "wood", n=5)
        # pump: post, rocking beam, cross handles
        s = pose.get("_pump", 0.0)
        pv = Vector((0, c.y, zt + 0.56))
        tube(tag + "post", [Vector((0, c.y, zt)), pv], [0.07, 0.05], "wood", n=6)
        box(tag + "postcap", pv, (0.14, 0.14, 0.1), "kit2")
        a = D(20 * s)
        dv = Vector((0, -math.cos(a), math.sin(a)))              # toward the front end
        half = 0.56
        tube(tag + "beam", [pv - dv * half, pv + dv * half], [0.06, 0.06], "kit2", n=6)
        for k, e in enumerate((-1, 1)):
            h = pv + dv * half * e
            tube(tag + "handle%d" % k, [h - X * 0.2, h + X * 0.2], [0.03, 0.03], "darkmetal", n=5)
        mode = pose.get("_mode", "idle")
        for k, (e, rot) in enumerate(((1, math.pi), (-1, 0.0))):  # front man faces back, rear man faces front
            m = PumpCrew()
            m.key = self.key + "_crew%d" % k
            m.variant = k
            sf.mounted(m, crew_pose(s * e, mode), Vector((0, c.y - e * (half + 0.16), zt)), rot)
        # keg and mast with the flag at the back
        kg = Vector((-wd * 0.26, c.y + ln * 0.36, zt))
        parts.cylinder(tag + "keg", kg, kg + UP * 0.3, 0.14, "kit1", seg=10)
        for j, t in enumerate((0.07, 0.23)):
            parts.cylinder(tag + "keghoop%d" % j, kg + UP * (t - 0.02), kg + UP * (t + 0.02), 0.15, "rust", seg=10)
        mb = Vector((wd * 0.3, c.y + ln * 0.42, zt))
        mt = mb + UP * 1.5 + X * 0.06 + B * 0.05
        tube(tag + "mast", [mb, lerp(mb, mt, 0.5) - X * 0.03, mt], [0.045, 0.035, 0.025], "wood", n=6)
        cone(tag + "masttip", mt, mt + UP * 0.12, 0.04, "bone", 5)
        fl = pose.get("_flag", 1)
        wave = {1: 0.05, -1: -0.05, 2: 0.1, 3: -0.02}[fl]
        droop = 0.0 if fl in (2, 3) else 0.1
        fh, fw = 0.36, 0.2
        cols = []
        for j in range(4):
            off = B * (fw * j) + X * (wave * math.sin(j * 1.6)) - UP * (droop * j * 0.6)
            cols.append((mt - UP * 0.03 + off, mt - UP * (0.03 + fh) + off))
        for j, m in enumerate(("kit1", "kit2", "kit1")):
            sheet(tag + "flag%d" % j, [[cols[j][0], cols[j + 1][0]], [cols[j][1], cols[j + 1][1]]], [m], thick=0.03, subsurf=0)
