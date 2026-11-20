"""Extra parts for the body plans: non-human heads, tails, horns, tusks, beards, held rods, foliage.

Every part takes the joint dict J (from core.skeleton) and draws under core.ROOT[0]. Costume parts that
were already in the approved concept live in core: helmet, crest, collar, cape, skirt, panel, lapels, belt,
breastplate, gorget, pauldrons, wing, tband (a band around the torso), surf (a point on the torso).
There is deliberately no ball: nothing here may look like a ball in a hand.
"""
import math
from mathutils import Vector, Matrix
from . import core
from .core import (ellipsoid, ball_at, cone, flat_cone, box, tube, loft, sheet, cap, lerp, basis, D, UP)

def head_frame(J):
    """(centre, side axis X, forward axis F, up axis U, radii s) of the head."""
    c, R, s = J["head"], J["head_R"], J["head_s"]
    return c, R.col[0], R.col[1], R.col[2], s

def snout_head(J, P, L, tag, pose):
    """Animal head on the cranium that body() already drew. Layout keys: snout=(length, width) factors,
    ears="bat"|"rat"|"wolf"|"bull"|"none", fangs, eye_mat, snout_mat, nose_mat, crest (material)."""
    c, X, F, U, s = head_frame(J)
    R = J["head_R"]
    skin = L["skin"]
    ln, wd = L.get("snout", (1.0, 1.0))
    hs = s[0] / 0.2
    for sd in (-1, 1):
        tube(tag + "brow%d" % sd, [c + F * s[1] * 0.9 + U * s[2] * 0.15, c + F * s[1] * 0.78 + X * sd * s[0] * 0.5 + U * s[2] * 0.42,
                                   c + F * s[1] * 0.45 + X * sd * s[0] * 0.95 + U * s[2] * 0.38],
             [0.05 * hs, 0.06 * hs, 0.035 * hs], skin, n=6)
        e = c + F * s[1] * 0.84 + X * sd * s[0] * 0.5 + U * s[2] * 0.14
        ellipsoid(tag + "socket%d" % sd, e, (0.065 * hs, 0.03 * hs, 0.045 * hs), "socket", R, seg=8)
        ellipsoid(tag + "eye%d" % sd, e + F * 0.015 * hs, (0.045 * hs, 0.02 * hs, 0.028 * hs), L.get("eye_mat", "eye"), R, seg=8)
        ears = L.get("ears", "none")
        root = c + X * sd * s[0] * 0.72 + U * s[2] * 0.55 - F * 0.02
        if ears == "bat":
            tip = root + (X * sd * 0.26 + U * 0.56 - F * 0.1) * hs
            flat_cone(tag + "ear%d" % sd, root - U * 0.06 * hs, tip, 0.15 * hs, skin, F, squash=0.22)
            flat_cone(tag + "earin%d" % sd, root + F * 0.035, lerp(root, tip, 0.82) + F * 0.035, 0.085 * hs, "ear_in", F, squash=0.15)
        elif ears == "rat":
            ellipsoid(tag + "ear%d" % sd, root + (X * sd * 0.1 + U * 0.08) * hs, (0.13 * hs, 0.04 * hs, 0.14 * hs), L.get("ear_mat", "skin_rat"), R, seg=10)
        elif ears == "wolf":
            flat_cone(tag + "ear%d" % sd, root - U * 0.05 * hs, root + (X * sd * 0.08 + U * 0.3 - F * 0.04) * hs, 0.11 * hs, skin, F, squash=0.3)
        elif ears == "bull":
            flat_cone(tag + "ear%d" % sd, root - U * 0.12 * hs, root + (X * sd * 0.3 - U * 0.1 - F * 0.05) * hs, 0.08 * hs, skin, U, squash=0.3)
    jaw = D(pose.get("jaw", 8))
    sn = c + F * s[1] * (0.55 + 0.28 * ln) - U * s[2] * 0.22
    smat = L.get("snout_mat", skin)
    ellipsoid(tag + "snout", sn, (0.145 * hs * wd, 0.19 * hs * ln, 0.105 * hs), smat, R)
    ball_at(tag + "nose", sn + F * 0.18 * hs * ln + U * 0.02 * hs, 0.045 * hs * wd, L.get("nose_mat", "socket"))
    hinge = c - U * s[2] * 0.35 + F * s[1] * 0.1
    jf = (F * math.cos(jaw) - U * math.sin(jaw)).normalized()
    ju = X.cross(jf) * -1
    jc = hinge + jf * 0.26 * hs * ln - ju * 0.07 * hs
    ellipsoid(tag + "jaw", jc, (0.125 * hs * wd, 0.2 * hs * ln, 0.06 * hs), smat, basis(X, jf, ju))
    if pose.get("jaw", 8) > 14:
        ellipsoid(tag + "maw", lerp(sn - U * 0.07 * hs, jc + ju * 0.03, 0.5) + F * 0.03, (0.1 * hs * wd, 0.15 * hs * ln, 0.03 + 0.2 * math.sin(jaw)),
                  "mouth", R, seg=10)
    if L.get("fangs"):
        for sd in (-1, 1):
            b = sn + (F * 0.13 * ln - U * 0.07 + X * sd * 0.075 * wd) * hs
            cone(tag + "fang%d" % sd, b, b - U * 0.15 * hs + F * 0.02, 0.035 * hs, "bone", 6)
    if L.get("crest"):
        core.crest(tag, c, R, s, L["crest"], h=0.2 * hs, n=5, lo=0.6)

def skull_head(J, P, L, tag, pose):
    """Bare skull on the cranium that body() already drew (use a bone skin). eye_mat sets the glow."""
    c, X, F, U, s = head_frame(J)
    R = J["head_R"]
    for sd in (-1, 1):
        e = c + F * s[1] * 0.82 + X * sd * s[0] * 0.42 + U * s[2] * 0.08
        ellipsoid(tag + "socket%d" % sd, e, (s[0] * 0.3, s[1] * 0.14, s[2] * 0.26), "socket", R, seg=10)
        ball_at(tag + "eye%d" % sd, e + F * s[1] * 0.1, 0.022, L.get("eye_mat", "eye"))
    cone(tag + "nosehole", c + F * s[1] * 0.98 - U * s[2] * 0.3, c + F * s[1] * 0.9 - U * s[2] * 0.05, 0.035, "socket", 4)
    jaw = c + F * s[1] * 0.42 - U * s[2] * 0.72
    ellipsoid(tag + "jaw", jaw, (s[0] * 0.62, s[1] * 0.6, s[2] * 0.3), L["skin"], R)
    box(tag + "teeth", c + F * s[1] * 0.93 - U * s[2] * 0.6, (s[0] * 0.8, 0.02, s[2] * 0.16), "white", R)
    box(tag + "gap", c + F * s[1] * 0.95 - U * s[2] * 0.6, (s[0] * 0.84, 0.02, s[2] * 0.035), "socket", R)

core.HEADS["snout"] = snout_head
core.HEADS["skull"] = skull_head

def tail(J, P, L, tag, pose):
    """Layout: tail=dict(len=0.8, r=0.07, mat=..., up=0.15, tip=None). Pose key "tail" (-1..1) sways it."""
    spec = dict(len=0.8, r=0.07, mat=L["skin"], up=0.15, tip=None)
    if isinstance(L.get("tail"), dict):
        spec.update(L["tail"])
    B, X = J["B"], J["X"]
    Bh = Vector((B.x, B.y, 0)).normalized()
    ln, r = spec["len"], spec["r"]
    sway = pose.get("tail", 0.0) * ln * 0.25
    base = J["pelvis"] + B * 0.1
    pts = [base, base + Bh * ln * 0.4 - UP * ln * 0.28 + X * sway * 0.3, base + Bh * ln * 0.75 - UP * ln * 0.3 + X * sway,
           base + Bh * ln + UP * (spec["up"] * ln - ln * 0.2) + X * sway * 1.8]
    tube(tag + "tail", pts, [r * 1.3, r, r * 0.7, r * 0.3], spec["mat"], ref=X, n=8)
    if spec["tip"]:
        ball_at(tag + "tailtip", pts[-1], r * 0.9, spec["tip"])

def horns(J, L, tag):
    """Layout: horns="bull"|"ram"|"goat"|"small", horn_mat."""
    c, X, F, U, s = head_frame(J)
    kind, mat = L["horns"], L.get("horn_mat", "bone")
    hs = s[0] / 0.2
    for sd in (-1, 1):
        root = c + X * sd * s[0] * 0.75 + U * s[2] * 0.6
        if kind == "bull":
            pts = [root, root + (X * sd * 0.22 + U * 0.06) * hs, root + (X * sd * 0.34 + U * 0.24 + F * 0.08) * hs]
        elif kind == "ram":
            pts = [root, root + (X * sd * 0.16 - F * 0.14 + U * 0.04) * hs, root + (X * sd * 0.24 - F * 0.12 - U * 0.2) * hs,
                   root + (X * sd * 0.2 + F * 0.08 - U * 0.26) * hs]
        elif kind == "goat":
            pts = [root, root + (X * sd * 0.05 - F * 0.14 + U * 0.2) * hs, root + (X * sd * 0.1 - F * 0.34 + U * 0.3) * hs]
        else:
            pts = [root, root + (X * sd * 0.05 + U * 0.14) * hs]
        tube(tag + "horn%d" % sd, pts, [0.07 * hs, 0.055 * hs, 0.035 * hs, 0.015 * hs][:len(pts)], mat, n=6)

def tusks(J, L, tag):
    c, X, F, U, s = head_frame(J)
    for sd in (-1, 1):
        b = c + F * s[1] * 0.86 - U * s[2] * 0.7 + X * sd * s[0] * 0.3
        cone(tag + "tusk%d" % sd, b, b + U * s[2] * 0.6 + F * 0.02, s[0] * 0.14, "bone", 6)

def beard(J, L, tag):
    """Layout: beard=<hair material>, beard_len (1.0)."""
    c, X, F, U, s = head_frame(J)
    k = L.get("beard_len", 1.0)
    ellipsoid(tag + "beard", c - U * s[2] * 0.75 + F * s[1] * 0.55, (s[0] * 0.85, s[1] * 0.55, s[2] * 0.75), L["beard"], J["head_R"])
    b = c - U * s[2] * 1.2 + F * s[1] * 0.6
    cone(tag + "beardtip", b, b - U * s[2] * 1.3 * k + F * 0.04, s[0] * 0.6, L["beard"], 8)
    ellipsoid(tag + "tache", c - U * s[2] * 0.42 + F * s[1] * 0.92, (s[0] * 0.55, 0.035, s[2] * 0.14), L["beard"], J["head_R"], seg=8)

def rod(J, side, tag, length=0.9, r=0.03, mat="wood", head=None, head_mat="metal"):
    """A shaft gripped in a hand (club, hammer, blade, staff, banner pole). Call it from extras().
    head: None | "club" | "hammer" | "blade". Never use this to make anything ball-like."""
    c0, d, n, t = J["grip_" + side]
    c0 = c0 - n * 0.05
    a, b = c0 - t * length * 0.25, c0 + t * length * 0.75
    tube(tag + "rod" + side, [a, b], [r, r], mat, n=6)
    if head == "club":
        ellipsoid(tag + "rodhead" + side, b, (r * 3, r * 3, r * 5), head_mat, basis(n, d, t))
    elif head == "hammer":
        box(tag + "rodhead" + side, b, (r * 9, r * 5, r * 5), head_mat, basis(d, n, t))
    elif head == "blade":
        flat_cone(tag + "rodhead" + side, b - t * 0.05, b + t * length * 0.5, r * 3.5, head_mat, n, squash=0.2)

def foliage(tag, centre, r, mat="leaf", n=5, seed=0):
    """A clump of leaves (treeman crowns, wood-elf decoration)."""
    import random
    rnd = random.Random(seed)
    for i in range(n):
        o = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.4, 0.8))) * r * 0.7
        ball_at(tag + "leaf%d_%d" % (seed, i), centre + o, r * rnd.uniform(0.45, 0.7), mat)

def cylinder(name, a, b, r, mat, seg=12):
    """Straight cylinder between two points (wheels, drums, barrels, funnels)."""
    return cone(name, a, b, r, mat, seg=seg, r2=r, smooth=True)
