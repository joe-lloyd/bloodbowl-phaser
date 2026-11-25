"""Geometry core: mesh helpers, the biped skeleton, body parts and costume parts.

Carried over from the approved concept script. Everything here builds meshes under ROOT[0] in metres,
with the figure standing on z = 0 and facing -Y. Materials are palette keys (see palette.py).
Team files must not edit this module; add parts in the team file instead.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix
from .palette import material

CAM_EL, CAM_AZ = math.radians(30), math.radians(45)
CAMX = Vector((math.cos(CAM_AZ), math.sin(CAM_AZ), 0))
VIEW = Vector((-math.sin(CAM_AZ) * math.cos(CAM_EL), math.cos(CAM_AZ) * math.cos(CAM_EL), -math.sin(CAM_EL)))
UP = Vector((0, 0, 1))
KEY_DIR = (CAMX * -0.55 + VIEW * 0.55 - UP * 0.85).normalized()      # direction the key light travels
MAX_SUBSURF = 1          # game-size sprites do not need more

# ------------------------------------------------------------ mesh helpers
ROOT = [None]
D = math.radians

def finish(name, bm, mats, subsurf=2, solidify=None, smooth=True):
    if isinstance(mats, str):
        mats = [mats]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    for k in mats:
        me.materials.append(material(k))
    if solidify:
        s = ob.modifiers.new("solid", "SOLIDIFY")
        s.thickness = solidify
        s.offset = 0
        if len(mats) > 1:
            s.material_offset = 1
    if subsurf:
        m = ob.modifiers.new("sub", "SUBSURF")
        m.levels = m.render_levels = min(subsurf, MAX_SUBSURF)
    ob.parent = ROOT[0]
    return ob

def basis(x, y, z):
    return Matrix((x, y, z)).transposed()

def lerp(a, b, t):
    return a + (b - a) * t

def ellipsoid(name, c, r, mat, rot=None, seg=16, subsurf=1):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=1)
    R = rot or Matrix.Identity(3)
    for v in bm.verts:
        v.co = R @ Vector((v.co.x * r[0], v.co.y * r[1], v.co.z * r[2])) + c
    return finish(name, bm, mat, subsurf)

def ball_at(name, c, r, mat):
    return ellipsoid(name, c, (r, r, r), mat, seg=10, subsurf=1)

def cap(name, c, r, mat, keep, cut=0.0, rot=None, seg=18, thick=0.02, hi=1.01):
    """Ellipsoid shell keeping the band cut < dot(unit_co, keep) < hi (helmets, hair, hoods, plate rims)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2 + 2, radius=1)
    R = rot or Matrix.Identity(3)
    keep_local = (R.transposed() @ keep).normalized()
    kill = [v for v in bm.verts if not (cut <= v.co.normalized().dot(keep_local) <= hi)]
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    for v in bm.verts:
        v.co = R @ Vector((v.co.x * r[0], v.co.y * r[1], v.co.z * r[2])) + c
    return finish(name, bm, mat, 1, solidify=thick)

def cone(name, base, tip, r, mat, seg=8, r2=0.0, smooth=True):
    bm = bmesh.new()
    d = tip - base
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r2, depth=d.length)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    for v in bm.verts:
        v.co = q @ v.co + (base + tip) / 2
    return finish(name, bm, mat, 0, smooth=smooth)

def flat_cone(name, base, tip, r, mat, flat_axis, squash=0.3):
    """A blade-like cone, squashed along flat_axis (ears, fins, crests)."""
    ob = cone(name, base, tip, r, mat, seg=8)
    a = flat_axis.normalized()
    for v in ob.data.vertices:
        off = v.co - base
        v.co = v.co - a * off.dot(a) * (1 - squash)
    return ob

def box(name, c, size, mat, R=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    R = R or Matrix.Identity(3)
    for v in bm.verts:
        v.co = R @ Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + c
    return finish(name, bm, mat, 0, smooth=False)

def frame_for(t, ref):
    x = ref - t * ref.dot(t)
    if x.length < 1e-4:
        alt = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
        x = alt - t * alt.dot(t)
    x.normalize()
    return x, t.cross(x)

def loft(name, rings, mat, n=14, arc=None, caps=True, subsurf=2, solidify=None, jag=0.0, ripple=None):
    """rings: (centre, xaxis, yaxis, rx, ry). arc=(a0, a1) in degrees (0 = +yaxis) makes an open sheet."""
    bm = bmesh.new()
    rows = []
    rnd = random.Random(len(name))
    for i, (c, xa, ya, rx, ry) in enumerate(rings):
        row = []
        cnt = n if arc is None else n + 1
        for k in range(cnt):
            th = 2 * math.pi * k / n if arc is None else D(arc[0] + (arc[1] - arc[0]) * k / n)
            rs = 1.0
            if ripple:          # per-ring (amplitude, frequency, phase): vertical folds in cloth
                amp, freq, ph = ripple[i]
                rs = 1 + amp * math.sin(freq * th + ph)
            p = c + xa * (rx * rs * math.sin(th)) + ya * (ry * rs * math.cos(th))
            if jag and i == len(rings) - 1 and k % 2:
                p = lerp(p, rings[i - 1][0] + (p - c), jag * (0.5 + rnd.random()))
            row.append(bm.verts.new(p))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        m = len(a)
        for k in (range(m) if arc is None else range(m - 1)):
            bm.faces.new((a[k], a[(k + 1) % m], b[(k + 1) % m], b[k]))
    if caps and arc is None:
        bm.faces.new(rows[0][::-1])
        bm.faces.new(rows[-1])
    return finish(name, bm, mat, subsurf, solidify)

def tube(name, pts, radii, mat, ref=Vector((1, 0, 0)), n=10, subsurf=1, flat=1.0):
    rings = []
    for i, (p, r) in enumerate(zip(pts, radii)):
        a = pts[max(i - 1, 0)]; b = pts[min(i + 1, len(pts) - 1)]
        t = (b - a).normalized()
        x, y = frame_for(t, ref)
        rings.append((p, x, y, r, r * flat))
    return loft(name, rings, mat, n=n, subsurf=subsurf)

def sheet(name, grid, mats, thick=0.02, subsurf=1):
    """grid: rows of points -> quad sheet with thickness (capes, membranes, panels)."""
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in row] for row in grid]
    for a, b in zip(vs, vs[1:]):
        for k in range(len(a) - 1):
            bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
    return finish(name, bm, mats, subsurf, solidify=thick)

# ------------------------------------------------------------- skeleton
def skeleton(P, pose):
    """Forward-kinematic joints. Arms/legs: (swing forward, spread sideways, bend[, forearm spread])."""
    lean = D(pose.get("lean", 0) + P.get("hunch", 0))
    tw = D(pose.get("twist", 0))
    X0 = Vector((1, 0, 0))
    u = Vector((0, -math.sin(lean), math.cos(lean)))
    X = Matrix.Rotation(tw, 3, u) @ X0
    F = X.cross(u)
    Xh = Matrix.Rotation(tw, 3, UP) @ X0
    Fh = Xh.cross(UP)
    J = {"X0": X0, "X": X, "u": u, "F": F, "B": -F, "tw": tw, "sh_h": P["sh_h"], "hF": X0.cross(u)}

    def ldir(a, b, s, Xa, Fa):
        a, b = D(a), D(b)
        return Xa * (s * math.sin(b)) + Fa * (math.sin(a) * math.cos(b)) - UP * (math.cos(a) * math.cos(b))

    pelvis = Vector((0, 0, 0))
    legs, arms = {}, {}
    F0 = Vector((0, -1, 0))
    for side, s in (("l", -1), ("r", 1)):
        a, b, knee = pose["legs"][side]
        p = pelvis + X0 * s * P["hip_w"] - u * 0.03
        pts = [p]
        segs = [(P["thigh"], a), (P["shin"], a - knee)]
        if P.get("digi"):
            segs = [(P["thigh"], a + 50), (P["shin"], a - knee - 52), (P["meta"], a + 20)]
        for Ln, ang in segs:
            p = p + ldir(ang, b, s, X0, F0) * Ln
            pts.append(p)
        fa = D(pose.get("feet", {}).get(side, 0))
        pts.append(p + Vector((s * 0.06, -math.cos(fa), -math.sin(fa))).normalized() * P["foot"])
        legs[side] = pts
        arm = pose["arms"][side]
        a, b, bend = arm[:3]
        b2 = arm[3] if len(arm) > 3 else b * 0.6
        sh = pelvis + u * P["sh_h"] + X * s * P["sh_w"]
        el = sh + ldir(a, b, s, Xh, Fh) * P["uarm"]
        fd = ldir(a + bend, b2, s, Xh, Fh)
        wr = el + fd * P["farm"]
        arms[side] = [sh, el, wr, wr + fd * P["hand"]]
    J["neck"] = pelvis + u * P["neck_h"]
    up_head = (u * 0.5 + UP * 0.5).normalized()
    J["head"] = J["neck"] + up_head * (P["head_h"] - P["neck_h"]) + F * P.get("head_fwd", 0)
    hx = Matrix.Rotation(tw * 0.5 + D(pose.get("look", 0)), 3, up_head) @ X0
    hx = (hx - up_head * hx.dot(up_head)).normalized()
    pitch = D(pose.get("nod", 0))
    hf = hx.cross(up_head)
    hf2 = (hf * math.cos(pitch) - up_head * math.sin(pitch)).normalized()
    J["head_R"] = basis(hx, hf2, hx.cross(hf2) * -1)
    low = min(min(pts[-2].z for pts in legs.values()), min(pts[-1].z for pts in legs.values()) + 0.03)
    shift = Vector((0, 0, P["ankle"] - low))
    J["pelvis"] = pelvis + shift
    for k in ("neck", "head"):
        J[k] = J[k] + shift
    for d in (legs, arms):
        for side in d:
            d[side] = [v + shift for v in d[side]]
    J["legs"], J["arms"] = legs, arms
    return J

HUMAN = dict(hip_w=0.15, thigh=0.41, shin=0.38, foot=0.3, ankle=0.11, sh_h=0.5, sh_w=0.345,
             uarm=0.3, farm=0.27, hand=0.125, neck_h=0.585, head_h=0.83, head_r=(0.2, 0.21, 0.225),
             torso=[(-0.07, .25, .18, 0), (0.1, .225, .165, 0), (0.3, .305, .195, 0), (0.44, .355, .195, .005),
                    (0.53, .24, .15, .01), (0.6, .12, .105, .01)])
HUMAN_SCALE, VARG_SCALE, LIMB = 0.97, 1.0, 1.2   # overall size and limb thickness (semi-chunky)
HAND = {"m": 1.0, "f": 0.68}                     # women have the smaller hands
# limb outlines: (fraction along the segment, radius, how far the muscle pushes out of line)
THIGH = {"m": ((0, .14, 0), (.32, .152, .03), (.68, .112, .026), (.92, .076, .006), (1, .074, 0)),
         "f": ((0, .158, 0), (.22, .155, .016), (.65, .104, .016), (.92, .068, .004), (1, .066, 0))}
SHIN = {"m": ((.08, .08, .004), (.3, .122, .046), (.6, .078, .02), (.85, .054, .002), (1, .052, 0)),
        "f": ((.08, .07, .004), (.3, .104, .04), (.6, .066, .014), (.85, .046, 0), (1, .045, 0))}
UARM = {"m": ((0, .096, 0), (.48, .114, .022), (.82, .076, 0), (1, .07, 0)),
        "f": ((0, .086, 0), (.45, .084, .008), (.85, .062, 0), (1, .06, 0))}
FARM = {"m": ((.08, .078, 0), (.28, .094, .006), (.7, .074, 0), (1, .066, 0)),
        "f": ((.08, .072, 0), (.28, .082, .004), (.7, .062, 0), (1, .05, 0))}
VARG = dict(hip_w=0.22, thigh=0.5, shin=0.46, meta=0.48, foot=0.3, ankle=0.07, digi=True, sh_h=0.8, sh_w=0.5,
            uarm=0.6, farm=0.58, hand=0.2, neck_h=0.86, head_h=1.1, head_fwd=0.2, hunch=20,
            head_r=(0.2, 0.23, 0.19),
            torso=[(-0.12, .21, .18, 0), (0.12, .2, .165, 0), (0.32, .28, .2, 0), (0.54, .43, .27, .03),
                   (0.72, .47, .27, .07), (0.84, .3, .22, .1), (0.92, .16, .14, .08)])

# ----------------------------------------------------------------- poses
IDLES = {
    "thrall": dict(lean=9, legs={"l": (6, 9, 10), "r": (-4, 9, 8)}, arms={"l": (26, 24, 66, 4), "r": (26, 24, 66, 4)},
                   hands="fist"),
    "runner": dict(lean=10, twist=-8, legs={"l": (-14, 5, 10), "r": (20, 5, 18)}, feet={"l": 22},
                   arms={"l": (30, 20, 55, 6), "r": (-20, 22, 45)}, hands="relaxed"),
    "thrower": dict(lean=0, legs={"l": (4, 6, 5), "r": (-3, 6, 5)},
                    arms={"l": (4, 22, 16), "r": (30, 24, 95, 4)}, hands="relaxed"),
    "blitzer": dict(lean=5, legs={"l": (5, 15, 8), "r": (-4, 15, 8)},
                    arms={"l": (6, 36, 46, -8), "r": (6, 36, 46, -8)}, hands="fist"),
    "vargheist": dict(lean=0, legs={"l": (-14, 17, 4), "r": (16, 17, 10)},
                      arms={"l": (2, 24, 26, 8), "r": (16, 24, 34, 8)}, hands="open", jaw=12, nod=-10),
}
ACTIONS = {
    # sprint
    "runner": dict(lean=26, twist=-16, legs={"l": (-44, 3, 14), "r": (72, 3, 92)}, feet={"l": 55},
                   arms={"l": (62, 8, 95), "r": (-55, 8, 80)}, hands="open", nod=-12),
    # wind-up throw, ball cocked behind the head, front arm pointing
    "thrower": dict(lean=-8, twist=34, legs={"l": (34, 8, 14), "r": (-24, 8, 20)}, feet={"r": 20},
                    arms={"l": (82, 4, 8), "r": (-25, 78, 200, 14)}, hands="open", look=-20),
    # shoulder charge, leading shoulder dropped and forearm tucked
    "blitzer": dict(lean=40, twist=-32, legs={"l": (-34, 6, 25), "r": (62, 6, 82)}, feet={"l": 40},
                    arms={"l": (-42, 26, 55), "r": (22, 18, 125, -35)}, hands="fist", nod=-22),
    # braced block stance, palms out
    "thrall": dict(lean=28, legs={"l": (38, 16, 62), "r": (-10, 16, 42)}, feet={"r": 18},
                   arms={"l": (72, 16, 38), "r": (72, 16, 38)}, hands="open", nod=-16),
    # roar / pounce, arms wide, wings spread
    "vargheist": dict(lean=-12, legs={"l": (26, 14, 30), "r": (-16, 14, 22)},
                      arms={"l": (95, 62, 55), "r": (95, 62, 55)}, hands="open", jaw=38, nod=-18),
}

# ------------------------------------------------------- torso surface helpers
def tprof(P, h):
    rings = P["torso"]
    if h <= rings[0][0]:
        return rings[0][1:]
    for a, b in zip(rings, rings[1:]):
        if h <= b[0]:
            t = (h - a[0]) / (b[0] - a[0])
            return tuple(lerp(a[i], b[i], t) for i in (1, 2, 3))
    return rings[-1][1:]

def tframe(J, h):
    t = max(0.0, min(1.0, h / J["sh_h"]))
    X = Matrix.Rotation(J["tw"] * t, 3, J["u"]) @ J["X0"]
    return X, -(X.cross(J["u"]))

def tring(J, P, h, k=1.0, add=0.0):
    rx, ry, back = tprof(P, h)
    X, B = tframe(J, h)
    return (J["pelvis"] + J["u"] * h + B * back, X, B, rx * k + add, ry * k + add)

def surf(J, P, h, ang, off=0.0):
    """Point on the torso surface; ang in degrees from the front, positive toward +X."""
    c, X, B, rx, ry = tring(J, P, h)
    a = D(ang)
    return c + X * ((rx + off) * math.sin(a)) - B * ((ry + off) * math.cos(a))

def tband(name, J, P, hs, mat, k=1.06, add=0.0, arc=None, solid=0.025, subsurf=1, n=14, jag=0.0):
    return loft(name, [tring(J, P, h, k, add) for h in hs], mat, n=n, arc=arc, caps=False, subsurf=subsurf,
                solidify=solid, jag=jag)

def limb(a, b, outline, k, push):
    """Points and radii of a limb segment from a to b; its muscle bulges towards push."""
    return [lerp(a, b, t) + push * (o * k) for t, _, o in outline], [r * k for _, r, _ in outline]

def limb_r(outline, t):
    """The radius of an outline at fraction t, for cloth and bands that follow the limb."""
    for (t0, r0, o0), (t1, r1, o1) in zip(outline, outline[1:]):
        if t <= t1:
            return lerp(r0 + o0 * 0.5, r1 + o1 * 0.5, max(0.0, t - t0) / (t1 - t0))
    return outline[-1][1]

def build_of(L):
    return "f" if L.get("sex") == "f" else "m"

# ------------------------------------------------------------- body parts
def hand(J, P, L, tag, side, s, mode):
    """Palm, four three-jointed fingers and a thumb; modes: relaxed, fist, open."""
    mode = L.get("hand_modes", {}).get(side, mode)
    sh, el, wr, tip = J["arms"][side]
    d = (tip - wr).normalized()
    inward = -J["X"] * s
    n = inward - d * inward.dot(d)
    if n.length < 0.2:
        n = -J["u"] - d * (-J["u"]).dot(d)
    n.normalize()
    if mode == "open" and not P.get("digi"):
        n = (J["F"] - d * J["F"].dot(d)).normalized() if abs(J["F"].dot(d)) < 0.8 else n
    t = n.cross(d) * s
    hs = P["hand"] / 0.1 * L.get("hand_scale", HAND[build_of(L)])
    gaunt = L.get("gauntlets")
    mat = "metal" if gaunt else L.get("gloves", L["skin"])
    claws = L.get("claws")
    fist = mode == "fist"
    pr = (0.082, 0.058, 0.075) if fist else (0.08, 0.04, 0.08)
    ellipsoid(tag + "palm" + side, wr + d * 0.065 * hs, tuple(x * hs for x in pr), mat, basis(t, n, d), seg=12)
    fl = L.get("finger", 1.0)
    for i in range(4):
        o = (i - 1.5) * 0.041
        b0 = wr + d * (0.115 * hs) + t * (o * hs)
        ln = (1.0 if i in (1, 2) else 0.86) * fl * hs
        if fist:
            pts = [b0 - d * 0.03 * hs, b0 + (d * 0.04 + n * 0.028) * hs, b0 + (d * 0.035 + n * 0.072) * hs,
                   b0 + (-d * 0.012 + n * 0.076) * hs]
        elif mode == "open":
            sp = t * (o * 0.9)
            pts = [b0 - d * 0.03 * hs, b0 + (d * 0.05 + sp * 0.5) * ln, b0 + (d * 0.1 + sp + n * 0.012) * ln,
                   b0 + (d * 0.142 + sp * 1.4 + n * 0.035) * ln]
        else:
            pts = [b0 - d * 0.03 * hs, b0 + (d * 0.05 + n * 0.012) * ln, b0 + (d * 0.088 + n * 0.042) * ln,
                   b0 + (d * 0.102 + n * 0.08) * ln]
        tube(tag + "fing%s%d" % (side, i), pts, [0.0265 * hs, 0.0255 * hs, 0.023 * hs, 0.019 * hs], mat, ref=n, n=6)
        if gaunt:
            ball_at(tag + "knuck%s%d" % (side, i), pts[1] - n * 0.012 * hs, 0.026 * hs, L.get("trim", "gold"))
        if claws:
            cd = (pts[3] - pts[2]).normalized()
            cone(tag + "claw%s%d" % (side, i), pts[3] - cd * 0.01, pts[3] + cd * claws * hs, 0.018 * hs, "bone", 6)
    b0 = wr + d * 0.045 * hs + t * 0.068 * hs
    td = (t * 0.6 + d * 0.6 + n * (0.6 if fist else 0.25)).normalized()
    tube(tag + "thumb" + side, [b0 - td * 0.02, b0 + td * 0.045 * hs, b0 + (td * 0.08 + d * 0.012) * hs,
                                b0 + (td * 0.1 + d * 0.035) * hs],
         [0.031 * hs, 0.029 * hs, 0.026 * hs, 0.021 * hs], mat, ref=n, n=6)
    if claws:
        cone(tag + "tclaw" + side, b0 + td * 0.09 * hs, b0 + td * (0.09 + claws * 0.8) * hs, 0.018 * hs, "bone", 6)
    J["grip_" + side] = (wr + d * 0.09 * hs + n * 0.1 * hs, d, n, t)

def boot(J, P, L, tag, side, k):
    knee, ankle, toe = J["legs"][side][-3:]
    mat = "metal" if L.get("greaves") else L.get("boots", "boot")
    top = lerp(knee, ankle, 0.42) - J["hF"] * 0.02 * k
    tube(tag + "boot" + side, [top, lerp(top, ankle, 0.6), ankle + Vector((0, 0, -0.02))],
         [0.108 * k, 0.078 * k, 0.068 * k], mat, n=10)
    cuff = L.get("cuff", "leather")
    if cuff and not L.get("greaves"):
        d = (knee - ankle).normalized()
        tube(tag + "bcuff" + side, [top - d * 0.035, top + d * 0.035], [0.125 * k, 0.13 * k], cuff, n=10)
    fd = (toe - ankle).normalized()
    sx = fd.cross(UP).normalized() if abs(fd.z) < 0.95 else J["X0"]
    up = sx.cross(fd)
    Ln = (toe - ankle).length
    rings, sole = [], []
    for dd, w, hh, drop in ((-0.3, .075, .07, .035), (0.1, .1, .075, .04), (0.6, .11, .062, .05),
                            (0.95, .1, .05, .06), (1.12, .06, .035, .07)):
        c = ankle + fd * (dd * Ln) - up * drop
        rings.append((c, sx, up, w * k * 0.8, hh * k * 0.92))
        sole.append((c - up * (hh * k - 0.004), sx, up, w * k * 0.88, 0.022))
    loft(tag + "foot" + side, rings, mat, n=10, subsurf=1)
    loft(tag + "sole" + side, sole, "sole", n=10, subsurf=1)
    if L.get("greaves"):
        tube(tag + "greave" + side, [lerp(knee, ankle, 0.1), lerp(knee, ankle, 0.5), lerp(knee, ankle, 0.92)],
             [0.125 * k, 0.12 * k, 0.1 * k], "metal", n=10)
        tube(tag + "grim" + side, [lerp(knee, ankle, 0.88), lerp(knee, ankle, 0.95)], [0.112 * k, 0.112 * k],
             L.get("trim", "gold"), n=10)
    if L.get("kneecops"):
        kc = L.get("knee_mat", "metal")
        R = basis(J["X0"], J["hF"], J["u"])
        cap(tag + "knee" + side, knee + J["hF"] * 0.02, (0.13 * k, 0.14 * k, 0.13 * k), kc, J["hF"], cut=0.1,
            seg=12, thick=0.025)

def body(J, P, L, tag, pose):
    """Limbs, torso, neck and head for the human-sized figures."""
    k = L.get("limb", 1.0) * LIMB
    u, X = J["u"], J["X"]
    loft(tag + "torso", [tring(J, P, r[0]) for r in P["torso"]], L["torso"])
    if build_of(L) == "m" and L["torso"] == L["skin"] and L.get("head", "human") == "human":
        for sd in (-1, 1):           # a bare chest shows its muscle
            at = surf(J, P, P["sh_h"] * 0.84, 30 * sd, -0.07)
            ellipsoid(tag + "pec%d" % sd, at, (P["sh_w"] * 0.5, 0.085, 0.075), L["skin"], basis(X, J["F"], u))
    nk = L.get("neck", 1.0)
    tube(tag + "neck", [J["neck"] - u * 0.06, J["head"] - u * 0.04], [0.09 * nk, 0.085 * nk], L["skin"])
    hr, hs = P["head_r"], L.get("head_scale", 1.0)
    R = J["head_R"]
    s = (hr[0] * hs, hr[1] * hs, hr[2] * hs)
    J["head_s"] = s
    ellipsoid(tag + "head", J["head"], s, L["skin"], R)
    mode = pose.get("hands", "relaxed")
    for side, sd in (("l", -1), ("r", 1)):
        leg(J, P, L, tag, side, sd, k)
        sh, el, wr, tip = J["arms"][side]
        ak = k * L.get("arm", 1.0)
        sex = build_of(L)
        ball_at(tag + "shoulder" + side, sh, (0.116 if sex == "m" else 0.098) * ak, L["arms"])
        tube(tag + "uarm" + side, *limb(sh, el, UARM[sex], ak, J["F"]), L["arms"], ref=J["F"], n=10)
        if not L.get("gauntlets"):
            for i, tt in enumerate((0.78, 0.92)):
                tube(tag + "fold%s%d" % (side, i), [lerp(sh, el, tt - 0.04), lerp(sh, el, tt + 0.04)],
                     [0.084 * ak, 0.078 * ak], L["arms"], ref=J["F"], n=10)
        fmat = "metal" if L.get("gauntlets") else L.get("forearms", L["arms"])
        farm, radii = limb(el, wr, FARM[sex], ak, X * sd)
        tube(tag + "farm" + side, [el] + farm, [UARM[sex][-1][1] * ak] + radii, fmat, ref=J["F"], n=10)
        fd = (wr - el).normalized()
        if L.get("gauntlets"):
            tube(tag + "gcuff" + side, [lerp(el, wr, .25), lerp(el, wr, .7)], [0.118 * ak, 0.09 * ak], "metal",
                 ref=J["F"], n=10)
            tube(tag + "grim" + side, [lerp(el, wr, .2), lerp(el, wr, .27)], [0.122 * ak, 0.122 * ak],
                 L.get("trim", "gold"), ref=J["F"], n=10)
        elif L.get("sleeve_cuff"):
            tube(tag + "scuff" + side, [wr - fd * 0.085, wr - fd * 0.015], [0.098 * ak, 0.102 * ak],
                 L["sleeve_cuff"], ref=J["F"], n=10)
        if L.get("arm_band"):
            tube(tag + "aband" + side, [lerp(sh, el, .55), lerp(sh, el, .75)], [0.104 * ak, 0.102 * ak],
                 L["arm_band"], ref=J["F"], n=10)
        if L.get("bracers"):
            tube(tag + "bracer" + side, [lerp(el, wr, .3), lerp(el, wr, .85)], [0.1 * ak, 0.085 * ak],
                 L["bracers"], ref=J["F"], n=10)
        if L.get("wraps"):
            for i, t in enumerate((0.35, 0.55, 0.75)):
                tube(tag + "wrap%s%d" % (side, i), [lerp(el, wr, t), lerp(el, wr, t + 0.1)],
                     [0.094 * ak, 0.09 * ak], L["wraps"], ref=J["F"], n=8)
        if not L.get("no_arms"):
            hand(J, P, L, tag, side, sd, mode)
    HEADS.get(L.get("head", "human"), lambda J, P, L, tag, pose: face(J, L, tag))(J, P, L, tag, pose)

def face(J, L, tag):
    """Sculpted head: jaw, cheekbones, brow ridge, nose, lips, eyes with lids, ears, and the hair styles."""
    c, R, s = J["head"], J["head_R"], J["head_s"]
    X, F, U = R.col[0], R.col[1], R.col[2]
    skin = L["skin"]
    fem = L.get("sex") == "f"
    vamp = L.get("eyes", "red") == "red"

    def hp(x, z, k=1.0):
        y = math.sqrt(max(0.04, 1 - x * x - z * z))
        return c + X * (x * s[0] * k) + U * (z * s[2] * k) + F * (y * s[1] * k)

    jaw_w = 0.56 if fem else 0.68
    ellipsoid(tag + "chin", c - U * s[2] * 0.52 + F * s[1] * 0.3, (s[0] * jaw_w, s[1] * 0.62, s[2] * 0.52), skin, R)
    if not fem:
        for sd in (-1, 1):      # jaw corners
            ellipsoid(tag + "jawc%d" % sd, c - U * s[2] * 0.5 + X * sd * s[0] * 0.55 + F * s[1] * 0.12,
                      (s[0] * 0.3, s[1] * 0.4, s[2] * 0.33), skin, R, seg=10)
    visor = L.get("visor")
    mouth = c + F * s[1] * 0.9 - U * s[2] * 0.62
    if not visor:
        for sd in (-1, 1):
            ellipsoid(tag + "cheek%d" % sd, hp(sd * 0.56, -0.16, 0.9), (s[0] * 0.26, s[1] * 0.2, s[2] * 0.17), skin, R,
                      seg=10)
        nk = 0.82 if fem else 1.0
        tip = hp(0, -0.16) + F * 0.045 * nk
        tube(tag + "nose", [hp(0, 0.2, 0.97), lerp(hp(0, 0.2), tip, 0.6) + F * 0.012, tip],
             [0.024 * nk, 0.03 * nk, 0.04 * nk], skin, ref=X, n=8)
        for sd in (-1, 1):
            ball_at(tag + "nostril%d" % sd, tip + X * sd * 0.03 * nk - F * 0.02 - U * 0.008, 0.024 * nk, skin)
        lip = L.get("lip", "lip_f" if fem else "lip")
        ellipsoid(tag + "mouth", mouth, (s[0] * 0.27, 0.012, s[2] * 0.045), "mouth", R, seg=8, subsurf=0)
        ellipsoid(tag + "lipu", mouth + U * s[2] * 0.055 + F * 0.004, (s[0] * 0.27, 0.022, s[2] * 0.05), lip, R, seg=10)
        ellipsoid(tag + "lipl", mouth - U * s[2] * 0.07 + F * 0.002, (s[0] * 0.21, 0.022, s[2] * 0.05), lip, R, seg=10)
        if L.get("fangs"):
            for sd in (-1, 1):
                b = mouth + X * sd * s[0] * 0.15 + F * 0.012 + U * 0.01
                cone(tag + "fang%d" % sd, b, b - U * 0.058, 0.014, "bone", 6)
    brow = L.get("brow", "hair")
    for sd in (-1, 1):
        if not visor:
            e = hp(sd * 0.4, 0.07, 0.97)
            ellipsoid(tag + "socket%d" % sd, e, (s[0] * 0.25, s[1] * 0.08, s[2] * 0.15), "socket" if vamp else skin, R,
                      seg=10)
            e2 = hp(sd * 0.4, 0.06, 1.02)
            if vamp:
                ellipsoid(tag + "eye%d" % sd, e2, (s[0] * 0.18, s[1] * 0.06, s[2] * 0.1), "eye", R, seg=10)
                box(tag + "pupil%d" % sd, e2 + F * s[1] * 0.06, (0.012, 0.01, s[2] * 0.15), "socket", R)
            else:
                ellipsoid(tag + "eye%d" % sd, e2, (s[0] * 0.17, s[1] * 0.05, s[2] * 0.09), "white", R, seg=10)
                ball_at(tag + "iris%d" % sd, e2 + F * s[1] * 0.04, 0.022, "socket")
            ball_at(tag + "glint%d" % sd, e2 + F * s[1] * 0.065 + X * 0.014 + U * 0.012, 0.008, "white")
            # upper lid / lash line and the brow above it
            lash = "socket" if (fem or vamp) else brow
            tube(tag + "lid%d" % sd, [hp(sd * 0.19, 0.12, 1.035), hp(sd * 0.4, 0.2, 1.045), hp(sd * 0.63, 0.13, 1.03)],
                 [0.008, 0.013 if fem else 0.01, 0.008], lash, ref=F, n=5)
            ridge = 0.02 if fem else 0.034
            tube(tag + "ridge%d" % sd, [hp(sd * 0.05, 0.27, 0.98), hp(sd * 0.45, 0.36, 0.99), hp(sd * 0.8, 0.26, 0.97)],
                 [ridge, ridge * 1.1, ridge * 0.6], skin, ref=F, n=6)
            if fem:
                pts = [hp(sd * 0.14, 0.33, 1.045), hp(sd * 0.45, 0.43, 1.045), hp(sd * 0.76, 0.34, 1.03)]
                rr = [0.013, 0.014, 0.008]
            else:
                pts = [hp(sd * 0.1, 0.25, 1.05), hp(sd * 0.45, 0.4, 1.05), hp(sd * 0.78, 0.33, 1.03)]
                rr = [0.02, 0.022, 0.012]
            tube(tag + "brow%d" % sd, pts, rr, brow, ref=F, n=6)
        ears = L.get("ears", "human")
        root = c + X * sd * s[0] * 0.92 + U * s[2] * 0.02
        if L.get("helm") in ("winged", "gridiron", "hood"):
            pass
        elif ears == "pointed":
            flat_cone(tag + "ear%d" % sd, root - X * sd * 0.02, root + X * sd * 0.1 + U * 0.17 - F * 0.07, 0.06, skin, F)
            flat_cone(tag + "earin%d" % sd, root + F * 0.012, root + X * sd * 0.075 + U * 0.12 - F * 0.04, 0.032,
                      "lip", F, squash=0.2)
        else:
            ellipsoid(tag + "ear%d" % sd, root, (0.025, 0.04, 0.05), skin, R, seg=8)
    hair = L.get("hair")
    hm = L.get("hair_mat", "hair")
    helm = L.get("helm")
    tm = L.get("tie", "kit1")
    act = L.get("_action")
    full = hair in ("slick", "long", "swept", "braid", "bun")
    if full and not helm:
        cap(tag + "hair", c + U * 0.012, (s[0] * 1.09, s[1] * 1.09, s[2] * 1.09), hm, (U * 0.8 - F * 0.6).normalized(),
            cut=-0.12, rot=R, thick=0.03)
        ellipsoid(tag + "hairback", c - F * s[1] * 0.35 + U * s[2] * 0.22, (s[0] * 1.0, s[1] * 0.85, s[2] * 0.92), hm, R)
        pk = hp(0, 0.6, 1.06)
        cone(tag + "peak", pk + U * 0.05 - F * 0.02, pk - U * 0.07 + F * 0.012, 0.05, hm, 6)
        # combed strands over the crown give the hair some structure
        for i, x in enumerate((-0.55, -0.28, 0.0, 0.28, 0.55)):
            zz = math.sqrt(1 - x * x)
            pts = [c + X * x * s[0] * 1.1 + U * zz * s[2] * (1.1 if y > -0.5 else 0.8) * math.sqrt(max(0.05, 1 - y * y))
                   + F * y * s[1] * 1.1 for y in (0.5, 0.0, -0.5, -0.85)]
            tube(tag + "strand%d" % i, pts, [0.02, 0.035, 0.035, 0.02], hm, ref=X, n=6)
        if hair == "swept":
            for i, (x, z) in enumerate(((-0.5, .6), (0, .8), (0.5, .6), (-0.3, .2), (0.3, .2))):
                b = c - F * s[1] * 0.7 + X * x * s[0] + U * z * s[2]
                cone(tag + "spk%d" % i, b, b - F * 0.2 + U * 0.11 + X * x * 0.08, 0.07, hm, 6)
        if fem:
            for sd in (-1, 1):      # locks framing the face
                a = c + X * sd * s[0] * 0.98 + U * s[2] * 0.42 + F * s[1] * 0.38
                tube(tag + "lock%d" % sd, [a, a - U * s[2] * 0.5 + X * sd * 0.02, a - U * s[2] * 1.05 - F * 0.02],
                     [0.04, 0.045, 0.015], hm, ref=F, n=6)
    elif hair == "short" and not helm:
        cap(tag + "hair", c + U * 0.012, (s[0] * 1.07, s[1] * 1.07, s[2] * 1.07), hm, (U * 0.9 - F * 0.45).normalized(),
            cut=0.08, rot=R, thick=0.025)
    if hair == "long" or L.get("helm_tail"):
        # high ponytail (or one escaping under the back of a helm)
        low = bool(L.get("helm_tail"))
        root = c - F * s[1] * (1.0 if low else 0.5) + U * s[2] * (-0.15 if low else 0.82)
        if act:
            pts = [root, root - F * 0.2 + U * 0.13, root - F * 0.5 + U * 0.12, root - F * 0.8 + U * 0.02,
                   root - F * 1.02 - U * 0.04]
        elif low:
            pts = [root, root - F * 0.16 - U * 0.05, root - F * 0.26 - U * 0.3, root - F * 0.24 - U * 0.62,
                   root - F * 0.16 - U * 0.9]
        else:
            pts = [root, root - F * 0.15 + U * 0.16, root - F * 0.36 - U * 0.02, root - F * 0.42 - U * 0.38,
                   root - F * 0.34 - U * 0.72]
        tube(tag + "tail", pts, [0.075, 0.1, 0.1, 0.08, 0.02], hm, ref=X, subsurf=2)
        tube(tag + "tie", [lerp(pts[0], pts[1], 0.35), lerp(pts[0], pts[1], 0.85)], [0.105, 0.11], tm, ref=X, n=8)
    if hair == "braid":
        # long braid: hangs forward over the near shoulder at rest, streams behind in action
        if act:
            offs = [(0, -0.95, 0.0), (0, -1.9, 0.25), (0, -3.0, 0.3), (0, -4.1, 0.15), (0, -5.0, -0.1)]
        else:
            offs = [(-0.25, -0.9, -0.2), (-0.85, -0.55, -0.85), (-1.12, 0.3, -1.5), (-1.02, 0.75, -2.3),
                    (-0.95, 0.85, -3.2)]
        pts = [c + X * x * s[0] + F * y * s[1] + U * z * s[2] for x, y, z in offs]
        nb = 13
        for i in range(nb):
            tt = i / (nb - 1) * (len(pts) - 1)
            a = min(int(tt), len(pts) - 2)
            q = lerp(pts[a], pts[a + 1], tt - a)
            r = lerp(0.085, 0.055, i / (nb - 1))
            side = X * (0.018 if i % 2 else -0.018)
            ellipsoid(tag + "plait%d" % i, q + side, (r, r, r * 0.9), hm, R, seg=8)
        ball_at(tag + "braidtie", pts[-1], 0.065, tm)
        cone(tag + "braidtip", pts[-1], pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.16, 0.05, hm, 6)
    if hair == "bun":
        b = c - F * s[1] * 0.72 + U * s[2] * 0.7
        ellipsoid(tag + "bun", b, (0.14, 0.14, 0.13), hm, R, seg=12)
        tube(tag + "bunband", [b + F * 0.07 - U * 0.07, b + F * 0.1 - U * 0.1], [0.1, 0.095], tm, ref=X, n=8)
        for sd in (-1, 1):
            a = b - X * sd * 0.2 - U * 0.1
            tube(tag + "pin%d" % sd, [a, b + X * sd * 0.12 + U * 0.07], [0.012, 0.012], L.get("trim", "gold"), n=5)
            ball_at(tag + "pinhead%d" % sd, b + X * sd * 0.12 + U * 0.07, 0.024, L.get("trim", "gold"))
    if L.get("scarf"):
        cap(tag + "scarf", c + U * 0.015, (s[0] * 1.13, s[1] * 1.13, s[2] * 1.12), L["scarf"],
            (U * 0.85 - F * 0.5).normalized(), cut=0.12, rot=R, thick=0.03)
        k = c - F * s[1] * 1.0 + U * s[2] * 0.1
        for sd in (-1, 1):
            flat_cone(tag + "scarfend%d" % sd, k, k - F * 0.1 - U * 0.24 + X * sd * 0.09, 0.06, L["scarf"], F, 0.3)

def crest(tag, c, R, s, mat, h=0.2, n=5, lo=0.75, back=-0.9, width=0.045):
    """A row of blades along the midline of a helmet, front to back."""
    X, F, U = R.col[0], R.col[1], R.col[2]
    for i in range(n):
        t = i / (n - 1)
        y = lerp(lo, back, t)
        z = math.sqrt(max(0.0, 1 - y * y))
        b = c + F * (y * s[1] * 1.12) + U * (z * s[2] * 1.1)
        out = (F * y + U * z * 1.3).normalized()
        flat_cone(tag + "crest%d" % i, b - out * 0.03, b + out * h * (0.8 + 0.5 * math.sin(t * math.pi)) - F * 0.06,
                  width * 2.2, mat, X, squash=0.3)

def helmet(J, L, tag):
    kind = L.get("helm")
    if not kind:
        return
    c, R, s = J["head"], J["head_R"], J["head_s"]
    X, F, U = R.col[0], R.col[1], R.col[2]
    big = (s[0] * 1.15, s[1] * 1.15, s[2] * 1.13)
    hm = L.get("helm_mat", "metal")
    trim = L.get("trim", "gold")
    if kind == "winged":
        ellipsoid(tag + "helm", c + U * 0.01, big, hm, R)
        ellipsoid(tag + "jawg", c - U * s[2] * 0.5 + F * s[1] * 0.32, (s[0] * 0.8, s[1] * 0.75, s[2] * 0.62), hm, R)
        box(tag + "visor", c + F * s[1] * 1.08 + U * s[2] * 0.1, (s[0] * 1.5, 0.05, 0.05), "socket", R)
        for sd in (-1, 1):
            ellipsoid(tag + "veye%d" % sd, c + F * s[1] * 1.12 + U * s[2] * 0.1 + X * sd * s[0] * 0.4,
                      (0.035, 0.02, 0.02), "eye", R, seg=8)
        cap(tag + "hrim", c + U * 0.01, tuple(b * 1.04 for b in big), trim, U, cut=0.28, hi=0.5, rot=R, thick=0.02)
        tube(tag + "ridge", [c + F * big[1] * 1.0 - U * s[2] * 0.7, c + F * big[1] * 1.08 + U * s[2] * 0.1],
             [0.02, 0.025], trim, n=6)
        crest(tag, c, R, s, L.get("crest_mat", "kit1"), h=0.16, n=4, lo=0.3)
    elif kind in ("open", "kettle", "skull"):
        keep = (U * 0.75 - F * 0.5).normalized() if kind == "open" else U
        cut = {"open": -0.18, "kettle": 0.12, "skull": 0.22}[kind]
        cap(tag + "helm", c + U * 0.02, big, hm, keep, cut=cut, rot=R, thick=0.025)
        cap(tag + "hrim", c + U * 0.02, tuple(b * 1.045 for b in big), trim if kind == "open" else hm, keep, cut=cut,
            hi=cut + 0.14, rot=R, thick=0.025)
        if kind == "open":
            tube(tag + "nasal", [c + F * big[1] * 0.98 + U * s[2] * 0.5, c + F * big[1] * 1.04 - U * s[2] * 0.2],
                 [0.03, 0.022], hm, n=6, flat=0.5)
        if kind == "kettle":
            bc = c + U * s[2] * 0.3
            ellipsoid(tag + "brim", bc, (big[0] * 1.6, big[1] * 1.6, 0.03), hm, R, seg=18)
            tube(tag + "strap", [c + X * s[0] * 0.95, c - U * s[2] * 1.0 + F * s[1] * 0.4, c - X * s[0] * 0.95],
                 [0.018, 0.018, 0.018], "leather", n=6)
    elif kind == "gridiron":
        keep = (U * 0.55 - F * 0.85).normalized()
        cap(tag + "helm", c + U * 0.015, big, L.get("helm_mat", "kit1"), keep, cut=-0.28, rot=R, thick=0.03)
        bars = L.get("bars", 2)
        for i, h in enumerate((-0.12, -0.42, -0.7)[:bars]):
            a = c + F * s[1] * 1.2 + U * s[2] * h
            tube(tag + "bar%d" % i, [a - X * s[0] * 1.0 - F * s[1] * 0.75, a - X * s[0] * 0.75 - F * 0.02, a,
                                     a + X * s[0] * 0.75 - F * 0.02, a + X * s[0] * 1.0 - F * s[1] * 0.75],
                 [0.022] * 5, "facemask", n=6, subsurf=1)
        tube(tag + "vbar", [c + F * s[1] * 1.05 + U * s[2] * 0.25, c + F * s[1] * 1.22 - U * s[2] * 0.15,
                            c + F * s[1] * 1.2 - U * s[2] * (0.12 + 0.3 * (bars - 1))], [0.02] * 3, "facemask", n=6)
        tube(tag + "stripe", [c - F * s[1] * 1.12 + U * s[2] * 0.3, c - F * s[1] * 0.6 + U * s[2] * 1.02,
                              c + U * s[2] * 1.17, c + F * s[1] * 0.75 + U * s[2] * 0.9],
             [0.04, 0.045, 0.045, 0.04], L.get("stripe", "kit2"), n=8, flat=0.5, ref=X)
        for sd in (-1, 1):
            ellipsoid(tag + "earcup%d" % sd, c + X * sd * big[0] * 0.98 - U * s[2] * 0.1, (0.025, 0.06, 0.06),
                      L.get("stripe", "kit2"), R, seg=8)
        fins = L.get("fins")
        fm = L.get("fin_mat", "kit2")
        for sd in (-1, 1):
            root = c + X * sd * s[0] * 0.7 + U * s[2] * 0.72
            if fins == "bat":
                flat_cone(tag + "fin%d" % sd, root - U * 0.05, root + X * sd * 0.2 + U * 0.36 - F * 0.06, 0.12, fm, F, 0.22)
                flat_cone(tag + "fin2%d" % sd, root - U * 0.05 + X * sd * 0.05, root + X * sd * 0.34 + U * 0.14 - F * 0.1,
                          0.09, fm, F, 0.22)
            elif fins == "swept":
                r2 = c + X * sd * s[0] * 1.0 + U * s[2] * 0.35
                flat_cone(tag + "fin%d" % sd, r2 + F * 0.06, r2 - F * 0.34 + U * 0.14 + X * sd * 0.07, 0.09, fm, X, 0.25)
        if fins == "crest":
            crest(tag, c, R, s, fm, h=0.15, n=5, lo=0.55)
        if L.get("maskfangs"):
            for sd in (-1, 1):
                b = c + F * s[1] * 1.22 - U * s[2] * 0.45 + X * sd * 0.06
                cone(tag + "maskfang%d" % sd, b, b - U * 0.12, 0.028, "bone", 6)
    elif kind == "hood":
        hmat = L.get("hood_mat", "kit1")
        cap(tag + "hood", c + U * 0.01 - F * 0.02, (s[0] * 1.3, s[1] * 1.28, s[2] * 1.26), hmat,
            (U * 0.5 - F * 0.85).normalized(), cut=-0.5, rot=R, thick=0.03)
        cone(tag + "hoodtip", c - F * s[1] * 0.8 + U * s[2] * 0.75, c - F * s[1] * 1.7 + U * s[2] * 0.35, 0.13, hmat, 8)
    if L.get("helm_wings"):
        wm = L["helm_wings"]
        for sd in (-1, 1):
            root = c + X * sd * big[0] * 0.92 + U * s[2] * 0.3
            for i, (ux, uz, bb, r) in enumerate(((0.1, 0.36, 0.1, 0.075), (0.2, 0.24, 0.16, 0.07), (0.24, 0.08, 0.2, 0.06))):
                flat_cone(tag + "hwing%d%d" % (sd, i), root, root + X * sd * ux + U * uz - F * bb, r, wm, F, squash=0.22)
            ball_at(tag + "hwboss%d" % sd, root, 0.045, trim)
    if L.get("plume"):
        crest(tag, c, R, s, L["plume"], h=0.24, n=6, lo=0.6, width=0.05)

def collar(J, P, L, tag, h=0.3, mat=("kit2", "lining")):
    """High flared collar, open at the front, with points at the front corners."""
    base = J["neck"] - J["u"] * 0.05
    X, B, u = J["X"], J["B"], J["u"]
    rows = []
    for t in (0.0, 0.5, 1.0):
        row = []
        for j in range(11):
            a = D(-128 + 256 * j / 10)
            edge = abs(j - 5) / 5.0
            r = 0.115 + (0.11 + 0.05 * edge) * t
            hh = h * t * (0.82 + 0.3 * edge)
            row.append(base + u * hh + X * (r * 1.12 * math.sin(a)) + B * (r * math.cos(a) + 0.02 * t))
        rows.append(row)
    sheet(tag + "collar", rows, list(mat), thick=0.02)

def cape(J, P, L, tag, length, stream, mats=("kit2", "lining"), jag=0.0, half=104):
    """Cape hung from the shoulders by gravity, gathered at the top so it falls in deep folds, with a
    short mantle over the shoulders; stream 0..1 blows it out behind the figure."""
    X, u = J["X"], J["u"]
    Bh = Vector((J["B"].x, J["B"].y, 0)).normalized()
    Xh = Vector((X.x, X.y, 0)).normalized()
    top = J["pelvis"] + u * (P["sh_h"] + 0.045) + J["B"] * 0.02
    trim = L.get("trim", "gold")

    def drape(name, ln, nv, nu, hw, fold, grow, mat, lift=0.0, thick=0.022):
        rows = []
        for i in range(nv + 1):
            v = i / nv
            c = top + UP * lift - UP * (ln * v * (1 - 0.5 * stream)) + Bh * (ln * v * stream * 0.85)
            c += UP * (0.12 * stream * math.sin(v * 3.0))
            rx = (P["sh_w"] + 0.06 + grow) * (1 + 0.32 * v) * (1 - 0.08 * stream * v)
            ry = 0.2 + grow + 0.27 * min(1.0, v * 1.6)      # stays clear of the coat skirt underneath
            row = []
            for j in range(nu + 1):
                a = D(-hw + 2 * hw * j / nu)
                f = fold * min(1.0, v * 2.2)
                rip = 1 + f * (0.1 * math.sin(a * 7.0 + 0.9) + 0.035 * math.sin(a * 15.0 + v * 2.0))
                p = c + Xh * (rx * rip * math.sin(a)) + Bh * (ry * rip * math.cos(a))
                if i == nv:
                    p -= UP * 0.035 * math.sin(a * 7.0 + 2.4) * fold
                if stream:
                    p += UP * (0.07 * stream * v * math.sin(v * 5 + j * 0.45))
                row.append(p)
            rows.append(row)
        sheet(tag + name, rows, list(mat), thick=thick, subsurf=2 if nu > 20 else 1)
        return rows

    rows = drape("cape", length, 12, 30, half, 1.0, 0.0, mats)
    # trim band along the hem
    sheet(tag + "capehem", [[lerp(a, b, 0.25) for a, b in zip(rows[-2], rows[-1])],
                            [b + (b - a) * 0.08 for a, b in zip(rows[-2], rows[-1])]], [trim], thick=0.03, subsurf=1)
    drape("mantle", 0.24, 3, 16, 128, 0.25, 0.035, (mats[0], mats[0]), lift=0.03, thick=0.03)
    if L.get("clasp", True):
        pts = []
        fem = L.get("sex") == "f"     # on a woman the clasps sit up on the shoulders, clear of the bust
        for sd in (-1, 1):
            p = surf(J, P, P["sh_h"] + (0.02 if fem else -0.02), sd * (66 if fem else 52), 0.04)
            pts.append(p)
            ellipsoid(tag + "clasp%d" % sd, p, (0.055, 0.055, 0.055), trim, seg=10)
            ball_at(tag + "claspgem%d" % sd, p + J["F"] * 0.04, 0.025, "eye")
        mid = lerp(pts[0], pts[1], 0.5) - u * 0.06 + J["F"] * 0.06
        for i in range(9):      # chain links
            tt = i / 8
            q = lerp(lerp(pts[0], mid, tt), lerp(mid, pts[1], tt), tt)
            ball_at(tag + "link%d" % i, q, 0.02, trim)

def skirt(J, P, L, tag, length, arc, flare, mat, lining="lining", jag=0.0, k=1.0, top=0.1, name="skirt"):
    """Coat skirt / tails hanging from the waist in vertical folds; arc is measured from the back."""
    X, B = tframe(J, 0.0)
    Bh = Vector((B.x, B.y, 0)).normalized()
    rx0, ry0, _ = tprof(P, top)
    c0 = J["pelvis"] + J["u"] * top
    rings = [(c0, X, B, rx0 * 1.07 * k, ry0 * 1.2 * k)]
    rip = [(0.0, 9, 0.0)]
    for t in (0.14, 0.4, 0.7, 1.0):
        c = c0 - UP * (length * t * (1 - 0.3 * flare)) + Bh * (length * t * flare * 0.8 + 0.02 * t)
        rings.append((c, X, Bh, (rx0 * 1.5 + 0.07 * t) * k, (ry0 * 1.5 + 0.1 * t) * k))
        rip.append((0.06 * t, 9, 0.6))
    loft(tag + name, rings, [mat, lining], n=36, arc=arc, caps=False, subsurf=1, solidify=0.022, jag=jag, ripple=rip)
    if L.get("hem"):
        loft(tag + name + "hem", [(lerp(rings[-2][0], rings[-1][0], 0.72),) + rings[-1][1:3] +
                                  (lerp(rings[-2][3], rings[-1][3], 0.72) + 0.012, lerp(rings[-2][4], rings[-1][4], 0.72) + 0.012),
                                  (rings[-1][0] - UP * 0.01,) + rings[-1][1:3] + (rings[-1][3] + 0.014, rings[-1][4] + 0.014)],
             [L["hem"]], n=36, arc=arc, caps=False, subsurf=1, solidify=0.026,
             ripple=[(lerp(rip[-2][0], rip[-1][0], 0.72), 9, 0.6), rip[-1]])

def panel(J, P, tag, front, length, width, mat, flare=0.0, trim=None, top=0.12):
    """Tabard / loincloth panel hanging from the belt."""
    X, B = tframe(J, 0.0)
    d = -B if front else B
    Bh = Vector((B.x, B.y, 0)).normalized()
    ry = tprof(P, top)[1]
    c0 = J["pelvis"] + J["u"] * top + d * (ry + 0.035)
    rows = []
    for t in (0, 0.35, 0.7, 1):
        c = c0 - UP * (length * t * (1 - 0.3 * flare)) + Bh * (length * t * flare * 0.7) + d * 0.03 * t
        w = width * (1 + 0.12 * t)
        rows.append([c - X * w - d * 0.04, c - X * w * 0.5, c, c + X * w * 0.5, c + X * w - d * 0.04])
    sheet(tag + ("tabF" if front else "tabB"), rows, [mat], thick=0.022)
    if trim:
        a, b = rows[-2], rows[-1]
        sheet(tag + ("tabFt" if front else "tabBt"), [[lerp(p, q, 0.55) + d * 0.012 for p, q in zip(a, b)],
                                                      [q + d * 0.012 - UP * 0.01 for q in b]], [trim], thick=0.026)

def lapels(J, P, L, tag):
    """Coat front: lapels, shirt V, cravat and buttons, all laid on the torso surface."""
    lm = L.get("lapel", "kit2")
    top, bot = P["sh_h"] + 0.02, 0.27
    vrows = []
    for sd in (-1, 1):
        rows = []
        for t in (0, 0.5, 1):
            h = lerp(top, bot, t)
            rows.append([surf(J, P, h, sd * lerp(20, 3, t), 0.03), surf(J, P, h, sd * lerp(40, 8, t), 0.035)])
        sheet(tag + "lapel%d" % sd, rows, [lm], thick=0.02)
    for t in (0, 0.5, 1):
        h = lerp(top, bot + 0.03, t)
        w = lerp(21, 2.5, t)
        vrows.append([surf(J, P, h, -w, 0.018), surf(J, P, h, 0, 0.022), surf(J, P, h, w, 0.018)])
    sheet(tag + "shirt", vrows, ["shirt"], thick=0.015)
    if L.get("cravat", True):
        p = surf(J, P, top - 0.03, 0, 0.05)
        Rc = basis(J["X"], J["F"], J["u"])
        ellipsoid(tag + "cravat", p, (0.1, 0.05, 0.055), "shirt", Rc, seg=10)
        ellipsoid(tag + "cravat2", p - J["u"] * 0.085 + J["F"] * 0.012, (0.075, 0.045, 0.06), "shirt", Rc, seg=10)
    for i, h in enumerate((0.21, 0.13)):
        for sd in (-1, 1):
            ball_at(tag + "btn%d%d" % (i, sd), surf(J, P, h, sd * 13, 0.025), 0.028, L.get("trim", "gold"))

def belt(J, P, L, tag, h=0.07, mat="leather", buckle="gold"):
    tband(tag + "belt", J, P, [h - 0.035, h + 0.035], mat, k=1.09, solid=0.035, add=0.012)
    if buckle:
        X, B = tframe(J, h)
        p = surf(J, P, h, 0, 0.05)
        box(tag + "buckle", p, (0.1, 0.035, 0.085), buckle, basis(X, -B, J["u"]))
        box(tag + "buckle2", p - B * 0.012, (0.05, 0.035, 0.04), "socket", basis(X, -B, J["u"]))

def breastplate(J, P, L, tag):
    mat = L["breast"]
    trim = L.get("trim", "gold")
    sh = P["sh_h"]
    tband(tag + "plackart", J, P, [0.1, 0.2, 0.3], mat, k=1.1, add=0.012, solid=0.03)
    tband(tag + "cuirass", J, P, [0.25, 0.36, sh - 0.04, sh + 0.035], mat, k=1.1, add=0.03, solid=0.03)
    tband(tag + "cuirim", J, P, [0.235, 0.275], trim, k=1.1, add=0.045, solid=0.03)
    # centre ridge and an emblem in the team colour
    if L.get("sex") != "f":                       # a centre ridge reads as a man's chest
        tube(tag + "bridge", [surf(J, P, 0.28, 0, 0.065), surf(J, P, 0.38, 0, 0.085), surf(J, P, sh, 0, 0.06)],
             [0.02, 0.03, 0.02], mat, n=6)
    if L.get("emblem", True):
        # on a woman the wings would land on the bust, so the emblem moves up to the neckline and shrinks
        fem = L.get("sex") == "f"
        p = surf(J, P, sh - 0.04, 0, 0.07) if fem else surf(J, P, 0.4, 0, 0.09)
        span = 0.08 if fem else 0.13
        for sd in (-1, 1):
            flat_cone(tag + "emb%d" % sd, p, p + J["X"] * sd * span + J["u"] * 0.05, 0.05, L.get("emblem_mat", "kit1"),
                      J["F"], squash=0.25)
        ball_at(tag + "embc", p, 0.04, trim)

def gorget(J, P, L, tag, mat=None):
    mat = mat or L.get("breast") or "metal"
    tband(tag + "gorget", J, P, [P["sh_h"] - 0.01, P["sh_h"] + 0.07, P["sh_h"] + 0.13], mat, k=1.0, add=0.04,
          solid=0.03)

def pauldrons(J, P, L, tag):
    kind = L.get("pads")
    if not kind:
        return
    X, u, F = J["X"], J["u"], J["F"]
    pm = L.get("pad_mat", "metal")
    trim = L.get("pad_trim", L.get("trim", "gold"))
    sides = L.get("pad_sides", ("l", "r"))
    for side, sd in (("l", -1), ("r", 1)):
        if side not in sides:
            continue
        sh, el = J["arms"][side][:2]
        ax = (u * 0.75 + X * sd * 0.66).normalized()
        sx = F
        R = basis(sx, ax.cross(sx), ax)
        if kind in ("plate", "big"):
            k = (1.3 if kind == "big" else 1.0) * (0.9 if L.get("sex") == "f" else 1.0)
            c = sh + ax * 0.02
            # three overlapping lames with coloured rims, largest on top
            for i, (drop, sc) in enumerate(((0.16, 0.8), (0.085, 0.92), (0.0, 1.0))):
                cc = c - ax * drop * k + X * sd * drop * 0.5 * k
                r = (0.175 * k * sc, 0.17 * k * sc, 0.135 * k * sc)
                cap(tag + "pad%s%d" % (side, i), cc, r, pm, ax, cut=0.0, rot=R, seg=14, thick=0.03)
                cap(tag + "padrim%s%d" % (side, i), cc, tuple(x * 1.05 for x in r), trim, ax, cut=-0.02, hi=0.2,
                    rot=R, seg=14, thick=0.03)
            if L.get("spikes"):
                for i, off in enumerate((-0.07, 0.07) if L["spikes"] == 2 else (0.0,)):
                    b = c + ax * 0.1 * k + F * off
                    cone(tag + "spike%s%d" % (side, i), b, b + ax * 0.2 * k + u * 0.04, 0.045 * k, L.get("spike_mat", "bone"), 8)
        elif kind == "leather":
            cap(tag + "pad%s" % side, sh + ax * 0.01, (0.15, 0.15, 0.11), "leather", ax, cut=0.05, rot=R, seg=12, thick=0.03)
        elif kind in ("football", "football_big", "football_small"):
            k = {"football": 1.0, "football_big": 1.32, "football_small": 0.82}[kind]
            ax2 = (u * 0.92 + X * sd * 0.4).normalized()
            R2 = basis(F, ax2.cross(F), ax2)
            c = sh + u * 0.035 + X * sd * 0.02
            r = (0.2 * k, 0.21 * k, 0.12 * k)
            cap(tag + "pad%s" % side, c, r, pm, ax2, cut=0.02, rot=R2, seg=14, thick=0.035)
            cap(tag + "padrim%s" % side, c, tuple(x * 1.05 for x in r), trim, ax2, cut=0.0, hi=0.2, rot=R2, seg=14,
                thick=0.035)
            cap(tag + "padcap%s" % side, c + X * sd * 0.1 * k - u * 0.045, (0.14 * k, 0.16 * k, 0.1 * k), trim, ax, cut=0.1,
                rot=R, seg=12, thick=0.03)
            if L.get("spikes"):
                b = c + ax2 * 0.1 * k + X * sd * 0.04
                cone(tag + "spike%s" % side, b, b + ax * 0.2 * k, 0.05 * k, L.get("spike_mat", "bone"), 8)
    if kind.startswith("football"):
        sh_h = P["sh_h"]
        tband(tag + "yoke", J, P, [0.3, 0.4, sh_h, sh_h + 0.05], pm, k=1.08, add=0.03, solid=0.03)
        tband(tag + "yokerim", J, P, [0.285, 0.325], trim, k=1.08, add=0.045, solid=0.03)
        if L.get("neckroll"):
            p = J["pelvis"] + u * (sh_h + 0.08) + J["B"] * 0.12
            tube(tag + "neckroll", [p - X * 0.2, p + J["B"] * 0.05 + u * 0.02, p + X * 0.2], [0.07, 0.085, 0.07], trim, n=8)

# (No ball builder on purpose: figures never hold a ball; the game draws it.)

# ------------------------------------------------------------- vargheist
def wing(J, P, L, tag, sd, spread):
    """Bat wing. Spread: fingers fan out from a raised wrist with scalloped membranes. Folded: the wrist
    sits just above the shoulder and the fingers lie together down the back like a cloak, so the wing
    reads as a draped fold with one hooked thumb claw rather than a fan."""
    X, u = J["X"], J["u"]
    Bh = Vector((J["B"].x, J["B"].y, 0)).normalized()
    Xh = Vector((X.x, X.y, 0)).normalized() * sd
    root = J["pelvis"] + u * (P["sh_h"] - 0.1) + X * sd * 0.24 + J["B"] * 0.24
    sc = L.get("wing_scale", 1.0)
    if spread:
        elbow = root + (UP * 0.5 + Xh * 0.5 + Bh * 0.25) * sc
        wrist = elbow + (UP * 0.55 + Xh * 0.45 - Bh * 0.05) * sc
        tips = [wrist + (Xh * 0.95 + UP * 0.5 + Bh * 0.05) * sc, wrist + (Xh * 1.25 - UP * 0.3 + Bh * 0.12) * sc,
                wrist + (Xh * 0.95 - UP * 1.05 + Bh * 0.2) * sc, wrist + (Xh * 0.3 - UP * 1.5 + Bh * 0.25) * sc]
        anchor = root - UP * 0.75 + Bh * 0.02
        sag = 0.26
    else:
        elbow = root + (-UP * 0.45 + Xh * 0.5 + Bh * 0.42) * sc
        wrist = root + (UP * 0.42 + Xh * 0.56 - Bh * 0.02) * sc
        # leading finger hangs at the outside front; the others stack up behind it
        tips = [wrist + (-UP * (1.95 - 0.13 * i) + Xh * (0.14 - 0.12 * i) + Bh * (0.1 + 0.2 * i)) * sc
                for i in range(4)]
        anchor = root - UP * 0.8 + Bh * 0.06
        sag = 0.07
    chain = tips + [anchor]
    torn = L.get("torn", 0.0)
    rnd = random.Random(5 + sd)
    m = 6
    outer = []
    for gi, (a, b) in enumerate(zip(chain, chain[1:])):
        last_gap = gi == len(chain) - 2
        for q in range(m + (1 if last_gap else 0)):
            sfrac = q / m
            p = lerp(a, b, sfrac)
            pull = sag * math.sin(math.pi * sfrac)
            if torn and 0 < q < m:
                pull += torn * rnd.random()
            p = lerp(p, wrist, pull)
            if not spread:      # pleats: the slack membrane bulges out between the folded fingers
                p += (Xh * 0.07 - Bh * 0.03) * math.sin(math.pi * sfrac) * sc
            outer.append(p)
    rows = [[lerp(wrist, p, t) for p in outer] for t in (0.05, 0.3, 0.55, 0.8, 1.0)]
    sheet(tag + "membrane%d" % sd, rows, [L.get("wing_mat", "membrane")], thick=0.022, subsurf=2)
    fwd = -Bh * 0.04
    skin = L["skin"]
    tube(tag + "wingarm%d" % sd, [root, lerp(root, elbow, 0.5), elbow, lerp(elbow, wrist, 0.5), wrist],
         [0.1, 0.09, 0.07, 0.065, 0.06], skin, n=8, subsurf=2)
    ball_at(tag + "wingelbow%d" % sd, elbow, 0.075, skin)
    hook = wrist + (UP * 0.08 + Xh * 0.05 - Bh * 0.14) * sc
    tube(tag + "wingthumb%d" % sd, [wrist, hook], [0.05, 0.04], skin, n=6)
    cone(tag + "wingclaw%d" % sd, hook, hook + (-UP * 0.12 - Bh * 0.12 + Xh * 0.02) * sc, 0.04, "bone", 6)
    for i, p in enumerate(tips):
        mid = lerp(wrist, p, 0.5) + fwd + (Xh * 0.03 if not spread else Vector((0, 0, 0)))
        tube(tag + "wbone%d%d" % (sd, i), [wrist + fwd, lerp(wrist, mid, 0.5), mid, p + fwd],
             [0.045, 0.04, 0.032, 0.012], skin, n=6)
        ball_at(tag + "wknuck%d%d" % (sd, i), mid, 0.036, skin)

def varg(J, P, L, tag, pose, action):
    """Vargheist: V-shaped muscular torso, bat head, long clawed arms, digitigrade legs, bat wings."""
    u, X, F, B = J["u"], J["X"], J["F"], J["B"]
    skin, dark = L["skin"], L.get("dark", "varg_dark")
    thin = L.get("thin", 1.0)
    for sd in (-1, 1):
        wing(J, P, L, tag, sd, action or L.get("wingspread"))
    loft(tag + "torso", [tring(J, P, r[0]) for r in P["torso"]], skin)
    R0 = basis(X, F, u)
    # muscle masses give the toon shading something to cut into
    for sd in (-1, 1):
        ellipsoid(tag + "pec%d" % sd, surf(J, P, 0.6, sd * 30, -0.05), (0.2, 0.1, 0.14), skin,
                  Matrix.Rotation(D(sd * 28), 3, u) @ R0)
        for i, h in enumerate((0.16, 0.29, 0.41)):
            ellipsoid(tag + "ab%d%d" % (sd, i), surf(J, P, h, sd * 15, -0.03), (0.075, 0.05, 0.058), skin, R0, seg=8)
        ellipsoid(tag + "lat%d" % sd, surf(J, P, 0.52, sd * 105, -0.08), (0.12, 0.2, 0.2), skin, R0)
    ellipsoid(tag + "traps", J["pelvis"] + u * 0.84 + B * 0.14, (0.4, 0.26, 0.19), skin, R0)
    if L.get("spines"):
        for i, h in enumerate((0.3, 0.45, 0.6, 0.75, 0.88)):
            b = surf(J, P, h, 180, -0.03)
            cone(tag + "spine%d" % i, b, b + B * 0.16 + u * 0.08, 0.05, "bone", 6)
    if L.get("ribs"):
        for sd in (-1, 1):
            for i, h in enumerate((0.36, 0.45, 0.54)):
                tube(tag + "rib%d%d" % (sd, i), [surf(J, P, h + 0.04, sd * 20, 0.0), surf(J, P, h, sd * 50, 0.012),
                                                 surf(J, P, h - 0.02, sd * 85, 0.0)], [0.02, 0.026, 0.02], "bone", n=6)
    tube(tag + "neck", [J["neck"] - u * 0.1, J["head"] - u * 0.02 - J["head_R"].col[1] * 0.1], [0.17, 0.14], skin)
    # fur ruff around the neck and across the shoulders
    for i in range(13):
        a = D(-150 + 300 * i / 12)
        dd = X * math.sin(a) - F * math.cos(a) * -1
        dd = X * math.sin(a) + B * math.cos(a)
        b0 = J["neck"] - u * 0.04 + dd * 0.2
        cone(tag + "ruff%d" % i, b0, b0 + dd * 0.2 - u * 0.16, 0.085, dark, 6)
    # legs: thigh forward, shin back, long metatarsal down to the toes
    for side, sd in (("l", -1), ("r", 1)):
        hip, knee, hock, ballp, toe = J["legs"][side]
        tk = thin
        tube(tag + "thigh" + side, [hip + u * 0.05, lerp(hip, knee, .4), knee], [0.19 * tk, 0.215 * tk, 0.13 * tk], skin,
             n=12, subsurf=2)
        tube(tag + "shin" + side, [knee, lerp(knee, hock, .28), lerp(knee, hock, .7), hock],
             [0.125 * tk, 0.15 * tk, 0.1, 0.082], skin, n=10, subsurf=2)
        ball_at(tag + "kneeb" + side, knee + J["hF"] * 0.02, 0.095 * tk, skin)
        tube(tag + "meta" + side, [hock, lerp(hock, ballp, .5), ballp], [0.09, 0.07, 0.085], dark, n=10)
        ball_at(tag + "hockb" + side, hock, 0.1, skin)
        cone(tag + "hockspur" + side, hock, hock - J["hF"] * 0.16 + UP * 0.05, 0.04, "bone", 6)
        fd = (toe - ballp).normalized()
        sx = fd.cross(UP).normalized()
        ellipsoid(tag + "pad" + side, ballp + fd * 0.03 - UP * 0.01, (0.12, 0.13, 0.065), dark, basis(sx, fd, UP))
        for i in (-1, 0, 1):
            td = (fd + sx * i * 0.42).normalized()
            a = ballp + td * 0.05
            b = ballp + td * (P["foot"] * (1.0 if i == 0 else 0.85)) - UP * 0.025
            tube(tag + "toe%s%d" % (side, i), [a, lerp(a, b, .5) + UP * 0.03, b], [0.06, 0.055, 0.04], dark, n=6)
            cone(tag + "toeclaw%s%d" % (side, i), b - td * 0.02, b + td * 0.13 - UP * 0.015, 0.035, "bone", 6)
        # arms
        sh, el, wr, tip = J["arms"][side]
        ellipsoid(tag + "delt" + side, sh + u * 0.03 - X * sd * 0.04, (0.22, 0.2, 0.2), skin, R0)
        tube(tag + "uarm" + side, [sh, lerp(sh, el, .45), el], [0.185 * thin, 0.175 * thin, 0.11], skin, ref=F, n=10,
             subsurf=2)
        tube(tag + "farm" + side, [el, lerp(el, wr, .3), wr], [0.105, 0.14 * thin, 0.085], skin, ref=F, n=10, subsurf=2)
        cone(tag + "elbspur" + side, el, el + (el - wr).normalized() * 0.1 + (el - sh).normalized() * 0.1, 0.045, "bone", 6)
        if L.get("bracers"):
            tube(tag + "bracer" + side, [lerp(el, wr, .45), lerp(el, wr, .9)], [0.145, 0.105], L["bracers"], ref=F, n=10)
            tube(tag + "bracerrim" + side, [lerp(el, wr, .4), lerp(el, wr, .47)], [0.152, 0.152], L.get("trim", "gold"),
                 ref=F, n=10)
        hand(J, P, L, tag, side, sd, "open")
    varg_head(J, P, L, tag, pose)

def varg_head(J, P, L, tag, pose):
    c, R, s = J["head"], J["head_R"], P["head_r"]
    X, F, U = R.col[0], R.col[1], R.col[2]
    skin, dark = L["skin"], L.get("dark", "varg_dark")
    ellipsoid(tag + "head", c, s, skin, R)
    # heavy brow, meeting in a V over the snout
    for sd in (-1, 1):
        tube(tag + "brow%d" % sd, [c + F * s[1] * 0.92 + U * s[2] * 0.12, c + F * s[1] * 0.8 + X * sd * s[0] * 0.5 + U * s[2] * 0.42,
                                   c + F * s[1] * 0.45 + X * sd * s[0] * 0.95 + U * s[2] * 0.4], [0.05, 0.06, 0.035], skin, n=8)
        e = c + F * s[1] * 0.86 + X * sd * s[0] * 0.48 + U * s[2] * 0.14
        ellipsoid(tag + "socket%d" % sd, e, (0.065, 0.03, 0.045), "socket", R, seg=8)
        ellipsoid(tag + "eye%d" % sd, e + F * 0.015 - U * 0.005, (0.045, 0.02, 0.026), "eye", R, seg=8)
        # ears: tall leaf shapes with a paler inner ear
        root = c + X * sd * s[0] * 0.72 + U * s[2] * 0.55 - F * 0.02
        tip = root + X * sd * 0.26 + U * 0.56 - F * 0.1
        flat_cone(tag + "ear%d" % sd, root - U * 0.06, tip, 0.15, skin, F, squash=0.22)
        flat_cone(tag + "earin%d" % sd, root + F * 0.035, lerp(root, tip, 0.82) + F * 0.035, 0.085, "ear_in", F, squash=0.15)
    jaw = D(pose.get("jaw", 10))
    sn = c + F * s[1] * 0.78 - U * s[2] * 0.22
    ellipsoid(tag + "snout", sn, (0.145, 0.19, 0.105), skin, R)
    flat_cone(tag + "noseleaf", sn + F * 0.15 + U * 0.02, sn + F * 0.22 + U * 0.14, 0.07, dark, F, squash=0.35)
    for sd in (-1, 1):
        ball_at(tag + "nostril%d" % sd, sn + F * 0.185 + X * sd * 0.035 + U * 0.015, 0.02, "socket")
    # lower jaw swings open around a hinge at the back of the head
    hinge = c - U * s[2] * 0.35 + F * s[1] * 0.1
    jf = (F * math.cos(jaw) - U * math.sin(jaw)).normalized()
    ju = X.cross(jf) * -1
    Rj = basis(X, jf, ju)
    jc = hinge + jf * 0.26 - ju * 0.07
    ellipsoid(tag + "jaw", jc, (0.125, 0.2, 0.06), skin, Rj)
    ellipsoid(tag + "maw", lerp(sn - U * 0.07, jc + ju * 0.03, 0.5) + F * 0.03, (0.1, 0.15, 0.03 + 0.2 * math.sin(jaw)),
              "mouth", R, seg=10)
    for sd in (-1, 1):
        b = sn + F * 0.13 - U * 0.07 + X * sd * 0.075
        cone(tag + "fang%d" % sd, b, b - U * 0.17 + F * 0.02, 0.035, "bone", 6)
        b2 = sn + F * 0.165 - U * 0.08 + X * sd * 0.028
        cone(tag + "tooth%d" % sd, b2, b2 - U * 0.07, 0.02, "bone", 6)
        b3 = jc + jf * 0.14 + ju * 0.04 + X * sd * 0.06
        cone(tag + "lfang%d" % sd, b3, b3 + ju * 0.11, 0.028, "bone", 6)

def varg_extras(J, P, L, tag, action):
    """Per-direction dressing of the Vargheist: loincloth, harness, collar, shoulder plates."""
    u, X, F, B = J["u"], J["X"], J["F"], J["B"]
    trim = L.get("trim", "gold")
    flare = 0.5 if action else 0.05
    if L.get("loin"):
        tband(tag + "vbelt", J, P, [0.0, 0.08], L.get("belt_mat", "leather"), k=1.08, add=0.015, solid=0.04)
        panel(J, P, tag, True, 0.5, 0.17, L["loin"], flare, trim=L.get("loin_trim"), top=0.03)
        panel(J, P, tag, False, 0.52, 0.19, L["loin"], flare, trim=L.get("loin_trim"), top=0.03)
        p = surf(J, P, 0.04, 0, 0.07)
        ellipsoid(tag + "vbuckle", p, (0.08, 0.03, 0.08), trim, basis(X, F, u), seg=10)
    if L.get("harness"):
        hm = L["harness"]
        for sd in (-1, 1):
            pts = [surf(J, P, 0.8, sd * 38, 0.03), surf(J, P, 0.6, sd * 12, 0.11), surf(J, P, 0.42, -sd * 12, 0.04),
                   surf(J, P, 0.2, -sd * 55, 0.03)]
            tube(tag + "strap%d" % sd, pts, [0.085] * 4, hm, n=6, flat=0.4, ref=F)
        ellipsoid(tag + "boss", surf(J, P, 0.5, 0, 0.1), (0.1, 0.04, 0.1), trim, basis(X, F, u), seg=10)
    if L.get("jersey"):
        tband(tag + "jersey", J, P, [0.1, 0.3, 0.5, 0.68, 0.8], L["jersey"], k=1.04, add=0.075, solid=0.03, subsurf=2)
        tband(tag + "jhem", J, P, [0.08, 0.14], L.get("jersey_trim", "kit2"), k=1.04, add=0.09, solid=0.03)
    if L.get("iron_collar"):
        cm = L["iron_collar"]
        cc = J["neck"] + u * 0.0 + F * 0.03
        tube(tag + "icollar", [cc - u * 0.07, cc + u * 0.05], [0.26, 0.24], cm, n=12, ref=X)
        for i in range(5):
            a = D(-70 + 35 * i)
            dd = X * math.sin(a) + F * math.cos(a)
            cone(tag + "cspike%d" % i, cc + dd * 0.22, cc + dd * 0.38, 0.04, "bone", 6)
    if L.get("collar"):
        collar(J, P, L, tag, h=0.36, mat=(L.get("collar_mat", "kit2"), "lining"))
    pads = L.get("pads")
    if pads:
        pm = L.get("pad_mat", "darkmetal")
        for side, sd in (("l", -1), ("r", 1)):
            if side not in L.get("pad_sides", ("l", "r")):
                continue
            sh = J["arms"][side][0]
            ax = (u * 0.8 + X * sd * 0.6).normalized()
            R = basis(F, ax.cross(F), ax)
            k = 1.05 if pads == "football" else 1.0
            for i, (drop, sc) in enumerate(((0.12, 0.85), (0.0, 1.0))):
                cc = sh + ax * (0.06 - drop) + X * sd * drop * 0.6
                r = (0.215 * sc * k, 0.215 * sc * k, 0.16 * sc)
                cap(tag + "vpad%s%d" % (side, i), cc, r, pm, ax, cut=0.05, rot=R, seg=14, thick=0.035)
                cap(tag + "vpadrim%s%d" % (side, i), cc, tuple(x * 1.05 for x in r), L.get("pad_trim", trim), ax,
                    cut=0.03, hi=0.2, rot=R, seg=14, thick=0.035)
            if L.get("spikes"):
                for i, off in enumerate((-0.1, 0.1)):
                    b = sh + ax * 0.22 + F * off
                    cone(tag + "vspike%s%d" % (side, i), b, b + ax * 0.26, 0.06, "bone", 8)
    if L.get("chains"):
        for side in ("l", "r"):
            sh, el, wr, tip = J["arms"][side]
            tube(tag + "shackle" + side, [lerp(el, wr, 0.72), lerp(el, wr, 0.9)], [0.125, 0.12], "darkmetal", n=10)
            p = lerp(el, wr, 0.82) - UP * 0.1
            for i in range(3):
                ellipsoid(tag + "link%s%d" % (side, i), p - UP * 0.085 * i, (0.04, 0.02, 0.05), "darkmetal", seg=8)


# ------------------------------------------------------------- legs and head dispatch
HEADS = {}       # head kind -> builder(J, P, L, tag, pose); "human" (default) uses face()

def leg(J, P, L, tag, side, sd, k):
    """Plantigrade leg with boot (default), digitigrade leg (P["digi"]) or nothing (L["no_legs"])."""
    if L.get("no_legs"):
        return
    if P.get("digi"):
        return digi_leg(J, P, L, tag, side, sd, k)
    hip, knee, ankle = J["legs"][side][:3]
    sex = build_of(L)
    thigh, upper = limb(hip, knee, THIGH[sex], k, J["hF"])
    shin, lower = limb(knee, ankle, SHIN[sex], k, -J["hF"])
    tube(tag + "leg" + side, thigh + shin, upper + lower, L["legs"], n=12, subsurf=2)
    if L.get("pant_stripe"):
        o = J["X0"] * sd * 0.118 * k
        tube(tag + "stripe" + side, [lerp(hip, knee, .12) + o, lerp(hip, knee, .9) + o * 0.8], [0.035, 0.03],
             L["pant_stripe"], n=6)
    boot(J, P, L, tag, side, k)

def digi_leg(J, P, L, tag, side, sd, k):
    """Thigh forward, shin back, long metatarsal down to three clawed toes."""
    skin, dark = L.get("legs", L["skin"]), L.get("dark", L["skin"])
    u = J["u"]
    hip, knee, hock, ballp, toe = J["legs"][side]
    tube(tag + "thigh" + side, [hip + u * 0.05, lerp(hip, knee, .4), knee], [0.19 * k, 0.215 * k, 0.13 * k], skin, n=12)
    tube(tag + "shin" + side, [knee, lerp(knee, hock, .28), lerp(knee, hock, .7), hock],
         [0.125 * k, 0.15 * k, 0.1 * k, 0.082 * k], skin, n=10)
    ball_at(tag + "kneeb" + side, knee + J["hF"] * 0.02, 0.095 * k, skin)
    tube(tag + "meta" + side, [hock, lerp(hock, ballp, .5), ballp], [0.09 * k, 0.07 * k, 0.085 * k], dark, n=10)
    fd = (toe - ballp).normalized()
    sx = fd.cross(UP).normalized()
    ellipsoid(tag + "pad" + side, ballp + fd * 0.03 - UP * 0.01, (0.12 * k, 0.13 * k, 0.065 * k), dark, basis(sx, fd, UP))
    for i in (-1, 0, 1):
        td = (fd + sx * i * 0.42).normalized()
        a = ballp + td * 0.05
        b = ballp + td * (P["foot"] * (1.0 if i == 0 else 0.85)) - UP * 0.025
        tube(tag + "toe%s%d" % (side, i), [a, lerp(a, b, .5) + UP * 0.03, b], [0.06 * k, 0.055 * k, 0.04 * k], dark, n=6)
        if L.get("claws"):
            cone(tag + "toeclaw%s%d" % (side, i), b - td * 0.02, b + td * 0.13 - UP * 0.015, 0.035 * k, "bone", 6)
