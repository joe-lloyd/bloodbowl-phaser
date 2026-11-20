"""Shared parts for the undead_skaven_lizards batch (Necromantic Horror, Shambling Undead, Tomb Kings,
Skaven, Lizardmen). Registers no models; the team files of this batch import it.
Nothing here is ball-like and nothing round is ever put in a hand."""
import math
from mathutils import Vector, Matrix
from lib import core, parts, palette
from lib.core import (tube, tband, ball_at, box, lerp, UP, basis, D, cone, flat_cone, ellipsoid, cap, surf,
                      sheet, loft)

# A few extra ramps for this batch (kept small: every ramp joins the shared master palette).
palette.ramp("tomb_sand", "#6a5a44", "#a8946c", "#d8c89a")       # tomb statue
palette.ramp("skin_skink", "#1f5a4a", "#3a9a7a", "#7ad0a0")      # brighter, greener small lizards
palette.ramp("skin_krox", "#243a3a", "#3e6660", "#6a9a88")       # dark swamp green

def hframe(J):
    return parts.head_frame(J)

def back_h(J):
    B = J["B"]
    v = Vector((B.x, B.y, 0))
    return v.normalized() if v.length > 1e-4 else Vector((0, 1, 0))

def arm_r(L):
    return 0.1 * L["limb"] * core.LIMB * L.get("arm", 1.0)

def leg_r(L):
    return 0.13 * L["limb"] * core.LIMB

def ring(tag, name, a, b, t0, t1, r, mat, n=8):
    """A band around a limb between two joints."""
    tube(tag + name, [lerp(a, b, t0), lerp(a, b, t1)], [r, r], mat, n=n)

def strap(J, P, tag, name, h0, a0, h1, a1, mat, w=0.04, off=0.03, n=7):
    """A flat strap lying on the torso surface from (height, angle) to (height, angle)."""
    pts = [surf(J, P, lerp(h0, h1, i / (n - 1.0)), lerp(a0, a1, i / (n - 1.0)), off) for i in range(n)]
    tube(tag + name, pts, [w] * n, mat, ref=J["u"], n=6, flat=0.5)
    return pts

def harness(J, P, tag, mat, boss="gold", w=0.045, lo=0.1):
    """Crossed chest straps, front and back, with a boss where they meet."""
    sh = P["sh_h"]
    strap(J, P, tag, "hsF1", sh + 0.02, -42, lo, 78, mat, w)
    strap(J, P, tag, "hsF2", sh + 0.02, 42, lo, -78, mat, w)
    strap(J, P, tag, "hsB1", sh + 0.02, -138, lo, -258, mat, w)
    strap(J, P, tag, "hsB2", sh + 0.02, 138, lo, 258, mat, w)
    if boss:
        ball_at(tag + "hboss", surf(J, P, lerp(sh, lo, 0.5) + 0.01, 0, 0.05), 0.05, boss)
        ball_at(tag + "hbossb", surf(J, P, lerp(sh, lo, 0.5) + 0.01, 180, 0.05), 0.045, boss)

def sash(J, P, tag, mat, w=0.07, side=1):
    """One wide diagonal sash from a shoulder to the opposite hip, all the way round."""
    sh = P["sh_h"]
    strap(J, P, tag, "sashF", sh + 0.03, -40 * side, 0.08, 80 * side, mat, w, 0.035)
    strap(J, P, tag, "sashB", sh + 0.03, -140 * side, 0.08, -260 * side, mat, w, 0.035)

def spines(J, P, tag, mat, hs, length=0.14, r=0.06, name="spine", lift=0.5):
    """Blades down the middle of the back."""
    for i, h in enumerate(hs):
        b = surf(J, P, h, 180, -0.02)
        d = (J["B"] + J["u"] * lift).normalized()
        flat_cone(tag + name + str(i), b, b + d * length, r, mat, J["X"], squash=0.3)

def stitch(tag, name, a, b, ticks=3, r=0.014, mat="socket", across=None):
    """A stitched seam from a to b: a dark line with cross ticks."""
    tube(tag + name, [a, b], [r, r], mat, n=4)
    d = (b - a)
    if across is None:
        across = d.cross(UP)
        if across.length < 1e-3:
            across = Vector((1, 0, 0))
    across = across.normalized()
    for i in range(ticks):
        p = lerp(a, b, (i + 0.5) / ticks)
        tube(tag + name + "t%d" % i, [p - across * 0.04, p + across * 0.04], [r, r], mat, n=4)

def surf_stitch(J, P, tag, name, h0, a0, h1, a1, ticks=3, off=0.012):
    a, b = surf(J, P, h0, a0, off), surf(J, P, h1, a1, off)
    n = (lerp(a, b, 0.5) - (J["pelvis"] + J["u"] * (h0 + h1) * 0.5))
    stitch(tag, name, a, b, ticks, across=(b - a).cross(n))

def ribbon(J, tag, name, start, length, mat, pose, w=0.05, side=0.0, back=0.25, key="sway", flat=0.35):
    """A hanging cloth strip (scarf end, bandage, sash tail). It sways with pose[key] and streams behind in
    action poses."""
    Bh, X = back_h(J), J["X"]
    sw = pose.get(key, 0.0)
    if pose.get("_action"):
        pts = [start, start + Bh * length * 0.35 + UP * 0.05, start + Bh * length * 0.7 + UP * 0.08,
               start + Bh * length + UP * 0.02]
    else:
        pts = [start, start + Bh * (back * length * 0.5) - UP * length * 0.35 + X * side * 0.3,
               start + Bh * (back * length * 0.7 + sw * length * 0.15) - UP * length * 0.7 + X * side * 0.7,
               start + Bh * (back * length * 0.8 + sw * length * 0.3) - UP * length + X * side]
    tube(tag + name, pts, [w, w * 1.1, w, w * 0.5], mat, ref=X, n=6, flat=flat)
    return pts

def tail(J, tag, pose, ln=0.9, r=0.05, mat="skin_rat", up=0.15, bands=(), tip=None, curl=0.0, name="tail",
         spikes=None):
    """Tail with optional coloured bands [(t0, t1, material)], a tip, back spikes (material) and a curl
    (0 = straight, 1 = a full spiral at the end). Sways with pose["tail"] (-1..1)."""
    B, X = J["B"], J["X"]
    Bh = back_h(J)
    sway = pose.get("tail", 0.0) * ln * 0.25
    base = J["pelvis"] + B * 0.1
    if curl:
        pts, rr = [base], [r * 1.3]
        c = base + Bh * ln * 0.55 - UP * ln * 0.1
        pts.append(base + Bh * ln * 0.3 - UP * ln * 0.12 + X * sway * 0.3); rr.append(r * 1.1)
        turns = 1.35 * curl
        for i in range(9):
            t = i / 8.0
            a = -math.pi * 0.5 + t * turns * 2 * math.pi
            rad = ln * 0.3 * (1 - 0.75 * t)
            pts.append(c + Bh * (math.cos(a) * rad) + UP * (math.sin(a) * rad + ln * 0.18) + X * sway * (0.4 + 0.6 * t))
            rr.append(r * (1.0 - 0.7 * t))
        tube(tag + name, pts, rr, mat, ref=X, n=8)
        return pts
    pts = [base, base + Bh * ln * 0.4 - UP * ln * 0.28 + X * sway * 0.3, base + Bh * ln * 0.75 - UP * ln * 0.3 + X * sway,
           base + Bh * ln + UP * (up * ln - ln * 0.2) + X * sway * 1.8]
    rr = [r * 1.3, r, r * 0.7, r * 0.3]
    tube(tag + name, pts, rr, mat, ref=X, n=8)

    def at(t):
        t = max(0.0, min(0.999, t)) * 3
        i = int(t)
        return lerp(pts[i], pts[i + 1], t - i), lerp(rr[i], rr[i + 1], t - i)

    for i, (t0, t1, bm) in enumerate(bands):
        (p0, r0), (p1, r1) = at(t0), at(t1)
        tube(tag + name + "band%d" % i, [p0, p1], [r0 + 0.018, r1 + 0.018], bm, ref=X, n=8)
    if tip:
        ball_at(tag + name + "tip", pts[-1], r * 0.9, tip)
    if spikes:
        for i, t in enumerate((0.12, 0.3, 0.48, 0.66)):
            p, rad = at(t)
            cone(tag + name + "spk%d" % i, p + UP * rad * 0.6, p + UP * (rad + 0.11 * (1 - t * 0.6)) + Bh * 0.04, rad * 0.55,
                 spikes, 5)
    return pts

def head_band(J, tag, mat, lo=0.25, hi=0.5, k=1.06, name="hband", thick=0.03):
    """A band around the cranium (headband, crown ring, goggle strap)."""
    c, X, F, U, s = hframe(J)
    cap(tag + name, c, (s[0] * k, s[1] * k, s[2] * k), mat, U, cut=lo, hi=hi, rot=J["head_R"], thick=thick)

def crown(J, tag, mat="gold", n=7, h=0.14, lo=0.3, hi=0.52, r=0.04, k=1.1):
    """A ring with points."""
    c, X, F, U, s = hframe(J)
    head_band(J, tag, mat, lo, hi, k, "crown")
    z = (lo + hi) * 0.5 + 0.1
    rad = math.sqrt(max(0.05, 1 - z * z)) * k
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n
        b = c + X * (math.sin(a) * s[0] * rad) + F * (math.cos(a) * s[1] * rad) + U * (z * s[2] * k)
        cone(tag + "crownpt%d" % i, b, b + U * h + (X * math.sin(a) + F * math.cos(a)) * h * 0.25, r, mat, 5)

def claw_hand_spikes(J, tag, side, mat="bone", n=3, ln=0.12):
    """Knuckle spikes on a fist."""
    c0, d, nn, t = J["grip_" + side]
    for i in range(n):
        b = c0 - nn * 0.1 + t * (i - (n - 1) / 2.0) * 0.05
        cone(tag + "kspk%s%d" % (side, i), b, b + d * ln, 0.025, mat, 5)

def ribs(J, P, tag, hs=(0.24, 0.32, 0.4), mat="socket", half=62):
    """Dark gaps between the ribs of a bare skeleton torso."""
    for i, h in enumerate(hs):
        strap(J, P, tag, "rib%d" % i, h, -half, h, half, mat, w=0.016, off=0.0, n=5)
    strap(J, P, tag, "sternum", hs[0] - 0.04, 0, hs[-1] + 0.05, 0, "bone", w=0.03, off=0.005, n=3)

def belly(J, P, tag, mat="skin_belly", lo=0.0, hi=0.44, half=62):
    """Pale belly scales on the front of the torso."""
    hs = [lerp(lo, hi, i / 3.0) for i in range(4)]
    tband(tag + "belly", J, P, hs, mat, k=1.02, add=0.006, arc=(180 - half, 180 + half), solid=0.02)

def toe_claws(J, tag, k=1.0, mat="bone"):
    """Three claws on the front of each plantigrade foot."""
    for side in ("l", "r"):
        ankle, toe = J["legs"][side][-2:]
        fd = (toe - ankle).normalized()
        sx = fd.cross(UP).normalized()
        for i in (-1, 0, 1):
            b = toe + sx * i * 0.06 * k - UP * 0.05
            cone(tag + "tclw%s%d" % (side, i), b - fd * 0.03, b + fd * 0.1 * k - UP * 0.01, 0.03 * k, mat, 5)

def collar(J, P, tag, mat="kit2", rim="gold", drop=0.1):
    """Broad flat collar over the shoulders and chest."""
    sh = P["sh_h"]
    tband(tag + "bcollar", J, P, [sh - drop, sh - 0.02, sh + 0.05], mat, k=1.06, add=0.035, solid=0.03)
    if rim:
        tband(tag + "bcollarrim", J, P, [sh - drop - 0.035, sh - drop + 0.005], rim, k=1.06, add=0.045, solid=0.03)

def frill(J, tag, mat, web, n=5, length=0.34, spread=85, k=1.0):
    """A frilled-lizard fan behind the head: a flat web disc with blade ribs radiating through it."""
    c, X, F, U, s = hframe(J)
    back = c - F * s[1] * 0.6 - U * s[2] * 0.1
    ellipsoid(tag + "frillweb", back - F * 0.02, (s[0] * 2.0 * k, 0.03, s[2] * 1.7 * k), web, J["head_R"], seg=14)
    for i in range(n):
        a = D(lerp(-spread, spread, i / (n - 1.0)))
        d = X * math.sin(a) + U * math.cos(a)
        b = back + d * s[0] * 0.6
        flat_cone(tag + "frill%d" % i, b, b + d * length * k - F * 0.06, 0.09 * k, mat, F, squash=0.25)

def arm_shield(J, L, tag, side, mat, rim, boss, size=(0.34, 0.46)):
    """A flat board strapped to the outside of a forearm, with a rim and a spike boss (never round)."""
    sd = -1 if side == "l" else 1
    el, wr = J["arms"][side][1:3]
    d = (wr - el).normalized()
    out = (J["X"] * sd * 0.6 + J["F"]).normalized()
    n = out - d * out.dot(d)
    n = n.normalized() if n.length > 1e-3 else J["F"]
    R = basis(n.cross(d), n, d)
    c = lerp(el, wr, 0.5) + n * (arm_r(L) + 0.04)
    box(tag + "shield", c, (size[0], 0.035, size[1]), mat, R)
    box(tag + "shieldrim", c - n * 0.012, (size[0] + 0.05, 0.03, size[1] + 0.05), rim, R)
    cone(tag + "shieldboss", c + n * 0.015, c + n * 0.11, 0.05, boss, 6)

def nemes(J, tag, mat, trim="gold", ends=None, k=1.0, stripes=False):
    """A striped royal headcloth: a cap over the cranium, a gold band and two lappets down the chest."""
    c, X, F, U, s = hframe(J)
    R = J["head_R"]
    keep = (U * 0.8 - F * 0.6).normalized()
    size = (s[0] * 1.14 * k, s[1] * 1.14 * k, s[2] * 1.12 * k)
    cap(tag + "cloth", c + U * 0.015, size, mat, keep, cut=-0.05, rot=R, thick=0.03)
    if stripes:
        for i, lo in enumerate((0.05, 0.4, 0.72)):
            cap(tag + "stripe%d" % i, c + U * 0.015, tuple(x * 1.03 for x in size), trim, keep, cut=lo, hi=lo + 0.12, rot=R,
                thick=0.03)
    for sd in (-1, 1):
        box(tag + "lappet%d" % sd, c + X * sd * s[0] * 0.95 * k - U * s[2] * 1.45 + F * s[1] * 0.55, (0.11, 0.04, 0.3), mat, R)
        box(tag + "lapend%d" % sd, c + X * sd * s[0] * 0.95 * k - U * s[2] * 2.05 + F * s[1] * 0.56, (0.12, 0.045, 0.07), ends or trim, R)
    head_band(J, tag, trim, 0.3, 0.46, 1.19 * k)
