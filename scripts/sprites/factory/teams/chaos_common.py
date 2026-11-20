"""Shared parts for the chaos batch (Chaos Chosen, Chaos Dwarf, Chaos Renegade, Khorne, Nurgle).
Registers no models. Nothing here is ball-like and nothing round is ever put in a hand."""
import math
from mathutils import Vector, Matrix
from lib import core, parts
from lib.core import tube, tband, ball_at, box, cone, flat_cone, ellipsoid, cap, lerp, UP, basis, D, surf

def hf(J):
    """(centre, X, F, U, radii) of the head."""
    return parts.head_frame(J)

def horiz(v):
    return Vector((v.x, v.y, 0)).normalized()

# ------------------------------------------------------------------ heads
def big_ears(J, L, tag, size=1.0, droop=0.0, mat=None):
    """Long goblin / troll ears sticking out sideways."""
    c, X, F, U, s = hf(J)
    for sd in (-1, 1):
        root = c + X * sd * s[0] * 0.85 + U * s[2] * 0.05
        tip = root + (X * sd * 0.34 + U * (0.14 - droop) - F * 0.1) * size
        flat_cone(tag + "bigear%d" % sd, root - X * sd * 0.04, tip, 0.1 * size, mat or L["skin"], F, squash=0.3)

def long_nose(J, L, tag, ln=0.16, r=0.045):
    c, X, F, U, s = hf(J)
    a = c + F * s[1] * 0.88 - U * s[2] * 0.08
    cone(tag + "longnose", a, a + F * ln - U * ln * 0.45, r, L["skin"], 6)

def tall_hat(J, tag, h, mat, bands=(), taper=0.85, rim=None, lean=0.0, k=1.08, lift=0.22):
    """Tall drum hat. bands: (position 0..1, material, width). Returns (top centre, axis, top radius)."""
    c, X, F, U, s = hf(J)
    ax = (U - F * lean).normalized()
    base = c + U * s[2] * lift
    top = base + ax * h
    r = s[0] * k
    cone(tag + "hat", base, top, r, mat, seg=10, r2=r * taper)
    for i, (t, bm, w) in enumerate(bands):
        a = base + ax * h * t
        r0 = r * lerp(1, taper, t) + 0.014
        r1 = r * lerp(1, taper, t + w / h) + 0.014
        cone(tag + "hatband%d" % i, a, a + ax * w, r0, bm, seg=10, r2=r1)
    if rim:
        cone(tag + "hatrim", base - ax * 0.02, base + ax * 0.04, r * 1.06, rim, seg=10, r2=r * 1.06)
    return top, ax, r * taper

def floppy_cap(J, tag, mat, band, h=0.42, flop=0.22):
    """Pointed cloth cap whose tip flops backwards."""
    c, X, F, U, s = hf(J)
    base = c + U * s[2] * 0.3
    pts = [base, base + U * h * 0.45 - F * 0.02, base + U * h * 0.85 - F * flop * 0.5, base + U * h - F * flop]
    tube(tag + "capc", pts, [s[0] * 1.02, s[0] * 0.7, s[0] * 0.32, 0.03], mat, ref=X, n=8)
    cone(tag + "capband", base - U * 0.03, base + U * 0.06, s[0] * 1.1, band, seg=10, r2=s[0] * 1.04)

def mohawk(J, tag, mat, h=0.22, n=5, lo=0.6):
    c, X, F, U, s = hf(J)
    core.crest(tag, c, J["head_R"], s, mat, h=h, n=n, lo=lo)

def chin_tuft(J, tag, mat, ln=0.22, fwd=0.9, r=0.05):
    c, X, F, U, s = hf(J)
    b = c + F * s[1] * fwd - U * s[2] * 0.8
    cone(tag + "tuft", b + U * 0.04, b - U * ln + F * 0.03, r, mat, 6)

# ------------------------------------------------------------------ torso dressing
def sash(J, P, tag, pose, mat, side=-1, ln=0.46, h=0.06, r=0.05):
    """Knotted sash with two tails at one hip; the tails stream behind in action."""
    X, B = J["X"], J["B"]
    Bh = horiz(B)
    start = J["pelvis"] + J["u"] * h + X * side * (core.tprof(P, h)[0] + 0.03) + B * 0.02
    ball_at(tag + "sashknot", start, r * 1.2, mat)
    sway = pose.get("sash", 0.0)
    for i, off in enumerate((0.0, 0.07)):
        if pose.get("_action"):
            pts = [start, start + Bh * ln * 0.65 + UP * (0.06 + off), start + Bh * ln * 1.35 + UP * (0.1 + off * 2),
                   start + Bh * ln * 1.95 + UP * (0.04 + off * 2)]
        else:
            pts = [start, start - UP * ln * 0.3 + X * side * (0.03 + off), start + Bh * sway - UP * ln * 0.65 + X * side * (0.04 + off * 1.5),
                   start + Bh * sway * 2 - UP * (ln - off) + X * side * (0.04 + off * 2)]
        tube(tag + "sash%d" % i, pts, [r, r * 1.1, r, r * 0.4], mat, ref=X, n=6, flat=0.4)

def strap(J, P, tag, mat, r=0.04, off=0.035, top=None, bot=0.1, flip=1, name="strap"):
    """Diagonal strap round the torso, shoulder to opposite hip (front and back)."""
    top = P["sh_h"] - 0.02 if top is None else top
    for nm, a0, a1 in (("f", -52 * flip, 55 * flip), ("b", 180 + 52 * flip, 180 - 55 * flip)):
        pts = [surf(J, P, lerp(top, bot, t), lerp(a0, a1, t), off) for t in (0, 0.2, 0.4, 0.6, 0.8, 1.0)]
        tube(tag + name + nm, pts, [r] * 6, mat, ref=J["u"], n=6, flat=0.5)

def stripe(J, P, tag, name, h0, a0, h1, a1, mat, r=0.028, off=0.012):
    """Painted stripe on the torso between two surface points (height, angle from the front)."""
    pts = [surf(J, P, lerp(h0, h1, t), lerp(a0, a1, t), off) for t in (0, 0.33, 0.66, 1.0)]
    tube(tag + name, pts, [r] * 4, mat, ref=J["u"], n=5, flat=0.5)

def sigil(J, P, tag, h=0.36, mat="white", size=0.16, off=0.04, ang=0):
    """Our own renegade mark: two crossed claw slashes."""
    p = surf(J, P, h, ang, off)
    R = basis(J["X"], J["F"], J["u"])
    for i, a in enumerate((32, -32)):
        box(tag + "sigil%d" % i, p, (0.035, 0.03, size), mat, Matrix.Rotation(D(a), 3, J["F"]) @ R)

def spines(J, P, tag, hs, mat="bone", ln=0.2, r=0.05, ang=180, name="spine", rise=0.5):
    """Row of spikes growing out of the torso (default: down the back)."""
    for i, h in enumerate(hs):
        a = surf(J, P, h, ang, -0.02)
        out = (a - (J["pelvis"] + J["u"] * h)).normalized()
        cone(tag + "%s%d" % (name, i), a, a + out * ln + J["u"] * ln * rise, r, mat, 6)

def boils(J, P, tag, spots, mat="skin_belly", r=0.035):
    """spots: (height, angle) pairs on the torso surface."""
    for i, (h, a) in enumerate(spots):
        ball_at(tag + "boil%d" % i, surf(J, P, h, a, 0.0), r, mat)

def chain(name, a, b, mat="darkmetal", n=5, sag=0.1, r=0.022):
    for i in range(n):
        t = i / (n - 1.0)
        ball_at("%s%d" % (name, i), lerp(a, b, t) - UP * sag * math.sin(t * math.pi), r, mat)

def banner(J, P, tag, mat, trim, h=0.85, w=0.5, pole="wood", tip="bone", xoff=0.0, fh=0.6):
    """Back banner on a pole: a flag in one kit colour with a band and tatters in the other."""
    X, u, B = J["X"], J["u"], J["B"]
    Xh = horiz(X)
    Bh = horiz(B)
    a = J["pelvis"] + u * (P["sh_h"] * 0.5) + B * (core.tprof(P, P["sh_h"] * 0.5)[1] + 0.04) + X * xoff * 0.6
    top = J["pelvis"] + u * P["sh_h"] + B * (core.tprof(P, P["sh_h"])[1] + 0.12) + X * xoff + UP * h
    tube(tag + "bpole", [a, top], [0.035, 0.03], pole, n=6)
    cone(tag + "btip", top, top + UP * 0.12, 0.045, tip, 6)
    f = h * fh
    fc = top - UP * (0.04 + f * 0.5)
    R = basis(Xh, Bh, UP)
    tube(tag + "bbar", [top - UP * 0.03 - Xh * w * 0.56, top - UP * 0.03 + Xh * w * 0.56], [0.025, 0.025], pole, n=5)
    box(tag + "bflag", fc, (w, 0.04, f), mat, R)
    box(tag + "bband", fc + UP * f * 0.2, (w * 1.03, 0.05, f * 0.2), trim, R)
    for i, x in enumerate((-0.33, 0.0, 0.33)):
        b = fc - UP * f * 0.48 + Xh * w * x
        flat_cone(tag + "btat%d" % i, b, b - UP * f * (0.3 + 0.1 * (i % 2)), w * 0.17, trim if i == 1 else mat, Bh, squash=0.2)

def tentacle(name, base, d, bend, ln, r, mat, n=6, curl=1.0, tip=0.18):
    """Tapering tentacle from base along d, bending progressively towards `bend`."""
    pts = [base]
    p, dv = base, d.normalized()
    for i in range(n):
        dv = (dv + bend * (curl / n)).normalized()
        p = p + dv * (ln / n)
        pts.append(p)
    radii = [r * (1 - (1 - tip) * i / n) for i in range(n + 1)]
    tube(name, pts, radii, mat, n=8)
    return pts

def flies(J, tag, t, n=3, rad=0.3, r=0.034, mat="black"):
    """Flies circling the head; t is a loop phase 0..1."""
    c, X, F, U, s = hf(J)
    for i in range(n):
        a = 2 * math.pi * (t + i / float(n))
        p = c + X * (math.cos(a) * rad) + F * (math.sin(a) * rad * 0.7) + U * (s[2] * (0.7 + 0.5 * math.sin(a * 2 + i * 2.1)))
        ball_at(tag + "fly%d" % i, p, r, mat)

def collar_spikes(J, P, tag, mat="bone", n=6, ln=0.1, r=0.03, h=None):
    h = P["sh_h"] + 0.08 if h is None else h
    c = J["pelvis"] + J["u"] * h
    for i in range(n):
        a = D(360.0 * i / n + 30)
        d = (J["X"] * math.sin(a) + J["F"] * math.cos(a)).normalized()
        b = c + d * 0.15
        cone(tag + "cspk%d" % i, b, b + d * ln + J["u"] * 0.03, r, mat, 5)

def arm_overlay(J, L, tag, side, mat, k=1.0, name="mut"):
    """Re-skin one arm (a mutated limb) with slightly thicker tubes in another material."""
    sh, el, wr, tip = J["arms"][side]
    ak = L.get("limb", 1.0) * core.LIMB * L.get("arm", 1.0) * k
    ball_at(tag + name + "sh" + side, sh, 0.112 * ak, mat)
    tube(tag + name + "u" + side, [sh, lerp(sh, el, 0.5), el], [0.105 * ak, 0.105 * ak, 0.092 * ak], mat, ref=J["F"], n=10)
    tube(tag + name + "f" + side, [el, lerp(el, wr, 0.3), wr], [0.092 * ak, 0.1 * ak, 0.078 * ak], mat, ref=J["F"], n=10)
    return ak

# ------------------------------------------------------------------ added parts
def back_pt(J, P, h, off=0.0, side=0.0):
    """Point behind the torso at height h, `off` metres off the surface, `side` metres along X."""
    return surf(J, P, h, 180, off) + J["X"] * side

def curled_beard(J, tag, mat="hair", ring="brass", rows=3, ln=1.0):
    """Tiered beard of tight curls with metal rings: rows of little rolls that get narrower downwards."""
    c, X, F, U, s = hf(J)
    for r in range(rows):
        t = r / max(1.0, rows - 1.0)
        w = s[0] * lerp(0.95, 0.5, t)
        y = c - U * s[2] * (0.55 + 0.62 * r * ln) + F * s[1] * (0.72 + 0.06 * r)
        n = 4 - (1 if r == rows - 1 else 0)
        for i in range(n):
            x = (i / (n - 1.0) - 0.5) * 2 * w
            ball_at(tag + "curl%d_%d" % (r, i), y + X * x - F * abs(x) * 0.5, s[0] * 0.3, mat)
        if ring and r < rows - 1:
            tube(tag + "bring%d" % r, [y - U * s[2] * 0.3 - X * w * 0.75, y - U * s[2] * 0.3 + F * 0.03, y - U * s[2] * 0.3 + X * w * 0.75],
                 [0.022, 0.026, 0.022], ring, ref=U, n=5)

def headband(J, tag, mat, h=0.38, w=0.07, k=1.06, tails=True):
    c, X, F, U, s = hf(J)
    a = c + U * s[2] * h
    r = s[0] * k * math.sqrt(max(0.1, 1 - h * h)) + 0.012
    cone(tag + "hband", a - U * w * 0.5, a + U * w * 0.5, r, mat, seg=10, r2=r * 0.97)
    if tails:
        k0 = a - F * r
        for sd in (-1, 1):
            flat_cone(tag + "hbtail%d" % sd, k0, k0 - F * 0.16 - U * 0.2 + X * sd * 0.07, 0.05, mat, F, 0.3)

def eye_patch(J, tag, sd=1, mat="black"):
    c, X, F, U, s = hf(J)
    e = c + F * s[1] * 0.93 + X * sd * s[0] * 0.4 + U * s[2] * 0.08
    ellipsoid(tag + "patch", e, (s[0] * 0.3, 0.02, s[2] * 0.24), mat, J["head_R"], seg=8)
    tube(tag + "patchstr", [e + X * sd * s[0] * 0.45 - F * s[1] * 0.4 + U * s[2] * 0.3, e + U * s[2] * 0.25, c + F * s[1] * 0.85 - X * sd * s[0] * 0.6 + U * s[2] * 0.62],
         [0.014] * 3, mat, n=5)

def one_horn(J, tag, sd=-1, mat="bone", ln=0.5, r=0.075, stub=True):
    """A single long forward-curving horn on one side; the other side is a broken stump."""
    c, X, F, U, s = hf(J)
    hs = s[0] / 0.2
    root = c + X * sd * s[0] * 0.6 + U * s[2] * 0.7
    pts = [root, root + (X * sd * 0.12 + U * 0.45 - F * 0.1) * ln * hs, root + (X * sd * 0.2 + U * 0.85 + F * 0.05) * ln * hs,
           root + (X * sd * 0.16 + U * 1.15 + F * 0.3) * ln * hs]
    tube(tag + "horn1", pts, [r * hs, r * 0.8 * hs, r * 0.55 * hs, r * 0.15 * hs], mat, n=6)
    if stub:
        r2 = c - X * sd * s[0] * 0.6 + U * s[2] * 0.7
        cone(tag + "hornstub", r2, r2 + (U * 0.12 - X * sd * 0.05) * hs, r * 0.9 * hs, mat, 6, r2=r * 0.55 * hs)

def belly_maw(J, P, tag, h=0.12, w=0.2, gape=0.07, teeth=5, off=-0.01, mat="mouth"):
    """A toothed mouth split across the gut."""
    p = surf(J, P, h, 0, off)
    R = basis(J["X"], J["F"], J["u"])
    ellipsoid(tag + "maw", p, (w, 0.05, gape), mat, R, seg=10)
    for i in range(teeth):
        x = (i / (teeth - 1.0) - 0.5) * 1.6 * w
        k = 1 - abs(x) / w * 0.6
        b = p + J["X"] * x + J["F"] * 0.03
        cone(tag + "mawtu%d" % i, b + J["u"] * gape * k, b + J["u"] * gape * k * 0.1, 0.022, "bone", 5)
        if i % 2:
            cone(tag + "mawtl%d" % i, b - J["u"] * gape * k, b - J["u"] * gape * k * 0.1, 0.022, "bone", 5)

def warpaint(J, P, tag, mat, hs=(0.3, 0.4), a0=-34, a1=34, r=0.026):
    for i, h in enumerate(hs):
        stripe(J, P, tag, "paint%d" % i, h, a0, h - 0.03, a1, mat, r=r, off=0.008)

def rags(J, P, tag, mat, h0=0.1, h1=-0.2, arc=(-178, 178), jag=0.5, k=1.1, name="rag"):
    """Torn cloth skirt hanging from the waist."""
    return tband(tag + name, J, P, [h0, (h0 + h1) * 0.5, h1], mat, k=k, add=0.02, arc=arc, jag=jag, n=16)

def tank(J, P, tag, body="brass", band="kit1", r=0.15, h0=0.08, h1=0.56, off=0.17):
    """Fuel tank strapped to the back, with a chimney pipe; returns the top of the pipe."""
    a, b = back_pt(J, P, h0, off), back_pt(J, P, h1, off)
    parts.cylinder(tag + "tank", a, b, r, body, seg=10)
    ball_at(tag + "tankcap", b, r * 0.95, body)
    ball_at(tag + "tankbot", a, r * 0.95, body)
    for i, t in enumerate((0.22, 0.7)):
        q = lerp(a, b, t)
        d = (b - a).normalized()
        parts.cylinder(tag + "tankband%d" % i, q - d * 0.045, q + d * 0.045, r * 1.07, band, seg=10)
    top = b + J["u"] * 0.42 + J["B"] * 0.05 + J["X"] * 0.08
    tube(tag + "tankpipe", [b + J["X"] * 0.08, lerp(b, top, 0.6) + J["X"] * 0.08, top], [0.045, 0.045, 0.05], "darkmetal", n=6)
    return top

def flame(name, base, d, ln, r=0.07):
    cone(name + "o", base, base + d * ln, r, "fire", 6)
    cone(name + "i", base + d * ln * 0.1, base + d * ln * 0.6, r * 0.5, "white", 5)
