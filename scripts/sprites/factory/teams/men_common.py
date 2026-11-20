"""Shared parts for the `men` batch (Human, Imperial Nobility, Bretonian, Amazon, Norse).
Registers no models. Nothing here is ball-like and nothing is ever placed in a hand."""
import math
from mathutils import Vector, Matrix
from lib import core, parts, palette
from lib.core import (tube, tband, ball_at, box, lerp, UP, basis, D, ellipsoid, cap, cone, flat_cone, surf,
                      loft, sheet, tprof, tframe)

# a few extra ramps for this batch (kept short: every ramp adds to the shared master palette)
palette.ramp("pelt", "#8a5a1e", "#c8923a", "#ecc470")           # jaguar hide
palette.ramp("mail", "#3a3a46", "#666878", "#969db0")           # chain mail (stone darks, metal mid)
palette.alias("fur_dark", "fur_black")


def head(J):
    """(centre, X, F, U, radii, R) of the head."""
    c, R, s = J["head"], J["head_R"], J["head_s"]
    return c, R.col[0], R.col[1], R.col[2], s, R


def act(pose):
    return bool(pose.get("_action"))


# ---------------------------------------------------------------- headgear
def headband(tag, J, mat, tails=0.32, stream=False):
    c, X, F, U, s, R = head(J)
    cap(tag + "hband", c + U * 0.012, (s[0] * 1.14, s[1] * 1.14, s[2] * 1.14), mat, U, cut=0.2, hi=0.56, rot=R, thick=0.04)
    if tails:
        k = c - F * s[1] * 1.12 + U * s[2] * 0.4
        ball_at(tag + "hknot", k, 0.05, mat)
        for sd in (-1, 1):
            if stream:
                tip = k - F * tails * 1.5 + U * 0.05 * sd + X * sd * 0.06
            else:
                tip = k - F * tails * 0.45 - U * tails + X * sd * 0.1
            flat_cone(tag + "htail%d" % sd, k, tip, 0.08, mat, X, 0.45)


def plume_tall(tag, J, mat, h=0.45, r=0.1, base=1.12):
    """Horsehair plume: rises from the crown, arcs back and falls."""
    c, X, F, U, s, R = head(J)
    top = c + U * s[2] * base
    pts = [top - U * 0.04, top + U * h * 0.6, top + U * h - F * 0.2, top + U * h * 0.75 - F * 0.46, top + U * h * 0.1 - F * 0.58]
    tube(tag + "plume", pts, [r * 0.5, r * 0.8, r, r * 0.9, r * 0.3], mat, ref=X, n=8)
    tube(tag + "plumeholder", [top - U * 0.05, top + U * 0.08], [0.05, 0.045], "gold", n=6)


def side_feather(tag, J, mat, sd=1, length=0.6, r=0.085, up=0.75, name="feather"):
    """One big curling ostrich feather from the side of a hat, sweeping up and back."""
    c, X, F, U, s, R = head(J)
    a = c + X * sd * s[0] * 0.95 + U * s[2] * 0.62 + F * 0.05
    pts = [a, a + (U * up + X * sd * 0.25 - F * 0.2) * length * 0.5, a + (U * up * 1.15 - F * 0.75 + X * sd * 0.3) * length * 0.8,
           a + (U * up * 0.7 - F * 1.25 + X * sd * 0.25) * length]
    tube(tag + name, pts, [r * 0.45, r, r * 0.95, r * 0.3], mat, ref=X, n=8, flat=0.55)


def brim_hat(tag, J, mat, brim=1.75, crown=0.62, band=None, tilt=0.0, sit=0.42):
    """Wide-brimmed hat."""
    c, X, F, U, s, R = head(J)
    Rt = Matrix.Rotation(D(tilt), 3, F) @ R
    bc = c + U * s[2] * sit
    ellipsoid(tag + "brim", bc, (s[0] * brim, s[1] * brim, 0.035), mat, Rt, seg=18)
    ellipsoid(tag + "crown", bc + U * s[2] * 0.22, (s[0] * 1.04, s[1] * 1.04, s[2] * crown), mat, R)
    if band:
        ellipsoid(tag + "hatband", bc + U * 0.045, (s[0] * 1.09, s[1] * 1.09, 0.05), band, R, seg=14)


def beret(tag, J, mat, band=None, tilt=16, size=1.4):
    """Soft flat cap pulled down to one side."""
    c, X, F, U, s, R = head(J)
    Rt = Matrix.Rotation(D(tilt), 3, F) @ R
    ellipsoid(tag + "beret", c + U * s[2] * 0.74 + X * 0.07, (s[0] * size, s[1] * size * 0.95, s[2] * 0.36), mat, Rt, seg=16)
    cap(tag + "beretband", c + U * 0.012, (s[0] * 1.1, s[1] * 1.1, s[2] * 1.1), band or mat, U, cut=0.42, hi=0.75, rot=R, thick=0.03)


def closed_helm(tag, J, mat="metal", trim="gold", tail=0.0, slit=True, breaths=True):
    """Fully enclosed helm with an eye slit; tail > 0 adds a swept neck guard (sallet)."""
    c, X, F, U, s, R = head(J)
    big = (s[0] * 1.16, s[1] * 1.16, s[2] * 1.14)
    ellipsoid(tag + "helm", c + U * 0.01, big, mat, R)
    ellipsoid(tag + "bevor", c - U * s[2] * 0.52 + F * s[1] * 0.3, (s[0] * 0.86, s[1] * 0.8, s[2] * 0.62), mat, R)
    if slit:
        box(tag + "slit", c + F * s[1] * 1.1 + U * s[2] * 0.1, (s[0] * 1.55, 0.05, 0.045), "socket", R)
    if breaths:
        for sd in (-1, 1):
            for i in range(2):
                ball_at(tag + "breath%d%d" % (sd, i), c + F * s[1] * 1.0 - U * s[2] * (0.38 + 0.2 * i) + X * sd * s[0] * 0.3, 0.018, "socket")
    if trim:
        cap(tag + "hrim", c + U * 0.01, tuple(b * 1.04 for b in big), trim, U, cut=0.26, hi=0.42, rot=R, thick=0.02)
    if tail:
        b = c - F * s[1] * 0.7 - U * s[2] * 0.25
        flat_cone(tag + "sallet", b + F * 0.1, b - F * tail - U * 0.1, s[0] * 1.05, mat, U, 0.3)


def crest_fan(tag, J, mats, n=5, h=0.42, spread=70, base=1.1, r=0.07):
    """Upright fan of feathers across the top of the head (side to side)."""
    c, X, F, U, s, R = head(J)
    top = c + U * s[2] * base - F * 0.04
    for i in range(n):
        t = i / (n - 1) - 0.5
        a = D(spread * 2 * t)
        d = (U * math.cos(a) + X * math.sin(a)).normalized()
        k = 1.0 - 0.35 * abs(t) * 2
        flat_cone(tag + "fan%d" % i, top - d * 0.03 + X * math.sin(a) * s[0] * 0.5, top + d * h * k + X * math.sin(a) * s[0] * 0.5 - F * 0.06,
                  r, mats[i % len(mats)], F, squash=0.25)


def helm_wings(tag, J, mat, size=1.0, n=3, boss="gold"):
    """Upswept feathered wings on the sides of a helm."""
    c, X, F, U, s, R = head(J)
    for sd in (-1, 1):
        root = c + X * sd * s[0] * 1.05 + U * s[2] * 0.3
        for i in range(n):
            t = i / max(1, n - 1)
            tip = root + (X * sd * (0.1 + 0.2 * t) + U * (0.52 - 0.24 * t) - F * (0.12 + 0.22 * t)) * size
            flat_cone(tag + "hw%d%d" % (sd, i), root - U * 0.03, tip, 0.085 * size, mat, F, squash=0.22)
        if boss:
            ball_at(tag + "hwb%d" % sd, root, 0.05, boss)


# ---------------------------------------------------------------- torso dress
def halves(tag, J, P, m_left, m_right, hs=None, k=1.05, add=0.015, name="half"):
    """Jersey split down the middle (per pale): one material on each side of the body."""
    hs = hs or [0.08, 0.22, 0.36, P["sh_h"], P["sh_h"] + 0.04]
    tband(tag + name + "r", J, P, hs, m_right, k=k, add=add, arc=(0, 180), solid=0.03)
    tband(tag + name + "l", J, P, hs, m_left, k=k, add=add, arc=(180, 360), solid=0.03)


def sash(tag, J, P, mat, side=1, r=0.05, name="sash", full=True):
    """Diagonal band from one shoulder to the opposite hip (baldric, harness strap)."""
    sh = P["sh_h"]
    pts = [surf(J, P, sh + 0.02, side * 42, 0.03), surf(J, P, 0.38, side * 16, 0.04), surf(J, P, 0.24, -side * 22, 0.04),
           surf(J, P, 0.12, -side * 70, 0.035)]
    if full:
        pts += [surf(J, P, 0.12, -side * 125, 0.035), surf(J, P, 0.26, 180, 0.035), surf(J, P, 0.4, side * 140, 0.035),
                surf(J, P, sh + 0.02, side * 75, 0.03)]
    tube(tag + name, pts, [r] * len(pts), mat, ref=J["u"], n=6, flat=0.6)


def fur_mantle(tag, J, P, mat="fur_brown", drop=0.2, add=0.1, name="mantle"):
    """Shaggy fur over the shoulders with a jagged lower edge."""
    sh = P["sh_h"]
    tband(tag + name, J, P, [sh + 0.07, sh + 0.02, sh - drop * 0.5, sh - drop], mat, k=1.06, add=add, jag=0.55, solid=0.05, n=16)
    for side in ("l", "r"):
        s0 = J["arms"][side][0]
        ellipsoid(tag + name + "tuft" + side, s0 + J["u"] * 0.05, (0.17, 0.17, 0.13), mat, seg=10)


def tooth_necklace(tag, J, P, n=5, mat="bone", span=62, ln=0.1):
    sh = P["sh_h"]
    for i in range(n):
        a = -span + 2 * span * i / (n - 1)
        h = sh - 0.02 - 0.07 * math.cos(D(a) * 1.3)
        p = surf(J, P, h, a, 0.035)
        cone(tag + "tooth%d" % i, p + J["u"] * 0.02, p - J["u"] * ln + J["F"] * 0.02, 0.03, mat, 6)


def bandeau(tag, J, P, mat, lo=0.3, hi=0.47, trim=None):
    tband(tag + "top", J, P, [lo, (lo + hi) / 2, hi], mat, k=1.07, add=0.015, solid=0.03)
    if trim:
        tband(tag + "toptrim", J, P, [lo - 0.012, lo + 0.03], trim, k=1.07, add=0.028, solid=0.03)


def split_panel(tag, J, P, front, length, width, m_left, m_right, flare=0.0, top=0.1, name="sur"):
    """Surcoat panel hanging from the waist, left and right halves in different materials."""
    X, B = tframe(J, 0.0)
    d = -B if front else B
    Bh = Vector((B.x, B.y, 0)).normalized()
    ry = tprof(P, top)[1]
    c0 = J["pelvis"] + J["u"] * top + d * (ry + 0.04)
    left, right = [], []
    for t in (0, 0.35, 0.7, 1):
        c = c0 - UP * (length * t * (1 - 0.3 * flare)) + Bh * (length * t * flare * 0.7) + d * 0.03 * t
        w = width * (1 + 0.12 * t)
        left.append([c - X * w - d * 0.04, c - X * w * 0.5, c])
        right.append([c, c + X * w * 0.5, c + X * w - d * 0.04])
    nm = tag + name + ("F" if front else "B")
    sheet(nm + "l", left, [m_left], thick=0.022)
    sheet(nm + "r", right, [m_right], thick=0.022)


# ---------------------------------------------------------------- limbs
def legging(tag, J, L, side, mat, t0=0.0, t1=1.0, grow=1.04, name="hose"):
    """Cover part of one leg (hip..ankle) with another material: mi-parti hose, shorts legs, stripes."""
    k = L["limb"] * core.LIMB * grow
    hip, knee, ankle = J["legs"][side][:3]
    full = [(0.0, hip, 0.135), (0.225, lerp(hip, knee, .45), 0.14), (0.5, knee, 0.105), (0.65, lerp(knee, ankle, .3), 0.112),
            (1.0, ankle, 0.082)]

    def at(t):
        for (ta, pa, ra), (tb, pb, rb) in zip(full, full[1:]):
            if t <= tb:
                f = (t - ta) / (tb - ta)
                return lerp(pa, pb, f), lerp(ra, rb, f)
        return full[-1][1], full[-1][2]
    ts = sorted({t0, t1} | {t for t, _, _ in full if t0 < t < t1})
    pts, rr = zip(*[at(t) for t in ts])
    tube(tag + name + side, list(pts), [r * k for r in rr], mat, n=12)


def puff_sleeve(tag, J, side, mat, slash, r=0.165, band=True):
    """Puffed, slashed shoulder sleeve."""
    sh, el = J["arms"][side][:2]
    sd = -1 if side == "l" else 1
    d = (el - sh).normalized()
    c = sh + d * 0.07
    ellipsoid(tag + "puff" + side, c, (r, r, r * 1.05), mat, seg=12)
    out = J["X"] * sd
    for i, off in enumerate((-0.085, 0.0, 0.085)):      # slashes showing the lining
        p = c + (out * 0.9 + J["F"] * off * 7).normalized() * r * 0.93
        ellipsoid(tag + "slash%s%d" % (side, i), p, (0.03, 0.03, r * 0.72), slash, seg=8)
    if band:
        tube(tag + "puffband" + side, [lerp(sh, el, 0.62), lerp(sh, el, 0.76)], [0.125, 0.12], slash, ref=J["F"], n=10)


def pumpkin_hose(tag, J, side, mat, stripe, r=0.2):
    """Padded, striped trunk hose on the thigh."""
    hip, knee = J["legs"][side][:2]
    c = lerp(hip, knee, 0.3)
    d = (knee - hip).normalized()
    sx, fy = J["X0"], J["hF"]
    ellipsoid(tag + "trunk" + side, c, (r, r, r * 1.15), mat, basis(sx, fy, -d), seg=12)
    for i in range(6):
        a = D(60 * i + 30)
        o = (sx * math.sin(a) + fy * math.cos(a)) * r * 0.92
        ellipsoid(tag + "trunkst%s%d" % (side, i), c + o, (0.035, 0.035, r * 0.85), stripe, basis(sx, fy, -d), seg=8)


def braids(tag, J, mat, tie="kit2", stream=False, ln=1.0):
    """Two long plaits: over the front of the shoulders at rest, streaming behind in action."""
    c, X, F, U, s, R = head(J)
    for sd in (-1, 1):
        if stream:
            offs = [(0.9 * sd, -0.5, -0.3), (1.0 * sd, -1.6, 0.0), (1.1 * sd, -2.8, 0.1), (1.1 * sd, -3.8 * ln, -0.1)]
        else:
            offs = [(0.95 * sd, 0.0, -0.45), (1.1 * sd, 0.45, -1.2), (1.05 * sd, 0.75, -2.0), (0.95 * sd, 0.85, -2.8 * ln)]
        pts = [c + X * x * s[0] + F * y * s[1] + U * z * s[2] for x, y, z in offs]
        nb = 9
        for i in range(nb):
            tt = i / (nb - 1) * (len(pts) - 1)
            a = min(int(tt), len(pts) - 2)
            q = lerp(pts[a], pts[a + 1], tt - a)
            r = lerp(0.075, 0.05, i / (nb - 1))
            ellipsoid(tag + "plait%d_%d" % (sd, i), q + X * (0.015 if i % 2 else -0.015), (r, r, r * 0.9), mat, R, seg=8)
        ball_at(tag + "plaittie%d" % sd, pts[-1], 0.06, tie)


def shag(tag, a, b, r, mat, n=3, out=None, ln=0.16, name="shag"):
    """Tufts of long fur hanging off a limb between points a and b."""
    for i in range(n):
        t = (i + 0.5) / n
        p = lerp(a, b, t)
        o = (out if out is not None else Vector((0, 0, 0)))
        cone(tag + "%s%d" % (name, i), p + o * r * 0.5, p + o * (r + ln * 0.6) - UP * ln, r * 0.75, mat, 6)
