"""Build and render the Deathbowl arena around its plus-shaped pitch.

    pnpm exec tsx scripts/sprites/venue_layouts.ts > layouts.json
    blender -b --factory-startup --python deathbowl.py -- OUT_DIR layouts.json

The plus does not fit venues.py, which paints a rectangle with a dugout on
each long side and a crowd at each end, so the arena has this script. It
borrows the rest: stadium.py's camera, light, materials, dugout and stands,
and venues.py's scene set-up and render, so players and the Phaser tinting
look the same as on every other venue.

layouts.json holds the arena from the game's own layout: the pitch squares,
each seat's own end zone, the lines (pitch edge, end zone lines, Lines of
Scrimmage and wide-zone lines, the four Lines of Scrimmage also closing the
7 by 7 centre) and the four dugouts. Each seat keeps its reserves in the
corner beside its own arm, and its KO, casualty and sent-off boxes in a
26 by 3 strip behind its own end line. The four strips turn like a
pinwheel, each covering the ring corner by its reserves, so the pitch and
dugouts fill a 29 by 29 square. The strips come from venueSidelines.ts, so
the render and the game read one definition, and a unit test checks
meta.json against it.

The mask pass paints each seat's kit in its own colour (MASKS, also written
to meta.json) so build_game_assets.py can split a north, east, south and
west layer for Phaser to tint. Each seat owns its dugout, its own end zone
and the stand behind its end line.

The camera looks from the south-east corner, so tall seating would hide
whatever lies north or west of it. The north and west stands stand tall;
the east and south stands keep a few low rows.
"""

import os
import random
import sys

from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
vn = {"__name__": "arena_helpers", "__file__": os.path.join(HERE, "venues.py")}
with open(os.path.join(HERE, "venues.py")) as fh:
    exec(fh.read(), vn)

st = vn["st"]
S = st["S"]
G = st["G"]
SEATS = ("north", "east", "south", "west")
MASKS = {"north": (1, 0, 0), "east": (0, 1, 0), "south": (0, 0, 1), "west": (1, 1, 1)}
SEAT_PARTS = {
    f"{part}_{seat}": (kind, (grey, grey, grey), seat)
    for seat in SEATS
    for part, kind, grey in (("zone", "toon", 0.22), ("seat", "toon", 0.3), ("fan", "toon", 0.36),
                             ("trim", "flat", 1.0), ("banner", "toon", 0.5))
}
TALL, LOW = 16, 3
TREAD = 0.85


def turf(b, layout):
    zones = {tuple(sq): seat for seat, squares in layout["endZones"].items() for sq in squares}
    for x, y in layout["squares"]:
        seat = zones.get((x, y))
        part = f"zone_{seat}" if seat else ("turf_a" if (x + y) % 2 else "turf_b")
        b.box(part, G(x, y + 1, 0.0), G(x + 1, y, 0.02))


def lines(b, layout):
    w, z0, z1 = 0.12, 0.02, 0.03
    for x0, y0, x1, y1 in layout["lines"]:
        if x0 == x1:
            b.box("line", G(x0, y1, z0) - Vector((w / 2, 0, 0)), G(x0, y0, z1) + Vector((w / 2, 0, 0)))
        else:
            b.box("line", G(x0, y0, z0) - Vector((0, w / 2, 0)), G(x1, y0, z1) + Vector((0, w / 2, 0)))
    c = G(layout["cols"] / 2, layout["rows"] / 2, 0.03)
    b.box("line", c - Vector((0.35, 0.35, 0)), c + Vector((0.35, 0.35, 0.01)))


def strip_length(strip):
    return sum(n for _, n in strip["boxes"])


def strip_box(strip, margin):
    """The grid rectangle a 3-deep dugout strip covers, grown by `margin`."""
    (sx, sy), (ax, ay), (dx, dy) = strip["start"], strip["along"], strip["depth"]
    n = strip_length(strip)
    xs = (sx, sx + ax * n + dx * 3)
    ys = (sy, sy + ay * n + dy * 3)
    return min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin


def outline(layout):
    """The grid square the pitch and every dugout fill: (lo, hi) on both axes."""
    boxes = [strip_box(strip, 0) for strips in layout["strips"].values() for strip in strips]
    return min(min(x0, y0) for x0, y0, _, _ in boxes), max(max(x1, y1) for _, _, x1, y1 in boxes)


def apron(b, layout):
    b.box("ground", (-200, -200, -0.3), (260, 200, -0.05))
    lo, hi = outline(layout)
    vn["gbox"](b, "apron", lo - 0.5, lo - 0.5, hi + 1.5, hi + 1.5, -0.05, 0.0)


def dugouts(b, layout):
    """Reserves in the corner, then the KO, casualty and sent-off strip, which ends against the next seat's."""
    for seat in SEATS:
        for strip in layout["strips"][seat]:
            along, depth = tuple(strip["along"]), tuple(strip["depth"])
            far = depth[0] < 0 or depth[1] < 0
            boxes = [tuple(box) for box in strip["boxes"]]
            st["dugout"](b, seat, *strip["start"], along, depth, far=far, boxes=boxes,
                         open_end=strip_length(strip) > 4)


def crowd(b, rng, layout):
    """A stand behind each seat's end line, outside the square, in that seat's kit.

    The tall north and west stands run on over the corners behind them, so the
    corners have no gaps; the low east and south stands meet them there.
    """
    lo, hi = outline(layout)
    # the near stands sit a square further out, so their flags clear the dugouts
    near, far = (hi + 1.5) * S, (lo - 0.5) * S
    tall = 0.3 + TALL * TREAD
    low = 0.3 + LOW * TREAD
    top = 0.6 + TALL * 0.48 + 1.8
    seat_kit = {seat: (lambda t, seat=seat: seat) for seat in SEATS}
    # (x0, x1, front, out, seat): grid north is world +Y and grid west world -X
    for x0, x1, front, out, seat in ((far - tall, near + low, -far, (0, 1), "north"),
                                     (-near, -far, far, (-1, 0), "west")):
        depth = st["stand"](b, rng, x0, x1, front, out, TALL, 0.6, seat_kit[seat])
        sgn = out[1] if out[0] == 0 else out[0]
        st["banners"](b, x0, x1, front + sgn * depth, out, top, seat_kit[seat])
    st["stand"](b, rng, -near - low, -far, near, (1, 0), LOW, 0.25, seat_kit["east"], back=False)
    st["stand"](b, rng, far - tall, near, -near, (0, -1), LOW, 0.25, seat_kit["south"], back=False)


def build(layout):
    rng = random.Random(21)
    b = st["Builder"]()
    apron(b, layout)
    turf(b, layout)
    lines(b, layout)
    dugouts(b, layout)
    crowd(b, rng, layout)
    b.finish()
    return b.dugouts


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    out, layouts_path = args[:2]
    st["MASK"].update(MASKS)
    vn["prepare"](SEAT_PARTS)
    layout = vn["load_layout"](layouts_path, "deathbowl")
    meta = vn["render"](layout, os.path.join(out, "deathbowl"), build, {"masks": MASKS})
    print("venue deathbowl", meta["sizes"])
