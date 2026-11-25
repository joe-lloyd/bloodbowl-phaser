"""Shared parts for the greenskins_dwarfs batch (Orc, Black Orc, Ogre, Underworld Denizens, Dwarf).

Registers no models. The other greenskins_dwarfs_*.py files import these helpers. Every helper draws
under core.ROOT[0] and takes the joint dict J built by the biped plan. Nothing here is ball-like or
meant to be held in a hand.
"""
import math
from mathutils import Vector, Matrix
from lib import palette, parts, core
from lib.core import (ellipsoid, ball_at, cone, flat_cone, box, tube, loft, cap, lerp, basis, D, UP, surf, tband,
                      tprof)

# Batch materials. All of them reuse colours that are already in the master palette, so the shared
# palette does not grow.
palette.ramp("gd_skin_blackorc", "#243a22", "#3e6038", "#648a54")      # darker, duller than skin_orc
palette.ramp("gd_warp", "#3a7a34", "#6aff4a", "#f0ecf5")               # glowing mutation crystal
palette.ramp("gd_hair_orange", "#b03a18", "#e06a2a", "#ff8a1e")        # dyed slayer crest
palette.ramp("gd_iron", "#1a1020", "#2e2636", "#565a70")               # black iron plate

def hf(J):
    """(centre, side X, forward F, up U, radii s) of the head."""
    return parts.head_frame(J)

# ------------------------------------------------------------------ heads
def big_ears(J, L, tag, length=0.3, lift=0.45, back=0.08, width=0.42, mat=None, ring=None):
    """Large pointed goblinoid ears sticking out sideways (lift < 0 droops them)."""
    c, X, F, U, s = hf(J)
    mat = mat or L["skin"]
    for sd in (-1, 1):
        root = c + X * sd * s[0] * 0.88 + U * s[2] * 0.12
        tip = root + X * sd * length + U * (length * lift) - F * back
        flat_cone(tag + "bigear%d" % sd, root - X * sd * 0.04, tip, s[0] * width, mat, F, squash=0.28)
        if ring and sd > 0:
            ball_at(tag + "earring", lerp(root, tip, 0.55) - U * s[0] * 0.3, 0.035, ring)

def long_nose(J, L, tag, length=0.2, r=0.06, droop=0.25, mat=None):
    c, X, F, U, s = hf(J)
    mat = mat or L["skin"]
    a = c + F * s[1] * 0.9 - U * s[2] * 0.05
    b = a + F * length - U * length * droop
    tube(tag + "lnose", [a, lerp(a, b, 0.6) + U * 0.01, b], [r * 0.8, r, r * 0.75], mat, ref=X, n=6)

def brute_jaw(J, L, tag, k=1.0, mat=None):
    """Heavy underbite jaw (orcs, trolls, ogres)."""
    c, X, F, U, s = hf(J)
    ellipsoid(tag + "bjaw", c - U * s[2] * 0.6 + F * s[1] * 0.42, (s[0] * 0.8 * k, s[1] * 0.66 * k, s[2] * 0.38 * k),
              mat or L["skin"], J["head_R"], seg=10)

def big_tusks(J, tag, k=1.0, mat="bone", spread=0.36):
    c, X, F, U, s = hf(J)
    for sd in (-1, 1):
        b = c + F * s[1] * 0.92 - U * s[2] * 0.72 + X * sd * s[0] * spread
        cone(tag + "btusk%d" % sd, b, b + U * s[2] * 0.75 * k + F * 0.03 + X * sd * 0.02, s[0] * 0.17 * k, mat, 6)

def mohawk(J, tag, mat, h=0.3, n=6, lo=0.55, back=-0.9, width=0.05):
    c, X, F, U, s = hf(J)
    core.crest(tag + "mo", c, J["head_R"], s, mat, h=h, n=n, lo=lo, back=back, width=width)

def topknot(J, tag, mat, tie="kit2", h=0.34, pose=None):
    """Bound tuft of hair on the crown; it streams back in action poses."""
    c, X, F, U, s = hf(J)
    root = c + U * s[2] * 0.95 - F * s[1] * 0.2
    if pose and pose.get("_action"):
        pts = [root, root + U * h * 0.45 - F * h * 0.2, root + U * h * 0.6 - F * h * 0.9, root + U * h * 0.35 - F * h * 1.5]
    else:
        pts = [root, root + U * h * 0.5, root + U * h * 0.95 - F * h * 0.25, root + U * h * 0.7 - F * h * 0.75]
    tube(tag + "knot", pts, [0.07, 0.085, 0.075, 0.02], mat, ref=X, n=7)
    tube(tag + "knottie", [lerp(pts[0], pts[1], 0.3), lerp(pts[0], pts[1], 0.75)], [0.085, 0.09], tie, ref=X, n=7)

def helm_horns(J, tag, mat="bone", size=1.0, up=0.34, out=0.26, fwd=0.08, base=0.45, r=0.075):
    """A pair of curved horns on the sides of a helm."""
    c, X, F, U, s = hf(J)
    for sd in (-1, 1):
        root = c + X * sd * s[0] * 1.0 + U * s[2] * base
        pts = [root - X * sd * 0.04, root + (X * sd * out * 0.75 + U * up * 0.2) * size,
               root + (X * sd * out + U * up * 0.65 + F * fwd * 0.5) * size, root + (X * sd * out * 0.85 + U * up + F * fwd) * size]
        tube(tag + "hhorn%d" % sd, pts, [r * size, r * 0.85 * size, r * 0.55 * size, r * 0.15 * size], mat, ref=F, n=6)

def helm_spike(J, tag, mat="metal", h=0.3, r=0.07, fwd=0.0):
    c, X, F, U, s = hf(J)
    b = c + U * s[2] * 1.05 + F * fwd
    cone(tag + "hspike", b, b + U * h, r, mat, 6)

def goggles(J, tag, level=0.1, rim="brass", lens="eye_yellow", strap="leather", k=1.0):
    """Round goggles; level 0.1 = over the eyes, about 0.5 = pushed up on the brow."""
    c, X, F, U, s = hf(J)
    R = J["head_R"]
    y = math.sqrt(max(0.1, 1 - level * level - 0.16))
    for sd in (-1, 1):
        p = c + X * sd * s[0] * 0.42 + U * s[2] * level + F * s[1] * (y + 0.06)
        ellipsoid(tag + "gogrim%d" % sd, p, (s[0] * 0.34 * k, 0.05, s[2] * 0.3 * k), rim, R, seg=10)
        ellipsoid(tag + "goglens%d" % sd, p + F * 0.035, (s[0] * 0.22 * k, 0.035, s[2] * 0.19 * k), lens, R, seg=8)
    cap(tag + "gogstrap", c, (s[0] * 1.2, s[1] * 1.2, s[2] * 1.2), strap, U, cut=level - 0.12, hi=level + 0.12, rot=R,
        seg=14, thick=0.02)

def jaw_plate(J, tag, mat="darkmetal", teeth="bone", k=1.0):
    """Riveted iron guard over the lower face with a row of jagged teeth."""
    c, X, F, U, s = hf(J)
    R = J["head_R"]
    ellipsoid(tag + "jawplate", c - U * s[2] * 0.52 + F * s[1] * 0.4, (s[0] * 0.92 * k, s[1] * 0.78 * k, s[2] * 0.46 * k), mat, R,
              seg=12)
    for i, x in enumerate((-0.5, -0.17, 0.17, 0.5)):
        b = c + F * s[1] * (1.1 - 0.12 * abs(x)) * k - U * s[2] * 0.3 + X * x * s[0] * 0.9
        cone(tag + "jawtooth%d" % i, b - U * 0.03, b + U * s[2] * 0.36, s[0] * 0.13, teeth, 5)

def cheek_guards(J, tag, mat="metal", trim=None):
    c, X, F, U, s = hf(J)
    R = J["head_R"]
    for sd in (-1, 1):
        ellipsoid(tag + "cheekg%d" % sd, c + X * sd * s[0] * 0.9 - U * s[2] * 0.35 + F * s[1] * 0.3,
                  (0.045, s[1] * 0.55, s[2] * 0.55), mat, R, seg=8)
        if trim:
            ball_at(tag + "cheekr%d" % sd, c + X * sd * (s[0] * 0.9 + 0.04) - U * s[2] * 0.1 + F * s[1] * 0.3, 0.035, trim)

def warts(J, tag, mat, spots, r=0.04):
    """spots: world points; small bumps one tone lighter read as warts."""
    for i, p in enumerate(spots):
        ball_at(tag + "wart%d" % i, p, r, mat)

# ------------------------------------------------------------------ beards
def beard(J, tag, mat, kind="spade", ln=1.0, tie=None, wide=1.0, pose=None, tache=True):
    """Dwarf beards. kind: spade (broad slab), fork (two braids with ties), long (one tapering point),
    bush (wild and round). Beards swing back a little in action poses. tache=False leaves the lips bare
    and keeps the beard to the chin."""
    c, X, F, U, s = hf(J)
    R = J["head_R"]
    act = bool(pose and pose.get("_action"))
    dn = (-U * 0.9 - F * 0.45).normalized() if act else -U
    if tache:
        ellipsoid(tag + "beardmass", c - U * s[2] * 0.72 + F * s[1] * 0.5, (s[0] * 0.98 * wide, s[1] * 0.62, s[2] * 0.72), mat, R)
    else:
        ellipsoid(tag + "beardmass", c - U * s[2] * 0.86 + F * s[1] * 0.42, (s[0] * 0.8 * wide, s[1] * 0.5, s[2] * 0.45), mat, R)
    for sd in (-1, 1) if tache else ():        # drooping moustache
        tube(tag + "tache%d" % sd, [c + F * s[1] * 1.0 - U * s[2] * 0.36 + X * sd * 0.02,
                                    c + F * s[1] * 0.95 - U * s[2] * 0.52 + X * sd * s[0] * 0.55,
                                    c + F * s[1] * 0.75 - U * s[2] * 0.95 + X * sd * s[0] * 0.95 * wide],
             [0.05, 0.06, 0.025], mat, ref=F, n=6)
    top = c - U * s[2] * 1.05 + F * s[1] * 0.62
    if kind == "spade":
        ellipsoid(tag + "beardspade", top + dn * s[2] * 0.75 * ln, (s[0] * 1.0 * wide, s[1] * 0.42, s[2] * 1.0 * ln), mat, R)
        if tie:
            box(tag + "beardclasp", top + dn * s[2] * 1.5 * ln + F * s[1] * 0.3, (s[0] * 0.9 * wide, 0.05, 0.07), tie, R)
    elif kind == "long":
        cone(tag + "beardlong", top + U * 0.02, top + dn * s[2] * 2.3 * ln + F * 0.05, s[0] * 0.72 * wide, mat, 8)
        if tie:
            for i, t in enumerate((0.45, 0.75)):
                ball_at(tag + "beardring%d" % i, top + dn * s[2] * 2.3 * ln * t + F * 0.04, s[0] * 0.72 * wide * (1 - t) + 0.02, tie)
    elif kind == "fork":
        for sd in (-1, 1):
            a = top + X * sd * s[0] * 0.38
            b = a + dn * s[2] * 2.0 * ln + X * sd * s[0] * 0.35
            n = 6
            for i in range(n):
                t = i / (n - 1)
                r = lerp(0.085, 0.055, t)
                ball_at(tag + "plait%d_%d" % (sd, i), lerp(a, b, t) + F * 0.02 * (i % 2), r, mat)
            if tie:
                ball_at(tag + "plaittie%d" % sd, b + dn * 0.03, 0.062, tie)
            cone(tag + "plaittip%d" % sd, b, b + dn * 0.14, 0.045, mat, 6)
    elif kind == "bush":
        for i, (x, z, r) in enumerate(((-0.6, 0.55, 0.7), (0.6, 0.55, 0.7), (0, 0.85, 0.8), (-0.35, 1.3, 0.55), (0.35, 1.3, 0.55),
                                       (0, 1.7, 0.4))):
            ball_at(tag + "bush%d" % i, top + dn * s[2] * z * ln + X * x * s[0] * wide + F * s[1] * 0.05, s[0] * r, mat)

# ------------------------------------------------------------------ torso gear
def strap(J, P, tag, name, mat, a0, h0, a1, h1, r=0.04, off=0.03, n=7):
    """A strap laid over the torso surface from (angle a0, height h0) to (a1, h1); angle 0 = front."""
    pts = [surf(J, P, lerp(h0, h1, i / n), lerp(a0, a1, i / n), off) for i in range(n + 1)]
    tube(tag + name, pts, [r] * (n + 1), mat, ref=J["u"], n=6)
    return pts

def baldric(J, P, tag, mat, sd=1, r=0.045, top=None, bot=0.1, name="baldric"):
    """Strap from one shoulder across the chest to the other hip and back up across the back."""
    top = P["sh_h"] - 0.02 if top is None else top
    strap(J, P, tag, name + "f", mat, sd * 48, top, -sd * 78, bot, r)
    strap(J, P, tag, name + "b", mat, -sd * 78, bot, -sd * 312, top, r)

def rivets(J, P, tag, name, h, mat="metal", angles=(-150, -100, -50, 0, 50, 100, 150), off=0.05, r=0.024):
    for i, a in enumerate(angles):
        ball_at(tag + name + "%d" % i, surf(J, P, h, a, off), r, mat)

def gut_plate(J, P, tag, mat="kit1", rim="kit2", h=0.13, rx=0.26, rz=0.22, off=0.02, boss="metal", emblem=None):
    """Belly plate strapped over the gut: flat disc, contrasting rim, rivets and a centre boss."""
    X, F, u = J["X"], J["F"], J["u"]
    R = basis(X, F, u)
    p = surf(J, P, h, 0, off)
    ellipsoid(tag + "gutrim", p - F * 0.02, (rx * 1.12, 0.06, rz * 1.12), rim, R, seg=14)
    ellipsoid(tag + "gut", p + F * 0.012, (rx, 0.075, rz), mat, R, seg=14)
    for i in range(6):
        a = math.pi / 3 * i + 0.5
        ball_at(tag + "gutriv%d" % i, p + F * 0.05 + X * rx * 0.8 * math.sin(a) + u * rz * 0.8 * math.cos(a), 0.026, boss)
    if emblem:
        box(tag + "gutemb", p + F * 0.085, (rx * 0.5, 0.03, rz * 0.5), emblem, Matrix.Rotation(D(45), 3, F) @ R)
    else:
        cone(tag + "gutboss", p + F * 0.06, p + F * 0.2, 0.06, boss, 6)
    return p

def back_spikes(J, P, tag, hs, mat="bone", ln=0.22, r=0.05, name="bspike"):
    """Spikes along the spine pointing back and up."""
    for i, h in enumerate(hs):
        b = surf(J, P, h, 180, -0.02)
        cone(tag + name + "%d" % i, b, b + J["B"] * ln + J["u"] * ln * 0.45, r, mat, 6)

def crystals(tag, name, base, axis, size=0.2, n=3, mat="gd_warp", glow="eye_green", seed=1):
    """A cluster of faceted mutation crystals growing out of the skin along `axis`."""
    import random
    rnd = random.Random(seed)
    axis = axis.normalized()
    side = axis.cross(UP)
    if side.length < 0.1:
        side = axis.cross(Vector((1, 0, 0)))
    side.normalize()
    side2 = axis.cross(side)
    for i in range(n):
        tilt = (side * rnd.uniform(-0.55, 0.55) + side2 * rnd.uniform(-0.55, 0.55)) if i else Vector((0, 0, 0))
        d = (axis + tilt).normalized()
        k = size * (1.0 if i == 0 else rnd.uniform(0.5, 0.75))
        b = base + tilt * size * 0.35
        cone(tag + name + "%d" % i, b - d * k * 0.2, b + d * k, k * 0.3, glow if i == 1 else mat, 5, smooth=False)

def shoulder_plate(J, tag, side, mat="kit1", rim="kit2", k=1.0, spike=None, name="splate"):
    """One big rounded shoulder plate (for monsters that wear no jersey)."""
    sd = -1 if side == "l" else 1
    X, u, F = J["X"], J["u"], J["F"]
    sh = J["arms"][side][0]
    ax = (u * 0.8 + X * sd * 0.6).normalized()
    R = basis(F, ax.cross(F), ax)
    c = sh + ax * 0.03
    r = (0.22 * k, 0.22 * k, 0.16 * k)
    cap(tag + name + side, c, r, mat, ax, cut=0.0, rot=R, seg=14, thick=0.035)
    cap(tag + name + "rim" + side, c, tuple(x * 1.06 for x in r), rim, ax, cut=-0.03, hi=0.22, rot=R, seg=14, thick=0.035)
    if spike:
        b = c + ax * r[2] * 0.8
        cone(tag + name + "spk" + side, b, b + ax * 0.24 * k, 0.06 * k, spike, 6)
    return c, ax

def arm_spikes(J, tag, side, mat="bone", n=2, ln=0.12, k=1.0):
    """Spikes on the outside of a forearm bracer."""
    sd = -1 if side == "l" else 1
    sh, el, wr, tip = J["arms"][side]
    out = (J["X"] * sd - (wr - el).normalized() * (J["X"] * sd).dot((wr - el).normalized())).normalized()
    for i in range(n):
        b = lerp(el, wr, 0.35 + 0.35 * i / max(1, n - 1)) + out * 0.08 * k
        cone(tag + "aspk%s%d" % (side, i), b, b + out * ln * k, 0.035 * k, mat, 5)

def knee_spike(J, tag, side, mat="metal", ln=0.12, k=1.0):
    knee = J["legs"][side][1]
    b = knee + J["hF"] * 0.1 * k
    cone(tag + "kspk" + side, b, b + J["hF"] * ln + UP * ln * 0.3, 0.045 * k, mat, 5)

def fur_ruff(J, P, tag, mat="fur_brown", n=9, r=0.085, h=None, arc=(-150, 150), off=0.03, name="ruff"):
    """Shaggy fur collar around the shoulders."""
    h = P["sh_h"] + 0.02 if h is None else h
    for i in range(n):
        a = lerp(arc[0], arc[1], i / (n - 1))
        ball_at(tag + name + "%d" % i, surf(J, P, h, a, off), r * (1.0 if i % 2 else 0.8), mat)

def flag(tag, base, up, back, mat="kit1", trim="kit2", pole="wood", h=0.7, w=0.4, wave=0.0, name="flag"):
    """A pole with a small pennant (vehicles and machines only; never carried in a hand)."""
    top = base + up * h
    tube(tag + name + "pole", [base, top], [0.022, 0.022], pole, n=5)
    ball_at(tag + name + "top", top, 0.04, trim)
    a = top - up * 0.04
    rows = []
    for t in (0.0, 0.5, 1.0):
        off = up * (wave * 0.08 * math.sin(t * 3.0))
        rows.append([a + back * w * t + off, a + back * w * t - up * (0.26 * (1 - 0.45 * t)) + off])
    core.sheet(tag + name + "cloth", rows, [mat], thick=0.02)

def glow_eyes(J, tag, mat="eye_green", k=1.0):
    """Glowing eyes laid over a human-type face."""
    c, X, F, U, s = hf(J)
    for sd in (-1, 1):
        ellipsoid(tag + "glow%d" % sd, c + X * sd * s[0] * 0.4 + U * s[2] * 0.07 + F * s[1] * 0.95,
                  (s[0] * 0.2 * k, 0.035, s[2] * 0.12 * k), mat, J["head_R"], seg=8)

def moustache(J, tag, mat, ln=1.0, r=0.05):
    c, X, F, U, s = hf(J)
    for sd in (-1, 1):
        tube(tag + "mous%d" % sd, [c + F * s[1] * 1.0 - U * s[2] * 0.34 + X * sd * 0.02,
                                   c + F * s[1] * 0.95 - U * s[2] * 0.5 + X * sd * s[0] * 0.6,
                                   c + F * s[1] * 0.8 - U * s[2] * (0.6 + 0.7 * ln) + X * sd * s[0] * 0.9],
             [r, r * 1.1, r * 0.4], mat, ref=F, n=6)

def lumps(J, P, tag, name, spots, mat, r=0.09):
    """spots: (height, angle, radius factor) on the torso surface: rocky growths, boils, warts."""
    for i, (h, a, k) in enumerate(spots):
        ball_at(tag + name + "%d" % i, surf(J, P, h, a, 0.0), r * k, mat)

# ------------------------------------------------------------------ look options
BEARD_DEFAULTS = {"spade": (1.2, 1.1), "fork": (1.1, 1.0), "long": (1.1, 1.0), "bush": (1.0, 1.05)}

def opt_beard(J, L, tag, mat, pose, tie=None, own=None):
    """The beard the layout's gd_beard names (None draws none). own=(kind, ln, wide) keeps the position's
    own proportions for its own kind."""
    kind = L.get("gd_beard")
    if not kind:
        return
    ln, wide = own[1:] if own and own[0] == kind else BEARD_DEFAULTS[kind]
    beard(J, tag, mat, kind, ln, tie, wide, pose)

def side_braids(J, tag, mat, tie="kit2", pose=None, ln=1.0):
    """Two long plaits from beside the ears, hanging down in front of the shoulders; they stream back in
    action poses. Drawn outside any helmet, so they show under a full helm."""
    c, X, F, U, s = hf(J)
    act = bool(pose and pose.get("_action"))
    for sd in (-1, 1):
        a = c + X * sd * s[0] * 1.14 - U * s[2] * 0.05 - F * s[1] * 0.12
        if act:
            pts = [a, a - U * s[2] * 0.6 - F * s[1] * 0.4, a - U * s[2] * 1.0 * ln - F * s[1] * 1.3 * ln]
        else:
            pts = [a, a - U * s[2] * 0.9 + F * s[1] * 0.15 + X * sd * 0.03, a - U * s[2] * 2.1 * ln + F * s[1] * 0.4 + X * sd * 0.02]
        n = 8
        for i in range(n):
            t = i / (n - 1) * 2
            k = min(int(t), 1)
            q = lerp(pts[k], pts[k + 1], t - k)
            ball_at(tag + "sbraid%d_%d" % (sd, i), q + F * 0.012 * (1 if i % 2 else -1), lerp(0.07, 0.048, i / (n - 1)), mat)
        ball_at(tag + "sbraidtie%d" % sd, pts[-1], 0.058, tie)
        cone(tag + "sbraidtip%d" % sd, pts[-1], pts[-1] + (pts[-1] - pts[1]).normalized() * 0.12, 0.042, mat, 6)

def bust_band(J, P, tag, mat, trim=None):
    """A wrap over a bare-chested woman's bust, so a shirtless position still reads as a woman."""
    sh = P["sh_h"]
    tband(tag + "bustband", J, P, [0.48 * sh, 0.6 * sh, 0.74 * sh, 0.84 * sh], mat, k=1.07, add=0.018, solid=0.03)
    if trim:
        tband(tag + "bustrim", J, P, [0.47 * sh, 0.52 * sh], trim, k=1.08, add=0.03, solid=0.03)

def earring(J, tag, mat="brass", sd=1, r=0.04, drop=0.12):
    """A ring hanging from one ear lobe."""
    c, X, F, U, s = hf(J)
    ball_at(tag + "earring%d" % sd, c + X * sd * s[0] * 1.02 - U * s[2] * drop, r, mat)

def hoops(J, tag, mat="gold", r=0.065):
    """Big hoop earrings hanging from both ears."""
    c, X, F, U, s = hf(J)
    for sd in (-1, 1):
        top = c + X * sd * (s[0] * 0.95 + 0.02) - U * s[2] * 0.12
        mid = top - U * r
        pts = [top + (U * math.cos(D(a)) + F * math.sin(D(a))) * r - U * r for a in range(0, 361, 45)]
        tube(tag + "hoop%d" % sd, pts, [0.016] * len(pts), mat, ref=X, n=5)
        ball_at(tag + "hoopbead%d" % sd, mid - U * r, 0.026, mat)
