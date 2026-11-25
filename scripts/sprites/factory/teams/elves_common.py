"""Shared parts for the four elf teams (Dark Elf, High Elf, Elven Union, Wood Elf).
Registers no models. Nothing here is ball-like and nothing is held in a hand."""
import math
from mathutils import Vector
from lib import core, palette
from lib.core import tube, ball_at, box, cone, flat_cone, cap, sheet, ellipsoid, lerp, basis, UP, D, surf

palette.ramp("elf_pink", "#8a2a5a", "#d0508a", "#f090b8")          # dyed hair of the Union stars
palette.ramp("elf_birch", "#6a6a66", "#a8a698", "#deddd0")         # pale bark of the Loren treeman

def hz(v):
    return Vector((v.x, v.y, 0)).normalized()

def hf(J):
    """(centre, side, forward, up, radii) of the head."""
    R = J["head_R"]
    return J["head"], R.col[0], R.col[1], R.col[2], J["head_s"]

def limb_k(L):
    return L.get("limb", 1.0) * core.LIMB

# ----------------------------------------------------------------------------- limbs
def leg_band(J, L, tag, side, t0, t1, mat, seg="thigh", grow=1.09, name="lb"):
    """A band around the thigh or shin between fractions t0..t1 (socks, garters, wraps, warpaint)."""
    k = limb_k(L)
    hip, knee, ankle = J["legs"][side][:3]
    a, b = (hip, knee) if seg == "thigh" else (knee, ankle)
    ts = [lerp(t0, t1, i / 3.0) for i in range(4)]
    push = J["hF"] if seg == "thigh" else -J["hF"]
    outline = (core.THIGH if seg == "thigh" else core.SHIN)[core.build_of(L)]
    tube(tag + name + side + seg, [lerp(a, b, t) + push * (0.01 * k) for t in ts], [core.limb_r(outline, t) * k * grow for t in ts], mat, n=10)

def arm_band(J, L, tag, side, t0, t1, mat, seg="upper", grow=1.1, name="ab"):
    """A band around the upper arm or forearm between fractions t0..t1 (sleeves, tattoos, wristbands)."""
    ak = limb_k(L) * L.get("arm", 1.0)
    sh, el, wr = J["arms"][side][:3]
    a, b = (sh, el) if seg == "upper" else (el, wr)
    outline = (core.UARM if seg == "upper" else core.FARM)[core.build_of(L)]
    ts = [lerp(t0, t1, i / 2.0) for i in range(3)]
    tube(tag + name + side + seg, [lerp(a, b, t) for t in ts], [core.limb_r(outline, t) * ak * grow for t in ts], mat, ref=J["F"], n=10)

def shorts(J, L, tag, mat, hem=None, length=0.36):
    k = limb_k(L)
    for side in ("l", "r"):
        hip, knee = J["legs"][side][:2]
        tube(tag + "short" + side, [hip + J["u"] * 0.03, lerp(hip, knee, length * 0.5), lerp(hip, knee, length)],
             [0.15 * k, 0.152 * k, 0.144 * k], mat, n=10)
        if hem:
            tube(tag + "shorthem" + side, [lerp(hip, knee, length - 0.03), lerp(hip, knee, length + 0.03)],
                 [0.158 * k, 0.158 * k], hem, n=10)

def fin(tag, name, a, b, out, mat, h=0.16, flat=None, r=0.06):
    """A blade standing on the segment a-b, pointing along `out` (bracer blades, greave fins)."""
    base = lerp(a, b, 0.5)
    flat_cone(tag + name, base, lerp(a, b, 0.15) + out * h, r, mat, flat if flat is not None else (b - a).cross(out), 0.25)

# ----------------------------------------------------------------------------- cloth
def streamers(tag, start, J, pose, mat, length=0.46, w=0.05, sd=-1, n=2, name="str", key="sash"):
    """Ribbon tails: hang at rest (pose[key] sways them), stream behind in the run."""
    X = J["X"]
    Bh = hz(J["B"])
    sway = pose.get(key, 0.0)
    for i in range(n):
        off = 0.07 * i
        if pose.get("_action"):
            pts = [start, start + Bh * length * 0.65 + UP * (0.06 + off), start + Bh * length * 1.35 + UP * (0.1 + off * 2),
                   start + Bh * length * 1.95 + UP * (0.04 + off * 2)]
        else:
            pts = [start, start - UP * length * 0.3 + X * sd * (0.03 + off),
                   start + Bh * sway - UP * length * 0.65 + X * sd * (0.04 + off * 1.5),
                   start + Bh * sway * 2 - UP * (length - off) + X * sd * (0.04 + off * 2)]
        tube(tag + name + str(i), pts, [w, w * 1.1, w, w * 0.4], mat, ref=X, n=6, flat=0.4)

def sash(J, P, tag, pose, mat, sd=-1, length=0.46, h=0.06, n=2):
    """Knot at one hip with ribbon tails."""
    start = J["pelvis"] + J["u"] * h + J["X"] * sd * (core.tprof(P, h)[0] + 0.03) + J["B"] * 0.02
    ball_at(tag + "sashknot", start, 0.06, mat)
    streamers(tag, start, J, pose, mat, length=length, sd=sd, n=n, name="sash")

def drape(J, P, tag, name, length, a0, a1, mats, stream=0.0, fold=1.0, grow=0.0, lift=0.0, nv=6, nu=14, jag=0.0,
          thick=0.022, depth=0.27, flare=0.32):
    """Cloth hung from the shoulders over the arc a0..a1 degrees (0 = back, +90 = the figure's +X side,
    180 = front): mantles, half capes, pelts. jag makes a ragged / leafy lower edge."""
    Bh, Xh = hz(J["B"]), hz(J["X"])
    top = J["pelvis"] + J["u"] * (P["sh_h"] + 0.045) + J["B"] * 0.02
    rows = []
    for i in range(nv + 1):
        v = i / nv
        c = top + UP * lift - UP * (length * v * (1 - 0.5 * stream)) + Bh * (length * v * stream * 0.85)
        rx = (P["sh_w"] + 0.06 + grow) * (1 + flare * v)
        ry = 0.2 + grow + depth * min(1.0, v * 1.6)
        row = []
        for j in range(nu + 1):
            a = D(a0 + (a1 - a0) * j / nu)
            rip = 1 + fold * min(1.0, v * 2.2) * 0.1 * math.sin(a * 7.0 + 0.9)
            p = c + Xh * (rx * rip * math.sin(a)) + Bh * (ry * rip * math.cos(a))
            if jag and i == nv and j % 2:
                p += UP * jag
            row.append(p)
        rows.append(row)
    sheet(tag + name, rows, list(mats), thick=thick)
    return rows

def leaf_ring(J, P, tag, h, n, length, mat, width=0.09, droop=0.75, arc=(-180, 180), off=0.02, name="leaf", alt=None):
    """A ring of leaf / feather / fur points around the torso at height h, hanging down and out."""
    ctr = J["pelvis"] + J["u"] * h
    for i in range(n):
        ang = arc[0] + (arc[1] - arc[0]) * (i + 0.5) / n
        p = surf(J, P, h, ang, off)
        out = hz(p - ctr)
        ln = length * (1.0 if i % 2 else 0.8)
        tip = p + out * ln * (1 - droop) - UP * ln * droop
        flat_cone(tag + name + str(i), p + UP * 0.03, tip, width, (alt if alt and i % 2 else mat), out, 0.3)

def torso_stripe(J, P, tag, name, pts, mat, r=0.03, off=0.012):
    """A stripe laid on the torso through (height, angle) points: jersey piping, baldrics, tattoos."""
    tube(tag + name, [surf(J, P, h, a, off) for h, a in pts], [r] * len(pts), mat, ref=J["u"], n=6, flat=0.5)

def banner(tag, name, a, b, length, mat, trim=None, sway=0.0, back=Vector((0, 1, 0)), notch=0.25):
    """A pennant hanging from the edge a-b, with a swallow-tail lower edge and an optional trim band."""
    rows = []
    for i in range(5):
        v = i / 4.0
        row = []
        for j in range(5):
            t = j / 4.0
            p = lerp(a, b, t) - UP * length * v + back * (sway * v * v + 0.03 * math.sin(v * 5 + t * 2))
            if i == 4:
                p += UP * length * notch * (1 - abs(t - 0.5) * 2)
            row.append(p)
        rows.append(row)
    sheet(tag + name, rows, [mat], thick=0.03)
    if trim:
        sheet(tag + name + "t", [[p + back * -0.012 for p in rows[0]], [lerp(p, q, 0.6) + back * -0.012 for p, q in zip(rows[0], rows[1])]],
              [trim], thick=0.04)

# ----------------------------------------------------------------------------- heads
def headband(J, tag, mat, lo=0.28, hi=0.52, k=1.13, tilt=0.0):
    c, X, F, U, s = hf(J)
    cap(tag + "hband", c + U * 0.012, (s[0] * k, s[1] * k, s[2] * k), mat, (U + F * tilt).normalized(), cut=lo, hi=hi,
        rot=J["head_R"], thick=0.03)

def shades(J, tag, mat="black"):
    c, X, F, U, s = hf(J)
    box(tag + "shades", c + F * s[1] * 0.93 + U * s[2] * 0.1, (s[0] * 1.75, 0.07, s[2] * 0.3), mat, J["head_R"])

def face_mask(J, tag, mat):
    """Cloth over the nose, mouth and chin."""
    c, X, F, U, s = hf(J)
    cap(tag + "mask", c - U * s[2] * 0.42 + F * s[1] * 0.12, (s[0] * 0.98, s[1] * 1.05, s[2] * 0.8), mat, F, cut=0.05,
        rot=J["head_R"], thick=0.03)

def spire(J, tag, mat, h=0.34, lean=0.1, r=0.8, tip=None):
    """Tall tapering point on top of a helm; returns the tip position."""
    c, X, F, U, s = hf(J)
    base = c + U * s[2] * 0.72
    top = base + U * h - F * lean
    tube(tag + "spire", [base, base + U * h * 0.45 - F * lean * 0.3, top], [s[0] * r, s[0] * r * 0.55, 0.03], mat, ref=X, n=10)
    if tip:
        ball_at(tag + "spiretip", top, 0.04, tip)
    return top

def comb(J, tag, mat, h=0.16, lo=0.7, back=-0.9, n=7, thick=0.05, jag=0.0, name="comb", bulge=0.5):
    """A sail / ridge standing on the midline of the head from front (lo) to back; jag makes it saw-toothed."""
    c, X, F, U, s = hf(J)
    bot, top = [], []
    for i in range(n):
        t = i / (n - 1)
        y = lerp(lo, back, t)
        z = math.sqrt(max(0.0, 1 - y * y))
        b = c + F * (y * s[1] * 1.12) + U * (z * s[2] * 1.1)
        out = (F * y + U * z * 1.3).normalized()
        hh = h * (1 - bulge + bulge * math.sin(t * math.pi) ** 0.6) * ((1 - jag) if i % 2 else 1.0)
        bot.append(b - out * 0.04)
        top.append(b + out * hh)
    sheet(tag + name, [bot, top], [mat], thick=thick, subsurf=0 if jag else 1)

def swept_horns(J, tag, mat, k=1.0, up=1.0, back=1.0, r=0.06):
    """Two horns from the temples that rise and sweep back."""
    c, X, F, U, s = hf(J)
    for sd in (-1, 1):
        root = c + X * sd * s[0] * 1.0 + U * s[2] * 0.45
        pts = [root, root + (X * sd * 0.16 + U * 0.1 * up) * k, root + (X * sd * 0.2 + U * 0.32 * up - F * 0.08 * back) * k,
               root + (X * sd * 0.1 + U * 0.54 * up - F * 0.24 * back) * k]
        tube(tag + "horn%d" % sd, pts, [r, r * 0.85, r * 0.55, 0.012], mat, n=6)

def feathers(J, tag, mat, n=2, h=0.4, at=(0.75, 0.5, -0.3), fan=0.14, r=0.06, name="fth", lean=0.3, alt=None):
    """Tall feathers standing on the head. at = (side, up, forward) of the root in head radii, per side."""
    c, X, F, U, s = hf(J)
    for sd in ((-1, 1) if at[0] else (1,)):
        root = c + X * sd * at[0] * s[0] + U * at[1] * s[2] + F * at[2] * s[1]
        for i in range(n):
            tip = root + U * h * (1 - 0.2 * i) - F * (lean * h + fan * i) + X * sd * (0.06 + 0.05 * i)
            flat_cone(tag + name + "%d%d" % (sd, i), root - U * 0.03, tip, r, (alt if alt and i % 2 else mat), X, 0.3)

def mane(J, tag, mat, length=0.3, r=0.085):
    """Wild hair: a shell with spikes radiating from the crown, sides and back."""
    c, X, F, U, s = hf(J)
    R = J["head_R"]
    cap(tag + "mhair", c + U * 0.012, (s[0] * 1.1, s[1] * 1.1, s[2] * 1.1), mat, (U * 0.8 - F * 0.6).normalized(), cut=-0.12,
        rot=R, thick=0.03)
    ellipsoid(tag + "mback", c - F * s[1] * 0.35 + U * s[2] * 0.2, (s[0] * 1.02, s[1] * 0.9, s[2] * 0.95), mat, R)
    dirs = [(0, 0.1, 1.0, 1.0), (-0.55, -0.1, 0.9, 1.1), (0.55, -0.1, 0.9, 1.1), (-0.95, -0.3, 0.35, 1.25), (0.95, -0.3, 0.35, 1.25),
            (-1.0, -0.5, -0.3, 1.2), (1.0, -0.5, -0.3, 1.2), (0, -0.8, 0.75, 1.15), (-0.5, -0.9, 0.3, 1.3), (0.5, -0.9, 0.3, 1.3),
            (0, -1.0, -0.15, 1.4), (-0.6, -0.8, -0.55, 1.3), (0.6, -0.8, -0.55, 1.3), (-0.35, 0.45, 0.95, 0.7), (0.35, 0.45, 0.95, 0.7)]
    for i, (x, y, z, ln) in enumerate(dirs):
        d = (X * x + F * y + U * z).normalized()
        b = c + X * (x * s[0] * 0.75) + F * (y * s[1] * 0.75) + U * (z * s[2] * 0.75)
        cone(tag + "mspk%d" % i, b, b + d * (0.2 + length * ln), r, mat, 6)

def back_hair(J, L, tag, mat, length=0.5, w=0.17):
    """Long loose hair down the back (use with hair="slick"); streams behind in the run."""
    c, X, F, U, s = hf(J)
    root = c - F * s[1] * 0.55 + U * s[2] * 0.15
    if L.get("_action"):
        pts = [root, root - F * 0.25 + U * 0.05, root - F * (0.3 + length * 0.7) + U * 0.06, root - F * (0.35 + length * 1.3) - U * 0.02]
    else:
        pts = [root, root - F * 0.18 - U * 0.2, root - F * 0.2 - U * (0.25 + length * 0.6), root - F * 0.15 - U * (0.3 + length)]
    tube(tag + "bhair", pts, [w * 0.9, w, w * 0.9, w * 0.35], mat, ref=X, n=8, flat=0.55)

def topknot(J, L, tag, mat, tie="kit2", length=0.55, r=0.075):
    """Tall topknot bound at the crown: stands up, then falls back; streams in the run."""
    c, X, F, U, s = hf(J)
    root = c + U * s[2] * 0.85 - F * s[1] * 0.25
    if L.get("_action"):
        pts = [root, root + U * 0.2 - F * 0.05, root + U * 0.26 - F * (0.2 + length * 0.5), root + U * 0.16 - F * (0.3 + length),
               root + U * 0.02 - F * (0.4 + length * 1.3)]
    else:
        pts = [root, root + U * 0.22 - F * 0.02, root + U * 0.34 - F * 0.2, root + U * (0.3 - length * 0.5) - F * 0.36,
               root + U * (0.2 - length) - F * 0.36]
    tube(tag + "knot", pts, [r * 0.8, r, r * 1.2, r, 0.02], mat, ref=X, subsurf=2)
    tube(tag + "knottie", [lerp(pts[0], pts[1], 0.2), lerp(pts[0], pts[1], 0.9)], [r * 1.15, r * 1.2], tie, ref=X, n=8)

def antlers(J, tag, mat, k=1.0):
    c, X, F, U, s = hf(J)
    for sd in (-1, 1):
        root = c + X * sd * s[0] * 0.7 + U * s[2] * 0.75
        a = root + (X * sd * 0.14 + U * 0.2) * k
        b = a + (X * sd * 0.04 + U * 0.24 - F * 0.04) * k
        tube(tag + "antl%d" % sd, [root, a, b], [0.04, 0.032, 0.012], mat, n=5)
        tube(tag + "antt%d" % sd, [a, a + (X * sd * 0.18 + U * 0.1) * k], [0.028, 0.01], mat, n=5)
        tube(tag + "antu%d" % sd, [lerp(a, b, 0.5), lerp(a, b, 0.5) + (-X * sd * 0.08 + U * 0.14 + F * 0.05) * k], [0.024, 0.01], mat, n=5)

def studs(J, P, tag, name, pts, mat, r=0.022, off=0.06):
    """Small round studs, gems or rivets on the torso surface at (height, angle) points."""
    for i, (h, a) in enumerate(pts):
        ball_at(tag + name + str(i), surf(J, P, h, a, off), r, mat)

# ----------------------------------------------------------------------------- look options
def hair(sex, mat, men="slick", women="long"):
    """Layout of a bare head's hair: "slick" for men also gets long loose hair down the back, drawn by
    the team's extras from the elf_backhair key; women default to a high ponytail."""
    style = women if sex == "f" else men
    out = dict(hair=style, hair_mat=mat)
    if style == "slick":
        out["elf_backhair"] = mat
    return out

def helmed(**layout):
    """A helmet value as a function of the body: a man's hair escapes the helm in a low tail at the back, a
    woman's in a long braid over her shoulder, so she reads apart from the front."""
    return lambda sex: dict(layout, helm_tail=None, hair="braid") if sex == "f" else dict(layout, helm_tail=True)

def loose_hair(J, L, tag, length=0.42, w=0.17):
    """The elf_backhair layout key: long loose hair down the back."""
    if L.get("elf_backhair"):
        back_hair(J, L, tag, L["elf_backhair"], length=length, w=w)

def sheath(J, tag, sd, mat="leather", hilt="darkmetal", ln=0.3):
    """A sheathed dagger strapped behind one hip (worn, never drawn)."""
    base = J["pelvis"] + J["u"] * 0.1 + J["X"] * sd * 0.2 + J["B"] * 0.17
    d = (J["X"] * sd * -0.75 - J["u"] * 0.65).normalized()
    tube(tag + "sheath%d" % sd, [base, base + d * ln], [0.05, 0.025], mat, ref=J["B"], n=6, flat=0.5)
    tube(tag + "hilt%d" % sd, [base - d * 0.17, base], [0.028, 0.03], hilt, n=6)
    box(tag + "guard%d" % sd, base, (0.14, 0.04, 0.04), hilt, basis(J["u"].cross(d).normalized(), J["B"], d) if abs(J["u"].dot(d)) < 0.99 else None)
