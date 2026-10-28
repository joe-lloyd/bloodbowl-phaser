"""Build the neon stadium around a Sevens pitch and render it as one backdrop.

    blender.exe -b --factory-startup --python stadium.py -- OUT_DIR layout

One layout per run: a third layout in the same session rendered black.

Layouts differ only in where the two dugouts sit:

    far     both dugouts side by side along the far sideline
    facing  home dugout on the far sideline, away dugout on the near one
    ends    one dugout behind each end zone

The camera is the player camera: orthographic, 30 degrees up, turned 45, at
the same pixels per metre, so the sprites from render_models.py stand on the
backdrop without rescaling. Pitch and dugout squares are SQUARE_M across.

Each dugout is 11 squares by 3: reserves 4 wide, KO 3, injured 3 and sent
off 1. Eleven squares is the width of an end zone, so the same block fits a
sideline or an end. Reserves hold 12, enough for a full Sevens roster.

Like the players, the backdrop renders twice. In the colour pass anything in
team colours is grey; the mask pass paints home kit red and away kit green,
so Phaser can tint the crowd, seats, end zones and reserve boxes per match.
meta.json records where world points land in the image so the page can put
grid squares on it.

Only the far sides get tall stands. Anything tall on the near sides would
stand between the camera and the pitch, so they get a few low rows.
"""

import json
import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
g = {"__name__": "stadium_helpers"}
with open(os.path.join(HERE, "blender_players.py")) as fh:
    exec(fh.read(), g)

STYLE = g["STYLES"]["neon"]
PX_PER_UNIT = g["PX_PER_UNIT"]
S = 2.8                     # SQUARE_M in team_models.py
COLS, ROWS = 20, 11
LOS = (7, 13)               # Line of scrimmage lines: between columns 6|7 and 12|13
WIDE = (2, 9)
DUGOUT = [("reserves", 4), ("ko", 3), ("injured", 3), ("sent off", 1)]
DUGOUT_ROWS = 3
LABELS = {"reserves": "RESERVES", "ko": "KO", "injured": "INJURED", "sent off": "SENT\nOFF"}

# part -> (kind, colour, mask). kind "toon" is lit, "flat" glows at its colour.
# Colours are linear, so a dark sRGB tone needs a very small value.
PARTS = {
    "ground": ("toon", (0.003, 0.0025, 0.005), None),
    "apron": ("toon", (0.007, 0.006, 0.011), None),
    "turf_a": ("toon", (0.007, 0.014, 0.012), None),
    "turf_b": ("toon", (0.011, 0.02, 0.017), None),
    "zone_home": ("toon", (0.07, 0.07, 0.07), "home"),
    "zone_away": ("toon", (0.07, 0.07, 0.07), "away"),
    "dug_floor": ("toon", (0.006, 0.005, 0.009), None),
    "dug_tile": ("toon", (0.016, 0.014, 0.024), None),
    "concrete": ("toon", (0.03, 0.027, 0.04), None),
    "riser": ("toon", (0.012, 0.01, 0.017), None),
    "wall": ("toon", (0.018, 0.016, 0.026), None),
    "metal": ("toon", (0.04, 0.04, 0.055), None),
    "seat": ("toon", (0.035, 0.032, 0.045), None),
    "seat_home": ("toon", (0.1, 0.1, 0.1), "home"),
    "seat_away": ("toon", (0.1, 0.1, 0.1), "away"),
    "fan_home": ("toon", (0.2, 0.2, 0.2), "home"),
    "fan_away": ("toon", (0.2, 0.2, 0.2), "away"),
    "fan_dark": ("toon", (0.02, 0.018, 0.03), None),
    "fan_grey": ("toon", (0.1, 0.095, 0.12), None),
    "skin_a": ("toon", (0.8, 0.58, 0.52), None),
    "skin_b": ("toon", (0.5, 0.34, 0.26), None),
    "skin_orc": ("toon", (0.34, 0.66, 0.42), None),
    "line": ("flat", (0.6, 0.6, 0.7), None),
    "board": ("flat", (0.004, 0.003, 0.007), None),
    "screen": ("flat", (0.004, 0.005, 0.012), None),
    "lamp": ("flat", (1.0, 0.98, 0.92), None),
    "neon_home": ("flat", (1.0, 1.0, 1.0), "home"),
    "neon_away": ("flat", (1.0, 1.0, 1.0), "away"),
    "neon_pink": ("flat", (1.0, 0.16, 0.62), None),
    "neon_cyan": ("flat", (0.14, 0.9, 1.0), None),
    "neon_white": ("flat", (0.92, 0.94, 1.0), None),
    "neon_ko": ("flat", (1.0, 0.72, 0.12), None),
    "neon_injured": ("flat", (1.0, 0.12, 0.16), None),
    "neon_off": ("flat", (0.7, 0.4, 1.0), None),
}
BOX_NEON = {"ko": "neon_ko", "injured": "neon_injured", "sent off": "neon_off"}
MASK = {"home": (1, 0, 0), "away": (0, 1, 0), None: (0, 0, 0)}

SPONSORS = ["BUGMAN'S XXXXXX", "NUFFLE", "CABALVISION", "BLOODWEISER", "DEATH OR GLORY", "SPIKE!"]


def G(gx, gy, z=0.0):
    """Grid coordinates to world: grid x is world +X, grid y is world -Y."""
    return Vector((gx * S, -gy * S, z))


# ----------------------------------------------------------------- building


class Builder:
    """Collects boxes into one mesh per part, so the scene stays a few objects."""

    def __init__(self):
        self.meshes = {}
        self.texts = []
        self.dugouts = {}  # side -> box name -> square centres in grid coords

    def box(self, part, a, b):
        """Axis-aligned box between two corner points."""
        lo = Vector(map(min, a, b))
        hi = Vector(map(max, a, b))
        size = hi - lo
        if min(size) <= 0:
            return
        bm = self.meshes.setdefault(part, bmesh.new())
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((lo + hi) / 2) @ Matrix.Diagonal((*size, 1)))

    def text(self, part, body, at, height, rotation, align="CENTER", extrude=0.0):
        self.texts.append((part, body, Vector(at), height, rotation, align, extrude))

    def finish(self):
        for part, bm in self.meshes.items():
            me = bpy.data.meshes.new(part)
            bm.to_mesh(me)
            bm.free()
            add_object(part, me)
        for k, (part, body, at, height, rotation, align, extrude) in enumerate(self.texts):
            cu = bpy.data.curves.new(f"text_{k}", "FONT")
            cu.body = body
            cu.size = height
            cu.align_x = align
            cu.align_y = "BOTTOM"
            cu.extrude = extrude
            ob = add_object(part, cu)
            ob.location = at
            ob.rotation_euler = Euler(tuple(math.radians(a) for a in rotation))


def add_object(part, data):
    data.materials.append(bpy.data.materials[part])
    ob = bpy.data.objects.new(data.name, data)
    bpy.context.scene.collection.objects.link(ob)
    ob["part"] = part
    return ob


def make_materials():
    for part, (kind, color, mask) in PARTS.items():
        if kind == "toon":
            g["toon_material"](part, color, STYLE)
            g["mask_material"](f"mask_{part}", MASK[mask], STYLE)
        else:
            for name, c in ((part, color), (f"mask_{part}", MASK[mask])):
                mat, _, emit = g["new_material"](name)
                emit.inputs["Color"].default_value = (*c, 1)


def assign_pass(kind):
    for ob in bpy.data.objects:
        if "part" in ob:
            ob.data.materials[0] = bpy.data.materials[ob["part"] if kind == "color" else f"mask_{ob['part']}"]


# --------------------------------------------------------------------- pitch


def pitch(b):
    b.box("ground", (-120, -120, -0.3), (180, 120, -0.05))
    b.box("apron", (-S, -(ROWS + 1) * S, -0.05), ((COLS + 1) * S, S, 0.0))
    for x in range(COLS):
        for y in range(ROWS):
            if x in (0, COLS - 1):
                part = "zone_home" if x == 0 else "zone_away"
            else:
                part = "turf_a" if (x + y) % 2 else "turf_b"
            b.box(part, G(x, y + 1, 0.0), G(x + 1, y, 0.02))
    w, z = 0.12, (0.02, 0.03)
    for gx in (0, 1, LOS[0], COLS / 2, LOS[1], COLS - 1, COLS):
        b.box("line", G(gx, ROWS, z[0]) + Vector((-w / 2, 0, 0)), G(gx, 0, z[1]) + Vector((w / 2, 0, 0)))
    for gy in (0, WIDE[0], WIDE[1], ROWS):
        b.box("line", G(0, gy, z[0]) + Vector((0, -w / 2, 0)), G(COLS, gy, z[1]) + Vector((0, w / 2, 0)))
    # centre spot
    c = G(COLS / 2, ROWS / 2, 0.03)
    b.box("line", c - Vector((0.35, 0.35, 0)), c + Vector((0.35, 0.35, 0.01)))


# ------------------------------------------------------------------- dugouts


def dugout(b, side, gx0, gy0, along, depth, far):
    """An 11 x 3 block of squares starting at grid corner (gx0, gy0).

    `along` and `depth` are unit grid steps, (1, 0) or (0, 1) with a sign.
    Box order runs along `along`; home runs it backwards so in the "far"
    layout both reserve boxes sit by the halfway line. `far` dugouts get a back wall
    with neon signs; near ones would hide their own players behind a wall,
    so they get painted labels on the pitch-side apron instead.
    """
    order = DUGOUT[::-1] if side == "home" else DUGOUT
    ax, ay = along
    dx, dy = depth
    length = sum(n for _, n in DUGOUT)

    def corner(i, j):
        return (gx0 + ax * i + dx * j, gy0 + ay * i + dy * j)

    def rect(part, i0, j0, i1, j1, z0, z1, inset=0.0):
        (x0, y0), (x1, y1) = corner(i0, j0), corner(i1, j1)
        lo = G(min(x0, x1), max(y0, y1), z0) + Vector((inset, inset, 0))
        hi = G(max(x0, x1), min(y0, y1), z1) - Vector((inset, inset, 0))
        b.box(part, lo, hi)

    rect("dug_floor", -0.2, -0.2, length + 0.2, DUGOUT_ROWS + 0.2, 0.0, 0.04)
    i = 0
    for name, n in order:
        b.dugouts.setdefault(side, {})[name] = [
            list(corner(i + k + 0.5, j + 0.5)) for j in range(DUGOUT_ROWS) for k in range(n)]
        neon = BOX_NEON.get(name, f"neon_{side}")
        # a neon ring round each box, then one raised tile per square
        rect(neon, i, 0, i + n, DUGOUT_ROWS, 0.04, 0.09, inset=0.04)
        rect("dug_floor", i, 0, i + n, DUGOUT_ROWS, 0.04, 0.095, inset=0.16)
        for k in range(n):
            for j in range(DUGOUT_ROWS):
                rect("dug_tile", i + k, j, i + k + 1, j + 1, 0.095, 0.11, inset=0.24)
        mid_i = i + n / 2
        if far:
            # neon sign on the back wall, facing the pitch, which only far dugouts have
            x, y = corner(mid_i, DUGOUT_ROWS + 0.035)
            rot = (90, 0, 0) if dy else (90, 0, 90)
            b.text(neon, LABELS[name], G(x, y, 1.0), 1.0 if n > 1 else 0.5, rot, extrude=0.03)
        else:
            # painted on the apron between pitch and dugout, reading screen-right
            x, y = corner(mid_i, -0.08)
            b.text(neon, LABELS[name], G(x, y, 0.03), 1.4 if n > 1 else 0.6, (0, 0, 0) if ay == 0 else (0, 0, 90))
        i += n
    if far:
        rect("wall", -0.3, DUGOUT_ROWS + 0.05, length + 0.3, DUGOUT_ROWS + 0.25, 0.0, 2.2)
        rect(f"neon_{side}", -0.3, DUGOUT_ROWS + 0.0, length + 0.3, DUGOUT_ROWS + 0.05, 2.1, 2.2)
        for e in (-0.3, length + 0.3):
            rect("wall", e - 0.1, 0, e + 0.1, DUGOUT_ROWS + 0.25, 0.0, 1.1)
    else:
        rect("wall", -0.3, DUGOUT_ROWS + 0.05, length + 0.3, DUGOUT_ROWS + 0.25, 0.0, 0.35)
        rect(f"neon_{side}", -0.3, DUGOUT_ROWS + 0.0, length + 0.3, DUGOUT_ROWS + 0.05, 0.3, 0.36)


# -------------------------------------------------------------------- stands


def stand(b, rng, x0, x1, front, out, rows, base, kit_of, back=True):
    """Stepped seating along X (out = +1 or -1 in Y) or along Y (out in X).

    `x0`, `x1` bound the stand along its length; `front` is the coordinate of
    the front wall on the other axis. `kit_of(t)` picks home/away/None for a
    seat at position t along the length.
    """
    along_x = out[0] == 0
    sgn = out[1] if along_x else out[0]
    tread, step = 0.85, 0.48

    def place(t0, t1, d0, d1, z0, z1, part):
        if along_x:
            b.box(part, (t0, front + sgn * d0, z0), (t1, front + sgn * d1, z1))
        else:
            b.box(part, (front + sgn * d0, t0, z0), (front + sgn * d1, t1, z1))

    # front wall with a neon lip
    place(x0, x1, 0, 0.3, 0, base + 0.5, "wall")
    place(x0, x1, -0.02, 0.3, base + 0.42, base + 0.5, "neon_pink" if sgn > 0 else "neon_cyan")
    for r in range(rows):
        d0 = 0.3 + r * tread
        z = base + r * step
        place(x0, x1, d0, d0 + tread, 0, z, "riser")
        place(x0, x1, d0, d0 + tread, z, z + 0.04, "concrete")
        t = x0 + 0.35
        while t < x1 - 0.4:
            t1 = t + 0.5
            kit = kit_of((t + t1) / 2)
            seat = {"home": "seat_home", "away": "seat_away"}.get(kit, "seat")
            place(t, t1, d0 + 0.35, d0 + 0.75, z + 0.04, z + 0.3, seat)
            place(t, t1, d0 + 0.68, d0 + 0.78, z + 0.3, z + 0.7, seat)
            if rng.random() < 0.82:
                fan(b, rng, place, t, t1, d0, z, kit)
            t += 0.62
        if r % 6 == 5:
            place(x0, x1, d0 + tread - 0.04, d0 + tread, z + 0.04, z + 0.08, "neon_white")
    depth = 0.3 + rows * tread
    top = base + rows * step
    if back:
        place(x0, x1, depth, depth + 0.4, 0, top + 1.8, "wall")
        place(x0, x1, depth - 0.02, depth + 0.4, top + 1.7, top + 1.8, "neon_pink" if sgn > 0 else "neon_cyan")
    return depth


def fan(b, rng, place, t0, t1, d0, z, kit):
    shirt = kit if kit and rng.random() < 0.55 else rng.choice(["dark", "grey", "dark"])
    shirt = f"fan_{shirt}"
    skin = rng.choices(["skin_a", "skin_b", "skin_orc"], [5, 3, 1])[0]
    c = (t0 + t1) / 2 + rng.uniform(-0.05, 0.05)
    lean = rng.uniform(-0.05, 0.08)
    place(c - 0.21, c + 0.21, d0 + 0.42 + lean, d0 + 0.72 + lean, z + 0.3, z + 0.86, shirt)
    place(c - 0.12, c + 0.12, d0 + 0.45 + lean, d0 + 0.69 + lean, z + 0.86, z + 1.12, skin)
    if rng.random() < 0.3:
        for sx in (-1, 1):
            a = c + sx * 0.24
            place(a - 0.05, a + 0.05, d0 + 0.5, d0 + 0.6, z + 0.75, z + 1.3, shirt)


def boards(b, x0, x1, at, normal, sponsors):
    """LED boards along X (normal +-Y) or along Y (normal +-X), facing `normal`."""
    along_x = normal[0] == 0
    n = len(sponsors)
    seg = (x1 - x0) / n
    for k, name in enumerate(sponsors):
        t0, t1 = x0 + k * seg + 0.05, x0 + (k + 1) * seg - 0.05
        mid = (t0 + t1) / 2
        neon = ["neon_pink", "neon_cyan", "neon_white"][k % 3]
        if along_x:
            b.box("board", (t0, at - 0.15, 0), (t1, at + 0.15, 1.0))
            b.box(neon, (t0, at - 0.17, 0.92), (t1, at + 0.17, 1.0))
            face = at + 0.16 * normal[1]
            rot = (90, 0, 0) if normal[1] < 0 else (90, 0, 180)
            b.text(neon, name, (mid, face, 0.22), 0.55, rot)
        else:
            b.box("board", (at - 0.15, t0, 0), (at + 0.15, t1, 1.0))
            b.box(neon, (at - 0.17, t0, 0.92), (at + 0.17, t1, 1.0))
            face = at + 0.16 * normal[0]
            rot = (90, 0, 90) if normal[0] > 0 else (90, 0, -90)
            b.text(neon, name, (face, mid, 0.22), 0.55, rot)


def diagonal(b, part, x, y, half, z0, z1, step=0.5):
    """A panel along world (1, 1), square to the camera, as a run of thin boxes."""
    n = int(half / step)
    for k in range(-n, n + 1):
        cx, cy = x + k * step * 0.7071, y + k * step * 0.7071
        b.box(part, (cx - 0.3, cy - 0.3, z0), (cx + 0.3, cy + 0.3, z1))


def tower(b, x, y):
    """Floodlight mast with a bank of lamps square to the camera."""
    b.box("metal", (x - 0.4, y - 0.4, 0), (x + 0.4, y + 0.4, 25))
    diagonal(b, "metal", x, y, 3.2, 24.6, 28.4)
    for row in range(3):
        for col in range(-2, 3):
            cx, cy = x + col * 1.2 * 0.7071 + 0.35, y + col * 1.2 * 0.7071 - 0.35
            z = 25 + row * 1.15
            b.box("lamp", (cx - 0.4, cy - 0.4, z), (cx + 0.4, cy + 0.4, z + 0.85))


def scoreboard(b, x, y):
    """Big screen on legs in the far corner, square to the camera."""
    for k in (-1, 1):
        cx, cy = x + k * 5 * 0.7071, y + k * 5 * 0.7071
        b.box("metal", (cx - 0.3, cy - 0.3, 0), (cx + 0.3, cy + 0.3, 16))
    diagonal(b, "screen", x, y, 7, 16, 23)
    diagonal(b, "neon_pink", x - 0.05, y + 0.05, 7.2, 23, 23.3)
    diagonal(b, "neon_cyan", x - 0.05, y + 0.05, 7.2, 15.7, 16)
    b.text("neon_white", "BLOOD BOWL", (x + 0.4, y - 0.4, 23.6), 2.2, (90, 0, 45), extrude=0.05)


# ------------------------------------------------------------------- layouts


def build(layout):
    rng = random.Random(7)
    b = Builder()
    pitch(b)
    W, H = COLS * S, ROWS * S          # 56 x 30.8 m; pitch spans X 0..W, Y -H..0
    half = lambda t: "home" if t < W / 2 else "away"
    far_side_front, far_end_front = S * 1.0, -S * 1.0
    if layout == "far":
        dugout(b, "home", -1, -1, (1, 0), (0, -1), far=True)
        dugout(b, "away", 10, -1, (1, 0), (0, -1), far=True)
        far_side_front = 4.2 * S
        boards(b, -H, 0, -2.0, (1, 0), SPONSORS[:4])
    elif layout == "facing":
        dugout(b, "home", 4.5, -1, (1, 0), (0, -1), far=True)
        dugout(b, "away", 4.5, ROWS + 1, (1, 0), (0, 1), far=False)
        far_side_front = 4.2 * S
        boards(b, -1.5 * S, 4.2 * S, 2.0, (0, -1), SPONSORS[:2])
        boards(b, 15.8 * S, 21.5 * S, 2.0, (0, -1), SPONSORS[2:4])
        boards(b, -H, 0, -2.0, (1, 0), SPONSORS[:4])
    elif layout == "ends":
        dugout(b, "home", -1, 0, (0, 1), (-1, 0), far=True)
        dugout(b, "away", COLS + 1, 0, (0, 1), (1, 0), far=False)
        far_end_front = -4.2 * S
        boards(b, -1.5 * S, 21.5 * S, 2.0, (0, -1), SPONSORS)
    else:
        raise ValueError(layout)

    near_side = -H - (5.2 * S if layout == "facing" else 2.6)
    near_end = W + (5.2 * S if layout == "ends" else 2.6)
    span_x0, span_x1 = far_end_front - 1, near_end + 1
    # far sideline: the main stand, tall, with a roof
    d_side = stand(b, rng, far_end_front - 16, near_end + 10, far_side_front, (0, 1), 18, 0.6, half)
    # far end: home end behind the home end zone
    stand(b, rng, near_side - 10, far_side_front, far_end_front, (-1, 0), 14, 0.6, lambda t: "home")
    # near sides: a few low rows so nothing tall stands in front of the pitch
    stand(b, rng, far_end_front - 4, near_end, near_side, (0, -1), 3, 0.25, half, back=False)
    stand(b, rng, near_side, min(far_side_front, S), near_end, (1, 0), 3, 0.25, lambda t: "away", back=False)
    tower(b, far_end_front - 16, near_side - 6)
    tower(b, near_end + 8, far_side_front + d_side + 4)
    screen = (far_end_front - 14, far_side_front + d_side + 3)
    scoreboard(b, *screen)
    b.finish()
    # the page writes the score on the screen, so it needs the screen's centre in grid terms
    return b.dugouts, [screen[0] / S, -screen[1] / S, 19.5]


# -------------------------------------------------------------------- render


def frame_camera(px_per_unit):
    """Fit the orthographic camera to everything but the ground plane."""
    scene = bpy.context.scene
    cam = scene.camera
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    xs, ys = [], []
    for ob in bpy.data.objects:
        if ob.get("part") in (None, "ground"):
            continue
        for corner in ob.bound_box:
            p = inv @ (ob.matrix_world @ Vector(corner))
            xs.append(p.x)
            ys.append(p.y)
    margin = 1.0
    x0, x1, y0, y1 = min(xs) - margin, max(xs) + margin, min(ys) - margin, max(ys) + margin
    wpx, hpx = math.ceil((x1 - x0) * px_per_unit), math.ceil((y1 - y0) * px_per_unit)
    # recentre on the box, and back off along the view so nothing is clipped
    cam.location = cam.matrix_world @ Vector(((x0 + x1) / 2, (y0 + y1) / 2, 300))
    scene.render.resolution_x, scene.render.resolution_y = wpx, hpx
    cam.data.ortho_scale = max(wpx, hpx) / px_per_unit
    cam.data.clip_start, cam.data.clip_end = 1, 1000
    bpy.context.view_layer.update()
    return wpx, hpx


def to_px(p):
    scene = bpy.context.scene
    co = world_to_camera_view(scene, scene.camera, Vector(p))
    return [round(co.x * scene.render.resolution_x, 3), round((1 - co.y) * scene.render.resolution_y, 3)]


def render_layout(layout, out_dir, sizes=("lo", "hi")):
    for ob in [o for o in bpy.data.objects if "part" in o]:
        bpy.data.objects.remove(ob)
    dugouts, screen = build(layout)
    scene = bpy.context.scene
    scene.render.film_transparent = False
    os.makedirs(out_dir, exist_ok=True)
    meta = {"layout": layout, "square_m": S, "cols": COLS, "rows": ROWS, "dugouts": dugouts, "screen": screen, "sizes": {}}
    for size in sizes:
        w, h = frame_camera(PX_PER_UNIT[size])
        meta["sizes"][size] = {
            "width": w, "height": h, "px_per_unit": PX_PER_UNIT[size],
            # where grid (0, 0) lands, and the pixel step for one grid x, one grid y and one metre up
            "origin": to_px(G(0, 0)),
            "gx": [a - o for a, o in zip(to_px(G(1, 0)), to_px(G(0, 0)))],
            "gy": [a - o for a, o in zip(to_px(G(0, 1)), to_px(G(0, 0)))],
            "up": [a - o for a, o in zip(to_px((0, 0, 1)), to_px(G(0, 0)))],
        }
        for kind in ("color", "mask"):
            assign_pass(kind)
            scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (
                (0.0015, 0.0012, 0.0025, 1) if kind == "color" else (0, 0, 0, 1))
            scene.render.filepath = os.path.join(out_dir, f"{size}_{kind}.png")
            bpy.ops.render.render(write_still=True)
    with open(os.path.join(out_dir, "meta.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    return meta


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    out, layout = args
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    g["setup_scene"](STYLE)
    make_materials()
    print("stadium", layout, render_layout(layout, os.path.join(out, layout)))
