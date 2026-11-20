"""Build and render the Street, Beach and Gutter Bowl venues around their pitches.

    pnpm exec tsx scripts/sprites/venue_layouts.ts > layouts.json
    blender -b --factory-startup --python venues.py -- OUT_DIR layouts.json VENUE

VENUE is street, beach, gutter-street or gutter-sewer. One venue per run,
for the same reason stadium.py renders one layout per run.

layouts.json comes from the game's own pitch layouts, so the pitch size,
Lines of Scrimmage, wide zones, walls, obstacles, dugout squares and wall
gates in the render are the ones the rules use. The camera, light style,
materials and the colour and mask passes are stadium.py's, so the players
and the Phaser tinting work the same on every venue. meta.json has the
same shape as the stadium's, plus the obstacle squares, so a unit test can
check the art against the rules layout.

Tall things stay off the pitch side of anything a player can stand on:
the far wall is chest high, the near wall knee high, stall awnings low, and
houses, sea and sewer arches sit behind the far dugout.
"""

import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
st = {"__name__": "venue_helpers", "__file__": os.path.join(HERE, "stadium.py")}
with open(os.path.join(HERE, "stadium.py")) as fh:
    exec(fh.read(), st)

S = st["S"]
G = st["G"]
FONTS = ["C:/Windows/Fonts/georgiab.ttf", "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"]
MARGIN = {"ends": 6, "near": 6}
FAR_EDGE = -5


def rgb(hex_colour):
    """sRGB hex to the linear colour Blender materials take."""
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    h = hex_colour.lstrip("#")
    return tuple(lin(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def toon(hex_colour):
    return ("toon", rgb(hex_colour), None)


def flat(hex_colour):
    return ("flat", rgb(hex_colour), None)


VENUE_PARTS = {
    "ground": toon("#0b0805"),
    "mortar": toon("#2a2520"),
    "cobble_a": toon("#6b6259"), "cobble_b": toon("#575049"), "cobble_c": toon("#7a6d5e"),
    "cobble_dim_a": toon("#4a443e"), "cobble_dim_b": toon("#3e3934"),
    "brick_a": toon("#8a3f2c"), "brick_b": toon("#74362a"), "brick_c": toon("#9a4c33"),
    "capstone": toon("#8f8778"),
    "stone_a": toon("#5d6058"), "stone_b": toon("#4e524b"), "stone_c": toon("#6a6b60"),
    "sewer_a": toon("#3f4a40"), "sewer_b": toon("#36403a"), "sewer_c": toon("#4a5246"),
    "sewer_dim": toon("#2c332d"), "vault": toon("#151a16"),
    "slime": toon("#5f7a2a"), "sludge": toon("#232e18"), "sludge_glow": flat("#5f7d26"),
    "water": toon("#2a6470"), "water_deep": toon("#1d4c5e"), "foam": flat("#d8eeee"),
    "sand_a": toon("#c9a36b"), "sand_b": toon("#bf9860"), "sand_c": toon("#d4b27a"),
    "sand_wet": toon("#9b7a4c"), "sand_dim": toon("#a88a5c"),
    "timber": toon("#6b4a2b"), "timber_dark": toon("#4a321d"),
    "plaster_a": toon("#cdbf9f"), "plaster_b": toon("#b8a688"), "plaster_c": toon("#a39880"),
    "frame": toon("#3b2a1c"), "roof_a": toon("#6a3a2e"), "roof_b": toon("#4a4a52"),
    "window": flat("#ffc964"), "window_dark": toon("#2a2622"), "door": toon("#4a2e1c"),
    "awning_red": toon("#b8322a"), "awning_cream": toon("#e6d9b8"), "awning_blue": toon("#2f5c9a"),
    "awning_yellow": toon("#d9a632"), "awning_green": toon("#3f7a3a"),
    "produce_red": toon("#b52a20"), "produce_green": toon("#5a8f2a"),
    "produce_orange": toon("#d9782a"), "produce_yellow": toon("#d9c23a"), "sack": toon("#a08a5c"),
    "palm_trunk": toon("#7a5a3a"), "palm_leaf": toon("#3f7a2e"), "palm_leaf_b": toon("#2f6326"),
    "iron": toon("#2b2b2e"),
}

AWNINGS = [("awning_red", "awning_cream"), ("awning_blue", "awning_yellow"),
           ("awning_green", "awning_cream"), ("awning_yellow", "awning_red")]
PRODUCE = ["produce_red", "produce_green", "produce_orange", "produce_yellow"]


# ------------------------------------------------------------------ helpers


def gbox(b, part, x0, y0, x1, y1, z0, z1):
    """A box between two grid corners, from z0 to z1 metres."""
    b.box(part, G(x0, y0, z0), G(x1, y1, z1))


def tilted(b, part, centre, size, rotation):
    """A box of `size` metres turned by `rotation` (degrees) about its centre."""
    bm = b.meshes.setdefault(part, bmesh.new())
    turn = Euler(tuple(math.radians(a) for a in rotation)).to_matrix().to_4x4()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(Vector(centre)) @ turn @ Matrix.Diagonal((*size, 1)))


def obstacle_set(layout, kind=None):
    return {(o["x"], o["y"]) for o in layout["obstacles"] if kind is None or o["kind"] == kind}


def obstacle_blocks(layout):
    """Group obstacle squares into rectangles, as the painted venue did."""
    left = {(o["x"], o["y"]): o["kind"] for o in layout["obstacles"]}
    blocks = []
    for x, y in sorted(left, key=lambda p: (p[1], p[0])):
        if (x, y) not in left:
            continue
        kind = left[(x, y)]
        x1 = x
        while left.get((x1 + 1, y)) == kind:
            x1 += 1
        y1 = y
        while all(left.get((cx, y1 + 1)) == kind for cx in range(x, x1 + 1)):
            y1 += 1
        for cx in range(x, x1 + 1):
            for cy in range(y, y1 + 1):
                left.pop((cx, cy), None)
        blocks.append((kind, x, y, x1 + 1, y1 + 1))
    return blocks


def end_zone(layout, x):
    if x == 0:
        return "zone_home"
    if x == layout["cols"] - 1:
        return "zone_away"
    return None


# ------------------------------------------------------------------- ground


SURFACE_TOP = {"cobbles": 0.07, "sand": 0.0, "sewer": 0.03}


def cobble_square(b, rng, x, y, zone, inside):
    gbox(b, "mortar", x, y, x + 1, y + 1, -0.3, 0.0)
    n = 3 if inside else 2
    tones = ["cobble_a", "cobble_b", "cobble_c"] if inside else ["cobble_dim_a", "cobble_dim_b"]
    step = 1 / n
    for i in range(n):
        for j in range(n):
            inset = 0.035 + rng.uniform(0, 0.02)
            top = rng.uniform(0.03, 0.07)
            part = zone or rng.choice(tones)
            gbox(b, part, x + i * step + inset, y + j * step + inset,
                 x + (i + 1) * step - inset, y + (j + 1) * step - inset, 0.0, top)


def sand_square(b, rng, x, y, zone, inside):
    part = zone or (("sand_a" if (x + y) % 2 else "sand_b") if inside else "sand_dim")
    gbox(b, part, x, y, x + 1, y + 1, -0.3, 0.0)
    if not zone and rng.random() < 0.35:
        cx, cy = x + rng.uniform(0.15, 0.6), y + rng.uniform(0.15, 0.85)
        gbox(b, "sand_c" if inside else "sand_b", cx, cy, cx + rng.uniform(0.2, 0.4), cy + 0.05, 0.0, 0.015)


def sewer_square(b, rng, x, y, zone, inside):
    tones = ["sewer_a", "sewer_b", "sewer_c"] if inside else ["sewer_dim", "sewer_b"]
    for i in range(2):
        for j in range(2):
            inset = 0.025
            part = zone or rng.choice(tones)
            gbox(b, part, x + i / 2 + inset, y + j / 2 + inset,
                 x + (i + 1) / 2 - inset, y + (j + 1) / 2 - inset, -2.4, rng.uniform(0.0, 0.03))
    gbox(b, "vault", x, y, x + 1, y + 1, -2.45, -2.3)
    if not zone and rng.random() < 0.12:
        cx, cy = x + rng.uniform(0.1, 0.6), y + rng.uniform(0.1, 0.6)
        gbox(b, "slime", cx, cy, cx + rng.uniform(0.15, 0.35), cy + rng.uniform(0.1, 0.3), 0.0, 0.035)


SQUARE = {"cobbles": cobble_square, "sand": sand_square, "sewer": sewer_square}


def ground(b, rng, layout, skip):
    surface = layout["surface"]
    cols, rows = layout["cols"], layout["rows"]
    paint = SQUARE[surface]
    for x in range(-MARGIN["ends"], cols + MARGIN["ends"]):
        for y in range(FAR_EDGE, rows + MARGIN["near"]):
            if (x, y) in skip:
                continue
            inside = 0 <= x < cols and 0 <= y < rows
            paint(b, rng, x, y, end_zone(layout, x) if inside else None, inside)


def scrimmage_lines(layout):
    nml = layout["noMansLand"]
    if nml:
        return [nml["min"], nml["max"] + 1]
    return [layout["lineOfScrimmage"]["team2"]]


def markings(b, layout):
    cols, rows = layout["cols"], layout["rows"]
    blocked = obstacle_set(layout)
    z = SURFACE_TOP[layout["surface"]] + 0.005
    w = 0.12 / S

    def clear(*squares):
        return not any(sq in blocked for sq in squares)

    for gx in sorted({0, 1, cols // 2, cols - 1, cols, *scrimmage_lines(layout)}):
        for y in range(rows):
            if clear((gx - 1, y), (gx, y)):
                gbox(b, "line", gx - w / 2, y, gx + w / 2, y + 1, z, z + 0.012)
    wide = layout["wideZoneRows"]
    for gy in (0, wide["top"]["max"] + 1, wide["bottom"]["min"], rows):
        for x in range(cols):
            if clear((x, gy - 1), (x, gy)):
                gbox(b, "line", x, gy - w / 2, x + 1, gy + w / 2, z, z + 0.012)
    c = 0.35 / S
    gbox(b, "line", cols / 2 - c / 2, rows / 2 - c / 2, cols / 2 + c / 2, rows / 2 + c / 2, z, z + 0.015)


def hazard_ring(b, x0, y0, x1, y1, z):
    """Black and yellow paint round an obstacle block, inside its edge."""
    w = 0.08
    k = 0
    for (ax, ay, bx, by) in ((x0, y0, x1, y0), (x1, y0, x1, y1), (x1, y1, x0, y1), (x0, y1, x0, y0)):
        length = max(abs(bx - ax), abs(by - ay))
        steps = int(length * 4)
        for i in range(steps):
            t0, t1 = i / steps, (i + 1) / steps
            px0, py0 = ax + (bx - ax) * t0, ay + (by - ay) * t0
            px1, py1 = ax + (bx - ax) * t1, ay + (by - ay) * t1
            inx = w if bx == ax and ax == x0 else (-w if bx == ax else 0)
            iny = w if by == ay and ay == y0 else (-w if by == ay else 0)
            part = "trim_gold" if k % 2 else "trim_dark"
            gbox(b, part, min(px0, px0 + inx), min(py0, py0 + iny), max(px1, px1 + inx), max(py1, py1 + iny), z, z + 0.02)
            k += 1


# -------------------------------------------------------------------- walls


BRICK = dict(parts=["brick_a", "brick_b", "brick_c"], length=0.55, course=0.22)
STONE = dict(parts=["stone_a", "stone_b", "stone_c"], length=0.95, course=0.42)


def wall(b, rng, layout, gy, height, gate, style):
    """A sideline wall along grid y = gy, open for one square at the gate."""
    cols = layout["cols"]
    thick = 0.4
    yc = G(0, gy).y
    spans = [(-0.15, cols + 0.15)]
    if gate is not None:
        spans = [(-0.15, gate - 0.5), (gate + 0.5, cols + 0.15)]
    courses = max(1, round(height / style["course"]))
    ch = height / courses
    for x0, x1 in spans:
        a, e = x0 * S, x1 * S
        for c in range(courses):
            t = a - (style["length"] / 2 if c % 2 else 0)
            while t < e:
                t0, t1 = max(t, a), min(t + style["length"], e)
                if t1 - t0 > 0.05:
                    out = rng.uniform(0, 0.025)
                    b.box(rng.choice(style["parts"]), (t0 + 0.012, yc - thick / 2 - out, c * ch + 0.012),
                          (t1 - 0.012, yc + thick / 2 + out, (c + 1) * ch - 0.012))
                t += style["length"]
            b.box("mortar", (a, yc - thick / 2 + 0.03, c * ch), (e, yc + thick / 2 - 0.03, (c + 1) * ch))
        b.box("capstone", (a - 0.05, yc - thick / 2 - 0.06, height), (e + 0.05, yc + thick / 2 + 0.06, height + 0.1))
        for px in (x0, x1):
            p = px * S
            b.box("capstone", (p - 0.38, yc - 0.38, 0), (p + 0.38, yc + 0.38, height + 0.35))
            b.box("trim_dark", (p - 0.44, yc - 0.44, height + 0.35), (p + 0.44, yc + 0.44, height + 0.45))


def sideline_walls(b, rng, layout):
    if not layout["walledSidelines"]:
        return
    style = STONE if layout["surface"] == "sewer" else BRICK
    gates = layout["gates"]
    wall(b, rng, layout, -0.15, 1.5, gates.get("home"), style)
    wall(b, rng, layout, layout["rows"] + 0.15, 0.8, gates.get("away"), style)


# ------------------------------------------------------------- the two ends


def barricade(b, gx, gy0, gy1):
    x = gx * S
    y0, y1 = -gy1 * S, -gy0 * S
    t = y0
    while t <= y1:
        b.box("timber_dark", (x - 0.09, t - 0.09, 0), (x + 0.09, t + 0.09, 1.15))
        t += 1.4
    for z in (0.45, 0.95):
        b.box("timber", (x - 0.06, y0, z), (x + 0.06, y1, z + 0.14))


def end_crowds(b, rng, layout):
    cols, rows = layout["cols"], layout["rows"]
    y0, y1 = -(rows + 0.6) * S, 0.6 * S
    barricade(b, -1.35, -0.6, rows + 0.6)
    barricade(b, cols + 1.35, -0.6, rows + 0.6)
    st["stand"](b, rng, y0, y1, -1.7 * S, (-1, 0), 6, 0.4, lambda t: "home")
    st["stand"](b, rng, y0, y1, (cols + 1.7) * S, (1, 0), 3, 0.25, lambda t: "away", back=False)


# --------------------------------------------------------------- the street


def house(b, rng, x0, x1, front, depth):
    """One narrow town house between world x0 and x1, its front at world y `front`."""
    height = rng.choice([7.5, 9.0, 10.5, 12.0])
    plaster = rng.choice(["plaster_a", "plaster_b", "plaster_c", "brick_b"])
    back = front + depth
    b.box(plaster, (x0, front, 0), (x1, back, height))
    floors = int(height // 3)
    for f in range(floors):
        z = f * 3
        b.box("frame", (x0, front - 0.08, z + 2.85), (x1, front, z + 3.05))
        n = max(1, int((x1 - x0 - 0.6) // 1.7))
        span = (x1 - x0) / n
        for k in range(n):
            cx = x0 + span * (k + 0.5)
            if f == 0 and k == n // 2:
                b.box("door", (cx - 0.55, front - 0.06, 0), (cx + 0.55, front, 2.2))
                b.box("frame", (cx - 0.7, front - 0.09, 2.2), (cx + 0.7, front, 2.4))
                continue
            lit = "window" if rng.random() < 0.45 else "window_dark"
            b.box("frame", (cx - 0.55, front - 0.07, z + 0.85), (cx + 0.55, front, z + 2.25))
            b.box(lit, (cx - 0.42, front - 0.09, z + 0.98), (cx + 0.42, front - 0.06, z + 2.12))
    roof = rng.choice(["roof_a", "roof_b", "roof_a"])
    pitch = math.radians(38)
    half = depth / 2
    rise = half * math.tan(pitch)
    slope = half / math.cos(pitch) + 0.35
    for sgn in (-1, 1):
        centre = ((x0 + x1) / 2, front + half + sgn * half / 2, height + rise / 2)
        tilted(b, roof, centre, (x1 - x0 + 0.3, slope, 0.2), (-sgn * 38, 0, 0))
    b.box(plaster, (x0, front + 0.2, height), (x0 + 0.05, back - 0.2, height + rise * 0.9))
    if rng.random() < 0.7:
        cx = rng.uniform(x0 + 0.6, x1 - 1.2)
        b.box("brick_b", (cx, front + half - 0.5, height), (cx + 0.7, front + half + 0.3, height + rise + 1.2))


def houses(b, rng, layout):
    x = -MARGIN["ends"] * S
    end = (layout["cols"] + MARGIN["ends"]) * S
    front = G(0, FAR_EDGE + 0.3).y
    while x < end:
        w = rng.uniform(5.0, 9.0)
        house(b, rng, x, min(x + w, end), front, 8.0)
        x += w


def lamps(b, layout):
    y = -(layout["rows"] + 4.8) * S
    for gx in (2, layout["cols"] / 2, layout["cols"] - 2):
        x = gx * S
        b.box("iron", (x - 0.1, y - 0.1, 0), (x + 0.1, y + 0.1, 3.3))
        b.box("iron", (x - 0.3, y - 0.3, 3.3), (x + 0.3, y + 0.3, 3.4))
        b.box("lamp", (x - 0.22, y - 0.22, 3.4), (x + 0.22, y + 0.22, 3.85))
        b.box("iron", (x - 0.3, y - 0.3, 3.85), (x + 0.3, y + 0.3, 3.97))


def stall(b, rng, x0, y0, x1, y1, faces, colours):
    """A market stall on grid rect x0..x1, y0..y1, its counter facing +y or -y."""
    gbox(b, "timber_dark", x0 + 0.12, y0 + 0.12, x1 - 0.12, y1 - 0.12, 0.0, 0.18)
    fy = y1 if faces > 0 else y0
    by = y0 if faces > 0 else y1
    inner = -faces * 0.45
    for px in (x0 + 0.25, x1 - 0.25):
        for py in (fy - faces * 0.25, by + faces * 0.25):
            gbox(b, "timber", px - 0.04, py - 0.04, px + 0.04, py + 0.04, 0.18, 2.3)
    cy0, cy1 = sorted((fy - faces * 0.2, fy + inner))
    gbox(b, "timber", x0 + 0.3, cy0, x1 - 0.3, cy1, 0.18, 1.05)
    gbox(b, "timber_dark", x0 + 0.28, cy0 - 0.02, x1 - 0.28, cy1 + 0.02, 1.05, 1.12)
    t = x0 + 0.38
    while t < x1 - 0.55:
        crate = rng.choice(PRODUCE)
        gbox(b, "timber_dark", t, cy0 + 0.04, t + 0.38, cy1 - 0.04, 1.12, 1.3)
        for k in range(3):
            fx = t + 0.05 + k * 0.11
            gbox(b, crate, fx, cy0 + 0.07, fx + 0.09, cy1 - 0.07, 1.3, 1.42)
        t += 0.46
    for _ in range(rng.randint(3, 5)):
        sx = rng.uniform(x0 + 0.4, x1 - 0.7)
        sy = rng.uniform(min(y0, y1) + 0.5, max(y0, y1) - 0.9)
        part = rng.choice(["sack", "timber", "timber_dark"])
        h = rng.uniform(0.4, 0.9)
        gbox(b, part, sx, sy, sx + 0.25, sy + 0.25, 0.18, 0.18 + h)
    depth = abs(y1 - y0) * S
    stripes = int((x1 - x0) * S / 0.6)
    width = (x1 - x0) * S / stripes
    tilt = 10
    cy = G(0, (y0 + y1) / 2).y
    for k in range(stripes):
        cx = x0 * S + width * (k + 0.5)
        tilted(b, colours[k % 2], (cx, cy, 2.45), (width + 0.01, depth - 0.2, 0.08), (faces * tilt, 0, 0))


def stalls(b, rng, layout):
    for i, (kind, x0, y0, x1, y1) in enumerate(obstacle_blocks(layout)):
        if kind != "market-stall":
            continue
        hazard_ring(b, x0, y0, x1, y1, SURFACE_TOP["cobbles"])
        faces = 1 if y0 == 0 else -1
        mid = (x0 + x1) / 2
        stall(b, rng, x0 + 0.15, y0 + 0.15, mid - 0.05, y1 - 0.15, faces, AWNINGS[(2 * i) % 4])
        stall(b, rng, mid + 0.05, y0 + 0.15, x1 - 0.15, y1 - 0.15, faces, AWNINGS[(2 * i + 1) % 4])


# -------------------------------------------------------------------- beach


def palm(b, rng, gx, gy, height=6.5, lean=(0.6, -0.4)):
    x, y = gx * S, -gy * S
    segments = 9
    seg = height / segments
    for k in range(segments):
        t = k / segments
        ox, oy = lean[0] * t * t * 2, lean[1] * t * t * 2
        r = 0.22 - 0.06 * t
        b.box("palm_trunk", (x + ox - r, y + oy - r, k * seg), (x + ox + r, y + oy + r, (k + 1) * seg - 0.04))
    tx, ty, tz = x + lean[0] * 2, y + lean[1] * 2, height
    for k in range(8):
        a = k * 45 + rng.uniform(-12, 12)
        length = rng.uniform(2.4, 3.0)
        dx, dy = math.cos(math.radians(a)), math.sin(math.radians(a))
        centre = (tx + dx * length / 2, ty + dy * length / 2, tz - 0.35)
        tilted(b, "palm_leaf" if k % 2 else "palm_leaf_b", centre, (length, 0.55, 0.06), (0, 22, a))
    for k in range(3):
        a = math.radians(k * 120)
        cx, cy = tx + 0.25 * math.cos(a), ty + 0.25 * math.sin(a)
        b.box("timber_dark", (cx - 0.12, cy - 0.12, tz - 0.45), (cx + 0.12, cy + 0.12, tz - 0.2))


def umbrella(b, gx, gy, colours):
    x, y = gx * S, -gy * S
    b.box("timber", (x - 0.05, y - 0.05, 0), (x + 0.05, y + 0.05, 2.3))
    for k, r in enumerate((1.3, 1.0, 0.7, 0.4)):
        b.box(colours[k % 2], (x - r, y - r, 2.0 + k * 0.12), (x + r, y + r, 2.12 + k * 0.12))


def sea(b, rng, layout):
    x0, x1 = -MARGIN["ends"] - 2, layout["cols"] + MARGIN["ends"] + 2
    gbox(b, "sand_wet", x0, FAR_EDGE - 1.2, x1, FAR_EDGE, -0.3, -0.04)
    gbox(b, "water", x0, FAR_EDGE - 3.2, x1, FAR_EDGE - 1.2, -0.3, -0.1)
    gbox(b, "water_deep", x0, FAR_EDGE - 6.5, x1, FAR_EDGE - 3.2, -0.3, -0.12)
    for base, depth, z in ((FAR_EDGE - 1.2, 0.35, -0.09), (FAR_EDGE - 2.2, 1.0, -0.09), (FAR_EDGE - 4.0, 2.2, -0.11)):
        x = x0
        while x < x1:
            length = rng.uniform(0.25, 0.9)
            y = base - rng.uniform(0, depth)
            gbox(b, "foam", x, y, x + length, y + 0.05, z, z + 0.02)
            x += length + rng.uniform(0.3, 1.6)


def beach_dressing(b, rng, layout):
    cols, rows = layout["cols"], layout["rows"]
    sea(b, rng, layout)
    palm(b, rng, -3, -3.5)
    palm(b, rng, cols + 2.5, -2.5, height=7.0, lean=(-0.5, 0.5))
    palm(b, rng, -3, rows + 3.5, height=5.0)
    palm(b, rng, cols + 5, rows + 4.5, height=5.0, lean=(0.5, 0.3))
    umbrella(b, cols + 4.2, -3.2, ("awning_red", "awning_cream"))
    umbrella(b, -4.6, -2.0, ("awning_blue", "awning_yellow"))
    for gx, colour in ((cols + 3.2, "awning_blue"), (-4.0, "awning_red")):
        gbox(b, colour, gx, -3.0, gx + 0.25, -2.35, 0.0, 0.03)
    for gx, gy, kit in ((0, 0, "home"), (0, rows, "home"), (cols, 0, "away"), (cols, rows, "away")):
        x, y = gx * S, -gy * S
        b.box("timber", (x - 0.04, y - 0.04, 0), (x + 0.04, y + 0.04, 1.6))
        b.box(f"banner_{kit}", (x + 0.04, y - 0.02, 1.15), (x + 0.6, y + 0.02, 1.55))


# -------------------------------------------------------------------- sewer


def pits(b, rng, layout):
    for kind, x0, y0, x1, y1 in obstacle_blocks(layout):
        if kind != "sewer-pit":
            continue
        gbox(b, "sludge", x0, y0, x1, y1, -2.4, -1.85)
        for _ in range(int((x1 - x0) * (y1 - y0) * 0.6)):
            cx, cy = rng.uniform(x0 + 0.1, x1 - 0.2), rng.uniform(y0 + 0.1, y1 - 0.2)
            r = rng.uniform(0.03, 0.08)
            gbox(b, "sludge_glow", cx, cy, cx + r, cy + r, -1.85, -1.83)
        hazard_ring(b, x0, y0, x1, y1, SURFACE_TOP["sewer"])


def channel_squares(layout):
    cols, rows = layout["cols"], layout["rows"]
    xs = range(-MARGIN["ends"], cols + MARGIN["ends"])
    return {(x, y) for x in xs for y in (FAR_EDGE, rows + 5)}


def channels(b, rng, layout):
    cols, rows = layout["cols"], layout["rows"]
    for y in (FAR_EDGE, rows + 5):
        gbox(b, "water_deep", -MARGIN["ends"], y, cols + MARGIN["ends"], y + 1, -2.4, -0.7)
        gbox(b, "sludge", -MARGIN["ends"], y + 0.3, cols + MARGIN["ends"], y + 0.45, -0.7, -0.68)


def vault(b, rng, layout):
    """The sewer's back wall: stone arches over the far channel, torches between."""
    x0, x1 = -MARGIN["ends"] * S, (layout["cols"] + MARGIN["ends"]) * S
    front = -(FAR_EDGE - 0.1) * S
    b.box("stone_b", (x0, front, -2.4), (x1, front + 2.5, 7.5))
    b.box("stone_a", (x0, front - 0.25, 6.6), (x1, front + 0.1, 7.2))
    x = x0 + 2.0
    span = 7.0
    while x < x1 - span:
        a0, a1 = x + 0.9, x + span - 0.9
        b.box("stone_c", (x - 0.45, front - 0.6, -2.4), (x + 0.45, front, 6.6))
        b.box("vault", (a0, front - 0.03, -2.4), (a1, front + 0.4, 3.6))
        for k, inset in enumerate((0.45, 1.0, 1.7)):
            b.box("vault", (a0 + inset, front - 0.03, 3.6 + k * 0.45), (a1 - inset, front + 0.4, 4.05 + k * 0.45))
        b.box("stone_a", (a0 - 0.15, front - 0.12, 3.5), (a0 + 0.2, front, 5.0))
        b.box("stone_a", (a1 - 0.2, front - 0.12, 3.5), (a1 + 0.15, front, 5.0))
        if rng.random() < 0.6:
            px = rng.uniform(a0 + 1, a1 - 1)
            b.box("iron", (px - 0.3, front - 1.0, 1.4), (px + 0.3, front, 2.0))
            b.box("slime", (px - 0.18, front - 1.0, -0.7), (px + 0.18, front - 0.75, 1.4))
        tx = x
        b.box("iron", (tx - 0.08, front - 0.55, 2.5), (tx + 0.08, front - 0.45, 3.1))
        b.box("lamp", (tx - 0.14, front - 0.64, 3.1), (tx + 0.14, front - 0.36, 3.55))
        x += span


def walkway_posts(b, layout):
    rows = layout["rows"]
    y = -(rows + 4.85) * S
    for gx in range(-MARGIN["ends"] + 1, layout["cols"] + MARGIN["ends"], 3):
        x = gx * S
        b.box("iron", (x - 0.06, y - 0.06, 0), (x + 0.06, y + 0.06, 1.0))
    b.box("iron", (-MARGIN["ends"] * S, y - 0.05, 0.9), ((layout["cols"] + MARGIN["ends"]) * S, y + 0.05, 1.0))


# -------------------------------------------------------------------- build


def far_dugout_gx(squares):
    return min(x for x, _ in squares["sent off"] + squares["reserves"]) - 0.5


def dugouts(b, layout):
    home, away = layout["dugouts"]["home"], layout["dugouts"]["away"]
    st["dugout"](b, "home", far_dugout_gx(home), -1, (1, 0), (0, -1), far=True)
    st["dugout"](b, "away", far_dugout_gx(away), layout["rows"] + 1, (1, 0), (0, 1), far=False)


def build(layout):
    rng = random.Random(11)
    b = st["Builder"]()
    surface = layout["surface"]
    skip = obstacle_set(layout, "sewer-pit")
    if surface == "sewer":
        skip |= channel_squares(layout)
    b.box("ground", (-200, -200, -3.2), (260, 200, -3.0))
    ground(b, rng, layout, skip)
    markings(b, layout)
    dugouts(b, layout)
    sideline_walls(b, rng, layout)
    end_crowds(b, rng, layout)
    if surface == "cobbles":
        houses(b, rng, layout)
        lamps(b, layout)
        stalls(b, rng, layout)
    elif surface == "sand":
        beach_dressing(b, rng, layout)
    elif surface == "sewer":
        pits(b, rng, layout)
        channels(b, rng, layout)
        vault(b, rng, layout)
        walkway_posts(b, layout)
    b.finish()
    return b.dugouts


def render(layout, out_dir):
    for ob in [o for o in bpy.data.objects if "part" in o]:
        bpy.data.objects.remove(ob)
    built = build(layout)
    scene = bpy.context.scene
    scene.render.film_transparent = False
    os.makedirs(out_dir, exist_ok=True)
    w, h = st["frame_camera"](st["PX_PER_UNIT"]["lo"])
    to_px = st["to_px"]
    meta = {
        "layout": layout["venue"], "square_m": S, "cols": layout["cols"], "rows": layout["rows"],
        "dugouts": built, "obstacles": [[o["x"], o["y"]] for o in layout["obstacles"]],
        "sizes": {"lo": {
            "width": w, "height": h, "px_per_unit": st["PX_PER_UNIT"]["lo"],
            "origin": to_px(G(0, 0)),
            "gx": [a - o for a, o in zip(to_px(G(1, 0)), to_px(G(0, 0)))],
            "gy": [a - o for a, o in zip(to_px(G(0, 1)), to_px(G(0, 0)))],
            "up": [a - o for a, o in zip(to_px((0, 0, 1)), to_px(G(0, 0)))],
        }},
    }
    for kind in ("color", "mask"):
        st["assign_pass"](kind)
        scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (
            (*st["THEME"]["background"], 1) if kind == "color" else (0, 0, 0, 1))
        scene.render.filepath = os.path.join(out_dir, f"lo_{kind}.png")
        bpy.ops.render.render(write_still=True)
    with open(os.path.join(out_dir, "meta.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    return meta


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    out, layouts_path, venue = args[:3]
    with open(layouts_path) as fh:
        layout = next(v for v in json.load(fh) if v["venue"] == venue)
    st["THEME"]["parts"] = {**st["PARTS"], **VENUE_PARTS}
    st["THEME"]["font"] = next((f for f in FONTS if os.path.exists(f)), None)
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    st["g"]["setup_scene"](st["g"]["STYLES"][st["THEME"]["light"]])
    st["make_materials"]()
    print("venue", venue, render(layout, os.path.join(out, venue))["sizes"])
