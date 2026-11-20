"""Shared parts for the small-folk batch (Goblin, Snotling, Halfling, Gnome, Treeman). Registers no models.

Everything here is drawn from extras() hooks. Nothing in this file is, or may look like, a ball in a hand."""
import math
from mathutils import Vector, Matrix
from lib import core, parts, palette
from lib.core import tube, tband, ball_at, box, cone, flat_cone, ellipsoid, cap, sheet, loft, lerp, UP, basis, D

# A few extra palette entries for the batch (kept small: every ramp grows the shared master palette).
palette.ramp("shroom", "#7a1f2a", "#c23a34", "#ee7a5a")          # mushroom caps
palette.ramp("sack", "#6a5a3c", "#a8946a", "#d8c89c")            # sackcloth


def hf(J):
    return parts.head_frame(J)


def big_ears(J, L, tag, size=1.0, up=0.45, back=0.25, inner="skin_orc"):
    """Large pointed goblin ears sticking out sideways: the race's silhouette at game size."""
    c, X, F, U, s = hf(J)
    for sd in (-1, 1):
        root = c + X * sd * s[0] * 0.8 + U * s[2] * 0.05
        d = (X * sd + U * up - F * back).normalized()
        tip = root + d * 0.42 * size
        flat_cone(tag + "bear%d" % sd, root - d * 0.05, tip, 0.13 * size, L["skin"], F, squash=0.25)
        if inner:
            flat_cone(tag + "bearin%d" % sd, root + F * 0.035, lerp(root, tip, 0.72) + F * 0.035, 0.065 * size, inner, F,
                      squash=0.15)


def long_nose(J, L, tag, ln=0.2, r=0.055, droop=0.06, mat=None):
    c, X, F, U, s = hf(J)
    b = c + F * s[1] * 0.82 - U * s[2] * 0.12
    cone(tag + "gnose", b, b + F * ln - U * droop, r, mat or L["skin"], 6)


def grin(J, tag, w=0.62, mat="bone"):
    c, X, F, U, s = hf(J)
    box(tag + "grin", c + F * s[1] * 0.93 - U * s[2] * 0.6, (s[0] * w, 0.03, s[2] * 0.13), mat, J["head_R"])


def pointy_hat(J, tag, mat, band=None, h=0.6, bend=0.25, r=1.08, brim=0.0, brim_mat=None, base=0.35, tip=None):
    """Tall cone hat with a bent tip; returns the centre-line points (so callers can decorate it)."""
    c, X, F, U, s = hf(J)
    R = J["head_R"]
    b = c + U * s[2] * base
    pts = [b, b + U * h * 0.35 - F * bend * 0.08, b + U * h * 0.72 - F * bend * 0.45, b + U * h - F * bend]
    tube(tag + "hat", pts, [s[0] * r, s[0] * r * 0.64, s[0] * r * 0.3, 0.025], mat, ref=X, n=10)
    if band:
        tube(tag + "hatband", [b - U * 0.015, b + U * 0.085], [s[0] * r * 1.05, s[0] * r * 0.98], band, ref=X, n=10)
    if brim:
        ellipsoid(tag + "brim", b - U * 0.01, (s[0] * brim, s[1] * brim, 0.04), brim_mat or mat, R, seg=14)
    if tip:
        ball_at(tag + "hattip", pts[-1], 0.06, tip)
    return pts


def streamer(tag, name, pts, r, mats, flat=0.4, ref=None, taper=0.6):
    """A ribbon / scarf tail drawn as short segments in alternating materials (stripes)."""
    n = len(pts) - 1
    for i in range(n):
        k0 = 1 - (1 - taper) * i / n
        k1 = 1 - (1 - taper) * (i + 1) / n
        tube(tag + name + str(i), [pts[i], pts[i + 1]], [r * k0, r * k1], mats[i % len(mats)],
             ref=ref or Vector((1, 0, 0)), n=6, flat=flat)


def hang(start, back, side, length, n=4, stream=0.0, sway=0.0, out=0.06):
    """Points of something hanging from `start`; stream 0..1 blows it out behind (run)."""
    pts = [start]
    for i in range(1, n + 1):
        t = i / n
        p = start + back * (length * t * (out + stream * 0.9)) - UP * (length * t * (1 - stream * 0.8)) + side * (sway * t * t * length)
        if stream:
            p += UP * 0.06 * math.sin(t * 5.0) * stream
        pts.append(p)
    return pts


def hairy_feet(J, tag, k=1.0, mat="hair_brown"):
    """Tufts on top of bare halfling feet."""
    for side in ("l", "r"):
        ankle, toe = J["legs"][side][-2:]
        p = lerp(ankle, toe, 0.45) + UP * 0.03 * k
        ellipsoid(tag + "tuft" + side, p, (0.075 * k, 0.11 * k, 0.05 * k), mat, seg=8)


def curls(J, tag, mat, n=7, r=0.085, seed=3):
    """A mop of curly hair as overlapping lumps."""
    import random
    rnd = random.Random(seed)
    c, X, F, U, s = hf(J)
    for i in range(n):
        a = 2 * math.pi * i / n + rnd.uniform(-0.2, 0.2)
        p = c + X * math.sin(a) * s[0] * 0.8 + F * (math.cos(a) * s[1] * 0.75 - 0.03) + U * s[2] * rnd.uniform(0.45, 0.7)
        ball_at(tag + "curl%d" % i, p, r * rnd.uniform(0.85, 1.15), mat)
    ball_at(tag + "curltop", c + U * s[2] * 0.95, r * 1.2, mat)


def strap(tag, name, J, P, mat, sd=1, r=0.035, h0=None, h1=0.06):
    """Bandolier from one shoulder to the opposite hip, front and back."""
    top = P["sh_h"] if h0 is None else h0
    for nm, a0, a1 in (("f", sd * 60, -sd * 70), ("b", sd * 120, -sd * 110)):
        pts = [core.surf(J, P, lerp(top, h1, t), lerp(a0, a1, t), 0.03) for t in (0, 0.33, 0.66, 1)]
        tube(tag + name + nm, pts, [r] * 4, mat, n=6, flat=0.5, ref=J["F"])


def mushroom(tag, name, base, h, r, cap_mat="shroom", stem_mat="bone_old", spots="white", squash=1.0, axis=UP, nspots=5, seed=1, spot_r=0.13):
    """A toadstool: stem, domed cap and spots. squash < 1 flattens it (bouncing)."""
    import random
    rnd = random.Random(seed)
    hh = h * squash
    rr = r * (1 + (1 - squash) * 0.6)
    top = base + axis * hh
    tube(tag + name + "stem", [base, base + axis * hh * 0.5, top], [r * 0.42, r * 0.34, r * 0.38], stem_mat, n=8)
    q = Vector((0, 0, 1)).rotation_difference(axis).to_matrix()
    capc = top - axis * r * 0.12
    ch = r * 0.62 * squash
    cap(tag + name + "cap", capc, (rr, rr, ch), cap_mat, axis, cut=0.0, rot=q, seg=14, thick=0.05)
    ellipsoid(tag + name + "gill", capc, (rr * 0.96, rr * 0.96, 0.03), stem_mat, q, seg=12)
    if spots:
        for i in range(nspots):
            a = 2 * math.pi * i / nspots + rnd.uniform(-0.3, 0.3)
            el = rnd.uniform(0.35, 0.8)
            d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
            p = capc + q @ Vector((d.x * rr, d.y * rr, d.z * ch))
            ball_at(tag + name + "spot%d" % i, p, r * spot_r, spots)
    return top


def scarf(J, P, tag, pose, mats=("kit1", "kit2"), wrap="kit2", tails=((-38, 0.42, -0.1, 1), (-150, 0.5, -0.2, -1)), r=0.08):
    """A wrap round the neck and striped tails; tails = (torso angle, length, sway, +1 front / -1 back).
    The tails stream out behind while the figure is in action."""
    tband(tag + "scarf", J, P, [P["sh_h"] - 0.02, P["sh_h"] + 0.05, P["sh_h"] + 0.11], wrap, k=1.0, add=0.05, solid=0.04)
    Bh = Vector((J["B"].x, J["B"].y, 0)).normalized()
    st = 1.0 if pose.get("_action") else 0.0
    for i, (ang, ln, sw, front) in enumerate(tails):
        k0 = core.surf(J, P, P["sh_h"] - 0.02, ang, 0.07)
        pts = hang(k0, Bh if st else Bh * -front, J["X"], ln, n=5, stream=st, sway=sw + pose.get("_sway", 0.0), out=0.25)
        streamer(tag, "sctail%d" % i, pts, r, mats, ref=J["X"], taper=0.9)


def mounted(model, pose, loc, rotz=0.0, name="crew"):
    """Build a biped at `loc`, turned by rotz radians about the vertical (crew standing on a vehicle)."""
    import bpy
    root = core.ROOT[0]
    sub = bpy.data.objects.new(model.key + "_" + name, None)
    bpy.context.collection.objects.link(sub)
    sub.parent = root
    sub.location = loc
    sub.rotation_euler = (0, 0, rotz)
    core.ROOT[0] = sub
    try:
        L = model.make_layout(pose)
        P = model.proportions(L)
        J = core.skeleton(P, pose)
        tag = model.key + "_"
        model.dress(J, P, L, tag, pose)
        model.extras(J, P, L, tag, pose)
    finally:
        core.ROOT[0] = root
    return J
