"""Dwarf team (models dwarf_lineman, dwarf_runner, dwarf_blitzer, troll_slayer, deathroller). The three
plain dwarfs are also used by Old World Alliance. Costume: hold-forged iron. Beards are the identity,
and each position wears a different one. No figure holds anything.

Silhouettes: lineman = full-face bucket helm, square slab beard, wide plate, plates strapped to the
forearms; runner = bare-headed with a headband, two long plaits, sleeveless and unarmoured; blitzer =
winged open helm with a tall kit crest, one long ringed beard; troll slayer = towering orange crest and
bushy beard, bare tattooed chest; deathroller = steam roller in kit paint with a goggled driver.
"""
import math
from mathutils import Vector, Matrix
from lib import Biped, Vehicle, register, core, parts
from lib.core import tube, tband, ball_at, box, cone, cap, ellipsoid, flat_cone, lerp, UP, basis, D, surf
from teams import greenskins_dwarfs_common as gd

DWARF = dict(beard=None, boots="boot", cuff="leather", belt="leather", buckle="brass", trim="brass")

def _forearm_plate(J, tag, side, mat="kit1", rim="kit2", boss="brass", k=1.0):
    """A square plate strapped to the outside of a forearm (a shield-wall bracer; nothing is held)."""
    sd = -1 if side == "l" else 1
    sh, el, wr, tip = J["arms"][side]
    d = (wr - el).normalized()
    out = J["X"] * sd
    out = (out - d * out.dot(d)).normalized()
    R = basis(d.cross(out).normalized(), out, d)
    c = lerp(el, wr, 0.55) + out * 0.1 * k
    box(tag + "fplrim" + side, c - out * 0.012, (0.25 * k, 0.03, 0.31 * k), rim, R)
    box(tag + "fpl" + side, c + out * 0.012, (0.19 * k, 0.035, 0.25 * k), mat, R)
    box(tag + "fplboss" + side, c + out * 0.04, (0.07 * k, 0.03, 0.07 * k), boss, Matrix.Rotation(D(45), 3, out) @ R)

def _tattoo_arm(J, L, tag, side, mat="cloth_blue"):
    sh, el, wr, tip = J["arms"][side]
    ak = L["limb"] * core.LIMB * L["arm"]
    for i, t in enumerate((0.3, 0.55)):
        tube(tag + "tatarm%s%d" % (side, i), [lerp(sh, el, t), lerp(sh, el, t + 0.1)], [0.112 * ak, 0.11 * ak], mat, ref=J["F"], n=8)

@register
class DwarfLineman(Biped):
    """Shield-wall dwarf: full-face bucket helm with a slit visor and kit ridge, square slab of a beard
    with a kit clasp, broad plate pauldrons, square kit plates strapped to both forearms."""
    key = "dwarf_lineman"
    race = "dwarf"
    knobs = dict(shoulders=1.22, torso=1.26)
    layout = dict(DWARF, torso="kit1", arms="kit1", legs="kit2", helm="winged", helm_mat="metal", crest_mat="kit1",
                  pads="plate", pad_mat="metal", pad_trim="kit2", breast="metal", emblem_mat="kit2", gorget=True,
                  kneecops=True, knee_mat="metal", belt="kit2", pant_stripe="kit1", tabard="kit1", tabard_trim="kit2")
    stance = dict(lean=4, legs={"l": (4, 18, 12), "r": (-3, 18, 12)}, arms={"l": (30, 30, 84, -30), "r": (30, 30, 84, -30)},
                  hands="fist")
    stride, arm_swing, run_lean, jump = 28, 24, 10, 0.1
    lie, lie_shift = 0.2, 0.55

    def idle(self, ph, p, w):       # shield wall: drops into a brace behind his forearm plates, then eases up
        b = 1.0 if w["s1"] > 0 else 0.0
        arm = (30 + 22 * b, 30 - 12 * b, 84 + 14 * b, -30 - 14 * b)
        p.update(lean=4 + 6 * b, legs={"l": (4, 18, 12 + 14 * b), "r": (-3, 18, 12 + 14 * b)}, arms={"l": arm, "r": arm},
                 look=14 * w["s2"] * (1 - b))

    def extras(self, J, P, L, tag, pose):
        gd.beard(J, tag, "hair_brown", "spade", ln=1.3, tie="kit2", wide=1.15, pose=pose)
        for side in ("l", "r"):
            _forearm_plate(J, tag, side)
        gd.rivets(J, P, tag, "criv", 0.3, "brass", angles=(-120, -60, 60, 120), off=0.07, r=0.026)

@register
class DwarfRunner(Biped):
    """The quick one: bare-headed with a kit headband and swept-back hair, two long plaits tied in kit
    colour, sleeveless kit jerkin, bare arms with wraps, no armour at all."""
    key = "dwarf_runner"
    race = "dwarf"
    knobs = dict(limb=1.05, shoulders=1.02, torso=1.02, legs=0.66)
    layout = dict(DWARF, torso="kit1", arms="skin_fair", legs="kit2", hair="swept", hair_mat="hair_blond", brow="hair_blond",
                  wraps="bandage", belt="kit2", neckband="kit2", pant_stripe="kit1", cuff="kit1", arm_band="kit1")
    stance = dict(lean=10, twist=-6, legs={"l": (-10, 9, 10), "r": (14, 9, 14)}, feet={"l": 18},
                  arms={"l": (24, 16, 62, 4), "r": (-14, 18, 54)}, hands="fist")
    stride, arm_swing, run_lean, jump = 44, 40, 20, 0.2
    lie, lie_shift = 0.18, 0.5
    height = 1.0

    def idle(self, ph, p, w):       # jogs on the spot: knees pump alternately, plaits bouncing
        l, r = w["up"], w["dn"]
        p.update(legs={"l": (-10 + 40 * l, 9, 10 + 60 * l), "r": (14 + 26 * r, 9, 14 + 60 * r)},
                 arms={"l": (24 - 40 * l, 16, 62, 4), "r": (-14 + 40 * l, 18, 54)}, _action=False)

    def extras(self, J, P, L, tag, pose):
        gd.beard(J, tag, "hair_blond", "fork", ln=1.15, tie="kit2", pose=pose)
        c, X, F, U, s = gd.hf(J)
        cap(tag + "hband", c + U * 0.01, (s[0] * 1.12, s[1] * 1.12, s[2] * 1.1), "kit2", U, cut=0.3, hi=0.56, rot=J["head_R"],
            thick=0.03)
        k0 = c - F * s[1] * 1.1 + U * s[2] * 0.42
        act = pose.get("_action")
        for sd in (-1, 1):
            tip = k0 + ((-F * 0.36 + U * 0.06) if act else (-F * 0.12 - U * 0.3)) + X * sd * 0.1
            flat_cone(tag + "hbtail%d" % sd, k0, tip, 0.07, "kit2", U if act else F, 0.3)
        tband(tag + "hem", J, P, [0.04, 0.09], "kit2", k=1.06, add=0.02)
        gd.baldric(J, P, tag, "leather", sd=1, r=0.035)

@register
class DwarfBlitzer(Biped):
    """The star: open helm with swept kit wings and a tall kit crest, one long beard bound with brass
    rings, big kit pauldrons with a spike, gauntlets and greaves. Head down, ready to ram."""
    key = "dwarf_blitzer"
    race = "dwarf"
    knobs = dict(shoulders=1.28, torso=1.22)
    layout = dict(DWARF, torso="kit1", arms="kit1", legs="kit2", helm="open", helm_mat="metal", helm_wings="kit2", plume="kit1",
                  trim="brass", pads="big", pad_mat="kit1", pad_trim="kit2", spikes=1, breast="metal", emblem_mat="kit2",
                  gauntlets=True, greaves=True, kneecops=True, belt="kit2", loin="kit1", loin_trim="kit2")
    stance = dict(lean=12, nod=-6, legs={"l": (14, 14, 14), "r": (-12, 14, 12)}, arms={"l": (14, 34, 70, -12), "r": (-2, 34, 64, -12)},
                  hands="fist")
    stride, arm_swing, run_lean, jump = 34, 30, 18, 0.13
    lie, lie_shift = 0.2, 0.55
    height = 1.03

    def idle(self, ph, p, w):       # lowers his crest like a ram and stamps, then tosses his head back up
        b = 1.0 if w["s1"] > 0 else 0.0
        p.update(lean=12 + 6 * b, nod=-6 - 14 * b + 8 * w["dn"],
                 legs={"l": (14, 14, 14), "r": (-12 + 16 * w["up"], 14, 12 + 30 * w["up"])},
                 arms={"l": (14 + 10 * b, 34, 70 + 16 * b, -12), "r": (-2 - 10 * b, 34, 64 + 16 * b, -12)})

    def extras(self, J, P, L, tag, pose):
        gd.beard(J, tag, "hair_red", "long", ln=1.1, tie="brass", pose=pose)
        gd.cheek_guards(J, tag, "metal", "brass")

@register
class TrollSlayer(Biped):
    """Oath-bound berserker: towering orange crest, wild orange beard, bare chest and arms with blue
    tattoo bands, kit trousers and a long kit sash. Always roaring."""
    key = "troll_slayer"
    race = "dwarf"
    knobs = dict(shoulders=1.2, torso=1.14, limb=1.3)
    layout = dict(DWARF, torso="skin_fair", arms="skin_fair", legs="kit1", pant_stripe="kit2", belt="kit2", buckle="brass",
                  brow="gd_hair_orange", loin="kit2", loin_trim="kit1", arm_band="kit1", bracers="leather", cuff="kit2")
    stance = dict(lean=2, nod=-8, jaw=16, legs={"l": (8, 18, 10), "r": (-7, 18, 10)}, arms={"l": (0, 50, 80, -40), "r": (0, 50, 80, -40)},
                  hands="fist")
    stride, arm_swing, run_lean, jump = 38, 36, 20, 0.2
    lie, lie_shift = 0.19, 0.55
    height = 1.05

    def idle(self, ph, p, w):       # flexes both arms and bellows a challenge, crest shaking
        k = w["up"]
        arm = (0 + 20 * k, 50 + 26 * k, 80 + 40 * k, -40 - 30 * k)
        p.update(arms={"l": arm, "r": arm}, nod=-8 - 14 * k, jaw=16 + 24 * k, look=12 * w["s2"] * k,
                 lean=2 - 5 * (1 if k > 0.5 else 0))

    def adjust(self, name, i, pose):
        pose.setdefault("jaw", 22)
        return pose

    def extras(self, J, P, L, tag, pose):
        gd.mohawk(J, tag, "gd_hair_orange", h=0.62, n=7, lo=0.5, back=-0.8, width=0.07)
        gd.beard(J, tag, "gd_hair_orange", "bush", ln=1.0, wide=1.1, pose=pose)
        # tattoos: blue chevrons on the chest and back, bands on the upper arms
        for i, h in enumerate((0.36, 0.27)):
            gd.strap(J, P, tag, "tatl%d" % i, "cloth_blue", -62, h + 0.07, 0, h - 0.03, r=0.022, off=0.012)
            gd.strap(J, P, tag, "tatr%d" % i, "cloth_blue", 62, h + 0.07, 0, h - 0.03, r=0.022, off=0.012)
        gd.strap(J, P, tag, "tatbk", "cloth_blue", 120, 0.4, 240, 0.4, r=0.024, off=0.012)
        gd.strap(J, P, tag, "tatbk2", "cloth_blue", 180, 0.16, 180, 0.36, r=0.024, off=0.012)
        for side in ("l", "r"):
            _tattoo_arm(J, L, tag, side)
        # sash tails at the hip
        X, B = J["X"], J["B"]
        start = J["pelvis"] + J["u"] * 0.05 + X * (core.tprof(P, 0.05)[0] + 0.03)
        ball_at(tag + "sashknot", start, 0.065, "kit2")
        Bh = Vector((B.x, B.y, 0)).normalized()
        for i, off in enumerate((0.0, 0.07)):
            if pose.get("_action"):
                pts = [start, start + Bh * 0.22 + UP * (0.04 + off), start + Bh * 0.46 + UP * (0.06 + off)]
            else:
                pts = [start, start - UP * 0.14 + X * (0.03 + off), start - UP * 0.3 + X * (0.04 + off * 1.5)]
            tube(tag + "sash%d" % i, pts, [0.05, 0.055, 0.02], "kit2", ref=X, n=6, flat=0.4)

# ---------------------------------------------------------------------------- deathroller
class RollerDriver(Biped):
    """Soot-stained engineer: leather cap, brass goggles, forked white beard, kit coat."""
    race = "dwarf"
    knobs = dict(shoulders=1.2, torso=1.2, head=1.2)
    layout = dict(DWARF, torso="kit1", arms="kit1", helm="skull", helm_mat="leather", gauntlets=True, pads="leather",
                  neckband="kit2", sleeve_cuff="kit2")
    stance = dict(lean=8, legs={"l": (0, 8, 0), "r": (0, 8, 0)}, arms={"l": (40, 24, 50, -10), "r": (40, 24, 50, -10)}, hands="fist")

    def extras(self, J, P, L, tag, pose):
        gd.beard(J, tag, "hair_white", "fork", ln=0.8, tie="kit2", pose=pose)
        gd.goggles(J, tag, level=0.14, k=1.3)
        gd.helm_spike(J, tag, "brass", h=0.16, r=0.06)

@register
class Deathroller(Vehicle):
    """Steam roller in team paint: riveted kit hull with a secondary-colour stripe, spiked iron drum behind
    a toothed kit ram plate, brass-banded boiler and tall smoking funnel, a kit pennant, and a goggled
    driver hauling on the levers."""
    key = "deathroller"
    size = (0.95, 1.25, 0.6)
    drum = (0.46, 1.12)
    wheels = 0.36
    hull, trim, roof = "kit1", "kit2", "darkmetal"
    funnel = False
    driver = RollerDriver
    driver_at = (0.0, 0.92)
    height = 1.0

    def idle(self, ph, p, w):       # the engine shudders in two states and puffs; the driver shakes a fist
        p["hop"] = 0.025 * w["breath"]
        p["rattle"] = 1 if w["s2"] > 0 else -1
        if "driver" in p:
            k = w["up"]
            p["driver"]["arms"] = {"l": (40, 24, 50, -10), "r": (40 + 90 * k, 24 + 10 * k, 50 + 50 * k + 14 * w["s2"] * k, -10)}
            p["driver"]["hand_modes"] = {"r": "fist"}
            p["driver"]["look"] = 16 * w["s1"]
        return p

    def extras(self, tag, pose, c):
        wd, ln, ht = self.size
        X, F = Vector((1, 0, 0)), Vector((0, -1, 0))
        dr, dw = self.drum
        dc = Vector((0, -ln / 2 - dr * 0.55, dr))
        spin = D(pose.get("spin", 0))
        # drum: end caps in kit2, rows of long spikes that turn with it
        for sx in (-1, 1):
            parts.cylinder(tag + "drumcap%d" % sx, dc + X * sx * (dw / 2 - 0.02), dc + X * sx * (dw / 2 + 0.05), dr * 0.78, "kit2", seg=14)
            ball_at(tag + "drumhub%d" % sx, dc + X * sx * (dw / 2 + 0.06), 0.09, "brass")
        for j in range(6):
            a = spin + j * math.pi / 3 + math.pi / 6
            dd = Vector((0, math.sin(a), math.cos(a)))
            for sx in (-0.38, 0.0, 0.38):
                cone(tag + "dspk%d_%d" % (j, int(sx * 10) + 5), dc + X * dw * sx + dd * dr * 0.9, dc + X * dw * sx + dd * (dr + 0.17), 0.065,
                     "brass", 5)
        # ram plate above the drum with a row of teeth
        top = c + UP * (ht / 2)
        pc = Vector((0, -ln / 2 + 0.1 - 0.05, c.z + ht * 0.28))
        box(tag + "ram", pc, (wd * 1.12, 0.07, ht * 0.75), "kit1")
        box(tag + "ramtrim", pc + UP * (ht * 0.375), (wd * 1.16, 0.09, 0.07), "kit2")
        box(tag + "ramemb", pc + F * 0.04, (0.26, 0.04, 0.26), "kit2", Matrix.Rotation(D(45), 3, F))
        for i in range(5):
            b = pc + X * wd * (-0.48 + 0.24 * i) + UP * (ht * 0.41)
            cone(tag + "ramtooth%d" % i, b, b + UP * 0.17 + F * 0.05, 0.06, "metal", 5)
        # hull: side stripes, rivets
        for sx in (-1, 1):
            box(tag + "stripe%d" % sx, c + X * sx * (wd / 2 + 0.005) + UP * 0.05, (0.03, ln * 0.96, 0.13), "kit2")
            for i in range(5):
                ball_at(tag + "hriv%d_%d" % (sx, i), c + X * sx * (wd / 2 + 0.02) + Vector((0, ln * (-0.4 + 0.2 * i), -ht * 0.3)), 0.035, "brass")
        # boiler at the back with brass bands, funnel with kit rim and smoke
        r = 1 if pose.get("rattle", 0) > 0 else 0
        bc = top + Vector((0, ln * 0.36, 0.2))
        parts.cylinder(tag + "boiler", bc - X * wd * 0.44, bc + X * wd * 0.44, 0.27, "darkmetal", seg=12)
        for sx in (-0.3, 0.0, 0.3):
            parts.cylinder(tag + "bband%d" % int(sx * 10 + 5), bc + X * (wd * sx - 0.03), bc + X * (wd * sx + 0.03), 0.285, "brass", seg=12)
        fb = bc + X * wd * 0.22 + UP * 0.2
        parts.cylinder(tag + "funnel", fb, fb + UP * 0.62, 0.1, "darkmetal", seg=8)
        parts.cylinder(tag + "funnelrim", fb + UP * 0.56, fb + UP * 0.66, 0.14, "kit2", seg=8)
        pf = pose.get("puff", 0)
        ball_at(tag + "puff", fb + UP * (0.78 + 0.3 * pf), 0.08 + 0.08 * pf, "white")
        ball_at(tag + "puff2", fb + UP * (1.0 + 0.3 * pf) + Vector((0, 0.1, 0)), 0.05 + 0.05 * pf, "white")
        # pressure valve that pops in the idle
        vb = bc - X * wd * 0.25 + UP * 0.26
        parts.cylinder(tag + "valve", vb, vb + UP * (0.1 + 0.06 * r), 0.045, "brass", seg=6)
        # control levers in front of the driver (he grips nothing: they stand free)
        for sx in (-1, 1):
            lb = top + Vector((sx * 0.3, -ln * 0.22, 0))
            tube(tag + "lever%d" % sx, [lb, lb + UP * 0.3 + F * 0.06 * sx * (1 if r else -1)], [0.025, 0.025], "darkmetal", n=5)
            box(tag + "leverknob%d" % sx, lb + UP * 0.32 + F * 0.06 * sx * (1 if r else -1), (0.06, 0.06, 0.08), "brass")
        # pennant on the back corner
        gd.flag(tag, top + Vector((-wd * 0.42, ln * 0.44, 0)), UP, Vector((0, 1, 0)), "kit1", "kit2", h=0.95, w=0.42,
                wave=1.0 if pose.get("spin") else float(r))
